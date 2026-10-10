-- VBC Member Welfare / Care — initial schema, PostgreSQL 15+ / Supabase.
-- Run once in a new development project as the SQL Editor's postgres role.
-- Existing unrelated tables are untouched. No real members or sending schedules are seeded.
begin;

create schema care_private;
revoke all on schema care_private from public;
grant usage on schema care_private to authenticated, service_role;

create function care_private.valid_month_day(m integer, d integer)
returns boolean language sql immutable set search_path = '' as $$
  select case when m is null and d is null then true
    when m is null or d is null or m not between 1 and 12 then false
    else d between 1 and case m when 2 then 29 when 4 then 30
      when 6 then 30 when 9 then 30 when 11 then 30 else 31 end end;
$$;

create function care_private.normalize_phone(p text)
returns text language plpgsql immutable set search_path = '' as $$
declare n text; s text := nullif(btrim(p), '');
begin
  if s is null then return null; end if;
  if s !~ '^\+?[0-9 .()-]+$' then
    raise exception 'Invalid phone format; use a Nigerian number or international country code'
      using errcode = '22023';
  end if;
  n := regexp_replace(s, '[^0-9]', '', 'g');
  if left(s, 1) = '+' then n := '+' || n;
  elsif left(n, 2) = '00' then n := '+' || substring(n from 3);
  elsif length(n) = 11 and left(n, 1) = '0' then n := '+234' || substring(n from 2);
  elsif length(n) = 13 and left(n, 3) = '234' then n := '+' || n;
  elsif length(n) = 10 and n ~ '^[789]' then n := '+234' || n;
  else raise exception 'Include the country code for non-Nigerian numbers' using errcode = '22023';
  end if;
  if n !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Phone number must be valid E.164 format' using errcode = '22023';
  end if;
  return n;
end;
$$;

