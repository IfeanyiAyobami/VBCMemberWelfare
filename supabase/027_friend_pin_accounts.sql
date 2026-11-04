begin;
create table if not exists public.care_friend_pin_accounts(
 user_id uuid primary key references public.care_staff(user_id) on delete cascade,
 email text unique,phone text unique,pin_hash text not null,
 version uuid not null default gen_random_uuid(),
 window_start timestamptz not null default now(),attempts integer not null default 0,
 failures integer not null default 0,
 check(email is not null or phone is not null)
);
alter table public.care_friend_pin_accounts enable row level security;
revoke all on public.care_friend_pin_accounts from public,anon,authenticated;
grant all on public.care_friend_pin_accounts to service_role;
create or replace function care_private.friend_pin_eligible(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.care_staff s where user_id=p_user and is_active and role='followup_worker')
 and exists(select 1 from public.care_journey_roles where user_id=p_user and capability='friend')
 and not exists(select 1 from public.care_journey_roles where user_id=p_user and capability in ('coordinator','foundation'))
 and not exists(select 1 from public.hco_assignments where user_id=p_user and active)
$$;
revoke all on function care_private.friend_pin_eligible(uuid) from public,anon,authenticated;
create or replace function public.care_friend_pin_attempt(p_identity text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.care_friend_pin_accounts;
begin
 select * into r from public.care_friend_pin_accounts where email=lower(p_identity) or phone=p_identity for update;
 if not found or not care_private.friend_pin_eligible(r.user_id) then return '{}'::jsonb;end if;
 if r.window_start<=now()-interval '15 minutes' then r.attempts:=0;r.window_start:=now();end if;
 if r.attempts>=5 or r.failures>=20 then return '{}'::jsonb;end if;
 update public.care_friend_pin_accounts set attempts=r.attempts+1,window_start=r.window_start,failures=failures+1 where user_id=r.user_id;
 return jsonb_build_object('user_id',r.user_id,'pin_hash',r.pin_hash,'version',r.version);
end$$;
create or replace function public.care_friend_pin_complete(p_user uuid,p_version uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not care_private.friend_pin_eligible(p_user) then return false;end if;
 update public.care_friend_pin_accounts set failures=0 where user_id=p_user and version=p_version;
 return found;
end$$;
create or replace function public.care_friend_pin_save(p_actor uuid,p_user uuid,p_name text,p_email text,p_phone text,p_hash text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.care_staff where user_id=p_actor and is_active and role='administrator') then raise exception 'Administrator access required.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,27027));
 if exists(select 1 from public.care_staff where user_id=p_user and (role<>'followup_worker' or not is_active)) or exists(select 1 from public.care_journey_roles where user_id=p_user and capability in ('coordinator','foundation')) or exists(select 1 from public.hco_assignments where user_id=p_user and active) then raise exception 'PIN access is only for active Friend-only accounts.' using errcode='42501';end if;
 if p_email is null and p_phone is null or length(btrim(p_name)) not between 2 and 120 or length(p_hash)>500 or p_hash is null then raise exception 'Invalid Friend details.' using errcode='22023';end if;
 insert into public.care_staff(user_id,display_name,role) values(p_user,btrim(p_name),'followup_worker') on conflict(user_id) do nothing;
 insert into public.care_journey_roles(user_id,capability,granted_by) values(p_user,'friend',p_actor) on conflict do nothing;
 insert into public.care_friend_pin_accounts(user_id,email,phone,pin_hash) values(p_user,p_email,p_phone,p_hash)
 on conflict(user_id) do update set email=excluded.email,phone=excluded.phone,pin_hash=excluded.pin_hash,version=gen_random_uuid(),attempts=0,failures=0,window_start=now();
 insert into public.care_journey_events(member_id,actor,action,detail) values(null,p_actor,'friend_pin_account_saved',jsonb_build_object('user_id',p_user));
 return true;
end$$;
revoke all on function public.care_friend_pin_attempt(text),public.care_friend_pin_complete(uuid,uuid),public.care_friend_pin_save(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.care_friend_pin_attempt(text),public.care_friend_pin_complete(uuid,uuid),public.care_friend_pin_save(uuid,uuid,text,text,text,text) to service_role;
commit;
