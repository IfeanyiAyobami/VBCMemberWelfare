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

create or replace function public.care_journey_read(p_member uuid default null,p_search text default '',p_page integer default 0,p_view text default 'all',p_stage text default 'all') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;detail jsonb;w boolean:=care_private.journey_cap('friend');c boolean:=care_private.journey_cap('coordinator');f boolean:=care_private.journey_cap('foundation');a boolean:=care_private.has_role(array['administrator']);begin
 if not(c or f or care_private.journey_cap('friend')) then raise exception 'Journey access has not been assigned to this staff account.' using errcode='42501';end if;
 if length(p_search)>120 or p_page<0 or p_page>100000 or p_view not in ('all','overview','visitors','followups','attendance','membership','care','cfc') or p_stage not in ('all','eligible','interested','invited','confirmed','awaiting','deferred','did_not_join','joined','paused','inactive','declined_contact') then raise exception 'Invalid search' using errcode='22023';end if;
 with visible as (select j.*,m.other_names||' '||m.surname name,m.status,m.created_at registered_at,care_private.journey_services(j.member_id) service_count,care_private.journey_first_visit(j.member_id) first_visit_on,care_private.journey_has_previous_visit(j.member_id,(now() at time zone 'Africa/Lagos')::date) previous_visit_confirmed,care_private.journey_has_previous_visit(j.member_id,care_private.journey_membership_sunday()) membership_eligible,
 coalesce((select min(t.due_at) from public.care_journey_tasks t where t.member_id=j.member_id and t.status='open' and (t.kind='care_review' or (j.followup_state='active' and coalesce(cp.contact_consent,false)))),
 case when m.status<>'member' and j.followup_state='active' and coalesce(cp.contact_consent,false) and not exists(select 1 from public.care_journey_contacts e where e.member_id=j.member_id) and not exists(select 1 from public.care_followup_activities e join public.care_followups x on x.id=e.followup_id where x.member_id=j.member_id)
 then m.created_at+make_interval(hours=>(select first_contact_hours from public.care_journey_policy where id=1)) end) next_due,
 ((select count(*) from public.care_journey_contacts e where e.member_id=j.member_id)+(select count(*) from public.care_followup_activities e join public.care_followups x on x.id=e.followup_id where x.member_id=j.member_id)) contact_count,
 (select min(g.visit_date) from public.care_guest_submissions g where g.member_id=j.member_id and g.review_status in ('accepted','duplicate')) reported_first_visit,
 s.display_name worker_name,(select count(*) from public.care_ministry_memberships mm where mm.member_id=j.member_id and mm.active) ministry_count,(select cc.name from public.hco_member_cells xx join public.hco_cells cc on cc.id=xx.cell_id where xx.member_id=j.member_id and xx.active limit 1) home_cell_name,coalesce(cp.contact_consent,false) contact_consent,coalesce(cp.email_opt_in,false) email_opt_in,coalesce(cp.sms_opt_in,false) sms_opt_in,
 case when (c or (w and j.assigned_to=auth.uid())) and cp.contact_consent then m.phone end phone,
 case when (c or (w and j.assigned_to=auth.uid())) and cp.contact_consent then m.whatsapp end whatsapp,
 case when (c or (w and j.assigned_to=auth.uid())) and cp.contact_consent and cp.email_opt_in then m.email end email
 from public.care_journeys j join public.care_members m on m.id=j.member_id left join public.care_staff s on s.user_id=j.assigned_to left join public.care_preferences cp on cp.member_id=j.member_id where m.archived_at is null and (c or (w and j.assigned_to=auth.uid()) or (f and (j.official_joined_on is not null or j.legacy_member)))),
 filtered as(select * from visible where name ilike '%'||p_search||'%' and
 (p_view in ('all','attendance') or (p_view='overview' and followup_state='active' and (next_due is not null or (status<>'member' and assigned_to is null)))
 or (p_view='visitors' and status<>'member' and (p_stage='all' and followup_state='active' or p_stage in ('paused','inactive','declined_contact') and followup_state=p_stage)) or (p_view='followups' and next_due is not null and followup_state='active')
 or (p_view='membership' and (
 (p_stage='all' and status<>'member' and (membership_eligible or intention<>'unknown'))
 or (p_stage='eligible' and status<>'member' and membership_eligible)
 or (p_stage='joined' and status='member')
 or (p_stage='awaiting' and status<>'member' and intention in ('unknown','undecided'))
 or (p_stage in ('interested','invited','confirmed','deferred','did_not_join') and status<>'member' and intention=p_stage)))
 or (p_view in ('care','cfc') and status='member')))
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(t)) from(select * from filtered order by next_due nulls last,name,member_id limit 30 offset p_page*30)t),'[]'::jsonb),'total',(select count(*) from filtered),'stats',(select jsonb_build_object('visitors',count(*) filter(where status<>'member' and followup_state='active'),'unassigned',count(*) filter(where assigned_to is null and status<>'member' and followup_state='active'),'eligible',count(*) filter(where membership_eligible and status<>'member'),'members',count(*) filter(where status='member'),'care',count(*) filter(where official_joined_on is not null and care_status='ongoing'),'attention',count(*) filter(where next_due<now()),'overdue',count(*) filter(where (contact_count=0 and next_due is not null and status<>'member' and registered_at<now()-interval '7 days') or (contact_count>0 and next_due<now()))) from visible)) into result;
 if p_member is not null then
 if not care_private.journey_visible(p_member) then raise exception 'This person is outside your assigned journey access.' using errcode='42501';end if;
 select jsonb_build_object('person',to_jsonb(j)||jsonb_build_object('name',(select other_names||' '||surname from public.care_members where id=j.member_id),'status',(select status from public.care_members where id=j.member_id),'worker_name',(select display_name from public.care_staff where user_id=j.assigned_to),'service_count',care_private.journey_services(j.member_id),'first_visit_on',care_private.journey_first_visit(j.member_id),'previous_visit_confirmed',care_private.journey_has_previous_visit(j.member_id,(now() at time zone 'Africa/Lagos')::date),'membership_eligible',care_private.journey_has_previous_visit(j.member_id,care_private.journey_membership_sunday()),
 'reported_first_visit',(select min(g.visit_date) from public.care_guest_submissions g where g.member_id=j.member_id and g.review_status in ('accepted','duplicate')),
 'contact_consent',coalesce((select contact_consent from public.care_preferences where member_id=j.member_id),false),
 'phone',case when c or (w and j.assigned_to=auth.uid()) then (select m.phone from public.care_members m join public.care_preferences cp on cp.member_id=m.id where m.id=j.member_id and cp.contact_consent) end,
 'email',case when c or (w and j.assigned_to=auth.uid()) then (select m.email from public.care_members m join public.care_preferences cp on cp.member_id=m.id where m.id=j.member_id and cp.contact_consent and cp.email_opt_in) end),'attendance',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('qualifies',t.voided_at is null and lower(t.service_type)!~'(home.?cell|cfc|foundation)') order by t.service_date desc) from public.care_journey_attendance t where t.member_id=p_member),'[]'::jsonb),
 'contacts',case when c or (w and j.assigned_to=auth.uid()) then coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('actor_name',(select display_name from public.care_staff where user_id=t.actor)) order by t.occurred_at desc) from public.care_journey_contacts t where t.member_id=p_member),'[]'::jsonb) else '[]'::jsonb end,
 'tasks',case when c or (w and j.assigned_to=auth.uid()) then coalesce((select jsonb_agg(to_jsonb(t) order by t.due_at) from public.care_journey_tasks t where t.member_id=p_member and t.status='open' and (t.kind='care_review' or exists(select 1 from public.care_preferences cp where cp.member_id=p_member and cp.contact_consent))),'[]'::jsonb) else '[]'::jsonb end,
 'events',case when c or (w and j.assigned_to=auth.uid()) then coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('actor_name',(select display_name from public.care_staff where user_id=t.actor)) order by t.created_at desc) from public.care_journey_events t where t.member_id=p_member),'[]'::jsonb) else '[]'::jsonb end,
 'guests',case when c or (w and j.assigned_to=auth.uid()) then coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'visit_date',g.visit_date,'source',g.source,'review_status',g.review_status)) from public.care_guest_submissions g where g.member_id=p_member),'[]'::jsonb) else '[]'::jsonb end,
 'legacy_contacts',case when c or (w and j.assigned_to=auth.uid()) then coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from public.care_followup_activities e join public.care_followups x on x.id=e.followup_id where x.member_id=p_member),'[]'::jsonb) else '[]'::jsonb end,
 'previous_visits',coalesce((select jsonb_agg(to_jsonb(pv) order by pv.recorded_at desc) from public.care_journey_previous_visits pv where pv.member_id=p_member),'[]'::jsonb),
 'ministry',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.care_ministry_memberships t where t.member_id=p_member),'[]'::jsonb),
 'home_cells',coalesce((select jsonb_agg(to_jsonb(t)) from (select x.id,x.cell_id,x.active,x.joined_at,x.left_at,c.name cell_name,a.name area_name from public.hco_member_cells x join public.hco_cells c on c.id=x.cell_id join public.hco_areas a on a.id=c.area_id where x.member_id=p_member order by x.joined_at desc)t),'[]'::jsonb),
 'home_transfers',case when c or (w and j.assigned_to=auth.uid()) then coalesce((select jsonb_agg(to_jsonb(t) order by t.requested_at desc) from public.hco_member_transfers t where t.member_id=p_member),'[]'::jsonb) else '[]'::jsonb end,
 'welfare',case when c or (w and j.assigned_to=auth.uid()) then coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.care_journey_support t where t.member_id=p_member),'[]'::jsonb) else '[]'::jsonb end,
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

revoke all on function care_private.journey_integration_write(text,jsonb,uuid,uuid,boolean),care_private.journey_guest_source() from public,anon,authenticated;
revoke all on function public.care_journey_direct(jsonb,uuid) from public,anon;
grant execute on function public.care_journey_direct(jsonb,uuid) to authenticated;
revoke all on function care_private.journey_first_visit(uuid),care_private.journey_membership_sunday() from public,anon,authenticated;
revoke all on function care_private.journey_has_previous_visit(uuid,date) from public,anon,authenticated;
commit;
