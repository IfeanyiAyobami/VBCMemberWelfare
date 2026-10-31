-- VBC v3.8: Follow-up Team clarification of 31 October 2026.
-- Apply after 017. One previous VBC visit, explicit joining, shared person identity.
-- No historical dates, attendance, guest records or Home Cell assignments are invented.
begin;
alter table public.care_journeys add column if not exists registration_source text not null default 'existing_record' check(registration_source in ('visitor_form','staff_visitor','direct','existing_record'));
alter table public.care_journeys add column if not exists direct_registered_at timestamptz;
alter table public.care_journeys add column if not exists visit_purpose text not null default 'not_specified' check(visit_purpose in ('exploring','membership_interest','special_occasion','another_church','temporary','undecided','other','not_specified'));
alter table public.care_journeys add column if not exists followup_state text not null default 'active' check(followup_state in ('active','paused','inactive','declined_contact'));
alter table public.care_journeys drop constraint if exists care_journeys_intention_check;
alter table public.care_journeys add constraint care_journeys_intention_check check(intention in ('unknown','interested','invited','confirmed','undecided','deferred','did_not_join'));
update public.care_journeys j set registration_source=case when exists(select 1 from public.care_guest_submissions g where g.member_id=j.member_id and g.review_status in ('accepted','duplicate')) then 'visitor_form' else 'existing_record' end where registration_source='existing_record' and direct_registered_at is null;
alter table public.care_journey_cfc add column if not exists enrolled_on date;
alter table public.care_journey_cfc add column if not exists certificate_awarded_on date;
alter table public.care_journey_cfc add column if not exists enrolled_at timestamptz;
alter table public.care_journey_cfc add column if not exists certificate_recorded_at timestamptz;
update public.care_journey_cfc e set enrolled_at=x.recorded_at from (select member_id,min(created_at) recorded_at from public.care_journey_events where action='enrol' group by member_id)x where e.member_id=x.member_id and e.enrolled_at is null;
update public.care_journey_cfc e set certificate_recorded_at=x.recorded_at from (select member_id,min(created_at) recorded_at from public.care_journey_events where action='certificate' group by member_id)x where e.member_id=x.member_id and e.certificate_recorded_at is null;
alter table public.care_journey_cfc alter column enrolled_at set default now();
alter table public.care_journey_cfc_attendance add column if not exists attendance_status text not null default 'present' check(attendance_status in ('present','absent'));
alter table public.care_journey_cfc_attendance add column if not exists note text not null default '' check(length(note)<=2000);
create table if not exists public.care_ministry_memberships(
 id uuid primary key default gen_random_uuid(),member_id uuid not null references public.care_journeys(member_id),
 team_name text not null check(length(btrim(team_name)) between 1 and 120),responsibility text not null default '' check(length(responsibility)<=300),
 joined_on date,left_on date,active boolean not null default true,created_by uuid not null references public.care_staff(user_id),created_at timestamptz not null default now(),
 check(left_on is null or (joined_on is null or left_on>=joined_on)),check(active or left_on is not null)
);
create unique index if not exists care_ministry_current_team on public.care_ministry_memberships(member_id,lower(team_name)) where active;
create index if not exists care_ministry_person on public.care_ministry_memberships(member_id,created_at desc);
create table if not exists public.care_journey_support(
 id uuid primary key default gen_random_uuid(),member_id uuid not null references public.care_journeys(member_id),
 note text not null check(length(btrim(note)) between 3 and 2000),actor uuid not null references public.care_staff(user_id),created_at timestamptz not null default now()
);
alter table public.care_ministry_memberships enable row level security;
alter table public.care_journey_support enable row level security;
revoke all on public.care_ministry_memberships,public.care_journey_support from public,anon,authenticated;

