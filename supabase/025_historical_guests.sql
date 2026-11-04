-- Schema only. Private workbook data is loaded separately, never served as a static asset.
begin;
create table if not exists care_private.historical_guests(
 batch text not null,row_number integer not null,raw jsonb not null,
 full_name text not null,phone text,gender text,
 imported_member uuid references public.care_members(id),imported_at timestamptz,
 primary key(batch,row_number)
);
revoke all on care_private.historical_guests from public,anon,authenticated;
create or replace function public.care_historical_guests(p_row integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r care_private.historical_guests;m uuid;matches uuid[];parts text[];actor_id uuid:=auth.uid();
begin
 if not care_private.journey_cap('coordinator') then raise exception 'Coordinator access required.' using errcode='42501';end if;
 if p_row is null then
  return jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('row',h.row_number,'name',h.full_name,'phone',h.phone,'gender',h.gender,'source',h.raw,'memberId',h.imported_member,'importedAt',h.imported_at) order by h.row_number) from care_private.historical_guests h where batch='spring-guests-2025-v1'),'[]'::jsonb));
 end if;
 select * into r from care_private.historical_guests where batch='spring-guests-2025-v1' and row_number=p_row for update;
 if not found then raise exception 'Historical row not found.' using errcode='22023';end if;
 if r.imported_member is not null then return jsonb_build_object('saved',true,'memberId',r.imported_member,'message','Already imported');end if;
 -- Serialize this import and compare contacts and full display names, including archived records.
 perform pg_advisory_xact_lock(25025);
 select array_agg(id) into matches from public.care_members where
 (r.phone is not null and phone=r.phone) or
 lower(regexp_replace(btrim(other_names||' '||surname),'\s+',' ','g'))=lower(r.full_name);
 if cardinality(matches)>0 then return jsonb_build_object('saved',false,'message','Possible existing person. Review identity in Members; this row was not imported or merged.');end if;
 if r.phone is not null and exists(select 1 from public.care_guest_submissions where phone=r.phone and member_id is null and review_status='pending') then return jsonb_build_object('saved',false,'message','Matching pending guest submission. Review Guest submissions first.');end if;
 parts:=regexp_split_to_array(r.full_name,'\s+');
 insert into public.care_members(other_names,surname,phone,gender,status,created_by)
 values(parts[1],array_to_string(parts[2:cardinality(parts)],' '),r.phone,r.gender,'visitor',actor_id) returning id into m;
 -- Historical source facts are evidence, not invented attendance or a joining confirmation.
 update public.care_journeys set registration_source='existing_record',followup_state='paused',version=version+1 where member_id=m;
 update public.care_preferences set source='admin',evidence_note='Historical guest workbook. Original details retained in journey history; date, joining and assignment require review.',updated_at=now() where member_id=m;
 insert into public.care_journey_events(member_id,actor,action,detail) values(m,actor_id,'historical_guest_import',jsonb_build_object('batch',r.batch,'source_row',r.row_number,'source',r.raw,'note','Historical record imported. No visit date, official joining date, class attendance or Friend assignment inferred. Care paused pending review.'));
 update care_private.historical_guests set imported_member=m,imported_at=now() where batch=r.batch and row_number=r.row_number;
 return jsonb_build_object('saved',true,'memberId',m,'message','Imported; historical care paused');
exception when unique_violation then return jsonb_build_object('saved',false,'message','An existing record now matches. Review identity before importing.');
end$$;
revoke all on function public.care_historical_guests(integer) from public,anon;
grant execute on function public.care_historical_guests(integer) to authenticated;
commit;
