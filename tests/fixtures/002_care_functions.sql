-- Staff preference updates and trusted-server messaging functions.
-- These functions do not contact providers, run a scheduler or implement an HTTP endpoint.
begin;

create function public.care_set_preferences(
  p_member_id uuid, p_preferences jsonb, p_source text default 'admin',
  p_policy_version text default 'v1', p_evidence_note text default null
) returns public.care_preferences language plpgsql security definer set search_path = '' as $$
declare k text; result public.care_preferences;
begin
  if not (coalesce(auth.role() = 'service_role', false)
      or care_private.has_role(array['administrator','editor'])) then
    raise exception 'Staff editor access required' using errcode = '42501';
  end if;
  if p_preferences is null or jsonb_typeof(p_preferences) <> 'object' then
    raise exception 'Preferences must be a JSON object' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_preferences) loop
    if k <> all(array['contact_consent','email_opt_in','sms_opt_in','celebrations_opt_in','programmes_opt_in','newsletters_opt_in'])
      or jsonb_typeof(p_preferences->k) <> 'boolean' then
      raise exception 'Unknown preference or non-boolean value: %', k using errcode = '22023';
    end if;
  end loop;
  update public.care_preferences set
    contact_consent = coalesce((p_preferences->>'contact_consent')::boolean, contact_consent),
    email_opt_in = coalesce((p_preferences->>'email_opt_in')::boolean, email_opt_in),
    sms_opt_in = coalesce((p_preferences->>'sms_opt_in')::boolean, sms_opt_in),
    celebrations_opt_in = coalesce((p_preferences->>'celebrations_opt_in')::boolean, celebrations_opt_in),
    programmes_opt_in = coalesce((p_preferences->>'programmes_opt_in')::boolean, programmes_opt_in),
    newsletters_opt_in = coalesce((p_preferences->>'newsletters_opt_in')::boolean, newsletters_opt_in),
    source = p_source, policy_version = p_policy_version, evidence_note = p_evidence_note
  where member_id = p_member_id returning * into result;
  if not found then raise exception 'Member not found' using errcode = 'P0002'; end if;
  return result;
end;
$$;
revoke all on function public.care_set_preferences(uuid,jsonb,text,text,text) from public, anon, authenticated;
grant execute on function public.care_set_preferences(uuid,jsonb,text,text,text) to authenticated, service_role;

create function care_private.can_send(p_member_id uuid, p_channel text, p_purpose text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.care_members m join public.care_preferences p on p.member_id = m.id
    where m.id = p_member_id and m.archived_at is null and p.contact_consent
      and case p_channel when 'email' then p.email_opt_in and m.email is not null
        when 'sms' then p.sms_opt_in and m.phone is not null else false end
      and case p_purpose when 'follow_up' then true
        when 'birthday' then p.celebrations_opt_in when 'anniversary' then p.celebrations_opt_in
        when 'programme' then p.programmes_opt_in when 'newsletter' then p.newsletters_opt_in else false end
      and not exists (select 1 from public.care_channel_suppressions s where s.member_id = m.id and s.channel = p_channel)
  );
$$;