create table if not exists public.care_journey_previous_visits(
 id uuid primary key default gen_random_uuid(),member_id uuid not null references public.care_journeys(member_id),
 known_before date not null,source text not null check(source in ('phone','whatsapp','church_staff','other')),
 evidence text not null check(length(btrim(evidence)) between 3 and 2000),recorded_by uuid not null references public.care_staff(user_id),recorded_at timestamptz not null default now(),voided_at timestamptz
);
alter table public.care_journey_previous_visits enable row level security;
revoke all on public.care_journey_previous_visits from public,anon,authenticated;
create index if not exists care_journey_previous_visits_person on public.care_journey_previous_visits(member_id,known_before) where voided_at is null;
create or replace function care_private.journey_has_previous_visit(p_member uuid,p_before date) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.care_journey_attendance where member_id=p_member and voided_at is null and service_date<p_before and lower(service_type)!~'(home.?cell|cfc|foundation)') or exists(select 1 from public.care_journey_previous_visits where member_id=p_member and voided_at is null and known_before<=p_before)$$;

-- Retained church-attendance evidence remains self-reported/independent as originally recorded.
-- Old service-type approval flags no longer impose a second-visit or screening requirement.
create or replace function care_private.journey_services(p_member uuid,p_until date default (now() at time zone 'Africa/Lagos')::date)
returns integer language sql stable security definer set search_path='' as $$select count(*)::integer from public.care_journey_attendance where member_id=p_member and voided_at is null and service_date<=p_until and lower(service_type)!~'(home.?cell|cfc|foundation)'$$;

create or replace function care_private.journey_first_visit(p_member uuid) returns date language sql stable security definer set search_path='' as $$select min(service_date) from public.care_journey_attendance where member_id=p_member and voided_at is null and service_date<=(now() at time zone 'Africa/Lagos')::date and lower(service_type)!~'(home.?cell|cfc|foundation)'$$;
create or replace function care_private.journey_membership_sunday() returns date language plpgsql stable set search_path='' as $$declare today date:=(now() at time zone 'Africa/Lagos')::date;last_day date;last_sunday date;begin last_day:=(date_trunc('month',today)+interval '1 month - 1 day')::date;last_sunday:=last_day-extract(dow from last_day)::integer;if last_sunday<today then last_day:=(date_trunc('month',today)+interval '2 months - 1 day')::date;last_sunday:=last_day-extract(dow from last_day)::integer;end if;return last_sunday;end$$;
create or replace function care_private.journey_new_person() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.care_journeys(member_id,registration_source) values(new.id,case when new.status='visitor' then 'staff_visitor' else 'existing_record' end) on conflict do nothing;return new;end$$;
create or replace function care_private.journey_guest_source() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.member_id is not null and new.review_status in ('accepted','duplicate') then
 update public.care_journeys set registration_source='visitor_form' where member_id=new.member_id and registration_source<>'direct';end if;return new;end$$;
drop trigger if exists care_journey_guest_source on public.care_guest_submissions;
create trigger care_journey_guest_source after insert or update of member_id,review_status on public.care_guest_submissions for each row execute function care_private.journey_guest_source();

