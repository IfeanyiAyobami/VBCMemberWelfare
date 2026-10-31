-- VBC v3.8 reporting. Apply after 018. Read-only report data is role-scoped.
begin;
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
 'definitions',jsonb_build_object('cohort','Visitor intake records whose first recorded/reported visit falls within the period; registration date is an explicitly labelled fallback when visit date is unknown.',
 'conversion','Visitor-cohort joiners by period end divided by the same visitor cohort. Direct registrations and unknown legacy intake sources are excluded.',
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
