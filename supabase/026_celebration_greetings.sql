-- VBC Member Care v4.4 — celebration greetings sent from a staff member's own phone.
-- Records who greeted whom, for which birthday/anniversary year, and how.
-- No message content is stored. Safe to rerun.

create table if not exists public.care_celebration_greetings (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.care_members(id) on delete restrict,
  occasion text not null check (occasion in ('birthday', 'anniversary')),
  occasion_year integer not null check (occasion_year between 2020 and 2200),
  channel text not null check (channel in ('whatsapp', 'phone', 'sms', 'in_person', 'other')),
  greeted_by uuid not null references auth.users(id),
  greeted_by_name text not null,
  greeted_at timestamptz not null default now(),
  unique (member_id, occasion, occasion_year)
);

create index if not exists care_celebration_greetings_year_idx
  on public.care_celebration_greetings (occasion_year);

-- The greeter is always the signed-in staff member, named from care_staff.
create or replace function care_private.celebration_greeting_stamp()
returns trigger language plpgsql security definer set search_path = '' as $$
declare staff_name text;
begin
  select display_name into staff_name
    from public.care_staff
   where user_id = auth.uid() and is_active;
  if staff_name is null then
    raise exception 'Active staff access is required.' using errcode = '42501';
  end if;
  new.greeted_by := auth.uid();
  new.greeted_by_name := staff_name;
  new.greeted_at := now();
  return new;
end $$;

drop trigger if exists care_celebration_greeting_stamp on public.care_celebration_greetings;
create trigger care_celebration_greeting_stamp
  before insert on public.care_celebration_greetings
  for each row execute function care_private.celebration_greeting_stamp();

alter table public.care_celebration_greetings enable row level security;

drop policy if exists care_celebration_greetings_read on public.care_celebration_greetings;
create policy care_celebration_greetings_read on public.care_celebration_greetings
  for select to authenticated
  using (care_private.has_role(array['administrator', 'editor', 'viewer']));

drop policy if exists care_celebration_greetings_insert on public.care_celebration_greetings;
create policy care_celebration_greetings_insert on public.care_celebration_greetings
  for insert to authenticated
  with check (
    care_private.has_role(array['administrator', 'editor'])
    and exists (
      select 1 from public.care_members m
       where m.id = member_id and m.archived_at is null
    )
  );

revoke all on public.care_celebration_greetings from anon;
grant select, insert on public.care_celebration_greetings to authenticated;
