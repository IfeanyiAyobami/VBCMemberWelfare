-- Apply only after migrations 001–026.

begin;
create table if not exists public.care_friend_pin_accounts(
 user_id uuid primary key references public.care_staff(user_id) on delete cascade,
 email text unique,phone text unique,pin_hash text not null,
 version uuid not null default gen_random_uuid(),
 window_start timestamptz not null default now(),attempts integer not null default 0,
 failures integer not null default 0,
 check(email is not null or phone is not null)
);
alter table public.care_friend_pin_accounts enable row level security;
revoke all on public.care_friend_pin_accounts from public,anon,authenticated;
grant all on public.care_friend_pin_accounts to service_role;
create or replace function care_private.friend_pin_eligible(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.care_staff s where user_id=p_user and is_active and role='followup_worker')
 and exists(select 1 from public.care_journey_roles where user_id=p_user and capability='friend')
 and not exists(select 1 from public.care_journey_roles where user_id=p_user and capability in ('coordinator','foundation'))
 and not exists(select 1 from public.hco_assignments where user_id=p_user and active)
$$;
revoke all on function care_private.friend_pin_eligible(uuid) from public,anon,authenticated;
create or replace function public.care_friend_pin_attempt(p_identity text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.care_friend_pin_accounts;
begin
 select * into r from public.care_friend_pin_accounts where email=lower(p_identity) or phone=p_identity for update;
 if not found or not care_private.friend_pin_eligible(r.user_id) then return '{}'::jsonb;end if;
 if r.window_start<=now()-interval '15 minutes' then r.attempts:=0;r.window_start:=now();end if;
 if r.attempts>=5 or r.failures>=20 then return '{}'::jsonb;end if;
 update public.care_friend_pin_accounts set attempts=r.attempts+1,window_start=r.window_start,failures=failures+1 where user_id=r.user_id;
 return jsonb_build_object('user_id',r.user_id,'pin_hash',r.pin_hash,'version',r.version);
end$$;
create or replace function public.care_friend_pin_complete(p_user uuid,p_version uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not care_private.friend_pin_eligible(p_user) then return false;end if;
 update public.care_friend_pin_accounts set failures=0 where user_id=p_user and version=p_version;
 return found;
end$$;
create or replace function public.care_friend_pin_save(p_actor uuid,p_user uuid,p_name text,p_email text,p_phone text,p_hash text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.care_staff where user_id=p_actor and is_active and role='administrator') then raise exception 'Administrator access required.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,27027));
 if exists(select 1 from public.care_staff where user_id=p_user and (role<>'followup_worker' or not is_active)) or exists(select 1 from public.care_journey_roles where user_id=p_user and capability in ('coordinator','foundation')) or exists(select 1 from public.hco_assignments where user_id=p_user and active) then raise exception 'PIN access is only for active Friend-only accounts.' using errcode='42501';end if;
 if p_email is null and p_phone is null or length(btrim(p_name)) not between 2 and 120 or length(p_hash)>500 or p_hash is null then raise exception 'Invalid Friend details.' using errcode='22023';end if;
 insert into public.care_staff(user_id,display_name,role) values(p_user,btrim(p_name),'followup_worker') on conflict(user_id) do nothing;
 insert into public.care_journey_roles(user_id,capability,granted_by) values(p_user,'friend',p_actor) on conflict do nothing;
 insert into public.care_friend_pin_accounts(user_id,email,phone,pin_hash) values(p_user,p_email,p_phone,p_hash)
 on conflict(user_id) do update set email=excluded.email,phone=excluded.phone,pin_hash=excluded.pin_hash,version=gen_random_uuid(),attempts=0,failures=0,window_start=now();
 insert into public.care_journey_events(member_id,actor,action,detail) values(null,p_actor,'friend_pin_account_saved',jsonb_build_object('user_id',p_user));
 return true;
end$$;
revoke all on function public.care_friend_pin_attempt(text),public.care_friend_pin_complete(uuid,uuid),public.care_friend_pin_save(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.care_friend_pin_attempt(text),public.care_friend_pin_complete(uuid,uuid),public.care_friend_pin_save(uuid,uuid,text,text,text,text) to service_role;
commit;

begin;
-- A module Coordinator keeps journey capabilities, but no church-office role access.
create or replace function public.care_journey_restricted() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.care_staff s where user_id=auth.uid() and is_active and role<>'administrator' and (role='followup_worker' or exists(select 1 from public.care_journey_roles r where r.user_id=s.user_id and capability='coordinator')))
$$;
revoke all on function public.care_journey_restricted() from public,anon;
grant execute on function public.care_journey_restricted() to authenticated;
create or replace function care_private.has_role(allowed_roles text[]) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.care_staff s where user_id=auth.uid() and is_active and role=any(allowed_roles) and (role='administrator' or not public.care_journey_restricted()))
$$;
-- Staff can still verify their own active account; no global staff list is exposed.
drop policy if exists care_staff_own_identity on public.care_staff;
create policy care_staff_own_identity on public.care_staff for select to authenticated using(user_id=auth.uid());
create or replace function public.care_friend_account_manager() returns boolean language sql stable security definer set search_path='' as $$select care_private.journey_cap('coordinator')$$;
revoke all on function public.care_friend_account_manager() from public,anon;
grant execute on function public.care_friend_account_manager() to authenticated;
create or replace function public.care_programme_can_edit() returns boolean language sql stable security definer set search_path='' as $$select care_private.has_role(array['administrator','editor'])$$;
-- Friend account provisioning: Coordinator authority is limited to Friend-only targets.
create or replace function public.care_friend_pin_save(p_actor uuid,p_user uuid,p_name text,p_email text,p_phone text,p_hash text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.care_staff s where user_id=p_actor and is_active and (role='administrator' or exists(select 1 from public.care_journey_roles r where r.user_id=s.user_id and capability='coordinator'))) then raise exception 'Coordinator access required.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,27027));
 if exists(select 1 from public.care_staff where user_id=p_user and (role<>'followup_worker' or not is_active)) or exists(select 1 from public.care_journey_roles where user_id=p_user and capability in ('coordinator','foundation')) or exists(select 1 from public.hco_assignments where user_id=p_user and active) then raise exception 'PIN access is only for active Friend-only accounts.' using errcode='42501';end if;
 if p_email is null and p_phone is null or length(btrim(p_name)) not between 2 and 120 or length(p_hash)>500 or p_hash is null then raise exception 'Invalid Friend details.' using errcode='22023';end if;
 insert into public.care_staff(user_id,display_name,role) values(p_user,btrim(p_name),'followup_worker') on conflict(user_id) do nothing;
 insert into public.care_journey_roles(user_id,capability,granted_by) values(p_user,'friend',p_actor) on conflict do nothing;
 insert into public.care_friend_pin_accounts(user_id,email,phone,pin_hash) values(p_user,p_email,p_phone,p_hash)
 on conflict(user_id) do update set email=excluded.email,phone=excluded.phone,pin_hash=excluded.pin_hash,version=gen_random_uuid(),attempts=0,failures=0,window_start=now();
 insert into public.care_journey_events(member_id,actor,action,detail) values(null,p_actor,'friend_pin_account_saved',jsonb_build_object('user_id',p_user));
 return true;
end$$;
create or replace function public.care_journey_celebration_dates(p_member uuid,p_data jsonb default null,p_request uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.care_journeys;old care_private.journey_requests;payload jsonb:=jsonb_build_object('action','celebration_dates','member',p_member,'data',p_data);bm integer;bd integer;am integer;ad integer;answer jsonb;
begin
 select * into j from public.care_journeys where member_id=p_member for update;
 if not found or not(care_private.journey_cap('coordinator') or (care_private.journey_cap('friend') and j.assigned_to=auth.uid())) or not exists(select 1 from public.care_members where id=p_member and archived_at is null) then raise exception 'Assigned Friend or Coordinator access required.' using errcode='42501';end if;
 if p_data is not null then
  if p_request is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>1000 then raise exception 'Invalid celebration dates.' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_request::text,28028));
  select * into old from care_private.journey_requests where actor=auth.uid() and request_id=p_request;
  if found then if old.payload<>payload then raise exception 'Changed retry needs a new request.' using errcode='22023';end if;return old.result;end if;
  bm:=nullif(p_data->>'birthdayMonth','')::integer;bd:=nullif(p_data->>'birthdayDay','')::integer;am:=nullif(p_data->>'anniversaryMonth','')::integer;ad:=nullif(p_data->>'anniversaryDay','')::integer;
  if not care_private.valid_month_day(bm,bd) or not care_private.valid_month_day(am,ad) then raise exception 'Enter valid month/day pairs or leave both blank.' using errcode='22023';end if;
  update public.care_members set birthday_month=bm,birthday_day=bd,anniversary_month=am,anniversary_day=ad,updated_at=now() where id=p_member;
  insert into public.care_journey_events(member_id,actor,action,detail) values(p_member,auth.uid(),'celebration_dates_updated',p_data);
 end if;
 select jsonb_build_object('birthdayMonth',birthday_month,'birthdayDay',birthday_day,'anniversaryMonth',anniversary_month,'anniversaryDay',anniversary_day) into answer from public.care_members where id=p_member;
 if p_data is not null then insert into care_private.journey_requests values(auth.uid(),p_request,payload,answer);end if;
 return answer;
