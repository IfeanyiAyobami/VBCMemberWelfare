begin;
create table if not exists public.hco_leader_pin_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 pin_hash text not null, version uuid not null default gen_random_uuid(),
 window_start timestamptz not null default now(), attempts integer not null default 0,
 failures integer not null default 0, updated_at timestamptz not null default now()
);
alter table public.hco_leader_pin_accounts enable row level security;
revoke all on public.hco_leader_pin_accounts from public,anon,authenticated;
grant all on public.hco_leader_pin_accounts to service_role;
create or replace function care_private.hco_pin_eligible(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.hco_assignments where user_id=p_user and active and role='cell_leader')
 and not exists(select 1 from public.hco_assignments where user_id=p_user and active and role<>'cell_leader')
 and not exists(select 1 from public.care_staff where user_id=p_user and (not is_active or role<>'followup_worker'))
 and not exists(select 1 from public.care_journey_roles where user_id=p_user and capability<>'friend')
 and not exists(select 1 from public.hco_access where user_id=p_user and suspended_at is not null)
$$;
create or replace function public.hco_leader_pin_save(p_actor uuid,p_user uuid,p_hash text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_actor=p_user or not care_private.hco_pin_eligible(p_user) then raise exception 'PIN access requires an active cell-leader-only account.' using errcode='42501';end if;
 if not exists(select 1 from public.care_staff where user_id=p_actor and is_active and role='administrator') and not exists(select 1 from public.hco_assignments where user_id=p_actor and active and role='church_admin') then
 if not exists(select 1 from public.hco_assignments where user_id=p_actor and active and role='coordinator') or exists(
 select 1 from public.hco_assignments x join public.hco_cells c on c.id=x.cell_id where x.user_id=p_user and x.active and not exists(select 1 from public.hco_assignments mine where mine.user_id=p_actor and mine.active and mine.role='coordinator' and mine.area_id=c.area_id)
 ) then raise exception 'Coordinator scope required.' using errcode='42501';end if;
 end if;
 if exists(select 1 from public.hco_access where user_id=p_actor and suspended_at is not null) then raise exception 'Access suspended.' using errcode='42501';end if;
 if p_hash is null or p_hash !~ '^[a-f0-9]{32}:[a-f0-9]{128}$' then raise exception 'Invalid PIN hash.';end if;
 insert into public.hco_leader_pin_accounts(user_id,pin_hash) values(p_user,p_hash) on conflict(user_id) do update set pin_hash=excluded.pin_hash,version=gen_random_uuid(),attempts=0,failures=0,window_start=now(),updated_at=now();
 update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)-'hco_password_change_required'-'hco_temporary_password_hash' where id=p_user;
 insert into public.hco_audit(actor_id,target_user_id,action,details) values(p_actor,p_user,'leader_pin_generated','{}'::jsonb);
 return true;
end$$;
create or replace function public.hco_leader_pin_attempt(p_identity text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.hco_leader_pin_accounts; matches integer;
begin
 select count(distinct p.user_id) into matches from public.hco_leader_pin_accounts p join auth.users u on u.id=p.user_id left join public.hco_phone_usernames n on n.user_id=p.user_id where lower(u.email)=lower(p_identity) or n.phone=p_identity or ('+'||regexp_replace(u.phone,'\D','','g'))=p_identity;
 if matches<>1 then return '{}'::jsonb;end if;
 select p.* into r from public.hco_leader_pin_accounts p join auth.users u on u.id=p.user_id where lower(u.email)=lower(p_identity) or exists(select 1 from public.hco_phone_usernames n where n.user_id=p.user_id and n.phone=p_identity) or ('+'||regexp_replace(u.phone,'\D','','g'))=p_identity for update of p;
 if not found or not care_private.hco_pin_eligible(r.user_id) then return '{}'::jsonb;end if;
 if r.window_start<=now()-interval '15 minutes' then r.attempts:=0;r.window_start:=now();end if;
 if r.attempts>=5 or r.failures>=20 then return '{}'::jsonb;end if;
 update public.hco_leader_pin_accounts set attempts=r.attempts+1,window_start=r.window_start,failures=failures+1 where user_id=r.user_id;
 return jsonb_build_object('user_id',r.user_id,'pin_hash',r.pin_hash,'version',r.version);
end$$;
create or replace function public.hco_leader_pin_complete(p_user uuid,p_version uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not care_private.hco_pin_eligible(p_user) then return false;end if;
 update public.hco_leader_pin_accounts set failures=0 where user_id=p_user and version=p_version;
 return found;
end$$;
revoke all on function care_private.hco_pin_eligible(uuid),public.hco_leader_pin_save(uuid,uuid,text),public.hco_leader_pin_attempt(text),public.hco_leader_pin_complete(uuid,uuid) from public,anon,authenticated;
grant execute on function public.hco_leader_pin_save(uuid,uuid,text),public.hco_leader_pin_attempt(text),public.hco_leader_pin_complete(uuid,uuid) to service_role;
commit;
