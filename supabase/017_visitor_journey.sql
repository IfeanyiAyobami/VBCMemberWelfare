-- VBC v3.7 Visitor Journey. Apply after 001–016. No guest/person rows are deleted.
begin;
create table if not exists public.care_journey_roles(
  user_id uuid references public.care_staff(user_id),
  capability text check(capability in ('coordinator','foundation','friend')),
  granted_by uuid references public.care_staff(user_id),
  primary key(user_id,capability)
);
create table if not exists public.care_journey_policy(
  id integer primary key check(id=1),
  service_types text[] not null default '{}',
  first_contact_hours integer not null default 48 check(first_contact_hours between 1 and 168),
  cfc_policy text,
  care_policy text,
  updated_by uuid references public.care_staff(user_id)
);
insert into public.care_journey_policy(id) values(1) on conflict do nothing;
create table if not exists public.care_journeys(
  member_id uuid primary key references public.care_members(id) on delete restrict,
  assigned_to uuid references public.care_staff(user_id),
  version integer not null default 1,
  membership_review boolean not null default false,
  intention text not null default 'unknown' check(intention in ('unknown','interested','confirmed','undecided','deferred','did_not_join')),
  official_joined_on date,
  confirmed_by uuid references public.care_staff(user_id),
  care_until date,
  care_status text not null default 'ongoing' check(care_status in ('ongoing','completed')),
  legacy_member boolean not null default false,
  assignment_conflict boolean not null default false,
  updated_at timestamptz not null default now(),
  check((official_joined_on is null and care_until is null) or (official_joined_on is not null and care_until>=(official_joined_on+interval '6 months')::date))
);
create table if not exists public.care_journey_tasks(
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.care_journeys(member_id),
  due_at timestamptz not null,
  kind text not null check(kind in ('first_contact','followup','callback','care_review')),
  note text not null default '' check(length(note)<=1000),
  status text not null default 'open' check(status in ('open','done','paused'))
);
create index if not exists journey_tasks_due on public.care_journey_tasks(member_id,status,due_at);
create table if not exists public.care_journey_contacts(
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.care_journeys(member_id),
  actor uuid not null references public.care_staff(user_id),
  occurred_at timestamptz not null,
  method text not null check(method in ('phone','whatsapp','sms','email','in_person','other')),
  outcome text not null check(outcome in ('positive','undecided','no_answer','unreachable','promised_return','callback','not_interested','no_further_contact')),
  successful boolean not null,
  note text not null default '' check(length(note)<=2000),
  recorded_at timestamptz not null default now()
);
create table if not exists public.care_journey_attendance(
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.care_journeys(member_id),
  service_date date not null,
  service_key text not null check(length(btrim(service_key)) between 1 and 100),
  service_type text not null check(length(btrim(service_type)) between 1 and 100),
  source text not null check(source in ('phone','whatsapp','church_staff','other')),
  evidence text not null check(length(btrim(evidence)) between 1 and 2000),
  verification text not null check(verification in ('self_report','independently_confirmed')),
  qualifies boolean not null default false,
  recorded_by uuid not null references public.care_staff(user_id),
  voided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists journey_service_unique on public.care_journey_attendance(member_id,service_date,lower(service_type)) where voided_at is null;
create table if not exists public.care_journey_cohorts(
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(btrim(name)) between 1 and 120),
  starts_on date not null,
  created_by uuid not null references public.care_staff(user_id)
);
create table if not exists public.care_journey_cfc(
  member_id uuid primary key references public.care_journeys(member_id),
  cohort_id uuid not null references public.care_journey_cohorts(id),
  completed_on date,
  certificate_number text unique check(length(btrim(certificate_number)) between 1 and 100),
  check(certificate_number is null or completed_on is not null)
);
create table if not exists public.care_journey_cfc_attendance(
  member_id uuid references public.care_journey_cfc(member_id),
  week integer check(week between 1 and 7),
  attended_on date not null,
  recorded_by uuid not null references public.care_staff(user_id),
  primary key(member_id,week)
);
create table if not exists public.care_journey_events(
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.care_journeys(member_id),
  actor uuid not null references public.care_staff(user_id),
  action text not null,
  detail jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists care_private.journey_requests(
  actor uuid,
  request_id uuid,
  payload jsonb not null,
  result jsonb not null,
  primary key(actor,request_id)
);
create index if not exists journey_assignee on public.care_journeys(assigned_to);
create index if not exists journey_contacts_history on public.care_journey_contacts(member_id,occurred_at desc);
create index if not exists journey_events_history on public.care_journey_events(member_id,created_at desc);
-- Existing official members have unknown actual joining dates, never inferred from joined_on.
insert into public.care_journeys(member_id,legacy_member) select id,status='member' from public.care_members where archived_at is null on conflict do nothing;
update public.care_journeys j set assigned_to=t.worker,assignment_conflict=t.workers>1 from (select member_id,count(distinct assigned_to) workers,case when count(distinct assigned_to)=1 then (array_agg(assigned_to))[1] end worker from public.care_followups where status in ('pending','in_progress') group by member_id)t where j.member_id=t.member_id and j.version=1 and j.assigned_to is null;
insert into public.care_journey_tasks(member_id,due_at,kind,note) select j.member_id,min(f.due_at),'followup','Carried forward; original follow-up history retained.' from public.care_journeys j join public.care_followups f on f.member_id=j.member_id where j.assigned_to is not null and f.status in ('pending','in_progress') and not exists(select 1 from public.care_journey_tasks t where t.member_id=j.member_id) group by j.member_id;
create or replace function care_private.journey_cap(p_cap text) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.care_staff s where s.user_id=auth.uid() and s.is_active and (s.role='administrator' or exists(select 1 from public.care_journey_roles r where r.user_id=s.user_id and r.capability=p_cap) or (p_cap='friend' and s.role='followup_worker')))$$;
create or replace function care_private.journey_visible(p_member uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.care_journeys j join public.care_members m on m.id=j.member_id and m.archived_at is null where j.member_id=p_member and (care_private.journey_cap('coordinator') or (care_private.journey_cap('friend') and j.assigned_to=auth.uid()) or (care_private.journey_cap('foundation') and (j.official_joined_on is not null or j.legacy_member))))$$;
create or replace function care_private.journey_services(p_member uuid,p_until date default (now() at time zone 'Africa/Lagos')::date) returns integer language sql stable security definer set search_path='' as $$select count(*)::integer from public.care_journey_attendance where member_id=p_member and voided_at is null and qualifies and service_date<=p_until$$;
create or replace function care_private.journey_member_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status='member' and (tg_op='INSERT' or old.status is distinct from 'member') and not exists(select 1 from public.care_journeys where member_id=new.id and official_joined_on is not null) then raise exception 'Confirm official membership through the Visitor Journey joining action.' using errcode='22023'; end if;
 if tg_op='UPDATE' and old.status='member' and new.status<>'member' then raise exception 'Official membership cannot be removed through a profile edit.' using errcode='22023'; end if;
 return new;end$$;