create or replace function care_private.journey_integration_write(p_action text,p_data jsonb,p_actor uuid,p_member uuid,p_coordinator boolean)
returns void language plpgsql security definer set search_path='' as $$declare dt date;before_value jsonb;begin
 if p_action in ('purpose','followup_state','support','previous_visit','void_previous_visit') and not(p_coordinator or (care_private.journey_cap('friend') and exists(select 1 from public.care_journeys where member_id=p_member and assigned_to=p_actor))) then raise exception 'Assigned friend or Coordinator access required.' using errcode='42501';end if;
 if p_action in ('ministry_add','ministry_end') and not p_coordinator then raise exception 'Coordinator access required for ministry assignments.' using errcode='42501';end if;
 if p_action='previous_visit' then
 dt:=(p_data->>'beforeDate')::date;
 if dt is null or dt>(now() at time zone 'Africa/Lagos')::date then raise exception 'Record a known-before date, not a guessed visit date. The bound must be today or earlier.' using errcode='22023';end if;
 insert into public.care_journey_previous_visits(member_id,known_before,source,evidence,recorded_by) values(p_member,dt,p_data->>'source',btrim(p_data->>'note'),p_actor);
 elsif p_action='void_previous_visit' then
 if not p_coordinator or length(btrim(coalesce(p_data->>'note','')))<5 then raise exception 'Coordinator correction reason required.' using errcode='42501';end if;
 update public.care_journey_previous_visits set voided_at=now() where id=(p_data->>'visitId')::uuid and member_id=p_member and voided_at is null;
 if not found then raise exception 'Previous visit confirmation not found.' using errcode='22023';end if;
 update public.care_journeys set membership_review=true where member_id=p_member and official_joined_on is not null and not legacy_member and not care_private.journey_has_previous_visit(p_member,official_joined_on);
 elsif p_action='purpose' then
  if not (p_data ? 'purpose') then raise exception 'Choose a visitor purpose.' using errcode='22023';end if;
  update public.care_journeys set visit_purpose=p_data->>'purpose' where member_id=p_member;
 elsif p_action='followup_state' then
  if p_data->>'state' not in ('active','paused','inactive') or length(btrim(coalesce(p_data->>'note','')))<3 then raise exception 'Choose a follow-up status and record the reason. Use the no-contact outcome for a stop-contact request.' using errcode='22023';end if;
  if p_data->>'state'='active' and not coalesce((select contact_consent from public.care_preferences where member_id=p_member),false) then raise exception 'Contact permission must be explicitly restored through Member Care preferences before outreach resumes.' using errcode='22023';end if;
  update public.care_journeys set followup_state=p_data->>'state' where member_id=p_member;
 elsif p_action='support' then
  insert into public.care_journey_support(member_id,note,actor) values(p_member,btrim(p_data->>'note'),p_actor);
 elsif p_action='ministry_add' then
  dt:=nullif(p_data->>'date','')::date;
  if dt>(now() at time zone 'Africa/Lagos')::date then raise exception 'Ministry joining date cannot be in the future.' using errcode='22023';end if;
  insert into public.care_ministry_memberships(member_id,team_name,responsibility,joined_on,created_by)
  values(p_member,btrim(p_data->>'team'),coalesce(btrim(p_data->>'responsibility'),''),dt,p_actor);
 elsif p_action='ministry_end' then
  dt:=nullif(p_data->>'date','')::date;
  if dt is null or dt>(now() at time zone 'Africa/Lagos')::date or length(btrim(coalesce(p_data->>'note','')))<3 then raise exception 'Record the actual leaving date and reason.' using errcode='22023';end if;
  update public.care_ministry_memberships set active=false,left_on=dt where id=(p_data->>'ministryId')::uuid and member_id=p_member and active;
  if not found then raise exception 'Active ministry assignment not found.' using errcode='22023';end if;
 end if;
end$$;

