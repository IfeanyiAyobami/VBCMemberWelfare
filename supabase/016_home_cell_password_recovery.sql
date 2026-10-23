-- Additive. Apply after 015. Stores reset metadata and audit events, never passwords.
BEGIN;
CREATE TABLE IF NOT EXISTS public.hco_password_operations (
 id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES auth.users(id),
 target_user_id uuid NOT NULL REFERENCES auth.users(id),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 2000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','uncertain')),
 created_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz NOT NULL DEFAULT now()+interval '90 seconds',
 finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS hco_password_operations_target ON public.hco_password_operations(target_user_id,lease_until);
ALTER TABLE public.hco_password_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hco_password_operations FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.hco_password_begin(p_actor uuid,p_assignment uuid,p_request uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target uuid;
BEGIN
 IF p_request IS NULL OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'HCO_REASON_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM public.hco_access WHERE user_id=p_actor AND suspended_at IS NOT NULL)
 OR NOT (EXISTS(SELECT 1 FROM public.care_staff WHERE user_id=p_actor AND is_active AND role='administrator')
 OR EXISTS(SELECT 1 FROM public.hco_assignments WHERE user_id=p_actor AND active AND role='church_admin'))
 THEN RAISE EXCEPTION 'HCO_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT user_id INTO target FROM public.hco_assignments WHERE id=p_assignment AND active FOR UPDATE;
 IF target IS NULL OR target=p_actor THEN RAISE EXCEPTION 'HCO_SELECT_OTHER_LEADER'; END IF;
 IF EXISTS(SELECT 1 FROM public.hco_access WHERE user_id=target AND suspended_at IS NOT NULL) THEN RAISE EXCEPTION 'HCO_TARGET_SUSPENDED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(target::text,16016));
 IF EXISTS(SELECT 1 FROM public.hco_password_operations WHERE id=p_request) THEN RAISE EXCEPTION 'HCO_RESET_ALREADY_REQUESTED'; END IF;
 IF EXISTS(SELECT 1 FROM public.hco_password_operations WHERE target_user_id=target AND lease_until>clock_timestamp()) THEN RAISE EXCEPTION 'HCO_RESET_IN_PROGRESS'; END IF;
 UPDATE public.hco_password_operations SET status='uncertain',finished_at=now() WHERE target_user_id=target AND status='pending';
 INSERT INTO public.hco_password_operations(id,actor_id,target_user_id,reason) VALUES(p_request,p_actor,target,trim(p_reason));
 INSERT INTO public.hco_access(user_id,session_revoked_after) VALUES(target,clock_timestamp())
 ON CONFLICT(user_id) DO UPDATE SET session_revoked_after=excluded.session_revoked_after,updated_at=now();
 INSERT INTO public.hco_audit(actor_id,target_user_id,action,details)
 VALUES(p_actor,target,'password_reset_requested',jsonb_build_object('request_id',p_request,'reason',trim(p_reason)));
 RETURN jsonb_build_object('user_id',target);
END $$;
CREATE OR REPLACE FUNCTION public.hco_password_finish(p_actor uuid,p_request uuid,p_completed boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE op public.hco_password_operations%ROWTYPE;
BEGIN
 SELECT * INTO op FROM public.hco_password_operations WHERE id=p_request AND actor_id=p_actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'HCO_RESET_NOT_FOUND'; END IF;
 IF op.status<>'pending' THEN RETURN; END IF;
 UPDATE public.hco_password_operations SET status=CASE WHEN p_completed THEN 'completed' ELSE 'uncertain' END,finished_at=now() WHERE id=p_request;
 INSERT INTO public.hco_audit(actor_id,target_user_id,action,details)
 VALUES(p_actor,op.target_user_id,CASE WHEN p_completed THEN 'password_reset_completed' ELSE 'password_reset_uncertain' END,
 jsonb_build_object('request_id',p_request,'reason',op.reason));
END $$;
REVOKE ALL ON FUNCTION public.hco_password_begin(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.hco_password_finish(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hco_password_begin(uuid,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hco_password_finish(uuid,uuid,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
