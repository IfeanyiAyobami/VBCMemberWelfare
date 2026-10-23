-- 014: Member onboarding and reviewed home-cell transfers.
-- Additive; existing memberships are preserved. Requires core care schema and 011.
BEGIN;
CREATE TABLE IF NOT EXISTS public.hco_member_transfers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 member_id uuid NOT NULL REFERENCES public.care_members(id),
 target_cell_id uuid NOT NULL REFERENCES public.hco_cells(id),
 source_cells uuid[] NOT NULL,
 requested_by uuid NOT NULL REFERENCES auth.users(id),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 2000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','moved','kept')),
 requested_at timestamptz NOT NULL DEFAULT now(),
 decided_by uuid REFERENCES auth.users(id), decided_at timestamptz,
 decision_reason text CHECK(decision_reason IS NULL OR length(trim(decision_reason)) BETWEEN 5 AND 2000)
);
CREATE UNIQUE INDEX IF NOT EXISTS hco_one_pending_member_transfer ON public.hco_member_transfers(member_id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS public.hco_onboarding_batches (
 id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES auth.users(id),
 cell_id uuid NOT NULL REFERENCES public.hco_cells(id), payload jsonb NOT NULL,
 result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hco_member_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hco_onboarding_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hco_member_transfers,public.hco_onboarding_batches FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.hco_member_transfers,public.hco_onboarding_batches TO service_role;
-- Guard older assignment endpoints too. Never silently create a second active cell.
CREATE OR REPLACE FUNCTION public.hco_guard_member_cell() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.active THEN
  PERFORM 1 FROM care_members WHERE id=NEW.member_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM hco_member_cells WHERE member_id=NEW.member_id AND active AND cell_id<>NEW.cell_id)
   THEN RAISE EXCEPTION 'HCO_MEMBER_CELL_CONFLICT_SUBMIT_TRANSFER' USING ERRCODE='23505'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hco_single_active_member_cell ON public.hco_member_cells;
CREATE TRIGGER hco_single_active_member_cell BEFORE INSERT OR UPDATE OF active,cell_id,member_id ON public.hco_member_cells FOR EACH ROW EXECUTE FUNCTION public.hco_guard_member_cell();
REVOKE ALL ON FUNCTION public.hco_guard_member_cell() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.hco_onboard_members(p_actor uuid,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_cell uuid := (p_data->>'cell_id')::uuid; v_request uuid := (p_data->>'request_id')::uuid;
 v_admin boolean; v_saved hco_onboarding_batches; v_row jsonb; v_result jsonb := '[]';
 v_member uuid; v_ids uuid[]; v_sources uuid[]; v_transfer hco_member_transfers;
 v_action text; v_created boolean; v_phone text; v_email text; v_date date; v_m care_members;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor) OR EXISTS(SELECT 1 FROM hco_access WHERE user_id=p_actor AND suspended_at IS NOT NULL) THEN RAISE EXCEPTION 'HCO_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT EXISTS(SELECT 1 FROM care_staff WHERE user_id=p_actor AND role='administrator' AND is_active) OR EXISTS(SELECT 1 FROM hco_assignments WHERE user_id=p_actor AND role='church_admin' AND active) INTO v_admin;
 IF NOT EXISTS(SELECT 1 FROM hco_cells WHERE id=v_cell AND is_active) OR NOT (v_admin OR EXISTS(SELECT 1 FROM hco_assignments WHERE user_id=p_actor AND active AND role='cell_leader' AND cell_id=v_cell)) THEN RAISE EXCEPTION 'HCO_CELL_LEADER_ACCESS_REQUIRED' USING ERRCODE='42501'; END IF;
 IF v_request IS NULL OR jsonb_typeof(p_data->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'rows') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'HCO_INVALID_ONBOARDING_BATCH'; END IF;
 -- Serializes batch contact matching; member row locks serialize transfers and legacy assignment writes.
 PERFORM pg_advisory_xact_lock(9014,1);
 SELECT * INTO v_saved FROM hco_onboarding_batches WHERE id=v_request;
 IF FOUND THEN
  IF v_saved.actor_id<>p_actor OR v_saved.payload IS DISTINCT FROM p_data THEN RAISE EXCEPTION 'HCO_RETRY_PAYLOAD_MISMATCH'; END IF;
  RETURN v_saved.result;
 END IF;
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_data->'rows') LOOP
  v_created:=false; v_member:=nullif(v_row->>'existing_id','')::uuid;
  v_phone:=nullif(v_row->>'phone',''); v_email:=nullif(lower(trim(v_row->>'email')),'');
  SELECT array_agg(id ORDER BY id) INTO v_ids FROM care_members WHERE (v_phone IS NOT NULL AND phone=v_phone) OR (v_email IS NOT NULL AND lower(email)=v_email);
  IF v_member IS NULL AND coalesce(cardinality(v_ids),0)>0 THEN RAISE EXCEPTION 'HCO_EXISTING_MEMBER_CONFIRM_IN_PREVIEW'; END IF;
  IF v_member IS NOT NULL THEN
   IF p_data->'confirm_existing' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'HCO_CONFIRM_EXISTING_MEMBER'; END IF;
   IF coalesce(cardinality(v_ids),0)>1 OR (cardinality(v_ids)=1 AND NOT v_member=ANY(v_ids)) THEN RAISE EXCEPTION 'HCO_CONTACT_IDENTITY_CONFLICT'; END IF;
   SELECT * INTO v_m FROM care_members WHERE id=v_member AND archived_at IS NULL FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'HCO_MEMBER_NOT_FOUND_OR_ARCHIVED'; END IF;
  ELSE
   IF coalesce(length(trim(v_row->>'first')),0)=0 OR coalesce(length(trim(v_row->>'last')),0)=0 OR (v_phone IS NULL AND v_email IS NULL) THEN RAISE EXCEPTION 'HCO_MEMBER_DETAILS_REQUIRED'; END IF;
   IF v_phone IS NOT NULL AND v_phone !~ '^\+[1-9][0-9]{7,14}$' THEN RAISE EXCEPTION 'HCO_INVALID_PHONE'; END IF;
   IF EXISTS(SELECT 1 FROM care_guest_submissions WHERE (v_phone IS NOT NULL AND phone=v_phone) OR (v_email IS NOT NULL AND lower(email)=v_email)) THEN RAISE EXCEPTION 'HCO_CONTACT_EXISTS_IN_GUEST_RECORDS_CONTACT_OFFICE'; END IF;
   v_date:=(v_row->>'joined')::date;
   IF v_date IS NULL OR v_date<'1900-01-01' OR v_date>(now() AT TIME ZONE 'Africa/Lagos')::date THEN RAISE EXCEPTION 'HCO_INVALID_JOINED_DATE'; END IF;
   INSERT INTO care_members(other_names,surname,email,phone,status,occupation,residential_address,joined_on,birthday_month,birthday_day,anniversary_month,anniversary_day,created_by)
   VALUES(trim(v_row->>'first'),trim(v_row->>'last'),v_email,v_phone,'new_member',nullif(v_row->>'occupation',''),nullif(v_row->>'address',''),v_date,nullif(split_part(v_row->>'birthday','-',1),'')::smallint,nullif(split_part(v_row->>'birthday','-',2),'')::smallint,nullif(split_part(v_row->>'anniversary','-',1),'')::smallint,nullif(split_part(v_row->>'anniversary','-',2),'')::smallint,p_actor) RETURNING id INTO v_member;
   INSERT INTO care_preferences(member_id) VALUES(v_member) ON CONFLICT(member_id) DO NOTHING;
   UPDATE care_preferences SET contact_consent=true,email_opt_in=v_email IS NOT NULL AND coalesce((v_row->>'email_opt_in')::boolean,true),sms_opt_in=coalesce((v_row->>'sms_opt_in')::boolean,true),celebrations_opt_in=true,programmes_opt_in=true,newsletters_opt_in=true,source=CASE WHEN p_data->>'source'='csv' THEN 'import' ELSE 'admin' END,policy_version='home-cell-onboarding-v1',evidence_note='Initial channel preferences recorded during home-cell onboarding; not evidence of affirmative marketing consent.',updated_at=now() WHERE member_id=v_member;
   v_created:=true;
  END IF;
  SELECT coalesce(array_agg(cell_id ORDER BY cell_id),'{}'::uuid[]) INTO v_sources FROM hco_member_cells WHERE member_id=v_member AND active AND cell_id<>v_cell;
  IF cardinality(v_sources)>0 THEN
   SELECT array_agg(cell_id ORDER BY cell_id) INTO v_sources FROM hco_member_cells WHERE member_id=v_member AND active;
   IF p_data->'request_transfers' IS DISTINCT FROM 'true'::jsonb OR length(trim(coalesce(p_data->>'reason',''))) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'HCO_MEMBER_CELL_CONFLICT_SUBMIT_TRANSFER'; END IF;
   SELECT * INTO v_transfer FROM hco_member_transfers WHERE member_id=v_member AND status='pending';
   IF FOUND THEN
    IF v_transfer.target_cell_id<>v_cell THEN RAISE EXCEPTION 'HCO_TRANSFER_ALREADY_PENDING'; END IF;
   ELSE
    INSERT INTO hco_member_transfers(member_id,target_cell_id,source_cells,requested_by,reason) VALUES(v_member,v_cell,v_sources,p_actor,trim(p_data->>'reason')) RETURNING * INTO v_transfer;
   END IF;
   v_action:='transfer_requested';
  ELSE
   IF EXISTS(SELECT 1 FROM hco_member_cells WHERE member_id=v_member AND cell_id=v_cell AND active) THEN v_action:='already_assigned';
   ELSE
    INSERT INTO hco_member_cells(member_id,cell_id) VALUES(v_member,v_cell) ON CONFLICT(member_id,cell_id) DO UPDATE SET active=true,left_at=NULL,joined_at=now();
    v_action:=CASE WHEN v_created THEN 'created_and_assigned' ELSE 'assigned_existing' END;
   END IF;
  END IF;
  v_result:=v_result||jsonb_build_array(jsonb_build_object('member_id',v_member,'action',v_action,'cell_id',v_cell));
  INSERT INTO hco_audit(actor_id,action,details) VALUES(p_actor,'member_onboarding',jsonb_build_object('cell_id',v_cell,'member_id',v_member,'result',v_action,'request_id',v_request));
 END LOOP;
 INSERT INTO hco_onboarding_batches(id,actor_id,cell_id,payload,result) VALUES(v_request,p_actor,v_cell,p_data,v_result);
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.hco_onboard_members(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hco_onboard_members(uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.hco_transfer_decide(p_actor uuid,p_id uuid,p_decision text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v hco_member_transfers; v_member uuid; v_admin boolean; v_areas uuid[]; v_current uuid[]; v_target_area uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor) OR EXISTS(SELECT 1 FROM hco_access WHERE user_id=p_actor AND suspended_at IS NOT NULL) THEN RAISE EXCEPTION 'HCO_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF p_decision NOT IN ('moved','kept') OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'HCO_DECISION_REASON_REQUIRED'; END IF;
 SELECT member_id INTO v_member FROM hco_member_transfers WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'HCO_TRANSFER_NOT_FOUND'; END IF;
 PERFORM 1 FROM care_members WHERE id=v_member FOR UPDATE;
 SELECT * INTO v FROM hco_member_transfers WHERE id=p_id FOR UPDATE;
 IF v.status<>'pending' THEN RAISE EXCEPTION 'HCO_TRANSFER_ALREADY_DECIDED'; END IF;
 SELECT EXISTS(SELECT 1 FROM care_staff WHERE user_id=p_actor AND role='administrator' AND is_active) OR EXISTS(SELECT 1 FROM hco_assignments WHERE user_id=p_actor AND role='church_admin' AND active) INTO v_admin;
 SELECT coalesce(array_agg(area_id),'{}'::uuid[]) INTO v_areas FROM hco_assignments WHERE user_id=p_actor AND active AND role='coordinator';
 SELECT area_id INTO v_target_area FROM hco_cells WHERE id=v.target_cell_id;
 IF NOT v_admin AND NOT (v_target_area=ANY(v_areas) OR EXISTS(SELECT 1 FROM hco_cells WHERE id=ANY(v.source_cells) AND area_id=ANY(v_areas))) THEN RAISE EXCEPTION 'HCO_COORDINATOR_OR_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_decision='moved' THEN
  IF NOT v_admin AND (NOT v_target_area=ANY(v_areas) OR EXISTS(SELECT 1 FROM hco_cells WHERE id=ANY(v.source_cells) AND NOT area_id=ANY(v_areas))) THEN RAISE EXCEPTION 'HCO_CROSS_AREA_ADMIN_REVIEW_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM care_members WHERE id=v.member_id AND archived_at IS NULL) OR NOT EXISTS(SELECT 1 FROM hco_cells WHERE id=v.target_cell_id AND is_active) THEN RAISE EXCEPTION 'HCO_MEMBER_OR_CELL_INACTIVE'; END IF;
  SELECT coalesce(array_agg(cell_id ORDER BY cell_id),'{}'::uuid[]) INTO v_current FROM hco_member_cells WHERE member_id=v.member_id AND active;
  IF v_current IS DISTINCT FROM v.source_cells THEN RAISE EXCEPTION 'HCO_TRANSFER_STALE_MEMBERSHIP_REVIEW_AGAIN'; END IF;
  UPDATE hco_member_cells SET active=false,left_at=now() WHERE member_id=v.member_id AND active;
  INSERT INTO hco_member_cells(member_id,cell_id) VALUES(v.member_id,v.target_cell_id) ON CONFLICT(member_id,cell_id) DO UPDATE SET active=true,left_at=NULL,joined_at=now();
 END IF;
 UPDATE hco_member_transfers SET status=p_decision,decided_by=p_actor,decided_at=now(),decision_reason=trim(p_reason) WHERE id=p_id RETURNING * INTO v;
 INSERT INTO hco_audit(actor_id,action,details) VALUES(p_actor,'member_transfer_'||p_decision,jsonb_build_object('cell_id',v.target_cell_id,'member_id',v.member_id,'transfer_id',v.id,'source_cells',v.source_cells,'reason',p_reason));
 RETURN to_jsonb(v);
END $$;
REVOKE ALL ON FUNCTION public.hco_transfer_decide(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hco_transfer_decide(uuid,uuid,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.hco_transfer_inbox(p_actor uuid,p_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_admin boolean; v_areas uuid[]; v_items jsonb; v_more boolean;
BEGIN
 IF p_page NOT BETWEEN 1 AND 100000 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor) OR EXISTS(SELECT 1 FROM hco_access WHERE user_id=p_actor AND suspended_at IS NOT NULL) THEN RAISE EXCEPTION 'HCO_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT EXISTS(SELECT 1 FROM care_staff WHERE user_id=p_actor AND role='administrator' AND is_active) OR EXISTS(SELECT 1 FROM hco_assignments WHERE user_id=p_actor AND role='church_admin' AND active) INTO v_admin;
 IF NOT v_admin AND NOT EXISTS(SELECT 1 FROM hco_assignments WHERE user_id=p_actor AND active) THEN RAISE EXCEPTION 'HCO_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT coalesce(array_agg(area_id),'{}'::uuid[]) INTO v_areas FROM hco_assignments WHERE user_id=p_actor AND active AND role='coordinator';
 WITH visible AS (
  SELECT t.*,m.other_names||' '||m.surname member_name,c.name target_name,c.area_id target_area,
   (SELECT string_agg(sc.name,', ' ORDER BY sc.name) FROM hco_cells sc WHERE sc.id=ANY(t.source_cells)) source_names,
   v_admin OR c.area_id=ANY(v_areas) OR EXISTS(SELECT 1 FROM hco_cells sc WHERE sc.id=ANY(t.source_cells) AND sc.area_id=ANY(v_areas)) can_keep,
   v_admin OR (c.area_id=ANY(v_areas) AND NOT EXISTS(SELECT 1 FROM hco_cells sc WHERE sc.id=ANY(t.source_cells) AND NOT sc.area_id=ANY(v_areas))) can_move
  FROM hco_member_transfers t JOIN care_members m ON m.id=t.member_id JOIN hco_cells c ON c.id=t.target_cell_id
  WHERE v_admin OR t.requested_by=p_actor OR c.area_id=ANY(v_areas) OR EXISTS(SELECT 1 FROM hco_cells sc WHERE sc.id=ANY(t.source_cells) AND sc.area_id=ANY(v_areas))
  ORDER BY (t.status='pending') DESC,t.requested_at DESC,t.id OFFSET (p_page-1)*25 LIMIT 26
 ), numbered AS (SELECT *,row_number() OVER(ORDER BY (status='pending') DESC,requested_at DESC,id) n FROM visible)
 SELECT coalesce(jsonb_agg(to_jsonb(numbered)-'n'-'target_area') FILTER(WHERE n<=25),'[]'::jsonb),count(*)>25 INTO v_items,v_more FROM numbered;
 RETURN jsonb_build_object('items',v_items,'has_more',v_more);
END $$;
REVOKE ALL ON FUNCTION public.hco_transfer_inbox(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hco_transfer_inbox(uuid,integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
