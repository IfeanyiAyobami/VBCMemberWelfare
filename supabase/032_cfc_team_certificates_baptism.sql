begin;
-- Give each active CFC account one of five database-enforced slots.
alter table public.care_cfc_leaders add column if not exists active_slot smallint;
update public.care_cfc_leaders set active_slot=1 where active and active_slot is null;
create unique index if not exists care_cfc_active_slot on public.care_cfc_leaders(active_slot) where active;
drop index if exists public.care_cfc_single_active_leader;
create or replace function care_private.cfc_allocate_slot() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not new.active then new.active_slot:=null; return new; end if;
 perform pg_advisory_xact_lock(32005);
 select active_slot into new.active_slot from public.care_cfc_leaders where user_id=new.user_id and active;
 if new.active_slot is null then
  select i into new.active_slot from generate_series(1,5) i where not exists(select 1 from public.care_cfc_leaders where active and active_slot=i) order by i limit 1;
 end if;
 if new.active_slot is null then raise exception 'Five active CFC accounts already exist.' using errcode='22023'; end if;
 return new;
end$$;
drop trigger if exists cfc_allocate_slot on public.care_cfc_leaders;
create trigger cfc_allocate_slot before insert or update of active on public.care_cfc_leaders
for each row execute function care_private.cfc_allocate_slot();
revoke all on function care_private.cfc_allocate_slot() from public,anon,authenticated;

alter table public.care_journey_cfc
 add column if not exists certificate_ready_on date,
 add column if not exists certificate_collected_on date,
 add column if not exists certificate_collected_by uuid references public.care_staff(user_id);
create table if not exists public.care_cfc_baptisms(
 member_id uuid primary key references public.care_members(id),
 registered_at timestamptz not null default now(),
 scheduled_on date,
 baptised_on date,
 certificate_number text unique,
 certificate_awarded_on date,
 certificate_ready_on date,
 certificate_collected_on date,
 certificate_collected_by uuid references public.care_staff(user_id)
);
alter table public.care_cfc_baptisms enable row level security;
revoke all on public.care_cfc_baptisms from public,anon,authenticated;

create or replace function care_private.cfc_member_matches(p_name text,p_phone text,p_search text)
returns boolean language sql immutable set search_path='' as $$
 select strpos(lower(p_name),lower(btrim(coalesce(p_search,''))))>0
 or (length(regexp_replace(coalesce(p_search,''),'[^0-9]','','g'))>=3
 and p_search ~ '^[+0-9 ()-]+$'
 and strpos(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),
 regexp_replace(regexp_replace(p_search,'[^0-9]','','g'),'^0',''))>0)
