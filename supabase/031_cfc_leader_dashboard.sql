begin;
create table if not exists public.care_cfc_leaders(
 user_id uuid primary key references public.care_staff(user_id) on delete cascade,
 email text unique,phone text unique,pin_hash text not null,version uuid not null default gen_random_uuid(),
 active boolean not null default true,attempts integer not null default 0,failures integer not null default 0,window_start timestamptz not null default now(),
 check(email is not null or phone is not null)
);
-- One active CFC leader for the current church-wide foundational class programme.
create unique index if not exists care_cfc_single_active_leader on public.care_cfc_leaders((true)) where active;
create table if not exists public.care_cfc_teaching(
 cohort_id uuid references public.care_journey_cohorts(id),user_id uuid references public.care_cfc_leaders(user_id),primary key(cohort_id,user_id)
);
create table if not exists public.care_cfc_enrolments(
 member_id uuid references public.care_journey_cfc(member_id),cohort_id uuid references public.care_journey_cohorts(id),primary key(member_id,cohort_id)
);
insert into public.care_cfc_enrolments select member_id,cohort_id from public.care_journey_cfc on conflict do nothing;
create or replace function care_private.cfc_enrol_sync() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.care_cfc_enrolments values(new.member_id,new.cohort_id) on conflict do nothing;return new;end$$;
drop trigger if exists cfc_enrol_sync on public.care_journey_cfc;
create trigger cfc_enrol_sync after insert or update of cohort_id on public.care_journey_cfc for each row execute function care_private.cfc_enrol_sync();
revoke all on function care_private.cfc_enrol_sync() from public,anon,authenticated;
create table if not exists public.care_cfc_sessions(
 id uuid primary key default gen_random_uuid(),cohort_id uuid not null references public.care_journey_cohorts(id),
 lesson integer not null check(lesson between 1 and 7),held_on date not null,topic text not null check(length(topic) between 1 and 160),venue text not null default '',
 unique(cohort_id,lesson,held_on)
);
create table if not exists public.care_cfc_attendance(
 session_id uuid references public.care_cfc_sessions(id),member_id uuid references public.care_journey_cfc(member_id),
 status text not null check(status in ('present','absent')),recorded_by uuid not null references public.care_staff(user_id),
 recorded_at timestamptz not null default now(),note text not null default '',primary key(session_id,member_id)
);
insert into public.care_cfc_sessions(cohort_id,lesson,held_on,topic)
 select distinct e.cohort_id,a.week,a.attended_on,'Class '||a.week from public.care_journey_cfc_attendance a join public.care_journey_cfc e on e.member_id=a.member_id where not exists(select 1 from public.care_cfc_attendance old join public.care_cfc_sessions old_s on old_s.id=old.session_id where old.member_id=a.member_id and old_s.lesson=a.week) on conflict do nothing;
insert into public.care_cfc_attendance(session_id,member_id,status,recorded_by,note)
 select s.id,a.member_id,a.attendance_status,a.recorded_by,a.note from public.care_journey_cfc_attendance a join public.care_journey_cfc e on e.member_id=a.member_id join public.care_cfc_sessions s on s.cohort_id=e.cohort_id and s.lesson=a.week and s.held_on=a.attended_on where not exists(select 1 from public.care_cfc_attendance old join public.care_cfc_sessions old_s on old_s.id=old.session_id where old.member_id=a.member_id and old_s.lesson=a.week) on conflict do nothing;
create table if not exists public.care_cfc_reviews(member_id uuid primary key references public.care_journey_cfc(member_id),submitted_by uuid references public.care_staff(user_id),submitted_at timestamptz default now(),approved_by uuid references public.care_staff(user_id),approved_at timestamptz);
do $$declare n text;begin foreach n in array array['care_cfc_leaders','care_cfc_teaching','care_cfc_enrolments','care_cfc_sessions','care_cfc_attendance','care_cfc_reviews'] loop execute format('alter table public.%I enable row level security',n);execute format('revoke all on public.%I from public,anon,authenticated',n);execute format('grant all on public.%I to service_role',n);end loop;end$$;
-- CFC credentials never inherit the implicit Friend capability of followup_worker.
create or replace function care_private.journey_cap(p_cap text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.care_staff s where s.user_id=auth.uid() and s.is_active and not exists(select 1 from public.care_cfc_leaders l where l.user_id=s.user_id) and (s.role='administrator' or exists(select 1 from public.care_journey_roles r where r.user_id=s.user_id and r.capability=p_cap) or (p_cap='friend' and s.role='followup_worker')))
$$;
create or replace function care_private.cfc_active(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.care_cfc_leaders l join public.care_staff s using(user_id) where l.user_id=p_user and l.active and s.is_active and s.role='followup_worker')
 and not exists(select 1 from public.care_journey_roles where user_id=p_user)
 and not exists(select 1 from public.hco_assignments where user_id=p_user and active)