create table public.care_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 150),
  role text not null check (role in ('administrator', 'editor', 'viewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function care_private.has_role(allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.care_staff
    where user_id = (select auth.uid()) and is_active and role = any(allowed_roles));
$$;

create table public.care_settings (
  id smallint primary key default 1 check (id = 1),
  church_name text not null default 'Vine Branch Church',
  sender_name text not null default 'Vine Branch Church',
  sender_email text check (sender_email is null or sender_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  sms_sender_id text check (sms_sender_id is null or length(sms_sender_id) between 1 and 11),
  time_zone text not null default 'Africa/Lagos',
  email_provider text not null default 'brevo' check (email_provider in ('brevo')),
  sms_provider text check (sms_provider in ('termii', 'other')),
  email_enabled boolean not null default false,
  sms_enabled boolean not null default false,
  daily_email_limit integer not null default 300 check (daily_email_limit between 1 and 1000000),
  newsletter_reserve integer not null default 50 check (newsletter_reserve >= 0 and newsletter_reserve < daily_email_limit),
  newsletter_batch_size integer not null default 250 check (newsletter_batch_size between 1 and 10000),
  email_quota_time_zone text not null default 'UTC',
  monthly_sms_budget_ngn numeric(12,2) not null default 0 check (monthly_sms_budget_ngn >= 0),
  privacy_policy_url text check (privacy_policy_url is null or privacy_policy_url ~ '^https://'),
  consent_policy_version text not null default 'v1',
  updated_at timestamptz not null default now(),
  check (not email_enabled or sender_email is not null),
  check (not sms_enabled or (sms_provider is not null and sms_sender_id is not null))
);

create table public.care_members (
  id uuid primary key default gen_random_uuid(),
  surname text not null check (length(btrim(surname)) between 1 and 100),
  other_names text not null check (length(btrim(other_names)) between 1 and 120),
  status text not null default 'visitor' check (status in ('visitor', 'new_member', 'member')),
  email text check (email is null or (length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp text check (whatsapp is null or whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  occupation text check (occupation is null or length(occupation) <= 150),
  gender text check (gender is null or gender in ('Male', 'Female')),
  age_range text check (age_range is null or age_range in ('Less than 18','18-24','25-34','35-44','45-59','60 and above')),
  marital_status text check (marital_status is null or marital_status in ('Single', 'Married', 'Others')),
  residential_address text check (residential_address is null or length(residential_address) <= 600),
  birthday_month smallint, birthday_day smallint,
  anniversary_month smallint, anniversary_day smallint,
  joined_on date not null default current_date,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (care_private.valid_month_day(birthday_month::integer, birthday_day::integer)),
  check (care_private.valid_month_day(anniversary_month::integer, anniversary_day::integer))
);
-- Global uniqueness keeps an archived contact from accidentally being recreated.
-- Shared family contacts require a deliberate schema change; never silently merge people.
create unique index care_members_email_unique on public.care_members(lower(email)) where email is not null;
create unique index care_members_phone_unique on public.care_members(phone) where phone is not null;
create index care_members_status_joined on public.care_members(status, joined_on desc) where archived_at is null;
create index care_members_birthday on public.care_members(birthday_month, birthday_day) where archived_at is null;
create index care_members_anniversary on public.care_members(anniversary_month, anniversary_day) where archived_at is null;
create index care_members_name on public.care_members(surname, other_names);

create table public.care_preferences (
  member_id uuid primary key references public.care_members(id) on delete cascade,
  contact_consent boolean not null default false,
  email_opt_in boolean not null default false,
  sms_opt_in boolean not null default false,
  celebrations_opt_in boolean not null default false,
  programmes_opt_in boolean not null default false,
  newsletters_opt_in boolean not null default false,
  source text not null default 'system' check (source in ('system','website','admin','import','preference_link')),
  policy_version text not null default 'v1',
  evidence_note text check (evidence_note is null or length(evidence_note) <= 2000),
  updated_at timestamptz not null default now()
);

create table public.care_consent_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.care_members(id) on delete cascade,
  preference text not null check (preference in ('contact_consent','email_opt_in','sms_opt_in','celebrations_opt_in','programmes_opt_in','newsletters_opt_in')),
  previous_value boolean,
  new_value boolean not null,
  source text not null,
  policy_version text not null,
  evidence_note text,
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now()
);
create index care_consent_events_member_time on public.care_consent_events(member_id, recorded_at desc);

create table public.care_guest_submissions (
  id uuid primary key default gen_random_uuid(),
  submission_key uuid not null unique,
  member_id uuid references public.care_members(id) on delete set null,
  source text not null default 'wordpress' check (source in ('wordpress','care_join','manual')),
  surname text not null check (length(btrim(surname)) between 1 and 100),
  other_names text not null check (length(btrim(other_names)) between 1 and 120),
  visit_date date not null,
  occupation text check (occupation is null or length(occupation) <= 150),
  gender text check (gender is null or gender in ('Male','Female')),
  age_range text check (age_range is null or age_range in ('Less than 18','18-24','25-34','35-44','45-59','60 and above')),
  marital_status text check (marital_status is null or marital_status in ('Single','Married','Others')),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp text check (whatsapp is null or whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  email text check (email is null or (length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  residential_address text check (residential_address is null or length(residential_address) <= 600),
  born_again text check (born_again is null or born_again in ('Yes','No')),
  home_visit text check (home_visit is null or home_visit in ('Yes','No')),
  discovery_source text check (discovery_source is null or discovery_source in ('Family','Friends / Acquaintance','Church evangelism / Outreach','Social media','Flyers','Other')),
  discovery_details text check (discovery_details is null or length(discovery_details) <= 1000),
  invited_by text check (invited_by is null or length(invited_by) <= 400),
  contact_consent boolean not null default false,
  birthday_month smallint, birthday_day smallint,
  anniversary_month smallint, anniversary_day smallint,
  email_opt_in boolean not null default false,
  sms_opt_in boolean not null default false,
  celebrations_opt_in boolean not null default false,
  programmes_opt_in boolean not null default false,
  newsletters_opt_in boolean not null default false,
  policy_version text not null default 'v1',
  review_status text not null default 'pending' check (review_status in ('pending','accepted','duplicate','rejected','unlinked')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text check (review_notes is null or length(review_notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (care_private.valid_month_day(birthday_month::integer, birthday_day::integer)),
  check (care_private.valid_month_day(anniversary_month::integer, anniversary_day::integer)),
  check (review_status not in ('accepted','duplicate') or member_id is not null)
);
-- Repeated visits and shared contacts are valid here; these columns are intentionally not unique.
create index care_guests_pending on public.care_guest_submissions(review_status, created_at desc);
create index care_guests_member_visit on public.care_guest_submissions(member_id, visit_date desc);
create index care_guests_email on public.care_guest_submissions(lower(email));
create index care_guests_phone on public.care_guest_submissions(phone);

create table public.care_notes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.care_members(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 10000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index care_notes_member_time on public.care_notes(member_id, created_at desc);

create table public.care_media_assets (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null default 'care-email-assets' check (bucket_id = 'care-email-assets'),
  object_path text not null check (length(object_path) between 1 and 1000),
  alt_text text not null check (length(btrim(alt_text)) between 1 and 500),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/gif','image/webp')),
  size_bytes bigint not null check (size_bytes between 1 and 1048576),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (bucket_id, object_path)
);

create table public.care_programmes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz check (ends_at is null or ends_at >= starts_at),
  time_zone text not null default 'Africa/Lagos',
  venue text not null check (length(btrim(venue)) between 1 and 500),
  description text check (description is null or length(description) <= 10000),
  info_url text check (info_url is null or info_url ~ '^https://'),
  banner_asset_id uuid references public.care_media_assets(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','published','cancelled','completed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index care_programmes_start on public.care_programmes(starts_at);

create table public.care_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  kind text not null check (kind in ('birthday','anniversary','programme','newsletter','follow_up')),
  email_subject text check (email_subject is null or length(email_subject) <= 300),
  email_body text check (email_body is null or length(email_body) <= 100000),
  sms_body text check (sms_body is null or length(sms_body) <= 1600),
  design jsonb not null default '{}'::jsonb check (jsonb_typeof(design) = 'object'),
  banner_asset_id uuid references public.care_media_assets(id) on delete set null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index care_templates_kind on public.care_templates(kind);

create table public.care_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  programme_id uuid references public.care_programmes(id) on delete restrict,
  template_id uuid references public.care_templates(id) on delete set null,
  channel text not null default 'email' check (channel in ('email','sms','both')),
  audience text not null default 'all' check (audience in ('all','new','selected')),
  email_subject text, email_body text, sms_body text,
  design jsonb not null default '{}'::jsonb check (jsonb_typeof(design) = 'object'),
  scheduled_at timestamptz,
  status text not null default 'draft' check (status in ('draft','scheduled','sending','completed','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'scheduled' or scheduled_at is not null)
);
create index care_campaigns_scheduled on public.care_campaigns(status, scheduled_at);
create table public.care_campaign_members (
  campaign_id uuid not null references public.care_campaigns(id) on delete cascade,
  member_id uuid not null references public.care_members(id) on delete cascade,
  primary key (campaign_id, member_id)
);
create index care_campaign_members_member on public.care_campaign_members(member_id);

create table public.care_newsletters (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  issue_month date not null check (extract(day from issue_month) = 1),
  email_subject text not null check (length(btrim(email_subject)) between 1 and 300),
  introduction text,
  design jsonb not null default '{}'::jsonb check (jsonb_typeof(design) = 'object'),
  scheduled_at timestamptz,
  batch_size integer not null default 250 check (batch_size between 1 and 10000),
  reserve integer not null default 50 check (reserve >= 0),
  status text not null default 'draft' check (status in ('draft','scheduled','sending','completed','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'scheduled' or scheduled_at is not null)
);
create index care_newsletters_month on public.care_newsletters(issue_month desc);
create index care_newsletters_scheduled on public.care_newsletters(status, scheduled_at);
create table public.care_newsletter_sections (
  id uuid primary key default gen_random_uuid(),
  newsletter_id uuid not null references public.care_newsletters(id) on delete cascade,
  position integer not null check (position >= 0),
  category text, title text not null, body text not null,
  image_asset_id uuid references public.care_media_assets(id) on delete set null,
  image_alt text, cta_label text,
  cta_url text check (cta_url is null or cta_url ~ '^https://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (newsletter_id, position)
);
create table public.care_newsletter_programmes (
  newsletter_id uuid not null references public.care_newsletters(id) on delete cascade,
  programme_id uuid not null references public.care_programmes(id) on delete cascade,
  position integer not null default 0 check (position >= 0),
  primary key (newsletter_id, programme_id)
);
create index care_newsletter_programmes_programme on public.care_newsletter_programmes(programme_id);

create table public.care_automation_rules (
  id uuid primary key default gen_random_uuid(),
  kind text not null unique check (kind in ('birthday','anniversary')),
  name text not null,
  template_id uuid references public.care_templates(id) on delete restrict,
  is_enabled boolean not null default false,
  send_time time not null default '08:00',
  time_zone text not null default 'Africa/Lagos',
  channel text not null default 'email' check (channel in ('email','sms','both')),
  leap_day_rule text not null default 'february_28' check (leap_day_rule in ('february_28','march_1','leap_year_only')),
  updated_at timestamptz not null default now(),
  check (not is_enabled or template_id is not null)
);

create table public.care_channel_suppressions (
  member_id uuid not null references public.care_members(id) on delete cascade,
  channel text not null check (channel in ('email','sms')),
  reason text not null check (reason in ('hard_bounce','complaint','provider_block','manual','invalid_contact')),
  provider text, detail text,
  created_at timestamptz not null default now(),
  primary key (member_id, channel)
);

create table public.care_message_jobs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.care_members(id) on delete cascade,
  campaign_id uuid references public.care_campaigns(id) on delete restrict,
  newsletter_id uuid references public.care_newsletters(id) on delete restrict,
  automation_rule_id uuid references public.care_automation_rules(id) on delete restrict,
  channel text not null check (channel in ('email','sms')),
  purpose text not null check (purpose in ('follow_up','birthday','anniversary','programme','newsletter')),
  idempotency_key text not null unique check (length(idempotency_key) between 1 and 240),
  recipient text not null,
  email_subject text, body_text text, body_html text,
  status text not null default 'queued' check (status in ('queued','processing','sent','delivered','failed','cancelled','suppressed','needs_review')),
  priority integer not null default 50 check (priority between 0 and 100),
  scheduled_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  lease_token uuid, lease_expires_at timestamptz,
  provider text, provider_message_id text, last_error text,
  sent_at timestamptz, delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(campaign_id, newsletter_id, automation_rule_id) <= 1),
  check (coalesce(length(body_text), 0) + coalesce(length(body_html), 0) > 0),
  check (channel <> 'email' or coalesce(length(btrim(email_subject)), 0) > 0),
  check (channel <> 'sms' or (coalesce(length(btrim(body_text)), 0) between 1 and 1600)),
  check ((status = 'processing' and lease_token is not null and lease_expires_at is not null)
    or (status <> 'processing' and lease_token is null and lease_expires_at is null))
);
create index care_jobs_ready on public.care_message_jobs(priority desc, scheduled_at, next_attempt_at)
  where status = 'queued';
create index care_jobs_member_time on public.care_message_jobs(member_id, created_at desc);
create index care_jobs_campaign on public.care_message_jobs(campaign_id);
create index care_jobs_newsletter on public.care_message_jobs(newsletter_id);
create index care_jobs_automation on public.care_message_jobs(automation_rule_id);
create index care_jobs_provider_message on public.care_message_jobs(provider, provider_message_id)
  where provider_message_id is not null;

create table public.care_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.care_message_jobs(id) on delete cascade,
  attempt_number integer not null check (attempt_number >= 1),
  outcome text not null check (outcome in ('accepted','retryable','failed','uncertain')),
  provider text, provider_message_id text, error_code text, error_message text,
  created_at timestamptz not null default now(),
  unique (job_id, attempt_number)
);
create table public.care_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_key text not null,
  job_id uuid references public.care_message_jobs(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_key)
);
create index care_provider_events_unprocessed on public.care_provider_events(received_at) where processed_at is null;
create index care_provider_events_job on public.care_provider_events(job_id);

create table public.care_daily_email_usage (
  quota_date date primary key,
  reserved_count integer not null default 0 check (reserved_count >= 0),
  updated_at timestamptz not null default now()
);

create table public.care_preference_tokens (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.care_members(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  purpose text not null default 'preferences' check (purpose in ('preferences','unsubscribe')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index care_tokens_member on public.care_preference_tokens(member_id);

create table public.care_import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  status text not null default 'preview' check (status in ('preview','processing','completed','failed','cancelled')),
  total_rows integer not null default 0 check (total_rows >= 0),
  imported_rows integer not null default 0 check (imported_rows between 0 and total_rows),
  duplicate_rows integer not null default 0 check (duplicate_rows between 0 and total_rows),
  invalid_rows integer not null default 0 check (invalid_rows between 0 and total_rows),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.care_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.care_import_batches(id) on delete cascade,
  row_number integer not null check (row_number >= 1),
  mapped_data jsonb not null default '{}'::jsonb check (jsonb_typeof(mapped_data) = 'object'),
  status text not null default 'pending' check (status in ('pending','valid','duplicate','invalid','imported')),
  errors jsonb not null default '[]'::jsonb check (jsonb_typeof(errors) = 'array'),
  member_id uuid references public.care_members(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (batch_id, row_number)
);
create index care_import_rows_member on public.care_import_rows(member_id);

create table public.care_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  table_name text not null, record_key text, action text not null,
  changed_columns text[] not null default '{}',
  occurred_at timestamptz not null default now()
);
create index care_audit_time on public.care_audit_events(occurred_at desc);

-- Trigger helpers use a fixed empty search path and qualified table names.
create function care_private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
create function care_private.normalize_contacts()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.surname := btrim(new.surname); new.other_names := btrim(new.other_names);
  new.email := nullif(lower(btrim(new.email)), '');
  new.phone := care_private.normalize_phone(new.phone);
  new.whatsapp := care_private.normalize_phone(new.whatsapp);
  return new;
end;
$$;
create function care_private.stamp_creator()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by; new.created_at := old.created_at;
  elsif auth.uid() is not null then new.created_by := auth.uid(); end if;
  return new;
end;
$$;
create function care_private.stamp_guest_review()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.member_id is null and old.member_id is not null
    and new.review_status in ('accepted','duplicate') then
    new.review_status := 'unlinked';
  end if;
  if auth.uid() is not null and (
    new.review_status is distinct from old.review_status or new.member_id is distinct from old.member_id
    or new.review_notes is distinct from old.review_notes or new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_at is distinct from old.reviewed_at) then
    new.reviewed_by := auth.uid(); new.reviewed_at := now();
  end if;
  return new;
end;
$$;
create function care_private.check_time_zone()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
    raise exception 'Unknown IANA time zone' using errcode = '22023';
  end if;
  if tg_table_name = 'care_settings' then
    if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.email_quota_time_zone) then
      raise exception 'Unknown quota time zone' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
create function care_private.keep_last_administrator()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(735103);
  if old.role = 'administrator' and old.is_active then
    if tg_op = 'UPDATE' then
      if new.role = 'administrator' and new.is_active then return new; end if;
    end if;
    if not exists (select 1 from public.care_staff where role = 'administrator' and is_active and user_id <> old.user_id) then
      raise exception 'Create another active administrator before removing or demoting the last one';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create function care_private.record_consent_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare k text; old_value boolean; new_value boolean;
begin
  foreach k in array array['contact_consent','email_opt_in','sms_opt_in','celebrations_opt_in','programmes_opt_in','newsletters_opt_in'] loop
    old_value := case when tg_op = 'INSERT' then null else (to_jsonb(old)->>k)::boolean end;
    new_value := (to_jsonb(new)->>k)::boolean;
    if old_value is distinct from new_value then
      insert into public.care_consent_events(member_id, preference, previous_value, new_value, source, policy_version, evidence_note, recorded_by)
      values (new.member_id, k, old_value, new_value, new.source, new.policy_version, new.evidence_note, auth.uid());
    end if;
  end loop;
  return new;
end;
$$;
create function care_private.initialize_preferences()
returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.care_preferences(member_id) values(new.id); return new; end;
$$;
create function care_private.audit_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n jsonb; o jsonb; fields text[];
begin
  n := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  o := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  select coalesce(array_agg(k order by k), '{}'::text[]) into fields
  from (select jsonb_object_keys(n || o) as k) q
  where k not in ('updated_at','created_at') and n->k is distinct from o->k;
  insert into public.care_audit_events(actor_id, table_name, record_key, action, changed_columns)
  values(auth.uid(), tg_table_name, coalesce(n->>'id',o->>'id',n->>'user_id',o->>'user_id',n->>'member_id',o->>'member_id'), lower(tg_op), fields);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger care_members_normalize before insert or update on public.care_members for each row execute function care_private.normalize_contacts();
create trigger care_guests_normalize before insert or update on public.care_guest_submissions for each row execute function care_private.normalize_contacts();
create trigger care_guests_stamp_review before update on public.care_guest_submissions for each row execute function care_private.stamp_guest_review();
create trigger care_members_preferences after insert on public.care_members for each row execute function care_private.initialize_preferences();
create trigger care_preferences_history after insert or update on public.care_preferences for each row execute function care_private.record_consent_changes();
create trigger care_staff_last_admin before update or delete on public.care_staff for each row execute function care_private.keep_last_administrator();

do $$
declare t text;
begin
  foreach t in array array['care_staff','care_settings','care_members','care_preferences','care_guest_submissions','care_notes','care_programmes','care_templates','care_campaigns','care_newsletters','care_newsletter_sections','care_automation_rules','care_message_jobs','care_import_batches','care_daily_email_usage'] loop
    execute format('create trigger %I before update on public.%I for each row execute function care_private.touch_updated_at()', t || '_updated_at', t);
  end loop;
  foreach t in array array['care_members','care_notes','care_media_assets','care_programmes','care_templates','care_campaigns','care_newsletters','care_import_batches'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function care_private.stamp_creator()', t || '_creator', t);
  end loop;
  foreach t in array array['care_settings','care_programmes','care_automation_rules'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function care_private.check_time_zone()', t || '_timezone', t);
  end loop;
  foreach t in array array['care_staff','care_settings','care_members','care_preferences','care_guest_submissions','care_notes','care_programmes','care_templates','care_campaigns','care_newsletters','care_automation_rules','care_import_batches'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function care_private.audit_mutation()', t || '_audit', t);
  end loop;
end;
$$;

-- Explicit grants plus RLS: a Supabase Auth account alone never grants staff access.
do $$
declare t text;
begin
  for t in select tablename from pg_catalog.pg_tables where schemaname = 'public' and tablename like 'care\_%' escape '\' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    if t <> 'care_preference_tokens' then
      execute format('grant select on table public.%I to authenticated', t);
      execute format('create policy %I on public.%I for select to authenticated using ((select care_private.has_role(array[''administrator'',''editor'',''viewer''])))', t || '_staff_read', t);
    end if;
  end loop;
  foreach t in array array['care_members','care_notes','care_media_assets','care_programmes','care_templates','care_campaigns','care_campaign_members','care_newsletters','care_newsletter_sections','care_newsletter_programmes','care_automation_rules','care_import_batches','care_import_rows'] loop
    execute format('grant insert, update on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select care_private.has_role(array[''administrator'',''editor''])))', t || '_editor_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select care_private.has_role(array[''administrator'',''editor'']))) with check ((select care_private.has_role(array[''administrator'',''editor''])))', t || '_editor_update', t);
    execute format('grant delete on public.%I to authenticated', t);
    if t = 'care_members' then
      execute format('create policy %I on public.%I for delete to authenticated using ((select care_private.has_role(array[''administrator''])))', t || '_admin_delete', t);
    else
      execute format('create policy %I on public.%I for delete to authenticated using ((select care_private.has_role(array[''administrator'',''editor''])))', t || '_editor_delete', t);
    end if;
  end loop;
  foreach t in array array['care_staff','care_settings'] loop
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select care_private.has_role(array[''administrator'']))) with check ((select care_private.has_role(array[''administrator''])))', t || '_admin_manage', t);
  end loop;
end;
$$;

-- Editors can review guest submissions but cannot rewrite the original answers.
grant update (member_id, review_status, reviewed_by, reviewed_at, review_notes) on public.care_guest_submissions to authenticated;
create policy care_guests_editor_review on public.care_guest_submissions for update to authenticated
  using ((select care_private.has_role(array['administrator','editor'])))
  with check ((select care_private.has_role(array['administrator','editor'])));

-- Helper functions are not a public API. Grant only the two needed by checks/RLS.
revoke all on all functions in schema care_private from public, anon, authenticated;
grant execute on function care_private.has_role(text[]) to authenticated;
grant execute on function care_private.valid_month_day(integer, integer) to authenticated, service_role;
grant execute on function care_private.normalize_phone(text) to authenticated;
grant execute on all functions in schema care_private to service_role;

insert into public.care_settings(id) values (1);
insert into public.care_templates(name, kind, email_subject, email_body, sms_body, design) values
 ('Birthday blessing', 'birthday', 'Happy birthday, {{first_name}}!', 'We thank God for your life, {{first_name}}. May this new year bring grace, joy and fresh strength. With love from your Vine Branch Church family.', 'Happy birthday, {{first_name}}! May God fill your year with grace and joy. With love, Vine Branch Church.', '{"headline":"Celebrating you today","preheader":"A blessing from your church family","bannerAlt":"Birthday celebration artwork","ctaLabel":"Visit our website","ctaUrl":"https://vinebranchchurch.org/"}'),
 ('Anniversary blessing', 'anniversary', 'Happy anniversary, {{first_name}}!', 'Today we celebrate your wedding anniversary. May your home continue to grow in love, peace and faith. Your Vine Branch Church family celebrates with you.', 'Happy wedding anniversary, {{first_name}}! May your home be filled with love and peace. Vine Branch Church.', '{"headline":"Love worth celebrating","preheader":"With love from Vine Branch Church","bannerAlt":"Wedding anniversary artwork"}'),
 ('Programme invitation', 'programme', 'You are invited: {{programme}}', 'Hello {{first_name}}, join us for {{programme}} on {{date}} at {{time}}. Venue: {{venue}}. We look forward to seeing you.', '{{first_name}}, join us for {{programme}}, {{date}} at {{time}}. Venue: {{venue}}. Vine Branch Church.', '{"headline":"There is a place for you","preheader":"Gather with your church family","bannerAlt":"Church programme artwork"}');
insert into public.care_automation_rules(kind, name, template_id, send_time)
 select kind, case kind when 'birthday' then 'Birthday messages' else 'Wedding anniversary messages' end,
 id, case kind when 'birthday' then '08:00'::time else '08:30'::time end
 from public.care_templates where kind in ('birthday','anniversary');

comment on table public.care_guest_submissions is 'All original guest answers, staged for staff review; public submissions never overwrite existing member identity or consent.';
comment on table public.care_preferences is 'Current explicit permissions. All choices start false. Change through care_set_preferences; every changed choice creates a consent event.';
comment on table public.care_preference_tokens is 'Server only. Store SHA-256 hashes of at least 32 random bytes; never raw tokens or guessable member UUID URLs.';
comment on table public.care_daily_email_usage is 'Conservative application reservations, not provider billing totals. Includes retries. Account activity outside this app must be reconciled by the worker.';
comment on column public.care_members.whatsapp is 'Existing guest form contact field retained; no WhatsApp sending is implemented.';
commit;