end$$;
revoke all on function public.care_journey_celebration_dates(uuid,jsonb,uuid) from public,anon;
grant execute on function public.care_journey_celebration_dates(uuid,jsonb,uuid) to authenticated;
create or replace function public.care_journey_direct(p_data jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid();m uuid;existing public.care_members;j public.care_journeys;old_request care_private.journey_requests;
 payload jsonb:=jsonb_build_object('action','direct','data',p_data);answer jsonb;phone_value text;email_value text;dt date;phone_match uuid;email_match uuid;created_new boolean:=false;
begin
 if not (care_private.journey_cap('coordinator') or care_private.journey_cap('friend')) then raise exception 'Follow Through registration access required.' using errcode='42501';end if;
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
  -- Optional celebration facts share the central record. Unknown dates remain null.
  if not care_private.valid_month_day(nullif(p_data->>'birthdayMonth','')::integer,nullif(p_data->>'birthdayDay','')::integer) or not care_private.valid_month_day(nullif(p_data->>'anniversaryMonth','')::integer,nullif(p_data->>'anniversaryDay','')::integer) then raise exception 'Enter valid celebration month/day pairs.' using errcode='22023';end if;
  update public.care_members set birthday_month=nullif(p_data->>'birthdayMonth','')::integer,birthday_day=nullif(p_data->>'birthdayDay','')::integer,anniversary_month=nullif(p_data->>'anniversaryMonth','')::integer,anniversary_day=nullif(p_data->>'anniversaryDay','')::integer where id=m;
  -- Defaults apply to this new record; explicit channel opt-outs supplied by staff remain off.
  update public.care_preferences set contact_consent=coalesce((p_data->>'contactConsent')::boolean,true),email_opt_in=email_value is not null and coalesce((p_data->>'emailOptIn')::boolean,true),sms_opt_in=coalesce((p_data->>'smsOptIn')::boolean,true),source='admin',evidence_note=p_data->>'note',updated_at=now() where member_id=m;
 end if;
 select * into existing from public.care_members where id=m and archived_at is null for update;
 if not found then raise exception 'Select a current central person record.' using errcode='22023';end if;
 select * into j from public.care_journeys where member_id=m for update;
 if not care_private.journey_cap('coordinator') and not created_new and j.assigned_to is distinct from actor_id then raise exception 'This record needs Coordinator identity review. No assignment was changed.' using errcode='42501';end if;
 if created_new and care_private.journey_cap('friend') and not care_private.journey_cap('coordinator') then update public.care_journeys set assigned_to=actor_id where member_id=m;end if;
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


commit;