$$;
create or replace function care_private.cfc_manager() returns boolean language sql stable security definer set search_path='' as $$select care_private.journey_cap('coordinator')$$;
create or replace function care_private.cfc_scope(p_cohort uuid) returns boolean language sql stable security definer set search_path='' as $$
 select care_private.cfc_manager() or care_private.cfc_active(auth.uid())
$$;
create or replace function public.care_cfc_pin_save(p_actor uuid,p_user uuid,p_name text,p_email text,p_phone text,p_hash text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.care_staff where user_id=p_actor and is_active and (role='administrator' or exists(select 1 from public.care_journey_roles where user_id=p_actor and capability='coordinator'))) then raise exception 'Follow Through coordinator access required.' using errcode='42501';end if;
 if exists(select 1 from public.care_staff where user_id=p_user and (role<>'followup_worker' or not is_active)) or exists(select 1 from public.care_journey_roles where user_id=p_user) or exists(select 1 from public.hco_assignments where user_id=p_user and active) then raise exception 'Use an independent CFC account.' using errcode='42501';end if;
 if length(btrim(p_name)) not between 2 and 120 or p_hash !~ '^[a-f0-9]{32}:[a-f0-9]{128}$' or p_hash is null or (p_email is null and p_phone is null) then raise exception 'Invalid account details.' using errcode='22023';end if;
 insert into public.care_staff(user_id,display_name,role) values(p_user,btrim(p_name),'followup_worker') on conflict(user_id) do nothing;
 insert into public.care_cfc_leaders(user_id,email,phone,pin_hash) values(p_user,p_email,p_phone,p_hash) on conflict(user_id) do update set pin_hash=excluded.pin_hash,version=gen_random_uuid(),attempts=0,failures=0,window_start=now();
 insert into public.care_journey_events(actor,action,detail) values(p_actor,'cfc_leader_pin_saved',jsonb_build_object('user_id',p_user));return true;
