-- VBC Member Welfare v0.5.0. Run in the Member Welfare project only.
-- Additive and safe to re-run. No records, preferences or sending settings are changed.
begin;

create or replace function public.care_update_preferences_guarded(
  p_member_id uuid, p_preferences jsonb, p_expected_version timestamptz,
  p_evidence_note text
) returns public.care_preferences language plpgsql security definer set search_path = '' as $$
declare current_preferences public.care_preferences; policy text; result public.care_preferences;
begin
  if not care_private.has_role(array['administrator','editor']) then
    raise exception 'Active staff editor access required' using errcode = '42501';
  end if;
  if p_evidence_note is null or length(btrim(p_evidence_note)) not between 10 and 2000 then
    raise exception 'Record consent evidence (10 to 2000 characters)' using errcode = '22023';
  end if;
  -- Member lock serializes this operation with archiving and note creation.
  perform 1 from public.care_members where id = p_member_id and archived_at is null for update;
  if not found then raise exception 'Member not found or archived' using errcode = 'P0002'; end if;
  select * into current_preferences from public.care_preferences where member_id = p_member_id for update;
  if not found then raise exception 'Preferences not found' using errcode = 'P0002'; end if;
  if p_expected_version is null or current_preferences.updated_at <> p_expected_version then
    raise exception 'Preferences changed; reload before saving' using errcode = '40001';
  end if;
  select consent_policy_version into policy from public.care_settings where id = 1;
  select * into result from public.care_set_preferences(p_member_id, p_preferences, 'admin', coalesce(policy,'v1'), btrim(p_evidence_note));
  return result;
end;
$$;
revoke all on function public.care_update_preferences_guarded(uuid,jsonb,timestamptz,text) from public, anon, authenticated;
grant execute on function public.care_update_preferences_guarded(uuid,jsonb,timestamptz,text) to authenticated;

create or replace function public.care_add_note_guarded(
  p_member_id uuid, p_request_id uuid, p_body text
) returns public.care_notes language plpgsql security invoker set search_path = '' as $$
declare result public.care_notes;
begin
  if not care_private.has_role(array['administrator','editor']) then
    raise exception 'Active staff editor access required' using errcode = '42501';
  end if;
  if p_request_id is null or p_body is null or length(btrim(p_body)) not between 1 and 4000 then
    raise exception 'Enter a note of 1 to 4000 characters' using errcode = '22023';
  end if;
  perform 1 from public.care_members where id = p_member_id and archived_at is null for update;
  if not found then raise exception 'Member not found or archived' using errcode = 'P0002'; end if;
  select * into result from public.care_notes where id = p_request_id;
  if found then
    if result.member_id = p_member_id and result.created_by = auth.uid() and result.body = btrim(p_body) then return result; end if;
    raise exception 'Note request ID already used' using errcode = '23505';
  end if;
  insert into public.care_notes(id,member_id,body) values(p_request_id,p_member_id,btrim(p_body)) returning * into result;
  return result;
end;
$$;
revoke all on function public.care_add_note_guarded(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.care_add_note_guarded(uuid,uuid,text) to authenticated;
notify pgrst, 'reload schema';
commit;