-- Direct registration is staff-only, identity-aware and replay-safe; no public form or Auth account is created.
create or replace function public.care_journey_direct(p_data jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid();m uuid;existing public.care_members;j public.care_journeys;old_request care_private.journey_requests;
 payload jsonb:=jsonb_build_object('action','direct','data',p_data);answer jsonb;phone_value text;email_value text;dt date;phone_match uuid;email_match uuid;created_new boolean:=false;
begin
 if not care_private.journey_cap('coordinator') then raise exception 'Follow-up Coordinator access required.' using errcode='42501';end if;
 if p_request is null or jsonb_typeof(p_data) is distinct from 'object' or length(p_data::text)>16000 or length(btrim(coalesce(p_data->>'note','')))<5 then raise exception 'Enter registration details and source evidence.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor_id::text||p_request::text,0));
 select * into old_request from care_private.journey_requests where actor=actor_id and request_id=p_request;
 if found then if old_request.payload<>payload then raise exception 'Changed retry details require a new request.' using errcode='22023';end if;return old_request.result;end if;
 m:=nullif(p_data->>'existingId','')::uuid;
 if m is null then
  phone_value:=care_private.normalize_phone(nullif(btrim(p_data->>'phone'),''));email_value:=lower(nullif(btrim(p_data->>'email'),''));
  if phone_value is null and email_value is null then raise exception 'Record a phone number or email address.' using errcode='22023';end if;
  -- Same contact contenders serialize; unique central indexes remain the final race guard.
  perform pg_advisory_xact_lock(hashtextextended(coalesce(phone_value,'')||'|'||coalesce(email_value,''),18018));
  select id into phone_match from public.care_members where phone=phone_value;
  select id into email_match from public.care_members where lower(email)=email_value;
  if phone_match is not null or email_match is not null then raise exception 'An existing person matches this email or phone. Search and select their record; do not create a duplicate.' using errcode='23505';end if;
  if exists(select 1 from public.care_guest_submissions where member_id is null and review_status='pending' and ((phone_value is not null and phone=phone_value) or (email_value is not null and lower(email)=email_value))) then raise exception 'A pending guest submission matches. Review it in Guest submissions before direct registration.' using errcode='22023';end if;
  insert into public.care_members(other_names,surname,phone,email,status,gender,occupation,residential_address,joined_on,created_by)
  values(btrim(p_data->>'first'),btrim(p_data->>'last'),phone_value,email_value,'visitor',nullif(p_data->>'gender',''),nullif(btrim(p_data->>'occupation'),''),nullif(btrim(p_data->>'address'),''),(now() at time zone 'Africa/Lagos')::date,actor_id) returning id into m;created_new:=true;
  -- Defaults apply to this new record; explicit channel opt-outs supplied by staff remain off.
  update public.care_preferences set contact_consent=coalesce((p_data->>'contactConsent')::boolean,true),email_opt_in=email_value is not null and coalesce((p_data->>'emailOptIn')::boolean,true),sms_opt_in=coalesce((p_data->>'smsOptIn')::boolean,true),source='admin',evidence_note=p_data->>'note',updated_at=now() where member_id=m;
 end if;
 select * into existing from public.care_members where id=m and archived_at is null for update;
 if not found then raise exception 'Select a current central person record.' using errcode='22023';end if;
 select * into j from public.care_journeys where member_id=m for update;
 if j.official_joined_on is not null or j.legacy_member then raise exception 'This person is already an official member. Open their existing journey.' using errcode='22023';end if;
 if nullif(p_data->>'existingId','') is not null and (p_data->>'identityConfirmed') is distinct from 'true' then raise exception 'Confirm that this is the same person.' using errcode='22023';end if;
 update public.care_journeys set registration_source=case when not created_new and registration_source in ('visitor_form','staff_visitor') then registration_source else 'direct' end,direct_registered_at=coalesce(direct_registered_at,now()),version=version+1 where member_id=m;
 dt:=nullif(p_data->>'previousVisitDate','')::date;
 if dt is not null then
  if dt>(now() at time zone 'Africa/Lagos')::date or length(btrim(coalesce(p_data->>'visitEvidence','')))<3 then raise exception 'Record an actual VBC visit date and its evidence. Do not guess a missing date.' using errcode='22023';end if;
  insert into public.care_journey_attendance(member_id,service_date,service_key,service_type,source,evidence,verification,qualifies,recorded_by)
  values(m,dt,'Previous VBC church visit','Church service - type not specified','other',p_data->>'visitEvidence','self_report',true,actor_id)
  on conflict(member_id,service_date,lower(service_type)) where voided_at is null do nothing;
 end if;
 if dt is null and (p_data->>'previousVisitConfirmed')='true' then
 dt:=nullif(p_data->>'beforeDate','')::date;
 if dt is null or dt>(now() at time zone 'Africa/Lagos')::date or length(btrim(coalesce(p_data->>'visitEvidence','')))<3 then raise exception 'Record the previous-visit evidence and known-before bound. Do not guess an actual visit date.' using errcode='22023';end if;
 insert into public.care_journey_previous_visits(member_id,known_before,source,evidence,recorded_by) values(m,dt,'other',p_data->>'visitEvidence',actor_id);
 end if;
 insert into public.care_journey_events(member_id,actor,action,detail) values(m,actor_id,'direct_registration',p_data-'email'-'phone'||jsonb_build_object('registration_source',(select registration_source from public.care_journeys where member_id=m)));
 answer:=jsonb_build_object('saved',true,'memberId',m);insert into care_private.journey_requests values(actor_id,p_request,payload,answer);return answer;
end$$;
