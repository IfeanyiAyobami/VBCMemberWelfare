-- Apply to a database already migrated through 021.

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


-- Saved programmes and public programme artwork. Public artwork contains no member data.
begin;
-- Extend the original programme table. Existing rows, IDs and invitations remain linked.
alter table public.care_programmes add column if not exists recurrence text not null default 'once';
alter table public.care_programmes add column if not exists event_date date;
alter table public.care_programmes add column if not exists weekday smallint;
alter table public.care_programmes add column if not exists start_time time;
alter table public.care_programmes add column if not exists information_link text not null default '';
alter table public.care_programmes add column if not exists flyer_path text;
alter table public.care_programmes add column if not exists updated_by uuid references public.care_staff(user_id);
alter table public.care_programmes add column if not exists version integer not null default 1;
alter table public.care_programmes alter column starts_at drop not null;
update public.care_programmes set event_date=(starts_at at time zone 'Africa/Lagos')::date,start_time=(starts_at at time zone 'Africa/Lagos')::time,information_link=coalesce(info_url,'') where recurrence='once' and event_date is null and starts_at is not null;
alter table public.care_programmes alter column start_time set not null;
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.care_programmes'::regclass and conname='care_programme_schedule') then alter table public.care_programmes add constraint care_programme_schedule check((recurrence='once' and event_date is not null and weekday is null) or (recurrence='weekly' and event_date is null and weekday between 0 and 6 and weekday is not null));end if;
 if not exists(select 1 from pg_constraint where conrelid='public.care_programmes'::regclass and conname='care_programme_flyer_path') then alter table public.care_programmes add constraint care_programme_flyer_path check(flyer_path is null or flyer_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$');end if;
 if not exists(select 1 from pg_constraint where conrelid='public.care_programmes'::regclass and conname='care_programme_information_link') then alter table public.care_programmes add constraint care_programme_information_link check(information_link='' or (information_link ~ '^https?://' and length(information_link)<=2000));end if;
end$$;
create table if not exists care_private.programme_requests(actor uuid not null,request_id uuid not null,payload jsonb not null,result jsonb not null,primary key(actor,request_id));
create or replace function public.care_programme_can_edit() returns boolean language sql stable security definer set search_path='' as $$select care_private.has_role(array['administrator','editor']) or care_private.journey_cap('coordinator')$$;
create or replace function public.care_programme_save(p_data jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); old public.care_programmes; replay care_private.programme_requests; result jsonb; target uuid:=nullif(p_data->>'id','')::uuid; mode text:=p_data->>'recurrence';
begin
 if not public.care_programme_can_edit() then raise exception 'Programme editor access required.' using errcode='42501';end if;
 if p_request is null or jsonb_typeof(p_data) is distinct from 'object' or length(p_data::text)>16000 then raise exception 'Invalid programme.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor_id::text||p_request::text,23023));
 select * into replay from care_private.programme_requests where programme_requests.actor=actor_id and request_id=p_request;
 -- Qualified actor column avoids ambiguity with the local variable.
 if found then if replay.payload<>p_data then raise exception 'Changed details need a new save request.' using errcode='22023';end if;return replay.result;end if;
 if mode not in ('once','weekly') or mode is null then raise exception 'Choose one-off or weekly.' using errcode='22023';end if;
 if nullif(p_data->>'flyerPath','') is not null and not exists(select 1 from public.care_programmes where id=target and flyer_path=p_data->>'flyerPath') and split_part(p_data->>'flyerPath','/',1)<>actor_id::text then raise exception 'Upload programme artwork using your staff account.' using errcode='42501';end if;
 if nullif(p_data->>'flyerPath','') is not null and to_regclass('storage.objects') is not null then
  if not exists(select 1 from storage.objects where bucket_id='care-programme-flyers' and name=p_data->>'flyerPath') then raise exception 'Upload the programme flyer before saving.' using errcode='22023';end if;
 end if;
 if target is not null then
  select * into old from public.care_programmes where id=target for update;
  if not found then raise exception 'Programme not found.' using errcode='22023';end if;
  if old.version is distinct from (p_data->>'version')::integer then raise exception 'This programme changed elsewhere. Close this form and refresh before editing.' using errcode='40001';end if;
  update public.care_programmes set title=btrim(p_data->>'title'),description=coalesce(p_data->>'description',''),recurrence=mode,event_date=case when mode='once' then nullif(p_data->>'date','')::date end,weekday=case when mode='weekly' then (p_data->>'weekday')::smallint end,start_time=(p_data->>'time')::time,venue=btrim(p_data->>'venue'),information_link=coalesce(p_data->>'link',''),flyer_path=nullif(p_data->>'flyerPath',''),starts_at=case when mode='once' then (nullif(p_data->>'date','')::date+(p_data->>'time')::time) at time zone 'Africa/Lagos' end,ends_at=null,info_url=case when p_data->>'link' ~ '^https://' then p_data->>'link' end,updated_by=actor_id,updated_at=now(),version=version+1 where id=target returning to_jsonb(care_programmes.*) into result;
 else
  insert into public.care_programmes(title,description,recurrence,event_date,weekday,start_time,venue,information_link,flyer_path,created_by,updated_by,starts_at) values(btrim(p_data->>'title'),coalesce(p_data->>'description',''),mode,case when mode='once' then nullif(p_data->>'date','')::date end,case when mode='weekly' then (p_data->>'weekday')::smallint end,(p_data->>'time')::time,btrim(p_data->>'venue'),coalesce(p_data->>'link',''),nullif(p_data->>'flyerPath',''),actor_id,actor_id,case when mode='once' then (nullif(p_data->>'date','')::date+(p_data->>'time')::time) at time zone 'Africa/Lagos' end) returning id,to_jsonb(care_programmes.*) into target,result;
 end if;
 insert into care_private.programme_requests values(actor_id,p_request,p_data,result);return result;
end$$;
alter table public.care_programmes enable row level security;
drop policy if exists care_programmes_read on public.care_programmes;
create policy care_programmes_read on public.care_programmes for select to authenticated using(care_private.has_role(array['administrator','editor','viewer','followup_worker']));
revoke all on public.care_programmes from anon,authenticated;
grant select on public.care_programmes to authenticated;
revoke all on function public.care_programme_can_edit(),public.care_programme_save(jsonb,uuid) from public,anon;
grant execute on function public.care_programme_can_edit(),public.care_programme_save(jsonb,uuid) to authenticated;
-- Supabase Storage may be absent in an isolated database test.
do $$begin if to_regclass('storage.buckets') is not null then
 insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('care-programme-flyers','care-programme-flyers',true,4194304,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
 execute 'drop policy if exists care_programme_art_insert on storage.objects';
 execute 'create policy care_programme_art_insert on storage.objects for insert to authenticated with check(bucket_id=''care-programme-flyers'' and (storage.foldername(name))[1]=auth.uid()::text and public.care_programme_can_edit())';
end if;end$$;
commit;


-- Familiar register columns and class attendance. All original scope checks still apply.
begin;
create or replace function public.care_journey_register(p_member uuid default null,p_search text default '',p_page integer default 0,p_view text default 'all',p_stage text default 'all') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; people jsonb;
begin
 result:=public.care_journey_read(p_member,p_search,p_page,p_view,p_stage);
 select coalesce(jsonb_agg(item||jsonb_build_object('gender',m.gender,'date_on_board',(m.created_at at time zone 'Africa/Lagos')::date,'cfc_cohort',co.name,'cfc_enrolled_on',c.enrolled_on,'cfc_completed_on',c.completed_on,'certificate_number',c.certificate_number,'cfc_weeks',coalesce((select jsonb_agg(jsonb_build_object('week',a.week,'status',a.attendance_status,'date',a.attended_on) order by a.week) from public.care_journey_cfc_attendance a where a.member_id=m.id),'[]'::jsonb)) order by x.position),'[]'::jsonb) into people
 from jsonb_array_elements(result->'items') with ordinality as x(item,position)
 join public.care_members m on m.id=(item->>'member_id')::uuid left join public.care_journey_cfc c on c.member_id=m.id left join public.care_journey_cohorts co on co.id=c.cohort_id;
 return result||jsonb_build_object('items',people);
end$$;
revoke all on function public.care_journey_register(uuid,text,integer,text,text) from public,anon;
grant execute on function public.care_journey_register(uuid,text,integer,text,text) to authenticated;

create or replace function public.care_journey_report(p_from date,p_to date,p_worker uuid default null,p_page integer default 0,p_limit integer default 1000)
returns jsonb language plpgsql security definer set search_path='' as $$
declare answer jsonb;c boolean:=care_private.journey_cap('coordinator');w boolean:=care_private.journey_cap('friend');actor_id uuid:=auth.uid();begin
 if not(c or w) then raise exception 'Coordinator or assigned friend reporting access required.' using errcode='42501';end if;
 if p_from is null or p_to is null or p_from>p_to or p_to>(now() at time zone 'Africa/Lagos')::date or p_to-p_from>3660 or p_page<0 or p_limit not between 1 and 10000 then raise exception 'Choose a valid reporting period of up to ten years, ending today or earlier.' using errcode='22023';end if;
 if not c and p_worker is not null and p_worker<>actor_id then raise exception 'Reports are limited to your assigned people.' using errcode='42501';end if;
 insert into public.care_journey_events(member_id,actor,action,detail) values(null,actor_id,'report_generated',jsonb_build_object('from',p_from,'to',p_to,'worker',p_worker,'page',p_page,'limit',p_limit));
 with contact_history as (
  select x.member_id,x.occurred_at,x.method,x.outcome,x.successful,x.actor from public.care_journey_contacts x join public.care_journeys cj on cj.member_id=x.member_id where (c or cj.assigned_to=actor_id) and (p_worker is null or cj.assigned_to=p_worker)
  union all
  select f.member_id,a.created_at,a.method,a.outcome,case when a.outcome in ('reached','requested_callback','declined') then true when a.outcome='no_answer' then false else null end,a.author_id
  from public.care_followup_activities a join public.care_followups f on f.id=a.followup_id join public.care_journeys cj on cj.member_id=f.member_id where (c or cj.assigned_to=actor_id) and (p_worker is null or cj.assigned_to=p_worker)
 ), base as (
 select j.*,m.other_names||' '||m.surname name,m.created_at registered_at,m.status,m.archived_at,
 case when cp.contact_consent then m.phone end phone,case when cp.contact_consent and cp.email_opt_in then m.email end email,
 coalesce(cp.contact_consent,false) contact_consent,coalesce(cp.email_opt_in,false) email_opt_in,m.gender,m.occupation,case when cp.contact_consent then m.residential_address end residential_address,case when cp.contact_consent then m.whatsapp end whatsapp,s.display_name worker_name,
 exists(select 1 from public.care_journey_previous_visits pv where pv.member_id=j.member_id and pv.voided_at is null and pv.known_before<=p_to+1) undated_previous_visit_confirmed,
 (select min(known_before) from public.care_journey_previous_visits pv where pv.member_id=j.member_id and pv.voided_at is null and pv.known_before<=p_to+1) previous_visit_known_before,
 (select min(service_date) from public.care_journey_attendance a where a.member_id=j.member_id and a.voided_at is null and a.service_date<=p_to) attendance_first_visit,
 (select min(visit_date) from public.care_guest_submissions g where g.member_id=j.member_id and g.review_status in ('accepted','duplicate') and g.visit_date<=p_to) reported_first_visit,
 (select min(occurred_at) from contact_history x where x.member_id=j.member_id and x.successful and (x.occurred_at at time zone 'Africa/Lagos')::date<=p_to) first_successful_contact,
 (select count(*) from contact_history x where x.member_id=j.member_id and (x.occurred_at at time zone 'Africa/Lagos')::date between p_from and p_to) attempts_in_period,
 (select count(*) from contact_history x where x.member_id=j.member_id and x.successful and (x.occurred_at at time zone 'Africa/Lagos')::date between p_from and p_to) successful_contacts_in_period,
 (select max(occurred_at) from contact_history x where x.member_id=j.member_id and (x.occurred_at at time zone 'Africa/Lagos')::date<=p_to) last_contact,
 ((select count(*) from contact_history x where x.member_id=j.member_id)) contact_attempt_total,
 coalesce((select min(due_at) from public.care_journey_tasks t where t.member_id=j.member_id and t.status='open' and (t.kind='care_review' or (j.followup_state='active' and cp.contact_consent))),case when j.followup_state='active' and cp.contact_consent and m.status<>'member' and not exists(select 1 from contact_history x where x.member_id=j.member_id) then m.created_at+make_interval(hours=>(select first_contact_hours from public.care_journey_policy where id=1)) end) next_contact,
 coalesce((select jsonb_agg(jsonb_build_object('date',x.occurred_at,'method',x.method,'outcome',x.outcome,'successful',x.successful) order by x.occurred_at desc) from contact_history x where x.member_id=j.member_id and (x.occurred_at at time zone 'Africa/Lagos')::date between p_from and p_to),'[]'::jsonb) followup_outcomes,
 coalesce((select jsonb_agg(jsonb_build_object('date',a.service_date,'service',a.service_key,'type',a.service_type,'source',a.source,'verification',a.verification,'voided',a.voided_at is not null) order by a.service_date) from public.care_journey_attendance a where a.member_id=j.member_id and a.service_date between p_from and p_to),'[]'::jsonb) church_attendance,
 (select count(*) from public.care_journey_attendance a where a.member_id=j.member_id and a.voided_at is null and a.service_date between p_from and p_to) services_in_period,
 (select coalesce(jsonb_agg(jsonb_build_object('team',x.team_name,'role',x.responsibility,'joined',x.joined_on,'left',x.left_on,'currently_active',x.active) order by x.created_at),'[]'::jsonb) from public.care_ministry_memberships x where x.member_id=j.member_id) ministry,
 (select coalesce(jsonb_agg(jsonb_build_object('cell',cc.name,'area',aa.name,'assigned',x.joined_at,'left',x.left_at,'currently_active',x.active) order by x.joined_at),'[]'::jsonb) from public.hco_member_cells x join public.hco_cells cc on cc.id=x.cell_id join public.hco_areas aa on aa.id=cc.area_id where x.member_id=j.member_id) home_cells,
 (select count(*) from public.care_ministry_memberships x where x.member_id=j.member_id and x.active) active_ministries_now,
 (select count(*) from public.hco_member_cells x where x.member_id=j.member_id and x.active) active_home_cells_now,
 (select h.name from public.care_journey_cfc e join public.care_journey_cohorts h on h.id=e.cohort_id where e.member_id=j.member_id) cfc_cohort,
 (select count(*) from public.care_journey_cfc_attendance x where x.member_id=j.member_id and x.attended_on<=p_to and x.attendance_status='present') cfc_weeks_by_period_end,
 (select count(*) from public.care_journey_cfc_attendance x where x.member_id=j.member_id and x.attended_on<=p_to and x.attendance_status='absent') cfc_missed_by_period_end,
 (select enrolled_on from public.care_journey_cfc x where x.member_id=j.member_id) cfc_enrolled_on,
 (select certificate_awarded_on from public.care_journey_cfc x where x.member_id=j.member_id) certificate_awarded_on,
 (select enrolled_at from public.care_journey_cfc x where x.member_id=j.member_id) cfc_enrolled_at,
 (select certificate_recorded_at from public.care_journey_cfc x where x.member_id=j.member_id) certificate_recorded_at,
 (select completed_on from public.care_journey_cfc x where x.member_id=j.member_id and x.completed_on<=p_to) cfc_completed_on,
 (select certificate_number from public.care_journey_cfc x where x.member_id=j.member_id) certificate_number_now,
 case when j.official_joined_on<=p_to then j.official_joined_on end joined_by_period_end
 from public.care_journeys j join public.care_members m on m.id=j.member_id left join public.care_preferences cp on cp.member_id=m.id left join public.care_staff s on s.user_id=j.assigned_to
 where (m.archived_at is null or c) and (c or j.assigned_to=actor_id) and (p_worker is null or j.assigned_to=p_worker)
 ), enriched as (
 select b.*,coalesce(least(attendance_first_visit,reported_first_visit),(registered_at at time zone 'Africa/Lagos')::date) cohort_date,
 case when reported_first_visit is not null and (attendance_first_visit is null or reported_first_visit<=attendance_first_visit) then 'Reported guest visit; not independently verified' when attendance_first_visit is not null then 'Recorded church attendance' else 'Registration date fallback; visit date unknown' end cohort_date_basis,
 registration_source in ('visitor_form','staff_visitor') visitor_intake,
 official_joined_on between p_from and p_to joined_in_period,
 coalesce(least(attendance_first_visit,reported_first_visit),(registered_at at time zone 'Africa/Lagos')::date) between p_from and p_to new_cohort
 from base b
 ), relevant as (
 select * from enriched where new_cohort or joined_in_period or attempts_in_period>0 or services_in_period>0
 or (official_joined_on<=p_to and care_until>=p_from) or (cfc_enrolled_at at time zone 'Africa/Lagos')::date between p_from and p_to or cfc_enrolled_on between p_from and p_to or certificate_awarded_on between p_from and p_to or cfc_completed_on between p_from and p_to or (certificate_recorded_at at time zone 'Africa/Lagos')::date between p_from and p_to
 or exists(select 1 from public.care_ministry_memberships x where x.member_id=enriched.member_id and (x.joined_on between p_from and p_to or x.left_on between p_from and p_to))
 or exists(select 1 from public.hco_member_cells x where x.member_id=enriched.member_id and ((x.joined_at at time zone 'Africa/Lagos')::date between p_from and p_to or (x.left_at at time zone 'Africa/Lagos')::date between p_from and p_to))
 )
 select jsonb_build_object('from',p_from,'to',p_to,'worker',p_worker,'total',(select count(*) from relevant),
 'rows',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from relevant order by name,member_id limit p_limit offset p_page*p_limit)x),'[]'::jsonb),
 'scoreboard',(select jsonb_build_object(
  'new_visitors',count(*) filter(where visitor_intake and new_cohort),
  'visitors_contacted',count(*) filter(where visitor_intake and new_cohort and successful_contacts_in_period>0),
  'first_contact_within_48h',count(*) filter(where visitor_intake and new_cohort and first_successful_contact>=registered_at and first_successful_contact<=registered_at+interval '48 hours'),
  'awaiting_assignment_now',count(*) filter(where archived_at is null and status<>'member' and assigned_to is null and followup_state='active'),
  'overdue_followups_now',count(*) filter(where archived_at is null and next_contact is not null and ((contact_attempt_total=0 and registered_at<now()-interval '7 days') or (contact_attempt_total>0 and next_contact<now()))),
  'interested_now',count(*) filter(where archived_at is null and intention in ('interested','confirmed','invited') and status<>'member'),
  'official_joiners',count(*) filter(where joined_in_period),
  'direct_joiners',count(*) filter(where joined_in_period and registration_source='direct'),
  'visitor_cohort_joiners',count(*) filter(where visitor_intake and new_cohort and joined_by_period_end is not null),
  'conversion_rate',case when count(*) filter(where visitor_intake and new_cohort)=0 then null else round(100.0*(count(*) filter(where visitor_intake and new_cohort and joined_by_period_end is not null))/(count(*) filter(where visitor_intake and new_cohort)),1) end,
  'continuing_care_now',count(*) filter(where archived_at is null and official_joined_on is not null and care_status='ongoing'),
  'cfc_enrolled_now',count(*) filter(where archived_at is null and cfc_cohort is not null),
  'cfc_enrolments_in_period',count(*) filter(where cfc_enrolled_on between p_from and p_to),
  'certificate_awards_in_period',count(*) filter(where certificate_awarded_on between p_from and p_to),
  'cfc_enrolments_recorded_in_period',count(*) filter(where (cfc_enrolled_at at time zone 'Africa/Lagos')::date between p_from and p_to),
  'certificate_records_in_period',count(*) filter(where (certificate_recorded_at at time zone 'Africa/Lagos')::date between p_from and p_to),
  'ministry_members_by_period_end',count(*) filter(where exists(select 1 from public.care_ministry_memberships mm where mm.member_id=enriched.member_id and mm.joined_on<=p_to and (mm.left_on is null or mm.left_on>p_to))),
  'home_cell_members_by_period_end',count(*) filter(where exists(select 1 from public.hco_member_cells hh where hh.member_id=enriched.member_id and (hh.joined_at at time zone 'Africa/Lagos')::date<=p_to and (hh.left_at is null and hh.active or (hh.left_at at time zone 'Africa/Lagos')::date>p_to))),
  'cfc_completions',count(*) filter(where cfc_completed_on between p_from and p_to),
  'ministry_involvement_now',count(*) filter(where archived_at is null and active_ministries_now>0),
  'home_cell_assignment_now',count(*) filter(where archived_at is null and active_home_cells_now>0),
  'unknown_intake_source',count(*) filter(where new_cohort and registration_source='existing_record'),
  'unknown_first_visit',count(*) filter(where new_cohort and attendance_first_visit is null and reported_first_visit is null)
 ) from enriched),
 'friend_summary',coalesce((select jsonb_agg(to_jsonb(t) order by t.friend) from(select assigned_to,coalesce(worker_name,'Not assigned') friend,count(*) people,count(*) filter(where joined_by_period_end is not null) joined_by_period_end,coalesce(sum(attempts_in_period),0) contact_attempts,coalesce(sum(successful_contacts_in_period),0) conversations,count(*) filter(where archived_at is null and next_contact is not null and ((contact_attempt_total=0 and registered_at<now()-interval '7 days') or (contact_attempt_total>0 and next_contact<now()))) overdue_now,count(*) filter(where cfc_cohort is not null) cfc_enrolled_now from relevant group by assigned_to,worker_name)t),'[]'::jsonb),
 'definitions',jsonb_build_object('cohort','Visitor intake records whose first recorded/reported visit falls within the period; registration date is an explicitly labelled fallback when visit date is unknown.',
 'conversion','Visitor-cohort joiners by period end divided by the same visitor cohort. Direct registrations and unknown legacy intake sources are excluded.',
 'friend_analysis','The full selected period population grouped by CURRENT assigned friend. Page changes do not change the totals. Joined by period end, activity in the period and current overdue/class values are different measures.',
 'worker_filter','Current assigned friend at report generation, not reconstructed historical ownership.',
 'archived_records','Coordinator historical reports retain archived records so visitor-conversion denominators do not change when a case is archived. Current operational metrics exclude archived records. Friends cannot export archived cases.',
 'current_metrics','Metrics ending in _now, next contact, ministry/Home Cell current status and certificate number are current operational snapshots, not historical reconstructions.',
 'first_contact','First successful conversation within 48 hours of database registration; unsuccessful attempts are counted separately.',
 'period_records','Period figures use actual visit, contact, class, joining and ministry dates where known. CFC enrolment and certificate recording use known audit timestamps; unknown dates are not guessed. Later evidence corrections can change a regenerated historical report.',
 'missing_data','Not recorded is unknown, never proof of non-attendance, non-membership or no ministry involvement.'),
 'generated_at',now()) into answer;
 return answer;
end$$;
revoke all on function public.care_journey_report(date,date,uuid,integer,integer) from public,anon;
grant execute on function public.care_journey_report(date,date,uuid,integer,integer) to authenticated;

commit;
