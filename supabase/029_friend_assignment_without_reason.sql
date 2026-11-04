-- Assignment history still records the actor, old Friend and selected new Friend.
begin;
create or replace function public.care_journey_write(p_action text,p_data jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid();j public.care_journeys;m uuid;v integer;old_request care_private.journey_requests;c boolean:=care_private.journey_cap('coordinator');f boolean:=care_private.journey_cap('foundation');admin boolean:=care_private.has_role(array['administrator']);payload jsonb:=jsonb_build_object('action',p_action,'data',p_data);answer jsonb;dt date;at_time timestamptz;worker uuid;policy public.care_journey_policy;previous_entry jsonb:='{}'::jsonb;outcome text;method text;note text:=coalesce(p_data->>'note','');pref public.care_preferences;k text;begin
 if actor_id is null or not(c or f or care_private.journey_cap('friend')) then raise exception 'Not authorized' using errcode='42501';end if;
 if p_request is null or p_action is null or jsonb_typeof(p_data) is distinct from 'object' or length(p_data::text)>16000 or length(note)>2000 then raise exception 'Invalid request' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor_id::text||p_request::text,0));
 select * into old_request from care_private.journey_requests where actor=actor_id and request_id=p_request;
 if found then if old_request.payload<>payload then raise exception 'Request identifier reused with different details.' using errcode='22023';end if;return old_request.result;end if;
 select * into policy from public.care_journey_policy where id=1;
 if p_action in ('policy','role','cohort') then
 if p_action='cohort' then
 if nullif(btrim(p_data->>'name'),'') is null or length(p_data->>'name')>120 or nullif(p_data->>'date','') is null then raise exception 'Enter a cohort name and start date.' using errcode='22023';end if;
 if not f then raise exception 'Foundation Class Coordinator access required.' using errcode='42501';end if;
 insert into public.care_journey_cohorts(name,starts_on,created_by) values(btrim(p_data->>'name'),(p_data->>'date')::date,actor_id);
 else
 if not admin then raise exception 'Church administrator access required.' using errcode='42501';end if;
 if length(btrim(note))<5 then raise exception 'Record the approval or reason.' using errcode='22023';end if;
 if p_action='role' then
 worker:=(p_data->>'worker')::uuid;
 if not exists(select 1 from public.care_staff where user_id=worker and is_active) or coalesce(p_data->>'capability','') not in ('coordinator','foundation','friend') then raise exception 'Select active staff and a valid capability.' using errcode='22023';end if;
 if jsonb_typeof(p_data->'enabled') is distinct from 'boolean' then raise exception 'Choose grant or remove.' using errcode='22023';end if;
 if not (p_data->>'enabled')::boolean and exists(select 1 from public.care_staff where user_id=worker and (role='administrator' or (role='followup_worker' and p_data->>'capability'='friend'))) then raise exception 'This access is inherited from the staff role. Change the staff role or deactivate the account in Member Care Team settings.' using errcode='22023';end if;
 if (p_data->>'enabled')::boolean then insert into public.care_journey_roles values(worker,p_data->>'capability',actor_id) on conflict do nothing;else delete from public.care_journey_roles where user_id=worker and capability=p_data->>'capability';end if;
 else
 if jsonb_typeof(p_data->'serviceTypes') is distinct from 'array' or jsonb_array_length(p_data->'serviceTypes')>20 then raise exception 'Choose up to 20 church service types.' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements_text(p_data->'serviceTypes')t where length(btrim(t)) not between 1 and 100 or lower(t) ~ '(home.?cell|cfc|foundation)') then raise exception 'Home Cell and CFC cannot count as church services.' using errcode='22023';end if;
 update public.care_journey_policy set service_types=array(select distinct btrim(x) from jsonb_array_elements_text(p_data->'serviceTypes')x),first_contact_hours=(p_data->>'firstContactHours')::integer,cfc_policy=nullif(btrim(p_data->>'cfcPolicy'),''),care_policy=nullif(btrim(p_data->>'carePolicy'),''),updated_by=actor_id where id=1;
 end if;end if;
 else
 m:=(p_data->>'memberId')::uuid;v:=(p_data->>'version')::integer;
 select * into j from public.care_journeys where member_id=m for update;
 if not found or not care_private.journey_visible(m) then raise exception 'This person is outside your assigned journey access.' using errcode='42501';end if;
 if v is distinct from j.version then raise exception 'This record changed. Refresh before saving again.' using errcode='40001';end if;
 if p_action in ('assign','intention','join','care_review','void_attendance','legacy_date') and not c then raise exception 'Follow-up Coordinator access required.' using errcode='42501';end if;
 if p_action in ('contact','attendance') and not(c or (care_private.journey_cap('friend') and j.assigned_to=actor_id)) then raise exception 'Assigned friend access required.' using errcode='42501';end if;
 if p_action in ('enrol','class_attendance','complete_cfc','certificate') and not f then raise exception 'Foundation Class Coordinator access required.' using errcode='42501';end if;
 if p_action='assign' then
 worker:=(p_data->>'worker')::uuid;
 if not exists(select 1 from public.care_staff s where s.user_id=worker and s.is_active and (s.role in ('administrator','followup_worker') or exists(select 1 from public.care_journey_roles r where r.user_id=worker and r.capability='friend'))) then raise exception 'Choose an active Follow-through Friend.' using errcode='22023';end if;

 update public.care_journeys set assigned_to=worker,assignment_conflict=false where member_id=m;
 if not exists(select 1 from public.care_journey_contacts where member_id=m) and not exists(select 1 from public.care_followup_activities e join public.care_followups x on x.id=e.followup_id where x.member_id=m) and not exists(select 1 from public.care_journey_tasks where member_id=m and status='open') and coalesce((select contact_consent from public.care_preferences where member_id=m),false) then insert into public.care_journey_tasks(member_id,due_at,kind,note) select m,created_at+make_interval(hours=>policy.first_contact_hours),'first_contact','Operational deadline from registration time, not verified attendance.' from public.care_members where id=m;end if;
 elsif p_action in ('purpose','followup_state','support','ministry_add','ministry_end','previous_visit','void_previous_visit') then
 perform care_private.journey_integration_write(p_action,p_data,actor_id,m,c);
 elsif p_action='contact' then
 select * into pref from public.care_preferences where member_id=m for update;
 method:=p_data->>'method';outcome:=p_data->>'outcome';at_time:=(p_data->>'occurredAt')::timestamptz;
 if at_time is null or at_time>now()+interval '1 minute' then raise exception 'Enter an actual contact time, not a future time.' using errcode='22023';end if;
 if (not coalesce(pref.contact_consent,false) or j.followup_state<>'active') and outcome<>'no_further_contact' then raise exception 'Outreach is paused because contact permission is off.' using errcode='22023';end if;
 if outcome<>'no_further_contact' and ((method='sms' and not pref.sms_opt_in) or (method='email' and not pref.email_opt_in)) then raise exception 'This channel is opted out.' using errcode='22023';end if;
 if outcome='callback' and nullif(p_data->>'nextDue','') is null then raise exception 'Choose a callback date and time.' using errcode='22023';end if;
 if nullif(p_data->>'nextDue','') is not null and ((p_data->>'nextDue')::timestamptz<=now() or (p_data->>'nextDue')::timestamptz<=at_time) then raise exception 'Next contact must be in the future.' using errcode='22023';end if;
 if outcome='no_further_contact' then
 if length(btrim(note))<3 then raise exception 'Record the request to stop all contact.' using errcode='22023';end if;
 foreach k in array array['contact_consent','email_opt_in','sms_opt_in','celebrations_opt_in','programmes_opt_in','newsletters_opt_in'] loop insert into public.care_consent_events(member_id,preference,previous_value,new_value,source,policy_version,evidence_note,recorded_by) values(m,k,(to_jsonb(pref)->>k)::boolean,false,'admin',coalesce(pref.policy_version,'v1'),note,actor_id);end loop;
 update public.care_journeys set followup_state='declined_contact' where member_id=m;
 update public.care_preferences set contact_consent=false,email_opt_in=false,sms_opt_in=false,celebrations_opt_in=false,programmes_opt_in=false,newsletters_opt_in=false,source='admin',evidence_note=note,updated_at=now() where member_id=m;
 update public.care_journey_tasks set status='paused' where member_id=m and status='open' and kind<>'care_review';
 else
 update public.care_journey_tasks set status='done' where member_id=m and status='open' and kind<>'care_review';
 if nullif(p_data->>'nextDue','') is not null then insert into public.care_journey_tasks(member_id,due_at,kind,note) values(m,(p_data->>'nextDue')::timestamptz,case when outcome='callback' then 'callback' else 'followup' end,left(note,1000));end if;
 end if;
 insert into public.care_journey_contacts(member_id,actor,occurred_at,method,outcome,successful,note) values(m,actor_id,at_time,method,outcome,outcome in ('positive','undecided','promised_return','callback','not_interested','no_further_contact'),note);
 elsif p_action='attendance' then
 dt:=(p_data->>'date')::date;
 if dt is null or dt>(now() at time zone 'Africa/Lagos')::date then raise exception 'Enter an actual service date.' using errcode='22023';end if;
 if lower(p_data->>'serviceType') ~ '(home.?cell|cfc|foundation)' then raise exception 'Home Cell and CFC belong to their own tracks.' using errcode='22023';end if;
 insert into public.care_journey_attendance(member_id,service_date,service_key,service_type,source,evidence,verification,qualifies,recorded_by) values(m,dt,btrim(p_data->>'serviceKey'),coalesce(nullif(btrim(p_data->>'serviceType'),''),'Church service - type not specified'),p_data->>'source',coalesce(nullif(btrim(note),''),'Attendance reported; no additional remarks.'),p_data->>'verification',true,actor_id);
 elsif p_action='void_attendance' then
 if length(btrim(note))<5 or (j.official_joined_on is not null and not admin) then raise exception 'Record a correction reason. Post-joining corrections require a church administrator.' using errcode='22023';end if;
 update public.care_journey_attendance set voided_at=now() where id=(p_data->>'attendanceId')::uuid and member_id=m and voided_at is null;
 if not found then raise exception 'Attendance entry not found.' using errcode='22023';end if;
 if j.official_joined_on is not null and not j.legacy_member and not care_private.journey_has_previous_visit(m,j.official_joined_on) then update public.care_journeys set membership_review=true where member_id=m;end if;
 elsif p_action='review_membership' then
 if not admin or length(btrim(note))<5 or (not j.legacy_member and not care_private.journey_has_previous_visit(m,j.official_joined_on)) then raise exception 'Administrator review and sufficient joining-date evidence are required.' using errcode='22023';end if;
 update public.care_journeys set membership_review=false where member_id=m;
 elsif p_action='intention' then update public.care_journeys set intention=p_data->>'intention' where member_id=m;
 elsif p_action in ('join','legacy_date') then
 dt:=(p_data->>'date')::date;
 if dt is null or dt>(now() at time zone 'Africa/Lagos')::date or length(btrim(note))<5 or j.official_joined_on is not null then raise exception 'Enter an actual joining date and evidence; membership must not already be confirmed.' using errcode='22023';end if;
 if p_action='legacy_date' then if not admin or not j.legacy_member then raise exception 'Only an administrator may reconcile a pre-existing official member with documentary evidence.' using errcode='42501';end if;
 elsif j.legacy_member or not care_private.journey_has_previous_visit(m,dt) then raise exception 'One recorded previous VBC church visit is required before the joining date. A first-time same-day joining exception has not been approved.' using errcode='22023';end if;
 update public.care_journeys set official_joined_on=dt,confirmed_by=actor_id,care_until=(dt+interval '6 months')::date where member_id=m;
 update public.care_members set status='member' where id=m;
 insert into public.care_journey_tasks(member_id,due_at,kind,note) values(m,((dt+interval '6 months')::date+time '09:00') at time zone 'Africa/Lagos','care_review','Coordinator review required; never automatically closed.');
 elsif p_action='care_review' then
 if j.official_joined_on is null or length(btrim(note))<5 then raise exception 'Confirm the actual membership date and record the care review.' using errcode='22023';end if;
 if p_data->>'decision'='complete' then
 if (now() at time zone 'Africa/Lagos')::date<j.care_until or policy.care_policy is null then raise exception 'Minimum care period and approved sign-off policy are required.' using errcode='22023';end if;
 update public.care_journeys set care_status='completed' where member_id=m;
 update public.care_journey_tasks set status='done' where member_id=m and kind='care_review' and status='open';
 elsif p_data->>'decision'='extend' then
 dt:=(p_data->>'date')::date;
 if dt is null or dt<=greatest(j.care_until,(now() at time zone 'Africa/Lagos')::date) then raise exception 'Choose a later review date.' using errcode='22023';end if;
 update public.care_journeys set care_until=dt,care_status='ongoing' where member_id=m;
 update public.care_journey_tasks set status='done' where member_id=m and kind='care_review' and status='open';
 insert into public.care_journey_tasks(member_id,due_at,kind,note) values(m,(dt+time '09:00') at time zone 'Africa/Lagos','care_review',left(note,1000));
 else raise exception 'Choose complete or extend.' using errcode='22023';end if;
 elsif p_action='enrol' then
 if j.official_joined_on is null then raise exception 'Confirm actual official membership before CFC enrolment.' using errcode='22023';end if;
 dt:=case when p_data ? 'date' then nullif(p_data->>'date','')::date else (now() at time zone 'Africa/Lagos')::date end; if dt>(now() at time zone 'Africa/Lagos')::date or dt<j.official_joined_on then raise exception 'Enrolment date must be actual and not before official joining.' using errcode='22023';end if; insert into public.care_journey_cfc(member_id,cohort_id,enrolled_on) values(m,(p_data->>'cohort')::uuid,dt);
 elsif p_action='class_attendance' then
 dt:=(p_data->>'date')::date;
 if dt is null or dt>(now() at time zone 'Africa/Lagos')::date or dt<j.official_joined_on or dt>(select completed_on from public.care_journey_cfc where member_id=m) or not exists(select 1 from public.care_journey_cfc e join public.care_journey_cohorts h on h.id=e.cohort_id where e.member_id=m and dt>=h.starts_on) then raise exception 'Choose an actual class date after joining and cohort start.' using errcode='22023';end if;
 select to_jsonb(t) into previous_entry from public.care_journey_cfc_attendance t where t.member_id=m and t.week=(p_data->>'week')::integer;
 if found then
 if coalesce(p_data->>'correction','')<>'on' or length(btrim(note))<5 then raise exception 'This week is already recorded. To correct it, select correction and give a reason.' using errcode='22023';end if;
 update public.care_journey_cfc_attendance set attended_on=dt,recorded_by=actor_id,attendance_status=coalesce(p_data->>'attendanceStatus','present'),note=coalesce(p_data->>'note','') where member_id=m and week=(p_data->>'week')::integer;
 else insert into public.care_journey_cfc_attendance(member_id,week,attended_on,recorded_by,attendance_status,note) values(m,(p_data->>'week')::integer,dt,actor_id,coalesce(p_data->>'attendanceStatus','present'),note);end if;
 elsif p_action='complete_cfc' then
 dt:=(p_data->>'date')::date;
 if policy.cfc_policy is null or length(btrim(note))<5 or dt is null or dt>(now() at time zone 'Africa/Lagos')::date or dt<j.official_joined_on or dt<coalesce((select max(attended_on) from public.care_journey_cfc_attendance where member_id=m),dt) then raise exception 'Approved CFC policy, valid completion date and assessment evidence required.' using errcode='22023';end if;
 update public.care_journey_cfc set completed_on=dt where member_id=m and completed_on is null;
 if not found then raise exception 'Enrolment is missing or already completed.' using errcode='22023';end if;
 elsif p_action='certificate' then dt:=case when p_data ? 'date' then nullif(p_data->>'date','')::date else (now() at time zone 'Africa/Lagos')::date end; if dt>(now() at time zone 'Africa/Lagos')::date or dt<(select completed_on from public.care_journey_cfc where member_id=m) then raise exception 'Award date must be actual, after completion and not in the future.' using errcode='22023';end if;
 if nullif(btrim(p_data->>'number'),'') is null or policy.cfc_policy is null or length(btrim(note))<5 then raise exception 'Approved certificate policy and award evidence required.' using errcode='22023';end if;
 update public.care_journey_cfc set certificate_number=btrim(p_data->>'number'),certificate_recorded_at=now(),certificate_awarded_on=dt where member_id=m and completed_on is not null and certificate_number is null;
 if not found then raise exception 'Complete CFC before recording a certificate award.' using errcode='22023';end if;
 else raise exception 'Unknown journey action.' using errcode='22023';end if;
 update public.care_journeys set version=version+1,updated_at=now() where member_id=m;
 end if;
 insert into public.care_journey_events(member_id,actor,action,detail) values(m,actor_id,p_action,p_data||jsonb_build_object('previous_friend',j.assigned_to,'previous_class_entry',previous_entry));
 answer:=jsonb_build_object('saved',true,'memberId',m);
 insert into care_private.journey_requests values(actor_id,p_request,payload,answer);return answer;end$$;

commit;