-- Transactional insertion; the caller chooses a stable key for one intended message.
-- Examples: birthday:<member-uuid>:2027:email or newsletter:<issue-uuid>:<member-uuid>:email.
create function public.care_enqueue_message(
  p_member_id uuid, p_channel text, p_purpose text, p_idempotency_key text, p_content jsonb,
  p_scheduled_at timestamptz default now(), p_campaign_id uuid default null,
  p_newsletter_id uuid default null, p_automation_rule_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare m public.care_members; j public.care_message_jobs; new_id uuid;
begin
  select * into m from public.care_members where id = p_member_id;
  if not found then raise exception 'Member not found' using errcode = 'P0002'; end if;
  -- Reject an idempotency key reused for a different recipient/channel/purpose.
  select * into j from public.care_message_jobs where idempotency_key = p_idempotency_key;
  if found then
    if j.member_id <> p_member_id or j.channel <> p_channel or j.purpose <> p_purpose then
      raise exception 'Idempotency key already used for another message' using errcode = '23505';
    end if;
    return j.id;
  end if;
  if not care_private.can_send(p_member_id, p_channel, p_purpose) then
    raise exception 'Member is not eligible for this message' using errcode = '22023';
  end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    raise exception 'Content must be a JSON object' using errcode = '22023';
  end if;
  if p_channel = 'email' and coalesce(length(btrim(p_content->>'subject')),0) not between 1 and 300 then
    raise exception 'Email subject is required (maximum 300 characters)' using errcode = '22023';
  end if;
  if coalesce(length(p_content->>'html'),0) > 300000 or coalesce(length(p_content->>'text'),0) > 100000 then
    raise exception 'Message content is too long' using errcode = '22023';
  end if;
  if p_newsletter_id is not null and (p_purpose <> 'newsletter' or p_channel <> 'email') then
    raise exception 'Newsletter jobs must use the email channel and newsletter purpose' using errcode = '22023';
  end if;
  if p_campaign_id is not null and p_purpose <> 'programme' then
    raise exception 'Campaign jobs must use the programme purpose' using errcode = '22023';
  end if;
  if p_automation_rule_id is not null and not exists (
    select 1 from public.care_automation_rules where id = p_automation_rule_id and kind = p_purpose) then
    raise exception 'Automation rule must match the message purpose' using errcode = '22023';
  end if;
  insert into public.care_message_jobs(member_id, channel, purpose, idempotency_key, recipient,
    email_subject, body_text, body_html, priority, scheduled_at, next_attempt_at,
    campaign_id, newsletter_id, automation_rule_id)
  values(p_member_id, p_channel, p_purpose, p_idempotency_key,
    case p_channel when 'email' then m.email else m.phone end,
    p_content->>'subject', nullif(p_content->>'text',''), nullif(p_content->>'html',''),
    case p_purpose when 'newsletter' then 10 else 50 end, p_scheduled_at, p_scheduled_at,
    p_campaign_id, p_newsletter_id, p_automation_rule_id)
  on conflict (idempotency_key) do nothing returning id into new_id;
  if new_id is null then
    select * into j from public.care_message_jobs where idempotency_key = p_idempotency_key;
    if j.member_id <> p_member_id or j.channel <> p_channel or j.purpose <> p_purpose then
      raise exception 'Idempotency key already used for another message' using errcode = '23505';
    end if;
    return j.id;
  end if;
  return new_id;
end;
$$;

create function care_private.reserve_email_slot(p_is_newsletter boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare cfg public.care_settings; d date; cap integer; changed integer;
begin
  select * into cfg from public.care_settings where id = 1;
  if not found or not cfg.email_enabled then return false; end if;
  d := (clock_timestamp() at time zone cfg.email_quota_time_zone)::date;
  cap := cfg.daily_email_limit - case when p_is_newsletter then cfg.newsletter_reserve else 0 end;
  insert into public.care_daily_email_usage(quota_date) values (d) on conflict do nothing;
  update public.care_daily_email_usage set reserved_count = reserved_count + 1
    where quota_date = d and reserved_count < cap;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

-- Claims lock rows, recheck current consent, and reserve the shared email budget.
-- An expired processing lease becomes needs_review: never automatically resend an ambiguous provider request.
create function public.care_claim_jobs(p_limit integer default 25)
returns setof public.care_message_jobs language plpgsql security definer set search_path = '' as $$
declare j public.care_message_jobs; m public.care_members; cfg public.care_settings; claimed integer := 0;
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Claim limit must be between 1 and 100' using errcode = '22023';
  end if;
  select * into cfg from public.care_settings where id = 1;
  if not found then raise exception 'Church settings missing'; end if;
  update public.care_message_jobs set status = 'needs_review', lease_token = null,
    lease_expires_at = null, last_error = 'Worker lease expired; reconcile with provider before retrying'
    where status = 'processing' and lease_expires_at < clock_timestamp();

  for j in select q.* from public.care_message_jobs q
    where q.status = 'queued' and q.scheduled_at <= clock_timestamp() and q.next_attempt_at <= clock_timestamp()
      and ((q.channel = 'email' and cfg.email_enabled) or (q.channel = 'sms' and cfg.sms_enabled))
    order by q.priority desc, q.scheduled_at, q.created_at, q.id
    limit 1000 for update skip locked
  loop
    if claimed >= p_limit then exit; end if;
    select * into m from public.care_members where id = j.member_id;
    if not care_private.can_send(j.member_id, j.channel, j.purpose)
      or j.recipient is distinct from (case j.channel when 'email' then m.email else m.phone end) then
      update public.care_message_jobs set status = 'suppressed', last_error = 'Consent, contact or suppression changed'
        where id = j.id;
      continue;
    end if;
    if (j.campaign_id is not null and exists(select 1 from public.care_campaigns where id = j.campaign_id and status = 'cancelled'))
      or (j.campaign_id is not null and exists(select 1 from public.care_campaigns c join public.care_programmes p on p.id = c.programme_id where c.id = j.campaign_id and p.status = 'cancelled'))
      or (j.newsletter_id is not null and exists(select 1 from public.care_newsletters where id = j.newsletter_id and status = 'cancelled'))
      or (j.automation_rule_id is not null and exists(select 1 from public.care_automation_rules where id = j.automation_rule_id and not is_enabled)) then
      update public.care_message_jobs set status = 'cancelled', last_error = 'Parent send or automation cancelled/disabled' where id = j.id;
      continue;
    end if;
    if j.attempts >= j.max_attempts then
      update public.care_message_jobs set status = 'failed', last_error = 'Maximum attempts reached' where id = j.id;
      continue;
    end if;
    if j.channel = 'email' and not care_private.reserve_email_slot(j.purpose = 'newsletter') then continue; end if;
    update public.care_message_jobs set status = 'processing', attempts = attempts + 1,
      lease_token = gen_random_uuid(), lease_expires_at = clock_timestamp() + interval '5 minutes',
      provider = case channel when 'email' then cfg.email_provider else cfg.sms_provider end
      where id = j.id returning * into j;
    claimed := claimed + 1;
    return next j;
  end loop;
end;
$$;

create function public.care_complete_job(
  p_job_id uuid, p_lease_token uuid, p_outcome text,
  p_provider_message_id text default null, p_error_code text default null,
  p_error_message text default null
) returns public.care_message_jobs language plpgsql security definer set search_path = '' as $$
declare j public.care_message_jobs;
begin
  select * into j from public.care_message_jobs where id = p_job_id for update;
  if not found then raise exception 'Message job not found' using errcode = 'P0002'; end if;
  if j.status <> 'processing' or p_lease_token is null or j.lease_token is distinct from p_lease_token then
    raise exception 'Job is no longer owned by this worker' using errcode = '22023';
  end if;
  if p_outcome is null or p_outcome not in ('accepted','retryable','failed','uncertain') then
    raise exception 'Unknown outcome' using errcode = '22023';
  end if;
  if p_outcome = 'accepted' and nullif(btrim(p_provider_message_id),'') is null then
    raise exception 'Accepted requests require a provider message ID; use uncertain otherwise' using errcode = '22023';
  end if;
  insert into public.care_delivery_attempts(job_id, attempt_number, outcome, provider, provider_message_id, error_code, error_message)
    values(j.id, j.attempts, p_outcome, j.provider, p_provider_message_id, p_error_code, p_error_message);
  update public.care_message_jobs set
    status = case p_outcome when 'accepted' then 'sent' when 'uncertain' then 'needs_review'
      when 'retryable' then case when j.attempts < j.max_attempts then 'queued' else 'failed' end else 'failed' end,
    provider_message_id = p_provider_message_id,
    last_error = p_error_message,
    sent_at = case when p_outcome = 'accepted' then clock_timestamp() else sent_at end,
    next_attempt_at = case when p_outcome = 'retryable' then clock_timestamp() + interval '5 minutes' * j.attempts else next_attempt_at end,
    lease_token = null, lease_expires_at = null
    where id = j.id returning * into j;
  return j;
end;
$$;

-- All queue operations are trusted-server only; never callable from anonymous or staff browser clients.
revoke all on function public.care_enqueue_message(uuid,text,text,text,jsonb,timestamptz,uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.care_claim_jobs(integer) from public, anon, authenticated;
revoke all on function public.care_complete_job(uuid,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.care_enqueue_message(uuid,text,text,text,jsonb,timestamptz,uuid,uuid,uuid) to service_role;
grant execute on function public.care_claim_jobs(integer) to service_role;
grant execute on function public.care_complete_job(uuid,uuid,text,text,text,text) to service_role;
revoke all on function care_private.can_send(uuid,text,text) from public, anon, authenticated;
revoke all on function care_private.reserve_email_slot(boolean) from public, anon, authenticated;
grant execute on function care_private.can_send(uuid,text,text), care_private.reserve_email_slot(boolean) to service_role;
commit;
