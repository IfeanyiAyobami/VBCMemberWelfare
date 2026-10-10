-- VBC Member Welfare v0.6.0. Run in the Member Welfare project after core setup.
-- Additive, safe to re-run. No existing members or permissions are modified.
begin;
alter table public.care_guest_submissions add column if not exists entered_by uuid references auth.users(id) on delete set null;
alter table public.care_guest_submissions add column if not exists consent_evidence text check (consent_evidence is null or length(consent_evidence) <= 2000);

create or replace function public.care_record_guest(
 p_submission_key uuid, p_guest jsonb, p_evidence text
) returns public.care_guest_submissions language plpgsql security definer set search_path='' as $$
declare incoming public.care_guest_submissions; existing public.care_guest_submissions; result public.care_guest_submissions; k text; incoming_json jsonb; stored_json jsonb; policy text; actor uuid; intake_source text;
 keys text[]:=array['surname','other_names','visit_date','occupation','gender','age_range','marital_status','phone','whatsapp','email','residential_address','born_again','home_visit','discovery_source','discovery_details','invited_by','contact_consent','birthday_month','birthday_day','anniversary_month','anniversary_day','email_opt_in','sms_opt_in','celebrations_opt_in','programmes_opt_in','newsletters_opt_in'];
begin
 if auth.role()='service_role' then actor:=null; intake_source:='wordpress';
 elsif care_private.has_role(array['administrator','editor']) then actor:=auth.uid(); intake_source:='manual';
 else raise exception 'Active staff editor or trusted receiver required' using errcode='42501'; end if;
 if p_submission_key is null or p_guest is null or jsonb_typeof(p_guest)<>'object' or p_evidence is null or length(btrim(p_evidence)) not between 10 and 2000 then raise exception 'Invalid guest or consent evidence' using errcode='22023'; end if;
 for k in select jsonb_object_keys(p_guest) loop
  if k<>all(keys) then raise exception 'Unknown guest field' using errcode='22023'; end if;
 end loop;
 foreach k in array array['contact_consent','email_opt_in','sms_opt_in','celebrations_opt_in','programmes_opt_in','newsletters_opt_in'] loop
  if jsonb_typeof(p_guest->k) is distinct from 'boolean' then raise exception 'Permissions must be explicit booleans' using errcode='22023'; end if;
 end loop;
 incoming:=jsonb_populate_record(null::public.care_guest_submissions,p_guest);
 incoming.phone:=care_private.normalize_phone(incoming.phone);
 incoming.whatsapp:=care_private.normalize_phone(incoming.whatsapp);
 incoming.email:=lower(nullif(btrim(incoming.email),''));
 if incoming.contact_consent is distinct from true or incoming.visit_date is null or incoming.visit_date<'1900-01-01'::date or incoming.visit_date>(now() at time zone 'Africa/Lagos')::date or (incoming.email_opt_in and incoming.email is null) then raise exception 'Check visit date, contact consent and email permission' using errcode='22023'; end if;
 -- One browser form key identifies one immutable submission, even on network retry.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_submission_key::text,735106));
 select * into existing from public.care_guest_submissions where submission_key=p_submission_key for update;
 if found then
  select jsonb_object_agg(key,value) into incoming_json from jsonb_each(to_jsonb(incoming)) where key=any(keys);
  select jsonb_object_agg(key,value) into stored_json from jsonb_each(to_jsonb(existing)) where key=any(keys);
  if existing.source=intake_source and existing.entered_by is not distinct from actor and stored_json=incoming_json and existing.consent_evidence=btrim(p_evidence) then return existing; end if;
  raise exception 'Submission key already used for different details' using errcode='23505';
 end if;
 select consent_policy_version into policy from public.care_settings where id=1;
 insert into public.care_guest_submissions(
 submission_key,source,surname,other_names,visit_date,occupation,gender,age_range,marital_status,phone,whatsapp,email,residential_address,born_again,home_visit,discovery_source,discovery_details,invited_by,contact_consent,birthday_month,birthday_day,anniversary_month,anniversary_day,email_opt_in,sms_opt_in,celebrations_opt_in,programmes_opt_in,newsletters_opt_in,policy_version,entered_by,consent_evidence)
 values(p_submission_key,intake_source,incoming.surname,incoming.other_names,incoming.visit_date,incoming.occupation,incoming.gender,incoming.age_range,incoming.marital_status,incoming.phone,incoming.whatsapp,incoming.email,incoming.residential_address,incoming.born_again,incoming.home_visit,incoming.discovery_source,incoming.discovery_details,incoming.invited_by,incoming.contact_consent,incoming.birthday_month,incoming.birthday_day,incoming.anniversary_month,incoming.anniversary_day,incoming.email_opt_in,incoming.sms_opt_in,incoming.celebrations_opt_in,incoming.programmes_opt_in,incoming.newsletters_opt_in,coalesce(policy,'v1'),actor,btrim(p_evidence)) returning * into result;
 return result;
