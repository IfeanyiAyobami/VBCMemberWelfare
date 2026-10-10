-- VBC follow-up management: run AFTER 004, 005, 006. Apply once in Supabase SQL editor.
begin;
alter table public.care_staff drop constraint if exists care_staff_role_check;
alter table public.care_staff add constraint care_staff_role_check check (role in ('administrator','editor','viewer','followup_worker'));

create table if not exists public.care_followups (
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references public.care_members(id) on delete restrict,
 assigned_to uuid not null references public.care_staff(user_id),
 assigned_by uuid not null references public.care_staff(user_id),
 due_at timestamptz not null,
 status text not null default 'pending' check (status in ('pending','in_progress','completed','cancelled')),
 summary text not null default '' check (length(summary)<=1000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists care_followups_assignee on public.care_followups(assigned_to,status,due_at);
create index if not exists care_followups_member on public.care_followups(member_id);
create table if not exists public.care_followup_activities (
 id uuid primary key default gen_random_uuid(),
 followup_id uuid not null references public.care_followups(id) on delete cascade,
 author_id uuid not null references public.care_staff(user_id),
 method text not null check (method in ('phone','whatsapp','sms','email','in_person','other')),
 outcome text not null check (outcome in ('reached','no_answer','requested_callback','declined','other')),
 note text not null check (length(btrim(note)) between 1 and 2000),
 created_at timestamptz not null default now()
);
create index if not exists care_followup_activity_parent on public.care_followup_activities(followup_id,created_at desc);
alter table public.care_followups enable row level security;
alter table public.care_followup_activities enable row level security;
revoke all on public.care_followups,public.care_followup_activities from public,anon,authenticated;

-- SECURITY DEFINER functions are the only entry points. Workers never receive
-- direct access to members, guest submissions, staff lists or care notes.
create or replace function public.care_followup_list()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_role text; result jsonb;
begin
 select role into actor_role from public.care_staff where user_id=auth.uid() and is_active;
 if actor_role is null or actor_role not in ('administrator','editor','followup_worker') then
  raise exception 'Not authorized' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.due_at asc),'[]'::jsonb) into result from (
  select f.id,f.member_id,f.assigned_to,f.due_at,f.status,f.summary,f.created_at,
   m.other_names,m.surname,
   case when coalesce(cp.contact_consent,false) then m.phone else null end as phone,
   case when coalesce(cp.contact_consent,false) and cp.email_opt_in then m.email else null end as email,
   coalesce(cp.contact_consent,false) as contact_consent,
   coalesce(cp.sms_opt_in,false) as sms_opt_in,
   coalesce(cp.email_opt_in,false) as email_opt_in,
   s.display_name as worker_name
  from public.care_followups f
  join public.care_members m on m.id=f.member_id and m.archived_at is null
  left join public.care_preferences cp on cp.member_id=m.id
  join public.care_staff s on s.user_id=f.assigned_to
  where actor_role in ('administrator','editor') or f.assigned_to=auth.uid()
 ) t;
 return result;
end $$;

create or replace function public.care_followup_staff()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
 if not care_private.has_role(array['administrator','editor']) then raise exception 'Not authorized' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'display_name',display_name,'role',role) order by display_name),'[]'::jsonb)
 into result from public.care_staff where is_active and role in ('followup_worker','editor','administrator');
 return result;
end $$;

create or replace function public.care_followup_assign(p_member_id uuid,p_worker uuid,p_due_at timestamptz,p_summary text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
 if not care_private.has_role(array['administrator','editor']) then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_due_at is null or p_due_at < now() - interval '1 day' or length(coalesce(p_summary,''))>1000 then
  raise exception 'Invalid assignment' using errcode='22023'; end if;
 if not exists(select 1 from public.care_staff where user_id=p_worker and is_active and role in ('followup_worker','editor','administrator')) then
  raise exception 'Worker unavailable' using errcode='22023'; end if;
 if not exists(select 1 from public.care_members m join public.care_preferences cp on cp.member_id=m.id
  where m.id=p_member_id and m.archived_at is null and cp.contact_consent=true) then
  raise exception 'Visitor missing or follow-up consent not granted' using errcode='22023'; end if;
 insert into public.care_followups(member_id,assigned_to,assigned_by,due_at,summary)
 values(p_member_id,p_worker,auth.uid(),p_due_at,coalesce(btrim(p_summary),'')) returning id into result;
 return result;
end $$;

create or replace function public.care_followup_record(p_followup_id uuid,p_method text,p_outcome text,p_note text,p_complete boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare f public.care_followups; result uuid; actor_role text; prefs public.care_preferences;
begin
 select role into actor_role from public.care_staff where user_id=auth.uid() and is_active;
 select * into f from public.care_followups where id=p_followup_id for update;
 if not found or (actor_role not in ('administrator','editor') and (actor_role!='followup_worker' or f.assigned_to!=auth.uid())) then
  raise exception 'Not authorized' using errcode='42501'; end if;
 if f.status in ('completed','cancelled') then raise exception 'Assignment is closed' using errcode='22023'; end if;
 if p_method not in ('phone','whatsapp','sms','email','in_person','other') or
    p_outcome not in ('reached','no_answer','requested_callback','declined','other') or
    length(btrim(coalesce(p_note,''))) not between 1 and 2000 then
  raise exception 'Invalid follow-up activity' using errcode='22023'; end if;
 select * into prefs from public.care_preferences where member_id=f.member_id;
 if not coalesce(prefs.contact_consent,false) then raise exception 'Contact consent not granted' using errcode='22023'; end if;
 if p_method='sms' and not coalesce(prefs.sms_opt_in,false) then raise exception 'SMS consent not granted' using errcode='22023'; end if;
 if p_method='email' and not coalesce(prefs.email_opt_in,false) then raise exception 'Email consent not granted' using errcode='22023'; end if;
 insert into public.care_followup_activities(followup_id,author_id,method,outcome,note)
 values(p_followup_id,auth.uid(),p_method,p_outcome,btrim(p_note)) returning id into result;
 update public.care_followups set status=case when p_complete then 'completed' else 'in_progress' end,updated_at=now() where id=f.id;
 return result;
end $$;

create or replace function public.care_followup_history(p_followup_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_role text; result jsonb;
begin
 select role into actor_role from public.care_staff where user_id=auth.uid() and is_active;
 if not exists(select 1 from public.care_followups where id=p_followup_id and
  (actor_role in ('administrator','editor') or (actor_role='followup_worker' and assigned_to=auth.uid()))) then
  raise exception 'Not authorized' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'method',a.method,'outcome',a.outcome,'note',a.note,'created_at',a.created_at,'author',s.display_name) order by a.created_at desc),'[]'::jsonb)
 into result from public.care_followup_activities a join public.care_staff s on s.user_id=a.author_id where a.followup_id=p_followup_id;
 return result;
end $$;

revoke all on function public.care_followup_list(),public.care_followup_staff(),public.care_followup_assign(uuid,uuid,timestamptz,text),public.care_followup_record(uuid,text,text,text,boolean),public.care_followup_history(uuid) from public,anon;
grant execute on function public.care_followup_list(),public.care_followup_staff(),public.care_followup_assign(uuid,uuid,timestamptz,text),public.care_followup_record(uuid,text,text,text,boolean),public.care_followup_history(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