$$;
revoke all on function care_private.cfc_member_matches(text,text,text) from public,anon,authenticated;
create or replace function public.care_cfc_read(p_search text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare manager boolean:=care_private.cfc_manager();answer jsonb;begin
 if not manager and not care_private.cfc_active(auth.uid()) then raise exception 'CFC access required.' using errcode='42501';end if;
 if length(p_search)>120 then raise exception 'Search too long.' using errcode='22023';end if;
 select jsonb_build_object('manager',manager,'canOrganize',true,'name',(select display_name from public.care_staff where user_id=auth.uid()),
 'cohorts',coalesce((select jsonb_agg(to_jsonb(h) order by h.starts_on desc) from public.care_journey_cohorts h where care_private.cfc_scope(h.id)),'[]'::jsonb),
 'sessions',coalesce((select jsonb_agg(to_jsonb(s) order by s.held_on,s.lesson) from public.care_cfc_sessions s where care_private.cfc_scope(s.cohort_id)),'[]'::jsonb),
 'teaching',case when manager then coalesce((select jsonb_agg(to_jsonb(t)) from public.care_cfc_teaching t),'[]'::jsonb) else '[]'::jsonb end,
 'leaders',case when manager then coalesce((select jsonb_agg(jsonb_build_object('user_id',l.user_id,'name',s.display_name,'email',l.email,'phone',l.phone,'active',l.active,'failures',l.failures)) from public.care_cfc_leaders l join public.care_staff s using(user_id)),'[]'::jsonb) else '[]'::jsonb end,
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',concat_ws(' ',m.other_names,m.surname),'phone',case when p.contact_consent then m.phone end,
 'completed_on',e.completed_on,'certificate_number',e.certificate_number,'certificate_awarded_on',e.certificate_awarded_on,'certificate_ready_on',e.certificate_ready_on,'certificate_collected_on',e.certificate_collected_on,'certificate_collected_by_name',(select display_name from public.care_staff where user_id=e.certificate_collected_by),'review',to_jsonb(r),
 'cohorts',(select jsonb_agg(cohort_id) from public.care_cfc_enrolments x where x.member_id=m.id and care_private.cfc_scope(x.cohort_id)),
 'attendance',coalesce((select jsonb_agg(jsonb_build_object('session_id',a.session_id,'cohort_id',s.cohort_id,'lesson',s.lesson,'date',s.held_on,'status',a.status,'cohort_name',(select name from public.care_journey_cohorts where id=s.cohort_id)) order by s.held_on) from public.care_cfc_attendance a join public.care_cfc_sessions s on s.id=a.session_id where a.member_id=m.id),'[]'::jsonb)))
 from public.care_journey_cfc e join public.care_members m on m.id=e.member_id left join public.care_preferences p on p.member_id=m.id left join public.care_cfc_reviews r on r.member_id=m.id
 where m.archived_at is null and care_private.cfc_member_matches(concat_ws(' ',m.other_names,m.surname),case when p.contact_consent then m.phone end,p_search) and exists(select 1 from public.care_cfc_enrolments x where x.member_id=m.id and care_private.cfc_scope(x.cohort_id))),'[]'::jsonb),
 'baptisms',coalesce((select jsonb_agg(to_jsonb(b)||jsonb_build_object('name',concat_ws(' ',m.other_names,m.surname),'certificate_collected_by_name',s.display_name) order by b.registered_at desc) from public.care_cfc_baptisms b join public.care_members m on m.id=b.member_id left join public.care_staff s on s.user_id=b.certificate_collected_by where m.archived_at is null),'[]'::jsonb),
 'candidates',case when length(btrim(p_search))>=2 then coalesce((select jsonb_agg(to_jsonb(t)) from (select j.member_id id,concat_ws(' ',m.other_names,m.surname) name from public.care_journeys j join public.care_members m on m.id=j.member_id left join public.care_preferences p on p.member_id=m.id where (j.official_joined_on is not null or j.legacy_member) and m.archived_at is null and care_private.cfc_member_matches(concat_ws(' ',m.other_names,m.surname),case when p.contact_consent then m.phone end,p_search) order by m.surname limit 30)t),'[]'::jsonb) else '[]'::jsonb end) into answer;
 return answer;