end$$;
create or replace function public.care_cfc_pin_attempt(p_identity text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.care_cfc_leaders;begin
 select * into r from public.care_cfc_leaders where email=lower(p_identity) or phone=p_identity for update;
 if not found or not care_private.cfc_active(r.user_id) then return '{}'::jsonb;end if;
 if r.window_start<=now()-interval '15 minutes' then r.attempts:=0;r.window_start:=now();end if;
 if r.attempts>=5 or r.failures>=20 then return '{}'::jsonb;end if;
 update public.care_cfc_leaders set attempts=r.attempts+1,window_start=r.window_start,failures=failures+1 where user_id=r.user_id;
 return jsonb_build_object('user_id',r.user_id,'pin_hash',r.pin_hash,'version',r.version);
end$$;
create or replace function public.care_cfc_pin_complete(p_user uuid,p_version uuid) returns boolean language plpgsql security definer set search_path='' as $$begin
 if not care_private.cfc_active(p_user) then return false;end if;
 update public.care_cfc_leaders set failures=0 where user_id=p_user and version=p_version;return found;
end$$;
-- Keep the existing journey summary accurate when attendance is entered through either dashboard.
create or replace function care_private.cfc_legacy_attendance() returns trigger language plpgsql security definer set search_path='' as $$
declare co uuid;sid uuid;v record;begin
 if current_setting('care.cfc_sync',true)='on' then return new;end if;
 select cohort_id into co from public.care_journey_cfc where member_id=new.member_id;
 insert into public.care_cfc_enrolments values(new.member_id,co) on conflict do nothing;
 insert into public.care_cfc_sessions(cohort_id,lesson,held_on,topic) values(co,new.week,new.attended_on,'Class '||new.week) on conflict(cohort_id,lesson,held_on) do update set topic=care_cfc_sessions.topic returning id into sid;
 insert into public.care_cfc_attendance(session_id,member_id,status,recorded_by,note) values(sid,new.member_id,new.attendance_status,new.recorded_by,new.note) on conflict(session_id,member_id) do update set status=excluded.status,recorded_by=excluded.recorded_by,note=excluded.note,recorded_at=now();
 select a.* ,s.held_on into v from public.care_cfc_attendance a join public.care_cfc_sessions s on s.id=a.session_id where a.member_id=new.member_id and s.lesson=new.week order by (a.status='present') desc,s.held_on desc limit 1;
 new.attendance_status:=v.status;new.attended_on:=v.held_on;new.recorded_by:=v.recorded_by;return new;
end$$;
drop trigger if exists cfc_legacy_attendance_sync on public.care_journey_cfc_attendance;
create trigger cfc_legacy_attendance_sync before insert or update on public.care_journey_cfc_attendance for each row execute function care_private.cfc_legacy_attendance();
create or replace function care_private.cfc_completion_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.completed_on is not null and (tg_op='INSERT' or old.completed_on is distinct from new.completed_on) and (select count(*) from public.care_journey_cfc_attendance where member_id=new.member_id and attendance_status='present')<>7 then raise exception 'Complete all seven distinct classes before confirming CFC completion.' using errcode='22023';end if;return new;
end$$;
drop trigger if exists cfc_seven_classes on public.care_journey_cfc;
create trigger cfc_seven_classes before insert or update on public.care_journey_cfc for each row execute function care_private.cfc_completion_guard();
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
 'completed_on',e.completed_on,'review',to_jsonb(r),
 'cohorts',(select jsonb_agg(cohort_id) from public.care_cfc_enrolments x where x.member_id=m.id and care_private.cfc_scope(x.cohort_id)),
 'attendance',coalesce((select jsonb_agg(jsonb_build_object('session_id',a.session_id,'cohort_id',s.cohort_id,'lesson',s.lesson,'date',s.held_on,'status',a.status,'cohort_name',(select name from public.care_journey_cohorts where id=s.cohort_id)) order by s.held_on) from public.care_cfc_attendance a join public.care_cfc_sessions s on s.id=a.session_id where a.member_id=m.id),'[]'::jsonb)))
 from public.care_journey_cfc e join public.care_members m on m.id=e.member_id left join public.care_preferences p on p.member_id=m.id left join public.care_cfc_reviews r on r.member_id=m.id
 where m.archived_at is null and concat_ws(' ',m.other_names,m.surname) ilike '%'||p_search||'%' and exists(select 1 from public.care_cfc_enrolments x where x.member_id=m.id and care_private.cfc_scope(x.cohort_id))),'[]'::jsonb),
 'candidates',case when length(btrim(p_search))>=2 then coalesce((select jsonb_agg(to_jsonb(t)) from (select j.member_id id,concat_ws(' ',m.other_names,m.surname) name from public.care_journeys j join public.care_members m on m.id=j.member_id where j.official_joined_on is not null and m.archived_at is null and concat_ws(' ',m.other_names,m.surname) ilike '%'||p_search||'%' order by m.surname limit 30)t),'[]'::jsonb) else '[]'::jsonb end) into answer;
 return answer;
end$$;
create or replace function public.care_cfc_write(p_action text,p_data jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare manager boolean:=care_private.cfc_manager();co uuid:=nullif(p_data->>'cohort','')::uuid;m uuid:=nullif(p_data->>'member','')::uuid;s public.care_cfc_sessions;v record;leader uuid:=nullif(p_data->>'leader','')::uuid;dt date;begin
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
 if not exists(select 1 from public.care_journeys where member_id=m and official_joined_on is not null) then raise exception 'Confirm official membership before CFC enrolment.' using errcode='22023';end if;
 insert into public.care_journey_cfc(member_id,cohort_id,enrolled_on) values(m,co,(now() at time zone 'Africa/Lagos')::date) on conflict(member_id) do nothing;
 insert into public.care_cfc_enrolments values(m,co) on conflict do nothing;
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
revoke all on function care_private.cfc_active(uuid),care_private.cfc_manager(),care_private.cfc_scope(uuid),care_private.cfc_legacy_attendance(),care_private.cfc_completion_guard() from public,anon,authenticated;
revoke all on function public.care_cfc_read(text),public.care_cfc_write(text,jsonb),public.care_cfc_pin_save(uuid,uuid,text,text,text,text),public.care_cfc_pin_attempt(text),public.care_cfc_pin_complete(uuid,uuid) from public,anon,authenticated;
grant execute on function public.care_cfc_read(text),public.care_cfc_write(text,jsonb) to authenticated;
grant execute on function public.care_cfc_pin_save(uuid,uuid,text,text,text,text),public.care_cfc_pin_attempt(text),public.care_cfc_pin_complete(uuid,uuid) to service_role;
commit;
