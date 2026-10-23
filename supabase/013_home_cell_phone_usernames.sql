-- 013: Phone usernames without the Supabase Phone/SMS provider.
-- Run after 011 (and retain 012 for the directory).
-- Adds a private username index; does not change passwords, users or roles.
BEGIN;
CREATE TABLE IF NOT EXISTS public.hco_phone_usernames (
 phone text PRIMARY KEY CHECK(phone ~ '^\+[1-9][0-9]{7,14}$'),
 user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hco_phone_usernames ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hco_phone_usernames FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.hco_phone_usernames TO service_role;
-- Index existing HCO native phone accounts. Their auth identity is repaired
-- explicitly by an administrator in Leadership Accounts after this migration.
INSERT INTO public.hco_phone_usernames(phone,user_id)
SELECT '+' || regexp_replace(u.phone,'[^0-9]','','g'),u.id
FROM auth.users u
WHERE regexp_replace(u.phone,'[^0-9]','','g') ~ '^[1-9][0-9]{7,14}$'
 AND EXISTS(SELECT 1 FROM hco_assignments a WHERE a.user_id=u.id AND a.active)
ON CONFLICT(user_id) DO NOTHING;
CREATE OR REPLACE FUNCTION public.hco_phone_leadership_write(p_actor uuid,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_target uuid := (p_data->>'user_id')::uuid;
 v_phone text := nullif(p_data->>'phone',''); v_owner uuid; v_result jsonb;
BEGIN
 IF p_action='assign' THEN
  -- Role permissions, suspension, scope and self-access rules remain authoritative.
  v_result := public.hco_leadership_write(p_actor,'add_role',p_data);
 ELSIF p_action='repair' THEN
  IF v_target=p_actor OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor)
   OR EXISTS(SELECT 1 FROM hco_access WHERE user_id=p_actor AND suspended_at IS NOT NULL)
   OR NOT (EXISTS(SELECT 1 FROM care_staff WHERE user_id=p_actor AND role='administrator' AND is_active)
     OR EXISTS(SELECT 1 FROM hco_assignments WHERE user_id=p_actor AND role='church_admin' AND active))
   OR NOT EXISTS(SELECT 1 FROM hco_assignments WHERE user_id=v_target AND active)
  THEN RAISE EXCEPTION 'HCO_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF length(trim(coalesce(p_data->>'reason',''))) < 5 THEN RAISE EXCEPTION 'HCO_REASON_REQUIRED'; END IF;
  v_result := jsonb_build_object('user_id',v_target);
 ELSE RAISE EXCEPTION 'HCO_UNSUPPORTED_ACTION'; END IF;
 IF v_phone IS NOT NULL THEN
  IF v_phone !~ '^\+[1-9][0-9]{7,14}$' THEN RAISE EXCEPTION 'HCO_INVALID_PHONE'; END IF;
  -- A native phone identity anywhere in this project cannot be claimed by another user.
  IF EXISTS(SELECT 1 FROM auth.users WHERE id<>v_target AND '+'||regexp_replace(phone,'[^0-9]','','g')=v_phone)
   THEN RAISE EXCEPTION 'HCO_PHONE_ALREADY_REGISTERED' USING ERRCODE='23505'; END IF;
  INSERT INTO hco_phone_usernames(phone,user_id) VALUES(v_phone,v_target) ON CONFLICT(phone) DO NOTHING;
  SELECT user_id INTO v_owner FROM hco_phone_usernames WHERE phone=v_phone;
  IF v_owner IS DISTINCT FROM v_target THEN RAISE EXCEPTION 'HCO_PHONE_ALREADY_REGISTERED' USING ERRCODE='23505'; END IF;
 END IF;
 INSERT INTO hco_audit(actor_id,target_user_id,action,details)
 VALUES(p_actor,v_target,'phone_username_'||p_action,jsonb_build_object('phone',v_phone,'reason',p_data->>'reason'));
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.hco_phone_leadership_write(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hco_phone_leadership_write(uuid,text,jsonb) TO service_role;
COMMIT;