end$$;
create or replace function public.care_cfc_write(p_action text,p_data jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare manager boolean:=care_private.cfc_manager();co uuid:=nullif(p_data->>'cohort','')::uuid;m uuid:=nullif(p_data->>'member','')::uuid;s public.care_cfc_sessions;v record;leader uuid:=nullif(p_data->>'leader','')::uuid;dt date; cert record; cert_kind text; cert_number text; local_day date:=(now() at time zone 'Africa/Lagos')::date;begin
 if not manager and not care_private.cfc_active(auth.uid()) then raise exception 'CFC access required.' using errcode='42501';end if;
 if m is not null then perform pg_advisory_xact_lock(hashtextextended(m::text,31031));end if;
 if p_action in ('assign','unassign','approve','suspend','reactivate') and not manager then raise exception 'Follow Through coordinator access required.' using errcode='42501';end if;
 if p_action='cohort' then
 if length(btrim(p_data->>'name')) not between 1 and 120 or nullif(p_data->>'date','') is null then raise exception 'Enter a cohort name and start date.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(btrim(p_data->>'name'))||(p_data->>'date'),31032));
 insert into public.care_journey_cohorts(name,starts_on,created_by) select btrim(p_data->>'name'),(p_data->>'date')::date,auth.uid() where not exists(select 1 from public.care_journey_cohorts where lower(name)=lower(btrim(p_data->>'name')) and starts_on=(p_data->>'date')::date);
 elsif p_action in ('assign','unassign') then
 if p_action='assign' then insert into public.care_cfc_teaching values(co,leader) on conflict do nothing;else delete from public.care_cfc_teaching where cohort_id=co and user_id=leader;end if;
 elsif p_action in ('suspend','reactivate') then update public.care_cfc_leaders set active=(p_action='reactivate'),version=gen_random_uuid() where user_id=leader;
 elsif p_action='enrol' then
 if not exists(select 1 from public.care_journeys j join public.care_members p on p.id=j.member_id where j.member_id=m and (j.official_joined_on is not null or j.legacy_member) and p.archived_at is null) then raise exception 'Confirm official membership before CFC enrolment.' using errcode='22023';end if;
 insert into public.care_journey_cfc(member_id,cohort_id,enrolled_on) values(m,co,(now() at time zone 'Africa/Lagos')::date) on conflict(member_id) do nothing;
 insert into public.care_cfc_enrolments values(m,co) on conflict do nothing;
 elsif p_action in ('baptism_register','baptism_schedule','baptism_complete') then
 if not exists(select 1 from public.care_journeys j join public.care_members p on p.id=j.member_id where j.member_id=m and (j.official_joined_on is not null or j.legacy_member) and p.archived_at is null) then raise exception 'Choose an existing confirmed church member.' using errcode='22023';end if;
 if p_action='baptism_register' then
  insert into public.care_cfc_baptisms(member_id) values(m) on conflict do nothing;
 else
  dt:=nullif(p_data->>'date','')::date;
  if dt is null or (p_action='baptism_complete' and dt>local_day) or (p_action='baptism_schedule' and dt<local_day) then raise exception 'Enter a valid baptism date.' using errcode='22023';end if;
  if p_action='baptism_schedule' then
   update public.care_cfc_baptisms set scheduled_on=dt where member_id=m and baptised_on is null;
  else
   update public.care_cfc_baptisms set baptised_on=dt where member_id=m and baptised_on is null;
  end if;
  if not found then raise exception 'Register the participant first; completed baptisms cannot be overwritten here.' using errcode='22023';end if;
 end if;
 elsif p_action in ('certificate_issue','certificate_ready','certificate_collect') then
 cert_kind:=p_data->>'kind';
 if not exists(select 1 from public.care_members where id=m and archived_at is null) then raise exception 'Choose an active participant.' using errcode='22023';end if;
 if cert_kind='cfc' then
  select completed_on as milestone,certificate_number,certificate_awarded_on,certificate_ready_on,certificate_collected_on into cert from public.care_journey_cfc where member_id=m for update;
 elsif cert_kind='baptism' then
  select baptised_on as milestone,certificate_number,certificate_awarded_on,certificate_ready_on,certificate_collected_on into cert from public.care_cfc_baptisms where member_id=m for update;
 else raise exception 'Choose CFC or baptism certificate.' using errcode='22023';end if;
 if cert.milestone is null then raise exception 'Record approved CFC completion or actual baptism first.' using errcode='22023';end if;
 dt:=coalesce(nullif(p_data->>'date','')::date,local_day);
 if dt<cert.milestone or dt>local_day then raise exception 'Certificate date must be on or after completion and no later than today.' using errcode='22023';end if;
 if p_action='certificate_issue' then
  cert_number:=nullif(btrim(p_data->>'number'),'');
  if cert.certificate_number is not null or cert_number is null or length(cert_number)>100 then raise exception 'Enter a certificate number for an unissued certificate.' using errcode='22023';end if;
  if cert_kind='cfc' then
   update public.care_journey_cfc set certificate_number=cert_number,certificate_awarded_on=dt,certificate_recorded_at=now() where member_id=m;
  else update public.care_cfc_baptisms set certificate_number=cert_number,certificate_awarded_on=dt where member_id=m;end if;
 elsif p_action='certificate_ready' then
  if cert.certificate_number is null or cert.certificate_ready_on is not null or dt<cert.certificate_awarded_on then raise exception 'Issue the certificate before marking it ready.' using errcode='22023';end if;
  if cert_kind='cfc' then update public.care_journey_cfc set certificate_ready_on=dt where member_id=m;
  else update public.care_cfc_baptisms set certificate_ready_on=dt where member_id=m;end if;
 else
  if cert.certificate_ready_on is null or cert.certificate_collected_on is not null or dt<cert.certificate_ready_on then raise exception 'Mark the certificate ready before recording collection.' using errcode='22023';end if;
  if cert_kind='cfc' then update public.care_journey_cfc set certificate_collected_on=dt,certificate_collected_by=auth.uid() where member_id=m;
  else update public.care_cfc_baptisms set certificate_collected_on=dt,certificate_collected_by=auth.uid() where member_id=m;end if;
 end if;
 if cert_kind='cfc' then update public.care_journeys set version=version+1,updated_at=now() where member_id=m;end if;
 elsif p_action='session' then
 if length(btrim(p_data->>'topic')) not between 1 and 160 or length(coalesce(p_data->>'venue',''))>200 or (p_data->>'date')::date<(select starts_on from public.care_journey_cohorts where id=co) then raise exception 'Check class title, venue and date.' using errcode='22023';end if;
 insert into public.care_cfc_sessions(cohort_id,lesson,held_on,topic,venue) values(co,(p_data->>'lesson')::integer,(p_data->>'date')::date,btrim(p_data->>'topic'),coalesce(p_data->>'venue','')) on conflict(cohort_id,lesson,held_on) do update set topic=excluded.topic,venue=excluded.venue;
 elsif p_action='attendance' then
 select * into s from public.care_cfc_sessions where id=(p_data->>'session')::uuid;
 if not found or not care_private.cfc_scope(s.cohort_id) or not exists(select 1 from public.care_cfc_enrolments where member_id=m and cohort_id=s.cohort_id) then raise exception 'This participant/class is outside your assignment.' using errcode='42501';end if;
 if s.held_on>(now() at time zone 'Africa/Lagos')::date or s.held_on<(select official_joined_on from public.care_journeys where member_id=m) or p_data->>'status' not in ('present','absent') then raise exception 'Record actual attendance after joining, using Present or Absent.' using errcode='22023';end if;
 if exists(select 1 from public.care_journey_cfc where member_id=m and completed_on is not null) then raise exception 'Completion is confirmed. Ask the coordinator to review corrections.' using errcode='22023';end if;
 if exists(select 1 from public.care_cfc_attendance where member_id=m and session_id=s.id and status<>p_data->>'status') and length(btrim(coalesce(p_data->>'note','')))<5 then raise exception 'Add a correction reason of at least five characters.' using errcode='22023';end if;
 if length(coalesce(p_data->>'note',''))>1000 then raise exception 'Note too long.' using errcode='22023';end if;
 insert into public.care_cfc_attendance(session_id,member_id,status,recorded_by,note) values(s.id,m,p_data->>'status',auth.uid(),coalesce(p_data->>'note','')) on conflict(session_id,member_id) do update set status=excluded.status,note=excluded.note,recorded_by=excluded.recorded_by,recorded_at=now();
 select a.*,x.held_on into v from public.care_cfc_attendance a join public.care_cfc_sessions x on x.id=a.session_id where a.member_id=m and x.lesson=s.lesson order by (a.status='present') desc,x.held_on desc limit 1;
 perform set_config('care.cfc_sync','on',true);
 insert into public.care_journey_cfc_attendance(member_id,week,attended_on,recorded_by,attendance_status,note) values(m,s.lesson,v.held_on,v.recorded_by,v.status,'CFC dashboard class history') on conflict(member_id,week) do update set attended_on=excluded.attended_on,recorded_by=excluded.recorded_by,attendance_status=excluded.attendance_status,note=excluded.note;
 perform set_config('care.cfc_sync','off',true);
 update public.care_journeys set version=version+1,updated_at=now() where member_id=m;
 elsif p_action in ('submit','approve') then
 if not manager and not exists(select 1 from public.care_cfc_enrolments x where x.member_id=m and care_private.cfc_scope(x.cohort_id)) then raise exception 'Participant outside your classes.' using errcode='42501';end if;
 if (select count(*) from public.care_journey_cfc_attendance where member_id=m and attendance_status='present')<>7 then raise exception 'All seven distinct classes must be completed.' using errcode='22023';end if;
 if p_action='submit' then insert into public.care_cfc_reviews(member_id,submitted_by) values(m,auth.uid()) on conflict(member_id) do update set submitted_by=excluded.submitted_by,submitted_at=now();
 else
 if not exists(select 1 from public.care_cfc_reviews where member_id=m) or not exists(select 1 from public.care_journey_policy where id=1 and nullif(btrim(cfc_policy),'') is not null) then raise exception 'Submit the completion for review and approve the CFC policy first.' using errcode='22023';end if;
 select max(attended_on) into dt from public.care_journey_cfc_attendance where member_id=m and attendance_status='present';
 update public.care_journey_cfc set completed_on=dt where member_id=m and completed_on is null;
 update public.care_cfc_reviews set approved_by=auth.uid(),approved_at=now() where member_id=m;
 update public.care_journeys set version=version+1,updated_at=now() where member_id=m;
 end if;
 else raise exception 'Unknown CFC action.' using errcode='22023';end if;
 insert into public.care_journey_events(member_id,actor,action,detail) values(m,auth.uid(),'cfc_'||p_action,p_data);
 return true;
end$$;
notify pgrst, 'reload schema';
commit;