end;
$$;
revoke all on function public.care_record_guest(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.care_record_guest(uuid,jsonb,text) to authenticated,service_role;

create or replace function public.care_review_guest(
 p_guest_id uuid,p_expected_version timestamptz,p_action text,
 p_member_id uuid,p_target_version timestamptz,p_review_notes text,p_identity_confirmed boolean
) returns public.care_guest_submissions language plpgsql security definer set search_path='' as $$
declare g public.care_guest_submissions; m public.care_members; desired_status text; result public.care_guest_submissions;
begin
 if not care_private.has_role(array['administrator','editor']) then raise exception 'Active staff editor required' using errcode='42501'; end if;
 if p_action is null or p_action<>all(array['create','link','reject']) or p_review_notes is null or length(btrim(p_review_notes))>2000 or p_expected_version is null then raise exception 'Invalid review decision' using errcode='22023'; end if;
 if (p_action in ('create','link') and p_member_id is null) or (p_action='reject' and p_member_id is not null) then raise exception 'Invalid member target' using errcode='22023'; end if;
 if p_action='reject' and length(btrim(p_review_notes))<10 then raise exception 'Record a reason for rejection' using errcode='22023'; end if;
 if p_action='link' and (p_identity_confirmed is distinct from true or p_target_version is null) then raise exception 'Confirm identity before linking' using errcode='22023'; end if;
 desired_status:=case p_action when 'create' then 'accepted' when 'link' then 'duplicate' else 'rejected' end;
 select * into g from public.care_guest_submissions where id=p_guest_id for update;
 if not found then raise exception 'Guest not found' using errcode='P0002'; end if;
 -- A repeated successful decision returns its original outcome, without another member.
 if g.review_status=desired_status and g.member_id is not distinct from p_member_id and g.reviewed_by=auth.uid() and coalesce(g.review_notes,'')=btrim(p_review_notes) then return g; end if;
 if g.review_status<>'pending' or g.updated_at<>p_expected_version then raise exception 'Guest already reviewed or changed' using errcode='40001'; end if;
 if p_action='create' then
  if exists(select 1 from public.care_members where phone=g.phone or (g.email is not null and email=g.email)) then raise exception 'A matching contact exists, including archived members' using errcode='23505'; end if;
  insert into public.care_members(id,surname,other_names,status,email,phone,whatsapp,occupation,gender,age_range,marital_status,residential_address,joined_on,birthday_month,birthday_day,anniversary_month,anniversary_day)
  values(p_member_id,g.surname,g.other_names,'visitor',g.email,g.phone,g.whatsapp,g.occupation,g.gender,g.age_range,g.marital_status,g.residential_address,g.visit_date,g.birthday_month,g.birthday_day,g.anniversary_month,g.anniversary_day);
  -- The member trigger initializes all choices off; copy only the guest's six recorded choices.
  perform public.care_set_preferences(p_member_id,jsonb_build_object('contact_consent',g.contact_consent,'email_opt_in',g.email_opt_in,'sms_opt_in',g.sms_opt_in,'celebrations_opt_in',g.celebrations_opt_in,'programmes_opt_in',g.programmes_opt_in,'newsletters_opt_in',g.newsletters_opt_in),case when g.source='wordpress' then 'website' else 'admin' end,g.policy_version,
    coalesce(g.consent_evidence,'Recorded guest-card choices.'));
 elsif p_action='link' then
  select * into m from public.care_members where id=p_member_id and archived_at is null for update;
  if not found then raise exception 'Active matching member not found' using errcode='P0002'; end if;
  if m.updated_at<>p_target_version then raise exception 'Member changed after review opened' using errcode='40001'; end if;
  if m.phone is distinct from g.phone and (g.email is null or m.email is distinct from g.email) then raise exception 'Target no longer matches submitted contacts' using errcode='40001'; end if;
  -- Do not rewrite an existing identity, contact, milestone or permission.
 end if;
 update public.care_guest_submissions set review_status=desired_status,member_id=case when p_action='reject' then null else p_member_id end,review_notes=nullif(btrim(p_review_notes),''),reviewed_by=auth.uid(),reviewed_at=now() where id=g.id returning * into result;
 return result;
end;
$$;
revoke all on function public.care_review_guest(uuid,timestamptz,text,uuid,timestamptz,text,boolean) from public,anon,authenticated;
grant execute on function public.care_review_guest(uuid,timestamptz,text,uuid,timestamptz,text,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
