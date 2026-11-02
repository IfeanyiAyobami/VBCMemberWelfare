-- Friends can register people without gaining access to other friends’ cases.
begin;
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

revoke all on function public.care_journey_direct(jsonb,uuid) from public,anon;
grant execute on function public.care_journey_direct(jsonb,uuid) to authenticated;
create or replace function public.care_journey_can_register() returns boolean language sql stable security definer set search_path='' as $$select care_private.journey_cap('coordinator') or care_private.journey_cap('friend')$$;
revoke all on function public.care_journey_can_register() from public,anon;
grant execute on function public.care_journey_can_register() to authenticated;
commit;
