-- v4.13: separate Cell Leader PIN identity linked to a staff password account.
-- Apply after 034. Never grants administrator powers to a PIN session.
begin;
create table if not exists public.hco_cell_logins (
 owner_id uuid primary key references auth.users(id),
 leader_user_id uuid not null unique references auth.users(id),
 created_at timestamptz not null default now(),
 check(owner_id<>leader_user_id)
);
alter table public.hco_cell_logins enable row level security;
revoke all on public.hco_cell_logins from public,anon,authenticated;
grant all on public.hco_cell_logins to service_role;
create or replace function care_private.hco_person(p_user uuid) returns uuid language sql stable security definer set search_path='' as $$
 select coalesce((select owner_id from public.hco_cell_logins where leader_user_id=p_user),p_user)
$$;
create or replace function public.hco_cell_login_sync(p_user uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare owner uuid; blocked boolean; cutoff timestamptz;
begin
 select owner_id into owner from public.hco_cell_logins where leader_user_id=p_user;
 if owner is null then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text,413));
 -- The source assignment is authoritative on every request, not a cookie or UI mode.
 blocked:=exists(select 1 from public.hco_access where user_id in(owner,p_user) and suspended_at is not null)
  or exists(select 1 from public.care_staff where user_id=owner and not is_active)
  or not exists(select 1 from public.hco_assignments where user_id=owner and active and role='cell_leader')
  or exists(select 1 from public.hco_assignments where user_id=p_user and active and role<>'cell_leader')
  or exists(select 1 from public.care_staff where user_id=p_user)
  or exists(select 1 from public.care_journey_roles where user_id=p_user);
 update public.hco_assignments a set active=false,ended_at=now() where a.user_id=p_user and a.active and (blocked or not exists(
   select 1 from public.hco_assignments source where source.user_id=owner and source.active and source.role='cell_leader' and source.cell_id=a.cell_id));
 if blocked then return false;end if;
 insert into public.hco_assignments(user_id,role,cell_id,assigned_by)
 select p_user,'cell_leader',cell_id,owner from public.hco_assignments where user_id=owner and active and role='cell_leader'
 on conflict do nothing;
 select session_revoked_after into cutoff from public.hco_access where user_id=owner;
 if cutoff is not null then
  insert into public.hco_access(user_id,session_revoked_after) values(p_user,cutoff)
  on conflict(user_id) do update set session_revoked_after=greatest(public.hco_access.session_revoked_after,excluded.session_revoked_after);
 end if;
 return true;
end$$;
create or replace function public.hco_cell_login_save(p_actor uuid,p_owner uuid,p_user uuid,p_hash text) returns boolean language plpgsql security definer set search_path='' as $$
declare first_setup boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,413));
 first_setup:=not exists(select 1 from public.hco_cell_logins where owner_id=p_owner);
 if p_actor=p_owner or not exists(select 1 from auth.users where id=p_actor)
  or exists(select 1 from public.hco_access where user_id=p_actor and suspended_at is not null)
  or not (exists(select 1 from public.care_staff where user_id=p_actor and is_active and role='administrator') or exists(select 1 from public.hco_assignments where user_id=p_actor and active and role='church_admin')) then
  raise exception 'Church Admin access required; ask another administrator for your own account.' using errcode='42501';end if;
 if not exists(select 1 from public.hco_assignments where user_id=p_owner and active and role='cell_leader')
  or not (exists(select 1 from public.hco_assignments where user_id=p_owner and active and role in('church_admin','coordinator')) or exists(select 1 from public.care_staff where user_id=p_owner and is_active and role='administrator')) then
  raise exception 'Keep both the Cell Leader assignment and the staff assignment before creating separate access.' using errcode='22023';end if;
 if exists(select 1 from public.hco_cell_logins where owner_id=p_user or leader_user_id=p_owner)
  or not exists(select 1 from auth.users where id=p_user and raw_app_meta_data->>'hco_cell_login_for'=p_owner::text and email='cell-'||p_owner::text||'@home-cell.invalid') then
  raise exception 'Invalid linked identity.' using errcode='22023';end if;
 insert into public.hco_cell_logins(owner_id,leader_user_id) values(p_owner,p_user) on conflict(owner_id) do nothing;
 if not exists(select 1 from public.hco_cell_logins where owner_id=p_owner and leader_user_id=p_user) or not public.hco_cell_login_sync(p_user) then
  raise exception 'Linked Cell Leader access is unavailable.' using errcode='42501';end if;
 perform public.hco_leader_pin_save(p_actor,p_user,p_hash);
 -- Remove the old primary PIN; PIN lookup must never issue the staff user's token.
 delete from public.hco_leader_pin_accounts where user_id=p_owner;
 -- Retire any old leader session issued for the now-privileged owner account.
 if first_setup then
  insert into public.hco_access(user_id,session_revoked_after) values(p_owner,clock_timestamp())
  on conflict(user_id) do update set session_revoked_after=excluded.session_revoked_after;
 end if;
 -- Reset only the leader sessions; staff password sessions stay intact on later PIN resets.
 insert into public.hco_access(user_id,session_revoked_after) values(p_user,clock_timestamp())
 on conflict(user_id) do update set session_revoked_after=excluded.session_revoked_after;
 insert into public.hco_audit(actor_id,target_user_id,action,details) values(p_actor,p_owner,'separate_cell_login_saved',jsonb_build_object('leader_user_id',p_user));
 return true;
