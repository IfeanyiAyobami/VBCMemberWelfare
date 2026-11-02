-- Saved programmes and public programme artwork. Public artwork contains no member data.
begin;
-- Extend the original programme table. Existing rows, IDs and invitations remain linked.
alter table public.care_programmes add column if not exists recurrence text not null default 'once';
alter table public.care_programmes add column if not exists event_date date;
alter table public.care_programmes add column if not exists weekday smallint;
alter table public.care_programmes add column if not exists start_time time;
alter table public.care_programmes add column if not exists information_link text not null default '';
alter table public.care_programmes add column if not exists flyer_path text;
alter table public.care_programmes add column if not exists updated_by uuid references public.care_staff(user_id);
alter table public.care_programmes add column if not exists version integer not null default 1;
alter table public.care_programmes alter column starts_at drop not null;
update public.care_programmes set event_date=(starts_at at time zone 'Africa/Lagos')::date,start_time=(starts_at at time zone 'Africa/Lagos')::time,information_link=coalesce(info_url,'') where recurrence='once' and event_date is null and starts_at is not null;
alter table public.care_programmes alter column start_time set not null;
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.care_programmes'::regclass and conname='care_programme_schedule') then alter table public.care_programmes add constraint care_programme_schedule check((recurrence='once' and event_date is not null and weekday is null) or (recurrence='weekly' and event_date is null and weekday between 0 and 6 and weekday is not null));end if;
 if not exists(select 1 from pg_constraint where conrelid='public.care_programmes'::regclass and conname='care_programme_flyer_path') then alter table public.care_programmes add constraint care_programme_flyer_path check(flyer_path is null or flyer_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$');end if;
 if not exists(select 1 from pg_constraint where conrelid='public.care_programmes'::regclass and conname='care_programme_information_link') then alter table public.care_programmes add constraint care_programme_information_link check(information_link='' or (information_link ~ '^https?://' and length(information_link)<=2000));end if;
end$$;
create table if not exists care_private.programme_requests(actor uuid not null,request_id uuid not null,payload jsonb not null,result jsonb not null,primary key(actor,request_id));
create or replace function public.care_programme_can_edit() returns boolean language sql stable security definer set search_path='' as $$select care_private.has_role(array['administrator','editor']) or care_private.journey_cap('coordinator')$$;
create or replace function public.care_programme_save(p_data jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); old public.care_programmes; replay care_private.programme_requests; result jsonb; target uuid:=nullif(p_data->>'id','')::uuid; mode text:=p_data->>'recurrence';
begin
 if not public.care_programme_can_edit() then raise exception 'Programme editor access required.' using errcode='42501';end if;
 if p_request is null or jsonb_typeof(p_data) is distinct from 'object' or length(p_data::text)>16000 then raise exception 'Invalid programme.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor_id::text||p_request::text,23023));
 select * into replay from care_private.programme_requests where programme_requests.actor=actor_id and request_id=p_request;
 -- Qualified actor column avoids ambiguity with the local variable.
 if found then if replay.payload<>p_data then raise exception 'Changed details need a new save request.' using errcode='22023';end if;return replay.result;end if;
 if mode not in ('once','weekly') or mode is null then raise exception 'Choose one-off or weekly.' using errcode='22023';end if;
 if nullif(p_data->>'flyerPath','') is not null and not exists(select 1 from public.care_programmes where id=target and flyer_path=p_data->>'flyerPath') and split_part(p_data->>'flyerPath','/',1)<>actor_id::text then raise exception 'Upload programme artwork using your staff account.' using errcode='42501';end if;
 if nullif(p_data->>'flyerPath','') is not null and to_regclass('storage.objects') is not null then
  if not exists(select 1 from storage.objects where bucket_id='care-programme-flyers' and name=p_data->>'flyerPath') then raise exception 'Upload the programme flyer before saving.' using errcode='22023';end if;
 end if;
 if target is not null then
  select * into old from public.care_programmes where id=target for update;
  if not found then raise exception 'Programme not found.' using errcode='22023';end if;
  if old.version is distinct from (p_data->>'version')::integer then raise exception 'This programme changed elsewhere. Close this form and refresh before editing.' using errcode='40001';end if;
  update public.care_programmes set title=btrim(p_data->>'title'),description=coalesce(p_data->>'description',''),recurrence=mode,event_date=case when mode='once' then nullif(p_data->>'date','')::date end,weekday=case when mode='weekly' then (p_data->>'weekday')::smallint end,start_time=(p_data->>'time')::time,venue=btrim(p_data->>'venue'),information_link=coalesce(p_data->>'link',''),flyer_path=nullif(p_data->>'flyerPath',''),starts_at=case when mode='once' then (nullif(p_data->>'date','')::date+(p_data->>'time')::time) at time zone 'Africa/Lagos' end,ends_at=null,info_url=case when p_data->>'link' ~ '^https://' then p_data->>'link' end,updated_by=actor_id,updated_at=now(),version=version+1 where id=target returning to_jsonb(care_programmes.*) into result;
 else
  insert into public.care_programmes(title,description,recurrence,event_date,weekday,start_time,venue,information_link,flyer_path,created_by,updated_by,starts_at) values(btrim(p_data->>'title'),coalesce(p_data->>'description',''),mode,case when mode='once' then nullif(p_data->>'date','')::date end,case when mode='weekly' then (p_data->>'weekday')::smallint end,(p_data->>'time')::time,btrim(p_data->>'venue'),coalesce(p_data->>'link',''),nullif(p_data->>'flyerPath',''),actor_id,actor_id,case when mode='once' then (nullif(p_data->>'date','')::date+(p_data->>'time')::time) at time zone 'Africa/Lagos' end) returning id,to_jsonb(care_programmes.*) into target,result;
 end if;
 insert into care_private.programme_requests values(actor_id,p_request,p_data,result);return result;
end$$;
alter table public.care_programmes enable row level security;
drop policy if exists care_programmes_read on public.care_programmes;
create policy care_programmes_read on public.care_programmes for select to authenticated using(care_private.has_role(array['administrator','editor','viewer','followup_worker']));
revoke all on public.care_programmes from anon,authenticated;
grant select on public.care_programmes to authenticated;
revoke all on function public.care_programme_can_edit(),public.care_programme_save(jsonb,uuid) from public,anon;
grant execute on function public.care_programme_can_edit(),public.care_programme_save(jsonb,uuid) to authenticated;
-- Supabase Storage may be absent in an isolated database test.
do $$begin if to_regclass('storage.buckets') is not null then
 insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('care-programme-flyers','care-programme-flyers',true,4194304,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
 execute 'drop policy if exists care_programme_art_insert on storage.objects';
 execute 'create policy care_programme_art_insert on storage.objects for insert to authenticated with check(bucket_id=''care-programme-flyers'' and (storage.foldername(name))[1]=auth.uid()::text and public.care_programme_can_edit())';
end if;end$$;
commit;
