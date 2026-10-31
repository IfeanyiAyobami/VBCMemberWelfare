from pathlib import Path
base=Path('supabase/017_visitor_journey.sql').read_text()
read=base[base.index('create or replace function public.care_journey_read('):base.index('create or replace function public.care_journey_write(')]
write=base[base.index('create or replace function public.care_journey_write('):base.index('-- Retire old writes')]
# Keep the existing transactional permissions, version checks and replay protection.
read=read.replace('service_count>=2','membership_eligible')
read=read.replace("care_private.journey_services(j.member_id) service_count,","care_private.journey_services(j.member_id) service_count,care_private.journey_first_visit(j.member_id) first_visit_on,care_private.journey_has_previous_visit(j.member_id,(now() at time zone 'Africa/Lagos')::date) previous_visit_confirmed,care_private.journey_has_previous_visit(j.member_id,care_private.journey_membership_sunday()) membership_eligible,")
read=read.replace("'service_count',care_private.journey_services(j.member_id),","'service_count',care_private.journey_services(j.member_id),'first_visit_on',care_private.journey_first_visit(j.member_id),'previous_visit_confirmed',care_private.journey_has_previous_visit(j.member_id,(now() at time zone 'Africa/Lagos')::date),'membership_eligible',care_private.journey_has_previous_visit(j.member_id,care_private.journey_membership_sunday()),")
read=read.replace("'did_not_join','joined')", "'did_not_join','joined','paused','inactive','declined_contact')")
read=read.replace("(p_view='visitors' and status<>'member')", "(p_view='visitors' and status<>'member' and (p_stage='all' and followup_state='active' or p_stage in ('paused','inactive','declined_contact') and followup_state=p_stage))")
read=read.replace("(p_view='followups' and next_due is not null)", "(p_view='followups' and next_due is not null and followup_state='active')")
read=read.replace("jsonb_agg(to_jsonb(t) order by t.service_date desc)","jsonb_agg(to_jsonb(t)||jsonb_build_object('qualifies',t.voided_at is null and lower(t.service_type)!~'(home.?cell|cfc|foundation)') order by t.service_date desc)")
read=read.replace("s.display_name worker_name,", "s.display_name worker_name,(select count(*) from public.care_ministry_memberships mm where mm.member_id=j.member_id and mm.active) ministry_count,(select cc.name from public.hco_member_cells xx join public.hco_cells cc on cc.id=xx.cell_id where xx.member_id=j.member_id and xx.active limit 1) home_cell_name,")
read=read.replace("p_stage='all' and (status='member' or membership_eligible or intention<>'unknown')", "p_stage='all' and status<>'member' and (membership_eligible or intention<>'unknown')")
read=read.replace("p_view='overview' and (", "p_view='overview' and followup_state='active' and (")
read=read.replace("and coalesce(cp.contact_consent,false))),", "and coalesce(cp.contact_consent,false))),")
read=read.replace("t.status='open' and (t.kind='care_review' or coalesce(cp.contact_consent,false))", "t.status='open' and (t.kind='care_review' or (j.followup_state='active' and coalesce(cp.contact_consent,false)))")
read=read.replace("case when m.status<>'member' and coalesce(cp.contact_consent,false)", "case when m.status<>'member' and j.followup_state='active' and coalesce(cp.contact_consent,false)")
read=read.replace("'visitors',count(*) filter(where status<>'member')", "'visitors',count(*) filter(where status<>'member' and followup_state='active')")
read=read.replace("where assigned_to is null and status<>'member'", "where assigned_to is null and status<>'member' and followup_state='active'")
read=read.replace("'interested','confirmed','deferred','did_not_join')", "'interested','invited','confirmed','deferred','did_not_join')")
read=read.replace("'all','eligible','interested','confirmed'", "'all','eligible','interested','invited','confirmed'")
# Reuse existing Home Cell structures, and expose sensitive care notes only to outreach roles.
needle="'cfc',(select to_jsonb(e)"
read=read.replace(needle,"""'previous_visits',coalesce((select jsonb_agg(to_jsonb(pv) order by pv.recorded_at desc) from public.care_journey_previous_visits pv where pv.member_id=p_member),'[]'::jsonb),
 'ministry',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.care_ministry_memberships t where t.member_id=p_member),'[]'::jsonb),
 'home_cells',coalesce((select jsonb_agg(to_jsonb(t)) from (select x.id,x.cell_id,x.active,x.joined_at,x.left_at,c.name cell_name,a.name area_name from public.hco_member_cells x join public.hco_cells c on c.id=x.cell_id join public.hco_areas a on a.id=c.area_id where x.member_id=p_member order by x.joined_at desc)t),'[]'::jsonb),
 'home_transfers',case when c or j.assigned_to=auth.uid() then coalesce((select jsonb_agg(to_jsonb(t) order by t.requested_at desc) from public.hco_member_transfers t where t.member_id=p_member),'[]'::jsonb) else '[]'::jsonb end,
 'welfare',case when c or j.assigned_to=auth.uid() then coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.care_journey_support t where t.member_id=p_member),'[]'::jsonb) else '[]'::jsonb end,
 'cfc',(select to_jsonb(e)""")