drop trigger if exists care_journey_member_guard on public.care_members;
create trigger care_journey_member_guard before insert or update of status on public.care_members for each row execute function care_private.journey_member_guard();
create or replace function care_private.journey_new_person() returns trigger language plpgsql security definer set search_path='' as $$begin insert into public.care_journeys(member_id) values(new.id) on conflict do nothing;return new;end$$;
drop trigger if exists care_journey_new_person on public.care_members;
create trigger care_journey_new_person after insert on public.care_members for each row execute function care_private.journey_new_person();
do $$declare n text;begin foreach n in array array['care_journey_roles','care_journey_policy','care_journeys','care_journey_tasks','care_journey_contacts','care_journey_attendance','care_journey_cohorts','care_journey_cfc','care_journey_cfc_attendance','care_journey_events'] loop execute format('alter table public.%I enable row level security',n);execute format('revoke all on public.%I from public,anon,authenticated',n);end loop;end$$;
revoke all on care_private.journey_requests from public,anon,authenticated;
create or replace function public.care_journey_read(p_member uuid default null,p_search text default '',p_page integer default 0,p_view text default 'all',p_stage text default 'all') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;detail jsonb;w boolean:=care_private.journey_cap('friend');c boolean:=care_private.journey_cap('coordinator');f boolean:=care_private.journey_cap('foundation');a boolean:=care_private.has_role(array['administrator']);begin
 if not(c or f or care_private.journey_cap('friend')) then raise exception 'Journey access has not been assigned to this staff account.' using errcode='42501';end if;
 if length(p_search)>120 or p_page<0 or p_page>100000 or p_view not in ('all','overview','visitors','followups','attendance','membership','care','cfc') or p_stage not in ('all','eligible','interested','confirmed','awaiting','deferred','did_not_join','joined') then raise exception 'Invalid search' using errcode='22023';end if;
 with visible as (select j.*,m.other_names||' '||m.surname name,m.status,m.created_at registered_at,care_private.journey_services(j.member_id) service_count,
 coalesce((select min(t.due_at) from public.care_journey_tasks t where t.member_id=j.member_id and t.status='open' and (t.kind='care_review' or coalesce(cp.contact_consent,false))),
 case when m.status<>'member' and coalesce(cp.contact_consent,false) and not exists(select 1 from public.care_journey_contacts e where e.member_id=j.member_id) and not exists(select 1 from public.care_followup_activities e join public.care_followups x on x.id=e.followup_id where x.member_id=j.member_id)
 then m.created_at+make_interval(hours=>(select first_contact_hours from public.care_journey_policy where id=1)) end) next_due,
 ((select count(*) from public.care_journey_contacts e where e.member_id=j.member_id)+(select count(*) from public.care_followup_activities e join public.care_followups x on x.id=e.followup_id where x.member_id=j.member_id)) contact_count,
 (select min(g.visit_date) from public.care_guest_submissions g where g.member_id=j.member_id and g.review_status in ('accepted','duplicate')) reported_first_visit,
 s.display_name worker_name,coalesce(cp.contact_consent,false) contact_consent,coalesce(cp.email_opt_in,false) email_opt_in,coalesce(cp.sms_opt_in,false) sms_opt_in,
 case when (c or j.assigned_to=auth.uid()) and cp.contact_consent then m.phone end phone,
 case when (c or j.assigned_to=auth.uid()) and cp.contact_consent then m.whatsapp end whatsapp,
 case when (c or j.assigned_to=auth.uid()) and cp.contact_consent and cp.email_opt_in then m.email end email
 from public.care_journeys j join public.care_members m on m.id=j.member_id left join public.care_staff s on s.user_id=j.assigned_to left join public.care_preferences cp on cp.member_id=j.member_id where m.archived_at is null and (c or (w and j.assigned_to=auth.uid()) or (f and (j.official_joined_on is not null or j.legacy_member)))),
 filtered as(select * from visible where name ilike '%'||p_search||'%' and
 (p_view in ('all','attendance') or (p_view='overview' and (next_due is not null or (status<>'member' and assigned_to is null)))
 or (p_view='visitors' and status<>'member') or (p_view='followups' and next_due is not null)
 or (p_view='membership' and (
 (p_stage='all' and (status='member' or service_count>=2 or intention<>'unknown'))
 or (p_stage='eligible' and status<>'member' and service_count>=2)
 or (p_stage='joined' and status='member')
 or (p_stage='awaiting' and status<>'member' and intention in ('unknown','undecided'))
 or (p_stage in ('interested','confirmed','deferred','did_not_join') and status<>'member' and intention=p_stage)))
 or (p_view in ('care','cfc') and status='member')))
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(t)) from(select * from filtered order by next_due nulls last,name,member_id limit 30 offset p_page*30)t),'[]'::jsonb),'total',(select count(*) from filtered),'stats',(select jsonb_build_object('visitors',count(*) filter(where status<>'member'),'unassigned',count(*) filter(where assigned_to is null and status<>'member'),'eligible',count(*) filter(where service_count>=2 and status<>'member'),'members',count(*) filter(where status='member'),'care',count(*) filter(where official_joined_on is not null and care_status='ongoing'),'attention',count(*) filter(where next_due<now()),'overdue',count(*) filter(where (contact_count=0 and next_due is not null and status<>'member' and registered_at<now()-interval '7 days') or (contact_count>0 and next_due<now()))) from visible)) into result;
 if p_member is not null then
 if not care_private.journey_visible(p_member) then raise exception 'This person is outside your assigned journey access.' using errcode='42501';end if;
 select jsonb_build_object('person',to_jsonb(j)||jsonb_build_object('name',(select other_names||' '||surname from public.care_members where id=j.member_id),'status',(select status from public.care_members where id=j.member_id),'worker_name',(select display_name from public.care_staff where user_id=j.assigned_to),'service_count',care_private.journey_services(j.member_id),
 'reported_first_visit',(select min(g.visit_date) from public.care_guest_submissions g where g.member_id=j.member_id and g.review_status in ('accepted','duplicate')),
 'contact_consent',coalesce((select contact_consent from public.care_preferences where member_id=j.member_id),false),
 'phone',case when c or j.assigned_to=auth.uid() then (select m.phone from public.care_members m join public.care_preferences cp on cp.member_id=m.id where m.id=j.member_id and cp.contact_consent) end,
 'email',case when c or j.assigned_to=auth.uid() then (select m.email from public.care_members m join public.care_preferences cp on cp.member_id=m.id where m.id=j.member_id and cp.contact_consent and cp.email_opt_in) end),'attendance',coalesce((select jsonb_agg(to_jsonb(t) order by t.service_date desc) from public.care_journey_attendance t where t.member_id=p_member),'[]'::jsonb),
 'contacts',case when c or j.assigned_to=auth.uid() then coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('actor_name',(select display_name from public.care_staff where user_id=t.actor)) order by t.occurred_at desc) from public.care_journey_contacts t where t.member_id=p_member),'[]'::jsonb) else '[]'::jsonb end,
 'tasks',case when c or j.assigned_to=auth.uid() then coalesce((select jsonb_agg(to_jsonb(t) order by t.due_at) from public.care_journey_tasks t where t.member_id=p_member and t.status='open' and (t.kind='care_review' or exists(select 1 from public.care_preferences cp where cp.member_id=p_member and cp.contact_consent))),'[]'::jsonb) else '[]'::jsonb end,
 'events',case when c or j.assigned_to=auth.uid() then coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('actor_name',(select display_name from public.care_staff where user_id=t.actor)) order by t.created_at desc) from public.care_journey_events t where t.member_id=p_member),'[]'::jsonb) else '[]'::jsonb end,
 'guests',case when c or j.assigned_to=auth.uid() then coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'visit_date',g.visit_date,'source',g.source,'review_status',g.review_status)) from public.care_guest_submissions g where g.member_id=p_member),'[]'::jsonb) else '[]'::jsonb end,
 'legacy_contacts',case when c or j.assigned_to=auth.uid() then coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from public.care_followup_activities e join public.care_followups x on x.id=e.followup_id where x.member_id=p_member),'[]'::jsonb) else '[]'::jsonb end,
 'cfc',(select to_jsonb(e) from public.care_journey_cfc e where e.member_id=p_member),'cfc_attendance',coalesce((select jsonb_agg(to_jsonb(e) order by e.week) from public.care_journey_cfc_attendance e where e.member_id=p_member),'[]'::jsonb)) into detail from public.care_journeys j where j.member_id=p_member;end if;
 return result||jsonb_build_object('detail',detail,'capabilities',jsonb_build_object('coordinator',c,'foundation',f,'administrator',a,'friend',care_private.journey_cap('friend')),'policy',(select to_jsonb(p) from public.care_journey_policy p where id=1),
 'team',case when c or a then coalesce((select jsonb_agg(jsonb_build_object('id',s.user_id,'name',s.display_name,'role',s.role,'capabilities',(select coalesce(jsonb_agg(r.capability),'[]'::jsonb) from public.care_journey_roles r where r.user_id=s.user_id))) from public.care_staff s where s.is_active),'[]'::jsonb) else '[]'::jsonb end,
 'cohorts',coalesce((select jsonb_agg(to_jsonb(t) order by t.starts_on desc) from public.care_journey_cohorts t),'[]'::jsonb));end$$;
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
 if length(btrim(note))<3 then raise exception 'Enter an assignment reason.' using errcode='22023';end if;
 update public.care_journeys set assigned_to=worker,assignment_conflict=false where member_id=m;
 if not exists(select 1 from public.care_journey_contacts where member_id=m) and not exists(select 1 from public.care_followup_activities e join public.care_followups x on x.id=e.followup_id where x.member_id=m) and not exists(select 1 from public.care_journey_tasks where member_id=m and status='open') and coalesce((select contact_consent from public.care_preferences where member_id=m),false) then insert into public.care_journey_tasks(member_id,due_at,kind,note) select m,created_at+make_interval(hours=>policy.first_contact_hours),'first_contact','Operational deadline from registration time, not verified attendance.' from public.care_members where id=m;end if;
 elsif p_action='contact' then
 select * into pref from public.care_preferences where member_id=m for update;
 method:=p_data->>'method';outcome:=p_data->>'outcome';at_time:=(p_data->>'occurredAt')::timestamptz;
 if at_time is null or at_time>now()+interval '1 minute' then raise exception 'Enter an actual contact time, not a future time.' using errcode='22023';end if;
 if not coalesce(pref.contact_consent,false) and outcome<>'no_further_contact' then raise exception 'Outreach is paused because contact permission is off.' using errcode='22023';end if;
 if outcome<>'no_further_contact' and ((method='sms' and not pref.sms_opt_in) or (method='email' and not pref.email_opt_in)) then raise exception 'This channel is opted out.' using errcode='22023';end if;
 if outcome='callback' and nullif(p_data->>'nextDue','') is null then raise exception 'Choose a callback date and time.' using errcode='22023';end if;
 if nullif(p_data->>'nextDue','') is not null and ((p_data->>'nextDue')::timestamptz<=now() or (p_data->>'nextDue')::timestamptz<=at_time) then raise exception 'Next contact must be in the future.' using errcode='22023';end if;
 if outcome='no_further_contact' then
 if length(btrim(note))<3 then raise exception 'Record the request to stop all contact.' using errcode='22023';end if;
 foreach k in array array['contact_consent','email_opt_in','sms_opt_in','celebrations_opt_in','programmes_opt_in','newsletters_opt_in'] loop insert into public.care_consent_events(member_id,preference,previous_value,new_value,source,policy_version,evidence_note,recorded_by) values(m,k,(to_jsonb(pref)->>k)::boolean,false,'admin',coalesce(pref.policy_version,'v1'),note,actor_id);end loop;
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
 insert into public.care_journey_attendance(member_id,service_date,service_key,service_type,source,evidence,verification,qualifies,recorded_by) values(m,dt,btrim(p_data->>'serviceKey'),btrim(p_data->>'serviceType'),p_data->>'source',btrim(note),p_data->>'verification',btrim(p_data->>'serviceType')=any(policy.service_types),actor_id);
 elsif p_action='void_attendance' then
 if length(btrim(note))<5 or (j.official_joined_on is not null and not admin) then raise exception 'Record a correction reason. Post-joining corrections require a church administrator.' using errcode='22023';end if;
 update public.care_journey_attendance set voided_at=now() where id=(p_data->>'attendanceId')::uuid and member_id=m and voided_at is null;
 if not found then raise exception 'Attendance entry not found.' using errcode='22023';end if;
 if j.official_joined_on is not null and not j.legacy_member and care_private.journey_services(m,j.official_joined_on)<2 then update public.care_journeys set membership_review=true where member_id=m;end if;
 elsif p_action='review_membership' then
 if not admin or length(btrim(note))<5 or (not j.legacy_member and care_private.journey_services(m,j.official_joined_on)<2) then raise exception 'Administrator review and sufficient joining-date evidence are required.' using errcode='22023';end if;
 update public.care_journeys set membership_review=false where member_id=m;
 elsif p_action='intention' then update public.care_journeys set intention=p_data->>'intention' where member_id=m;
 elsif p_action in ('join','legacy_date') then
 dt:=(p_data->>'date')::date;
 if dt is null or dt>(now() at time zone 'Africa/Lagos')::date or length(btrim(note))<5 or j.official_joined_on is not null then raise exception 'Enter an actual joining date and evidence; membership must not already be confirmed.' using errcode='22023';end if;
 if p_action='legacy_date' then if not admin or not j.legacy_member then raise exception 'Only an administrator may reconcile a pre-existing official member with documentary evidence.' using errcode='42501';end if;
 elsif j.legacy_member or care_private.journey_services(m,dt)<2 then raise exception 'Two recorded qualifying church services are required before joining.' using errcode='22023';end if;
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
 insert into public.care_journey_cfc(member_id,cohort_id) values(m,(p_data->>'cohort')::uuid);
 elsif p_action='class_attendance' then
 dt:=(p_data->>'date')::date;
 if dt is null or dt>(now() at time zone 'Africa/Lagos')::date or dt<j.official_joined_on or dt>(select completed_on from public.care_journey_cfc where member_id=m) or not exists(select 1 from public.care_journey_cfc e join public.care_journey_cohorts h on h.id=e.cohort_id where e.member_id=m and dt>=h.starts_on) then raise exception 'Choose an actual class date after joining and cohort start.' using errcode='22023';end if;
 select to_jsonb(t) into previous_entry from public.care_journey_cfc_attendance t where t.member_id=m and t.week=(p_data->>'week')::integer;
 if found then
 if coalesce(p_data->>'correction','')<>'on' or length(btrim(note))<5 then raise exception 'This week is already recorded. To correct it, select correction and give a reason.' using errcode='22023';end if;
 update public.care_journey_cfc_attendance set attended_on=dt,recorded_by=actor_id where member_id=m and week=(p_data->>'week')::integer;
 else insert into public.care_journey_cfc_attendance values(m,(p_data->>'week')::integer,dt,actor_id);end if;
 elsif p_action='complete_cfc' then
 dt:=(p_data->>'date')::date;
 if policy.cfc_policy is null or length(btrim(note))<5 or dt is null or dt>(now() at time zone 'Africa/Lagos')::date or dt<j.official_joined_on or dt<coalesce((select max(attended_on) from public.care_journey_cfc_attendance where member_id=m),dt) then raise exception 'Approved CFC policy, valid completion date and assessment evidence required.' using errcode='22023';end if;
 update public.care_journey_cfc set completed_on=dt where member_id=m and completed_on is null;
 if not found then raise exception 'Enrolment is missing or already completed.' using errcode='22023';end if;
 elsif p_action='certificate' then
 if nullif(btrim(p_data->>'number'),'') is null or policy.cfc_policy is null or length(btrim(note))<5 then raise exception 'Approved certificate policy and award evidence required.' using errcode='22023';end if;
 update public.care_journey_cfc set certificate_number=btrim(p_data->>'number') where member_id=m and completed_on is not null and certificate_number is null;
 if not found then raise exception 'Complete CFC before recording a certificate award.' using errcode='22023';end if;
 else raise exception 'Unknown journey action.' using errcode='22023';end if;
 update public.care_journeys set version=version+1,updated_at=now() where member_id=m;
 end if;
 insert into public.care_journey_events(member_id,actor,action,detail) values(m,actor_id,p_action,p_data||jsonb_build_object('previous_friend',j.assigned_to,'previous_class_entry',previous_entry));
 answer:=jsonb_build_object('saved',true,'memberId',m);
 insert into care_private.journey_requests values(actor_id,p_request,payload,answer);return answer;end$$;
-- Retire old writes and reads so former assignees cannot bypass canonical ownership.
revoke execute on function public.care_followup_list(),public.care_followup_staff(),public.care_followup_history(uuid),public.care_followup_assign(uuid,uuid,timestamptz,text),public.care_followup_record(uuid,text,text,text,boolean) from public,anon,authenticated;
revoke all on function care_private.journey_cap(text),care_private.journey_visible(uuid),care_private.journey_services(uuid,date),care_private.journey_member_guard(),care_private.journey_new_person() from public,anon,authenticated;
revoke all on function public.care_journey_read(uuid,text,integer,text,text),public.care_journey_write(text,jsonb,uuid) from public,anon;
grant execute on function public.care_journey_read(uuid,text,integer,text,text),public.care_journey_write(text,jsonb,uuid) to authenticated;
commit;
