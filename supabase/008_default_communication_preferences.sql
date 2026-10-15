-- VBC Member Care: new-record preference defaults + WordPress gateway adapter.
-- Review before running. Requires core schema and migrations 005, 006.
-- Does NOT enable messaging workers or modify existing member preferences.
BEGIN;

-- New member records receive initial ON preferences. This fires only on INSERT.
-- Existing opt-outs and existing member rows are not changed.
CREATE OR REPLACE FUNCTION care_private.vbc_new_member_preference_defaults()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.contact_consent := true;
  NEW.email_opt_in := EXISTS (
    SELECT 1 FROM public.care_members m WHERE m.id = NEW.member_id
      AND m.email IS NOT NULL
  );
  NEW.sms_opt_in := true;
  NEW.celebrations_opt_in := true;
  NEW.programmes_opt_in := true;
  NEW.newsletters_opt_in := true;
  NEW.source := 'system';
  NEW.evidence_note := 'Initial channel preferences only; not evidence of affirmative marketing consent';
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS vbc_new_member_preference_defaults ON public.care_preferences;
CREATE TRIGGER vbc_new_member_preference_defaults
BEFORE INSERT ON public.care_preferences FOR EACH ROW
EXECUTE FUNCTION care_private.vbc_new_member_preference_defaults();

-- Preserve the existing WordPress payload contract: the gateway continues
-- receiving false flags, and translates them to defaults for NEW submissions.
-- Website form evidence must accurately cover the intended communications.
create or replace function public.care_ingest_wordpress_gateway(
 p_submission_key uuid, p_guest jsonb, p_evidence text,
 p_payload_hash text, p_submitted_at text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.care_guest_submissions; saved public.care_guest_submissions;
 submitted timestamp without time zone; k text; was_duplicate boolean; effective_guest jsonb;
begin
 if auth.role() is distinct from 'service_role' then
  raise exception 'Trusted gateway receiver required' using errcode='42501';
 end if;
 if p_submission_key is null or p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$'
 or p_submitted_at is null or p_submitted_at !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$'
 or p_guest is null or jsonb_typeof(p_guest)<>'object' then
  raise exception 'Invalid gateway envelope' using errcode='22023';
 end if;
 submitted:=p_submitted_at::timestamp without time zone;
 if submitted<'1900-01-01'::timestamp or to_char(submitted,'YYYY-MM-DD HH24:MI:SS')<>p_submitted_at then
  raise exception 'Invalid site-local timestamp' using errcode='22023';
 end if;
 -- The Gateway only records follow-up consent. It supplies no sending choices
 -- or birthday/anniversary fields, even when an email/WhatsApp number exists.
 if p_guest->'contact_consent' is distinct from 'true'::jsonb then
  raise exception 'Follow-up consent required' using errcode='22023';
 end if;
 foreach k in array array['email_opt_in','sms_opt_in','celebrations_opt_in','programmes_opt_in','newsletters_opt_in'] loop
  if p_guest->k is distinct from 'false'::jsonb then
   raise exception 'Gateway does not supply sending permission' using errcode='22023';
  end if;
 end loop;
 foreach k in array array['birthday_month','birthday_day','anniversary_month','anniversary_day'] loop
  if p_guest->k is distinct from 'null'::jsonb then
   raise exception 'Gateway does not supply milestones' using errcode='22023';
  end if;
 end loop;
 -- Same lock namespace as care_record_guest, so legacy/manual collisions also
 -- serialize. The UNIQUE index is the final guard under concurrent requests.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_submission_key::text,735106));
 select * into existing from public.care_guest_submissions where submission_key=p_submission_key for update;
 was_duplicate:=found;
 if was_duplicate and (existing.source<>'wordpress'
 or existing.gateway_payload_hash is distinct from p_payload_hash
 or existing.gateway_submitted_at is distinct from submitted) then
  raise exception 'Submission ID conflicts with its saved payload' using errcode='23505';
 end if;
 -- Reuse the established staging function and validation. This never creates
 -- a member, changes a review decision, or schedules provider messages.
 -- The original WordPress payload remains immutable; derive server-side defaults.
 -- Missing email addresses cannot enable email sending.
 effective_guest := p_guest || jsonb_build_object(
   'email_opt_in', nullif(btrim(coalesce(p_guest->>'email','')), '') is not null,
   'sms_opt_in', true,
   'celebrations_opt_in', true,
   'programmes_opt_in', true,
   'newsletters_opt_in', true
 );
 saved:=public.care_record_guest(p_submission_key,effective_guest,p_evidence);
 if not was_duplicate then
  update public.care_guest_submissions set gateway_payload_hash=p_payload_hash,
   gateway_submitted_at=submitted where id=saved.id;
 end if;
 return jsonb_build_object('id',saved.id,'duplicate',was_duplicate);
end;
$$;

REVOKE ALL ON FUNCTION public.care_ingest_wordpress_gateway(uuid,jsonb,text,text,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.care_ingest_wordpress_gateway(uuid,jsonb,text,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