write=write.replace("care_private.journey_services(m,dt)<2", "not care_private.journey_has_previous_visit(m,dt)").replace("care_private.journey_services(m,j.official_joined_on)<2", "not care_private.journey_has_previous_visit(m,j.official_joined_on)")
write=write.replace('Two recorded qualifying church services are required before joining.', 'One recorded previous VBC church visit is required before the joining date. A first-time same-day joining exception has not been approved.')
write=write.replace("'interested','confirmed'", "'interested','invited','confirmed'")
# Registration alone never creates attendance. Only an explicit attendance write records a visit.
write=write.replace("btrim(p_data->>'serviceType')=any(policy.service_types)", "true")
write=write.replace("btrim(p_data->>'serviceType'),p_data->>'source'", "coalesce(nullif(btrim(p_data->>'serviceType'),''),'Church service - type not specified'),p_data->>'source'")
write=write.replace("btrim(note),p_data->>'verification',true", "coalesce(nullif(btrim(note),''),'Attendance reported; no additional remarks.'),p_data->>'verification',true")
write=write.replace("update public.care_preferences set contact_consent=false", "update public.care_journeys set followup_state='declined_contact' where member_id=m;\n update public.care_preferences set contact_consent=false")
write=write.replace("elsif p_action='contact' then", "elsif p_action in ('purpose','followup_state','support','ministry_add','ministry_end','previous_visit','void_previous_visit') then\n perform care_private.journey_integration_write(p_action,p_data,actor_id,m,c);\n elsif p_action='contact' then")
# Pausing follow-up never disables the internal care-review workflow or membership itself.
write=write.replace("if not coalesce(pref.contact_consent,false) and outcome<>'no_further_contact'", "if (not coalesce(pref.contact_consent,false) or j.followup_state<>'active') and outcome<>'no_further_contact'")
write=write.replace("set attended_on=dt,recorded_by=actor_id", "set attended_on=dt,recorded_by=actor_id,attendance_status=coalesce(p_data->>'attendanceStatus','present'),note=coalesce(p_data->>'note','')")
write=write.replace("insert into public.care_journey_cfc_attendance values(m,(p_data->>'week')::integer,dt,actor_id)","insert into public.care_journey_cfc_attendance(member_id,week,attended_on,recorded_by,attendance_status,note) values(m,(p_data->>'week')::integer,dt,actor_id,coalesce(p_data->>'attendanceStatus','present'),note)")
write=write.replace("set certificate_number=btrim(p_data->>'number')","set certificate_number=btrim(p_data->>'number'),certificate_recorded_at=now()")
write=write.replace("insert into public.care_journey_cfc(member_id,cohort_id) values(m,(p_data->>'cohort')::uuid)","dt:=case when p_data ? 'date' then nullif(p_data->>'date','')::date else (now() at time zone 'Africa/Lagos')::date end; if dt>(now() at time zone 'Africa/Lagos')::date or dt<j.official_joined_on then raise exception 'Enrolment date must be actual and not before official joining.' using errcode='22023';end if; insert into public.care_journey_cfc(member_id,cohort_id,enrolled_on) values(m,(p_data->>'cohort')::uuid,dt)")
write=write.replace("elsif p_action='certificate' then", "elsif p_action='certificate' then dt:=case when p_data ? 'date' then nullif(p_data->>'date','')::date else (now() at time zone 'Africa/Lagos')::date end; if dt>(now() at time zone 'Africa/Lagos')::date or dt<(select completed_on from public.care_journey_cfc where member_id=m) then raise exception 'Award date must be actual, after completion and not in the future.' using errcode='22023';end if;")
write=write.replace("certificate_recorded_at=now()", "certificate_recorded_at=now(),certificate_awarded_on=dt")
read=read.replace("c or j.assigned_to=auth.uid()","c or (w and j.assigned_to=auth.uid())")
prefix=Path('tools/018-prefix.sql').read_text()
Path('supabase/018_member_care_integration.sql').write_text(prefix+'\n'+read+'\n'+write+'\n'+Path('tools/018-suffix.sql').read_text())