end$$;
create or replace function care_private.hco_pin_eligible(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.hco_assignments where user_id=p_user and active and role in('cell_leader','area_leader'))
 and not exists(select 1 from public.hco_assignments where user_id=p_user and active and role not in('cell_leader','area_leader'))
 and not exists(select 1 from public.care_staff where user_id=p_user and (not is_active or role<>'followup_worker'))
 and not exists(select 1 from public.care_journey_roles where user_id=p_user and capability<>'friend')
 and not exists(select 1 from public.hco_access where user_id=p_user and suspended_at is not null)
 and not exists(select 1 from public.hco_cell_logins l where l.leader_user_id=p_user and (
   exists(select 1 from public.hco_access where user_id=l.owner_id and suspended_at is not null)
   or exists(select 1 from public.care_staff where user_id=l.owner_id and not is_active)
   or not exists(select 1 from public.hco_assignments where user_id=l.owner_id and active and role='cell_leader')
 ))
$$;
create or replace function public.hco_leader_pin_attempt(p_identity text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.hco_leader_pin_accounts; matches integer; target uuid;
begin
 -- Resolve the public identifier on the owner; verify the PIN only on the leader identity.
 select count(distinct p.user_id),min(p.user_id::text)::uuid into matches,target
 from public.hco_leader_pin_accounts p
 left join public.hco_cell_logins l on l.leader_user_id=p.user_id
 join auth.users u on u.id=coalesce(l.owner_id,p.user_id)
 left join public.hco_phone_usernames n on n.user_id=u.id
 where lower(u.email)=lower(p_identity) or n.phone=p_identity or ('+'||regexp_replace(u.phone,'\D','','g'))=p_identity;
 if matches<>1 then return '{}'::jsonb;end if;
 if exists(select 1 from public.hco_cell_logins where leader_user_id=target) and not public.hco_cell_login_sync(target) then return '{}'::jsonb;end if;
 select * into r from public.hco_leader_pin_accounts where user_id=target for update;
 if not found or not care_private.hco_pin_eligible(target) then return '{}'::jsonb;end if;
 if r.window_start<=now()-interval '15 minutes' then r.attempts:=0;r.window_start:=now();end if;
 if r.attempts>=5 or r.failures>=20 then return '{}'::jsonb;end if;
 update public.hco_leader_pin_accounts set attempts=r.attempts+1,window_start=r.window_start,failures=failures+1 where user_id=target;
 return jsonb_build_object('user_id',target,'pin_hash',r.pin_hash,'version',r.version);
end$$;
create or replace function public.hco_leader_pin_complete(p_user uuid,p_version uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.hco_cell_logins where leader_user_id=p_user) and not public.hco_cell_login_sync(p_user) then return false;end if;
 if not care_private.hco_pin_eligible(p_user) then return false;end if;
 update public.hco_leader_pin_accounts set failures=0 where user_id=p_user and version=p_version;
 return found;
end$$;
revoke all on function care_private.hco_person(uuid),care_private.hco_pin_eligible(uuid),public.hco_cell_login_sync(uuid),public.hco_cell_login_save(uuid,uuid,uuid,text),public.hco_leader_pin_attempt(text),public.hco_leader_pin_complete(uuid,uuid) from public,anon,authenticated;
grant execute on function public.hco_cell_login_sync(uuid),public.hco_cell_login_save(uuid,uuid,uuid,text),public.hco_leader_pin_attempt(text),public.hco_leader_pin_complete(uuid,uuid) to service_role;

-- Compare the person across both identities, including after assignments change.
CREATE OR REPLACE FUNCTION public.hco_workspace_write(p_actor uuid,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_admin boolean; v_manage boolean; v_write boolean; v_cell uuid; v_area uuid;
 v_id uuid; v_member uuid; v_guest uuid; v_request uuid; v_visit uuid;
 v_meeting public.hco_meetings%ROWTYPE; v_old jsonb; v_result jsonb; v_row jsonb; v_att jsonb;
 v_expected integer; v_date date; v_amount numeric; v_status text;
BEGIN
 IF EXISTS(SELECT 1 FROM public.hco_cell_logins WHERE leader_user_id=p_actor) AND NOT public.hco_cell_login_sync(p_actor) THEN RAISE EXCEPTION 'HCO_ACCESS_DENIED' USING ERRCODE='42501';END IF;
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
 SELECT v_admin OR EXISTS(SELECT 1 FROM hco_assignments WHERE user_id=p_actor AND active AND (role='coordinator' OR (role='area_leader' AND area_id=v_area))) INTO v_manage;
 SELECT EXISTS(SELECT 1 FROM hco_assignments WHERE user_id=p_actor AND active AND role='cell_leader' AND cell_id=v_cell) INTO v_write;
 IF p_action IN ('approve','correction','announcement','cell') THEN
 IF NOT v_manage THEN RAISE EXCEPTION 'HCO_REVIEW_ACCESS_REQUIRED' USING ERRCODE='42501'; END IF;
 -- v4.12: nobody reviews a report from a cell they lead or a report they submitted.
 IF p_action IN ('approve','correction') AND (v_write OR care_private.hco_person(v_meeting.submitted_by)=care_private.hco_person(p_actor)) THEN RAISE EXCEPTION 'HCO_CANNOT_REVIEW_OWN_CELL_REPORT' USING ERRCODE='42501'; END IF;
 ELSE
 IF NOT (v_admin OR v_write) THEN RAISE EXCEPTION 'HCO_CELL_LEADER_ACCESS_REQUIRED' USING ERRCODE='42501'; END IF;
 END IF;
 IF p_action IN ('attendance','finance','void_finance','submit') AND v_meeting.status NOT IN ('draft','correction_requested') THEN RAISE EXCEPTION 'HCO_SUBMITTED_REPORT_IS_LOCKED'; END IF;
 IF p_action IN ('attendance','finance','void_finance','submit') AND v_meeting.status='correction_requested' AND (NOT v_write OR care_private.hco_person(v_meeting.submitted_by) IS DISTINCT FROM care_private.hco_person(p_actor)) THEN RAISE EXCEPTION 'HCO_ONLY_SUBMITTING_CELL_LEADER_CAN_REVISE' USING ERRCODE='42501'; END IF;
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
   EXISTS(SELECT 1 FROM hco_assignments WHERE user_id=p_actor AND active AND role='coordinator')
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
 IF v_cell IS NULL AND v_area IS NULL AND NOT v_manage THEN RAISE EXCEPTION 'HCO_CHURCH_WIDE_ACCESS_REQUIRED' USING ERRCODE='42501'; END IF;
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
notify pgrst,'reload schema';
commit;
