-- VBC Member Care v4.12 — simple leader app support.
-- 1. "No meeting" weeks.  2. Nobody reviews their own cell's report; the Coordinator
--    approves when the area's only Area Leaders lead that cell.  3. PIN sign-in for
--    Area Leaders (and people who are both Cell and Area Leaders).
-- Safe to rerun. Apply after 032.
begin;

alter table public.hco_meetings drop constraint if exists hco_meetings_status_check;
alter table public.hco_meetings add constraint hco_meetings_status_check
  check (status in ('draft','submitted','correction_requested','approved','no_meeting'));

CREATE OR REPLACE FUNCTION public.hco_workspace_write(p_actor uuid,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_admin boolean; v_manage boolean; v_write boolean; v_cell uuid; v_area uuid;
 v_id uuid; v_member uuid; v_guest uuid; v_request uuid; v_visit uuid;
 v_meeting public.hco_meetings%ROWTYPE; v_old jsonb; v_result jsonb; v_row jsonb; v_att jsonb;
 v_expected integer; v_date date; v_amount numeric; v_status text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor) OR EXISTS(SELECT 1 FROM hco_access WHERE user_id=p_actor AND suspended_at IS NOT NULL) THEN
 RAISE EXCEPTION 'HCO_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT EXISTS(SELECT 1 FROM care_staff WHERE user_id=p_actor AND role='administrator' AND is_active)
 OR EXISTS(SELECT 1 FROM hco_assignments WHERE user_id=p_actor AND role='church_admin' AND active) INTO v_admin;
 IF NOT v_admin AND NOT EXISTS(SELECT 1 FROM hco_assignments WHERE user_id=p_actor AND active) THEN RAISE EXCEPTION 'HCO_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 v_cell:=nullif(p_data->>'cell_id','')::uuid;
 IF p_action IN ('attendance','finance','void_finance','submit','approve','correction','undo_no_meeting') THEN
 SELECT * INTO v_meeting FROM hco_meetings WHERE id=(p_data->>'meeting_id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'HCO_MEETING_NOT_FOUND'; END IF;
 v_cell:=v_meeting.cell_id;
 v_expected:=(p_data->>'version')::integer;
 IF v_expected IS NULL OR v_expected<>v_meeting.version THEN RAISE EXCEPTION 'HCO_STALE_REPORT_REFRESH_FIRST'; END IF;
 v_old:=jsonb_build_object('meeting',to_jsonb(v_meeting),'attendance',(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM hco_attendance a WHERE meeting_id=v_meeting.id),'finances',(SELECT coalesce(jsonb_agg(to_jsonb(f)),'[]') FROM hco_finances f WHERE meeting_id=v_meeting.id));
 END IF;
 IF p_action='followup' THEN
 SELECT cell_id INTO v_cell FROM hco_visits WHERE id=(p_data->>'visit_id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'HCO_VISIT_NOT_FOUND'; END IF;
 END IF;
 IF v_cell IS NOT NULL THEN
 SELECT area_id INTO v_area FROM hco_cells WHERE id=v_cell AND is_active;
 IF NOT FOUND THEN RAISE EXCEPTION 'HCO_CELL_NOT_FOUND'; END IF;
 ELSE v_area:=nullif(p_data->>'area_id','')::uuid; END IF;
 SELECT v_admin OR EXISTS(SELECT 1 FROM hco_assignments WHERE user_id=p_actor AND active AND role IN ('coordinator','area_leader') AND area_id=v_area) INTO v_manage;
 SELECT EXISTS(SELECT 1 FROM hco_assignments WHERE user_id=p_actor AND active AND role='cell_leader' AND cell_id=v_cell) INTO v_write;
 IF p_action IN ('approve','correction','announcement','cell') THEN
 IF NOT v_manage THEN RAISE EXCEPTION 'HCO_REVIEW_ACCESS_REQUIRED' USING ERRCODE='42501'; END IF;
 -- v4.12: nobody reviews a report from a cell they lead or a report they submitted.
 IF p_action IN ('approve','correction') AND (v_write OR v_meeting.submitted_by=p_actor) THEN RAISE EXCEPTION 'HCO_CANNOT_REVIEW_OWN_CELL_REPORT' USING ERRCODE='42501'; END IF;
 ELSE
 IF NOT (v_admin OR v_write) THEN RAISE EXCEPTION 'HCO_CELL_LEADER_ACCESS_REQUIRED' USING ERRCODE='42501'; END IF;
 END IF;
 IF p_action IN ('attendance','finance','void_finance','submit') AND v_meeting.status NOT IN ('draft','correction_requested') THEN RAISE EXCEPTION 'HCO_SUBMITTED_REPORT_IS_LOCKED'; END IF;
 IF p_action IN ('attendance','finance','void_finance','submit') AND v_meeting.status='correction_requested' AND (NOT v_write OR v_meeting.submitted_by IS DISTINCT FROM p_actor) THEN RAISE EXCEPTION 'HCO_ONLY_SUBMITTING_CELL_LEADER_CAN_REVISE' USING ERRCODE='42501'; END IF;
 IF p_action='meeting' THEN
 v_date:=(p_data->>'meeting_date')::date;
 IF v_date IS NULL OR v_date>(now() AT TIME ZONE 'Africa/Lagos')::date THEN RAISE EXCEPTION 'HCO_INVALID_MEETING_DATE'; END IF;
 IF EXISTS(SELECT 1 FROM hco_meetings WHERE cell_id=v_cell AND meeting_date<>v_date AND (meeting_date-(extract(isodow from meeting_date)::integer-1))=(v_date-(extract(isodow from v_date)::integer-1))) THEN RAISE EXCEPTION 'HCO_USE_EXISTING_MEETING_FOR_THIS_WEEK';END IF;
 INSERT INTO hco_meetings(cell_id,meeting_date,starts_at,ends_at) SELECT v_cell,v_date,meeting_start,meeting_end FROM hco_cells WHERE id=v_cell
 ON CONFLICT(cell_id,meeting_date) DO NOTHING;
 SELECT to_jsonb(m) INTO v_result FROM hco_meetings m WHERE cell_id=v_cell AND meeting_date=v_date;
 ELSIF p_action='attendance' THEN
 IF jsonb_typeof(p_data->'rows')<>'array' OR jsonb_array_length(p_data->'rows')>1000 OR length(coalesce(p_data->>'notes',''))>5000 THEN RAISE EXCEPTION 'HCO_INVALID_ATTENDANCE'; END IF;
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_data->'rows') LOOP
 v_member:=nullif(v_row->>'member_id','')::uuid;v_visit:=nullif(v_row->>'visit_id','')::uuid;
 IF (v_member IS NULL)=(v_visit IS NULL) OR v_row->>'status' NOT IN ('present','absent','late') THEN RAISE EXCEPTION 'HCO_INVALID_ATTENDANCE'; END IF;
 IF v_member IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hco_member_cells WHERE member_id=v_member AND cell_id=v_cell AND active) THEN RAISE EXCEPTION 'HCO_MEMBER_OUTSIDE_CELL'; END IF;
 IF v_visit IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hco_visits WHERE id=v_visit AND cell_id=v_cell AND meeting_id=v_meeting.id) THEN RAISE EXCEPTION 'HCO_VISITOR_OUTSIDE_MEETING'; END IF;
 END LOOP;
 DELETE FROM hco_attendance WHERE meeting_id=v_meeting.id;
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_data->'rows') LOOP
 INSERT INTO hco_attendance(meeting_id,member_id,visitor_name,status) VALUES(v_meeting.id,nullif(v_row->>'member_id','')::uuid,CASE WHEN v_row->>'visit_id' IS NOT NULL THEN 'visit:'||(v_row->>'visit_id') END,v_row->>'status');
 END LOOP;
 UPDATE hco_meetings SET notes=p_data->>'notes',version=version+1 WHERE id=v_meeting.id RETURNING to_jsonb(hco_meetings) INTO v_result;
 ELSIF p_action='finance' THEN
 v_amount:=(p_data->>'amount')::numeric;
 IF v_amount IS NULL OR v_amount<=0 OR v_amount>999999999999.99 OR v_amount<>round(v_amount,2) OR p_data->>'kind' NOT IN ('offering','dues','expense') OR length(trim(coalesce(p_data->>'description','')))<3 OR length(p_data->>'description')>1000 THEN RAISE EXCEPTION 'HCO_INVALID_TRANSACTION'; END IF;
 INSERT INTO hco_finances(meeting_id,kind,amount,description,recorded_by) VALUES(v_meeting.id,p_data->>'kind',v_amount,p_data->>'description',p_actor) RETURNING to_jsonb(hco_finances) INTO v_result;
 UPDATE hco_meetings SET version=version+1 WHERE id=v_meeting.id;
 ELSIF p_action='void_finance' THEN
 IF length(trim(coalesce(p_data->>'reason','')))<5 THEN RAISE EXCEPTION 'HCO_VOID_REASON_REQUIRED'; END IF;
 UPDATE hco_finances SET voided_at=now(),voided_by=p_actor,void_reason=left(p_data->>'reason',2000) WHERE id=(p_data->>'finance_id')::uuid AND meeting_id=v_meeting.id AND voided_at IS NULL RETURNING to_jsonb(hco_finances) INTO v_result;
 IF NOT FOUND THEN RAISE EXCEPTION 'HCO_TRANSACTION_NOT_FOUND_OR_ALREADY_VOIDED'; END IF;
 UPDATE hco_meetings SET version=version+1 WHERE id=v_meeting.id;
 ELSIF p_action='submit' THEN
 IF NOT EXISTS(SELECT 1 FROM hco_attendance WHERE meeting_id=v_meeting.id) THEN RAISE EXCEPTION 'HCO_RECORD_ATTENDANCE_FIRST'; END IF;
 UPDATE hco_meetings SET status='submitted',submitted_by=p_actor,submitted_at=now(),reviewed_by=NULL,reviewed_at=NULL,version=version+1 WHERE id=v_meeting.id RETURNING to_jsonb(hco_meetings) INTO v_result;
 UPDATE hco_corrections SET status='resolved',resolved_at=now() WHERE meeting_id=v_meeting.id AND status='open';
 ELSIF p_action IN ('approve','correction') THEN
 IF v_meeting.status<>'submitted' THEN RAISE EXCEPTION 'HCO_REPORT_NOT_SUBMITTED'; END IF;
 IF p_action='correction' THEN
 IF length(trim(coalesce(p_data->>'reason','')))<5 OR length(p_data->>'reason')>2000 THEN RAISE EXCEPTION 'HCO_CORRECTION_REASON_REQUIRED'; END IF;
 INSERT INTO hco_corrections(meeting_id,requested_by,reason) VALUES(v_meeting.id,p_actor,p_data->>'reason');
 ELSE
 -- Coordinators oversee and request corrections; Area Leaders approve.
 -- v4.12: Area Leaders approve; the Coordinator approves when every Area Leader of the area leads this cell (or none exists).
 IF NOT v_admin
  AND NOT EXISTS(SELECT 1 FROM hco_assignments WHERE user_id=p_actor AND active AND role='area_leader' AND area_id=v_area)
  AND NOT (
   EXISTS(SELECT 1 FROM hco_assignments WHERE user_id=p_actor AND active AND role='coordinator' AND area_id=v_area)
   AND NOT EXISTS(SELECT 1 FROM hco_assignments al WHERE al.active AND al.role='area_leader' AND al.area_id=v_area
     AND NOT EXISTS(SELECT 1 FROM hco_assignments cl WHERE cl.user_id=al.user_id AND cl.active AND cl.role='cell_leader' AND cl.cell_id=v_cell))
  ) THEN RAISE EXCEPTION 'HCO_AREA_LEADER_APPROVAL_REQUIRED' USING ERRCODE='42501'; END IF;
 END IF;
 UPDATE hco_meetings SET status=CASE WHEN p_action='approve' THEN 'approved' ELSE 'correction_requested' END,reviewed_by=p_actor,reviewed_at=now(),version=version+1 WHERE id=v_meeting.id RETURNING to_jsonb(hco_meetings) INTO v_result;
 ELSIF p_action='assign_member' THEN
 v_member:=(p_data->>'member_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM care_members WHERE id=v_member AND archived_at IS NULL) THEN RAISE EXCEPTION 'HCO_MEMBER_NOT_FOUND'; END IF;
 INSERT INTO hco_member_cells(member_id,cell_id) VALUES(v_member,v_cell) ON CONFLICT(member_id,cell_id) DO UPDATE SET active=true,left_at=NULL RETURNING to_jsonb(hco_member_cells) INTO v_result;
 ELSIF p_action='visitor' THEN
 v_request:=(p_data->>'request_id')::uuid;
 IF v_request IS NULL THEN RAISE EXCEPTION 'HCO_REQUEST_ID_REQUIRED'; END IF;
 SELECT to_jsonb(v) INTO v_result FROM hco_visits v WHERE request_id=v_request;
 IF v_result IS NOT NULL THEN
 IF (v_result->>'cell_id')::uuid<>v_cell OR v_result->'request_payload' IS DISTINCT FROM p_data THEN RAISE EXCEPTION 'HCO_RETRY_PAYLOAD_MISMATCH'; END IF;
 RETURN v_result; END IF;
 v_id:=(p_data->>'meeting_id')::uuid;
 SELECT meeting_date INTO v_date FROM hco_meetings WHERE id=v_id AND cell_id=v_cell AND status IN ('draft','correction_requested') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'HCO_OPEN_MEETING_REQUIRED'; END IF;
 SELECT to_jsonb(v) INTO v_result FROM hco_visits v WHERE request_id=v_request;
 IF v_result IS NOT NULL THEN IF v_result->'request_payload' IS DISTINCT FROM p_data THEN RAISE EXCEPTION 'HCO_RETRY_PAYLOAD_MISMATCH';END IF;RETURN v_result;END IF;
 v_member:=nullif(p_data->>'member_id','')::uuid;v_guest:=nullif(p_data->>'guest_submission_id','')::uuid;
 IF v_member IS NOT NULL AND NOT EXISTS(SELECT 1 FROM care_members WHERE id=v_member AND archived_at IS NULL) THEN RAISE EXCEPTION 'HCO_MEMBER_NOT_FOUND'; END IF;
 IF v_guest IS NOT NULL AND NOT EXISTS(SELECT 1 FROM care_guest_submissions WHERE id=v_guest) THEN RAISE EXCEPTION 'HCO_GUEST_NOT_FOUND'; END IF;
 IF v_member IS NULL AND v_guest IS NULL THEN
 IF EXISTS(SELECT 1 FROM care_members WHERE phone=p_data->>'phone' OR (nullif(p_data->>'email','') IS NOT NULL AND lower(email)=lower(p_data->>'email'))) OR EXISTS(SELECT 1 FROM care_guest_submissions WHERE phone=p_data->>'phone' OR (nullif(p_data->>'email','') IS NOT NULL AND lower(email)=lower(p_data->>'email'))) THEN RAISE EXCEPTION 'HCO_EXISTING_CONTACT_SEARCH_AND_CONFIRM_IDENTITY'; END IF;
 INSERT INTO care_guest_submissions(submission_key,source,other_names,surname,phone,email,whatsapp,gender,age_range,residential_address,invited_by,visit_date,birthday_month,birthday_day,anniversary_month,anniversary_day,entered_by,contact_consent,email_opt_in,sms_opt_in,celebrations_opt_in,programmes_opt_in,newsletters_opt_in,consent_evidence,policy_version)
 VALUES(v_request,'manual',trim(p_data->>'other_names'),trim(p_data->>'surname'),p_data->>'phone',nullif(lower(p_data->>'email'),''),nullif(p_data->>'whatsapp',''),nullif(p_data->>'gender',''),nullif(p_data->>'age_range',''),nullif(p_data->>'address',''),nullif(p_data->>'invited_by',''),v_date,nullif(split_part(p_data->>'birthday','-',1),'')::smallint,nullif(split_part(p_data->>'birthday','-',2),'')::smallint,nullif(split_part(p_data->>'anniversary','-',1),'')::smallint,nullif(split_part(p_data->>'anniversary','-',2),'')::smallint,p_actor,coalesce((p_data->>'contact_consent')::boolean,false),coalesce((p_data->>'email_opt_in')::boolean,false),coalesce((p_data->>'sms_opt_in')::boolean,false),coalesce((p_data->>'contact_consent')::boolean,false),coalesce((p_data->>'contact_consent')::boolean,false),coalesce((p_data->>'contact_consent')::boolean,false),'Preferences recorded by Home Cell leader during visitor registration.','https://vinebranchchurch.org/guest-terms/') RETURNING id INTO v_guest;
 END IF;
 IF EXISTS(SELECT 1 FROM hco_visits WHERE meeting_id=v_id AND ((v_member IS NOT NULL AND member_id=v_member) OR (v_guest IS NOT NULL AND guest_submission_id=v_guest))) THEN RAISE EXCEPTION 'HCO_VISITOR_ALREADY_RECORDED_FOR_MEETING'; END IF;
 INSERT INTO hco_visits(cell_id,meeting_id,member_id,guest_submission_id,registered_by,visited_at,request_id,request_payload,notes) VALUES(v_cell,v_id,v_member,v_guest,p_actor,v_date::timestamp AT TIME ZONE 'Africa/Lagos',v_request,p_data,left(p_data->>'notes',2000)) RETURNING to_jsonb(hco_visits) INTO v_result;
 ELSIF p_action='followup' THEN
 v_status:=p_data->>'status';
 IF v_status NOT IN ('pending','contacted','in_progress','completed','opted_out') THEN RAISE EXCEPTION 'HCO_INVALID_FOLLOWUP_STATUS'; END IF;
 UPDATE hco_visits SET followup_status=v_status,notes=left(p_data->>'notes',2000) WHERE id=(p_data->>'visit_id')::uuid RETURNING to_jsonb(hco_visits) INTO v_result;
 ELSIF p_action='announcement' THEN
 IF v_cell IS NULL AND v_area IS NULL AND NOT v_admin THEN RAISE EXCEPTION 'HCO_CHURCH_WIDE_ACCESS_REQUIRED' USING ERRCODE='42501'; END IF;
 INSERT INTO hco_announcements(area_id,cell_id,title,body,created_by) VALUES(CASE WHEN v_cell IS NULL THEN v_area END,v_cell,p_data->>'title',p_data->>'body',p_actor) RETURNING to_jsonb(hco_announcements) INTO v_result;
 ELSIF p_action='cell' THEN
 IF v_cell IS NULL THEN
 INSERT INTO hco_cells(area_id,name,address) VALUES(v_area,trim(p_data->>'name'),p_data->>'address') RETURNING to_jsonb(hco_cells) INTO v_result;
 ELSE
 UPDATE hco_cells SET name=trim(p_data->>'name'),address=p_data->>'address',meeting_day=(p_data->>'meeting_day')::smallint,meeting_start=(p_data->>'meeting_start')::time,meeting_end=(p_data->>'meeting_end')::time WHERE id=v_cell RETURNING to_jsonb(hco_cells) INTO v_result;
 END IF;
 ELSIF p_action='no_meeting' THEN
 -- v4.12: the cell leader marks a week as "No meeting" (today or up to a week ahead).
 v_date:=(p_data->>'meeting_date')::date;
 IF v_date IS NULL OR v_date>(now() AT TIME ZONE 'Africa/Lagos')::date+7 THEN RAISE EXCEPTION 'HCO_INVALID_MEETING_DATE'; END IF;
 SELECT * INTO v_meeting FROM hco_meetings WHERE cell_id=v_cell AND (meeting_date-(extract(isodow from meeting_date)::integer-1))=(v_date-(extract(isodow from v_date)::integer-1)) FOR UPDATE;
 IF FOUND THEN
  IF v_meeting.status='no_meeting' THEN RETURN to_jsonb(v_meeting); END IF;
  IF v_meeting.status<>'draft' OR EXISTS(SELECT 1 FROM hco_attendance WHERE meeting_id=v_meeting.id) OR EXISTS(SELECT 1 FROM hco_finances WHERE meeting_id=v_meeting.id AND voided_at IS NULL) OR EXISTS(SELECT 1 FROM hco_visits WHERE meeting_id=v_meeting.id) THEN RAISE EXCEPTION 'HCO_MEETING_ALREADY_HAS_RECORDS'; END IF;
  UPDATE hco_meetings SET status='no_meeting',submitted_by=p_actor,submitted_at=now(),notes=left(p_data->>'notes',2000),version=version+1 WHERE id=v_meeting.id RETURNING to_jsonb(hco_meetings) INTO v_result;
 ELSE
  INSERT INTO hco_meetings(cell_id,meeting_date,starts_at,ends_at,status,submitted_by,submitted_at,notes)
  SELECT v_cell,v_date,meeting_start,meeting_end,'no_meeting',p_actor,now(),left(p_data->>'notes',2000) FROM hco_cells WHERE id=v_cell
  RETURNING to_jsonb(hco_meetings) INTO v_result;
 END IF;
 ELSIF p_action='undo_no_meeting' THEN
 IF v_meeting.status<>'no_meeting' THEN RAISE EXCEPTION 'HCO_NOT_A_NO_MEETING_WEEK'; END IF;
 DELETE FROM hco_meetings WHERE id=v_meeting.id;
 v_result:=jsonb_build_object('id',v_meeting.id,'cell_id',v_meeting.cell_id,'meeting_date',v_meeting.meeting_date,'status','undone');
 ELSE RAISE EXCEPTION 'HCO_UNSUPPORTED_ACTION'; END IF;
 INSERT INTO hco_audit(actor_id,action,details) VALUES(p_actor,'workspace_'||p_action,jsonb_build_object('cell_id',v_cell,'before',v_old,'after',v_result));
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.hco_workspace_write(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hco_workspace_write(uuid,text,jsonb) TO service_role;

-- PIN sign-in: Cell Leaders and Area Leaders (either or both), no broader roles.
create or replace function care_private.hco_pin_eligible(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.hco_assignments where user_id=p_user and active and role in ('cell_leader','area_leader'))
 and not exists(select 1 from public.hco_assignments where user_id=p_user and active and role not in ('cell_leader','area_leader'))
 and not exists(select 1 from public.care_staff where user_id=p_user and (not is_active or role<>'followup_worker'))
 and not exists(select 1 from public.care_journey_roles where user_id=p_user and capability<>'friend')
 and not exists(select 1 from public.hco_access where user_id=p_user and suspended_at is not null)
$$;
create or replace function public.hco_leader_pin_save(p_actor uuid,p_user uuid,p_hash text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_actor=p_user or not care_private.hco_pin_eligible(p_user) then raise exception 'PIN access requires an active Cell Leader or Area Leader account.' using errcode='42501';end if;
 if not exists(select 1 from public.care_staff where user_id=p_actor and is_active and role='administrator') and not exists(select 1 from public.hco_assignments where user_id=p_actor and active and role='church_admin') then
 if not exists(select 1 from public.hco_assignments where user_id=p_actor and active and role='coordinator') or exists(
 select 1 from public.hco_assignments x left join public.hco_cells c on c.id=x.cell_id where x.user_id=p_user and x.active and not exists(select 1 from public.hco_assignments mine where mine.user_id=p_actor and mine.active and mine.role='coordinator' and mine.area_id=coalesce(c.area_id,x.area_id))
 ) then raise exception 'Coordinator scope required.' using errcode='42501';end if;
 end if;
 if exists(select 1 from public.hco_access where user_id=p_actor and suspended_at is not null) then raise exception 'Access suspended.' using errcode='42501';end if;
 if p_hash is null or p_hash !~ '^[a-f0-9]{32}:[a-f0-9]{128}$' then raise exception 'Invalid PIN hash.';end if;
 insert into public.hco_leader_pin_accounts(user_id,pin_hash) values(p_user,p_hash) on conflict(user_id) do update set pin_hash=excluded.pin_hash,version=gen_random_uuid(),attempts=0,failures=0,window_start=now(),updated_at=now();
 update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)-'hco_password_change_required'-'hco_temporary_password_hash' where id=p_user;
 insert into public.hco_audit(actor_id,target_user_id,action,details) values(p_actor,p_user,'leader_pin_generated','{}'::jsonb);
 return true;
end$$;
revoke all on function care_private.hco_pin_eligible(uuid),public.hco_leader_pin_save(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.hco_leader_pin_save(uuid,uuid,text) to service_role;
commit;
