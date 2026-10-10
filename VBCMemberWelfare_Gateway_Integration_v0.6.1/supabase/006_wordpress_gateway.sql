-- VBC Member Care v0.6.1. Add to the existing project; no core schema reset.
-- Requires 004_care_controls.sql and 005_guest_review.sql. Safe to re-run.
begin;
do $$ begin
 if to_regprocedure('public.care_record_guest(uuid,jsonb,text)') is null
 or to_regprocedure('public.care_review_guest(uuid,timestamptz,text,uuid,timestamptz,text,boolean)') is null then
  raise exception 'Run 005_guest_review.sql before 006_wordpress_gateway.sql';
 end if;
end $$;

alter table public.care_guest_submissions add column if not exists gateway_payload_hash text
 check (gateway_payload_hash is null or gateway_payload_hash ~ '^[a-f0-9]{64}$');
alter table public.care_guest_submissions add column if not exists gateway_submitted_at timestamp without time zone;
comment on column public.care_guest_submissions.gateway_submitted_at is
 'Original WordPress site-local date_submitted; no timezone was supplied. created_at is the Member Care receipt instant.';
comment on column public.care_guest_submissions.gateway_payload_hash is
 'SHA-256 of the canonical complete v1.1.3 payload. Shares the guest record lifetime; no extra copy of visitor answers.';

-- The core already has UNIQUE(submission_key). Fail safely or establish it on
-- installations lacking that constraint; never deduplicate/delete existing rows.
do $$ begin
 if not exists (
  select 1 from pg_catalog.pg_index i
  join pg_catalog.pg_attribute a on a.attrelid=i.indrelid and a.attnum=i.indkey[0]
  where i.indrelid='public.care_guest_submissions'::regclass and i.indisunique and i.indisvalid
  and i.indnkeyatts=1 and i.indpred is null and i.indexprs is null and a.attname='submission_key'
 ) then
  create unique index care_guests_gateway_submission_key_unique on public.care_guest_submissions(submission_key);
 end if;
end $$;

create or replace function public.care_ingest_wordpress_gateway(
 p_submission_key uuid, p_guest jsonb, p_evidence text,
 p_payload_hash text, p_submitted_at text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.care_guest_submissions; saved public.care_guest_submissions;
 submitted timestamp without time zone; k text; was_duplicate boolean;
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
 saved:=public.care_record_guest(p_submission_key,p_guest,p_evidence);
 if not was_duplicate then
  update public.care_guest_submissions set gateway_payload_hash=p_payload_hash,
   gateway_submitted_at=submitted where id=saved.id;
 end if;
 return jsonb_build_object('id',saved.id,'duplicate',was_duplicate);
end;
$$;
revoke all on function public.care_ingest_wordpress_gateway(uuid,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.care_ingest_wordpress_gateway(uuid,jsonb,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
