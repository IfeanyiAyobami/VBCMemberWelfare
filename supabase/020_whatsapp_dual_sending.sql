-- v3.9: dual WhatsApp sending. Apply after 019. No messages are sent by this SQL.
begin;
create table if not exists public.care_wa_campaigns(
 id uuid primary key default gen_random_uuid(),title text not null check(length(btrim(title)) between 3 and 100),
 body text not null check(length(body) between 5 and 2000),flyer text not null default '/whatsapp/sunday-invitation.jpg' check(flyer='/whatsapp/sunday-invitation.jpg'),
 template_name text check(template_name ~ '^[a-z0-9_]{1,100}$'),language text not null default 'en' check(language ~ '^[a-zA-Z_]{2,10}$'),
 active boolean not null default true,created_by uuid not null references public.care_staff(user_id),created_at timestamptz not null default now()
);
create table if not exists public.care_wa_permissions(
 member_id uuid primary key references public.care_journeys(member_id),allowed boolean not null,evidence text not null check(length(btrim(evidence)) between 5 and 1000),recorded_by uuid references public.care_staff(user_id),updated_at timestamptz not null default now()
);
create table if not exists public.care_wa_messages(
 id uuid primary key,member_id uuid not null references public.care_journeys(member_id),campaign_id uuid not null references public.care_wa_campaigns(id),actor uuid not null references public.care_staff(user_id),
 mode text not null check(mode in ('assisted','api')),body text not null check(length(body)<=2500),recipient text not null,
 state text not null check(state in ('opened','queued','sending','accepted','sent','delivered','read','failed','unknown','staff_sent','staff_replied','staff_unsent')),
 provider_id text unique,error_code text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),provider_at timestamptz,dispatched_at timestamptz,
 retry_allowed boolean not null default false,outcome text,note text check(length(note)<=2000),recorded_at timestamptz
);
drop index if exists public.care_wa_once_per_api_campaign;
create unique index care_wa_once_per_api_campaign on public.care_wa_messages(member_id,campaign_id) where mode='api' and not retry_allowed;
create index if not exists care_wa_message_person on public.care_wa_messages(member_id,created_at desc);
create table if not exists public.care_wa_replies(
 provider_id text primary key,member_id uuid not null references public.care_journeys(member_id),body text not null check(length(body)<=4000),received_at timestamptz not null,recorded_at timestamptz not null default now()
);
create table if not exists public.care_wa_events(
 id text primary key,member_id uuid references public.care_journeys(member_id),message_id uuid references public.care_wa_messages(id),action text not null,detail jsonb not null default '{}'::jsonb,recorded_at timestamptz not null default now()
);
alter table public.care_wa_events enable row level security;
revoke all on public.care_wa_events from public,anon,authenticated;
alter table public.care_wa_campaigns enable row level security;
alter table public.care_wa_permissions enable row level security;
alter table public.care_wa_messages enable row level security;
alter table public.care_wa_replies enable row level security;
revoke all on public.care_wa_campaigns,public.care_wa_permissions,public.care_wa_messages,public.care_wa_replies from public,anon,authenticated;
create or replace function care_private.wa_coordinator(p_actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.care_staff s where s.user_id=p_actor and s.is_active and (s.role='administrator' or exists(select 1 from public.care_journey_roles r where r.user_id=p_actor and r.capability='coordinator')))
$$;
create or replace function care_private.wa_access(p_actor uuid,p_member uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.care_journeys j join public.care_members m on m.id=j.member_id join public.care_staff s on s.user_id=p_actor and s.is_active where j.member_id=p_member and m.archived_at is null and (care_private.wa_coordinator(p_actor) or (j.assigned_to=p_actor and (s.role='followup_worker' or exists(select 1 from public.care_journey_roles r where r.user_id=p_actor and r.capability='friend')))))
$$;
create or replace function public.care_wa_read(p_member uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not care_private.wa_access(auth.uid(),p_member) then raise exception 'Assigned friend or Coordinator access required.' using errcode='42501';end if;
 return jsonb_build_object('actor',auth.uid(),'coordinator',care_private.wa_coordinator(auth.uid()),'permission',(select to_jsonb(x)-'recorded_by' from public.care_wa_permissions x where x.member_id=p_member),
 'contact_allowed',coalesce((select cp.contact_consent and j.followup_state='active' from public.care_preferences cp join public.care_journeys j using(member_id) where cp.member_id=p_member),false),
 'campaigns',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc) from public.care_wa_campaigns c where c.active),'[]'::jsonb),
 'messages',coalesce((select jsonb_agg(to_jsonb(x)-'recipient') from (select * from public.care_wa_messages where member_id=p_member order by created_at desc limit 50)x),'[]'::jsonb),
 'replies',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.care_wa_replies where member_id=p_member order by received_at desc limit 30)x),'[]'::jsonb));end$$;
create or replace function public.care_wa_campaign(p_title text,p_body text,p_template text default null,p_language text default 'en') returns uuid language plpgsql security definer set search_path='' as $$declare answer uuid;begin
 if not care_private.wa_coordinator(auth.uid()) then raise exception 'Coordinator access required.' using errcode='42501';end if;
 -- Body supports precisely one optional positional personalization, never arbitrary template parameters.
 if replace(p_body,'{{1}}','') ~ '\{\{|\}\}' or (length(p_body)-length(replace(p_body,'{{1}}','')))/5>1 then raise exception 'Use {{1}} once for the person name, or use plain text.' using errcode='22023';end if;
 insert into public.care_wa_campaigns(title,body,template_name,language,created_by) values(btrim(p_title),btrim(p_body),nullif(btrim(p_template),''),p_language,auth.uid()) returning id into answer;
 insert into public.care_journey_events(actor,action,detail) values(auth.uid(),'whatsapp_campaign_created',jsonb_build_object('campaign',answer));return answer;end$$;
create or replace function public.care_wa_permission(p_member uuid,p_allowed boolean,p_evidence text) returns void language plpgsql security definer set search_path='' as $$begin
 if not care_private.wa_access(auth.uid(),p_member) then raise exception 'Assigned friend or Coordinator access required.' using errcode='42501';end if;
 insert into public.care_wa_permissions(member_id,allowed,evidence,recorded_by) values(p_member,p_allowed,p_evidence,auth.uid()) on conflict(member_id) do update set allowed=excluded.allowed,evidence=excluded.evidence,recorded_by=excluded.recorded_by,updated_at=now();
 insert into public.care_journey_events(member_id,actor,action,detail) values(p_member,auth.uid(),'whatsapp_permission',jsonb_build_object('allowed',p_allowed,'evidence',p_evidence));end$$;
create or replace function public.care_wa_prepare(p_member uuid,p_campaign uuid,p_mode text,p_body text,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.care_wa_campaigns;m public.care_wa_messages;phone_value text;name_value text;begin
 if not care_private.wa_access(auth.uid(),p_member) or (p_mode='api' and not care_private.wa_coordinator(auth.uid())) then raise exception 'This sending method is outside your access.' using errcode='42501';end if;
 if p_request is null or p_mode not in ('assisted','api') then raise exception 'Invalid invitation.' using errcode='22023';end if;
 if not exists(select 1 from public.care_preferences cp join public.care_journeys j using(member_id) where cp.member_id=p_member and cp.contact_consent and j.followup_state='active') or exists(select 1 from public.care_wa_permissions where member_id=p_member and not allowed) then raise exception 'WhatsApp outreach is paused or opted out.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,20020));
 select * into m from public.care_wa_messages where id=p_request;
 if found then
 if m.actor<>auth.uid() or m.member_id<>p_member or m.campaign_id<>p_campaign or m.mode<>p_mode or (p_mode='assisted' and m.body is distinct from p_body) then raise exception 'Request identifier reused with different details.' using errcode='22023';end if;
 return jsonb_build_object('id',m.id,'body',m.body,'recipient',m.recipient,'state',m.state,'replayed',true);end if;
 if not exists(select 1 from public.care_preferences cp join public.care_journeys j using(member_id) where cp.member_id=p_member and cp.contact_consent and j.followup_state='active') or exists(select 1 from public.care_wa_permissions where member_id=p_member and not allowed) then raise exception 'WhatsApp outreach is paused or opted out.' using errcode='22023';end if;
 if p_mode='api' and not exists(select 1 from public.care_wa_permissions where member_id=p_member and allowed) then raise exception 'Record explicit WhatsApp permission before API sending.' using errcode='22023';end if;
 select * into c from public.care_wa_campaigns where id=p_campaign and active;
 if not found or (p_mode='api' and c.template_name is null) then raise exception 'Choose an active invitation configured for this sending method.' using errcode='22023';end if;
 select care_private.normalize_phone(coalesce(nullif(btrim(whatsapp),''),phone)),other_names||' '||surname into phone_value,name_value from public.care_members where id=p_member;
 if phone_value is null or phone_value !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'A valid international WhatsApp or phone number is required.' using errcode='22023';end if;
 if p_mode='assisted' and (p_body is null or length(btrim(p_body)) not between 5 and 2500) then raise exception 'Enter the invitation text.' using errcode='22023';end if;
 insert into public.care_wa_messages(id,member_id,campaign_id,actor,mode,body,recipient,state) values(p_request,p_member,p_campaign,auth.uid(),p_mode,case when p_mode='api' then replace(c.body,'{{1}}',name_value) else p_body end,phone_value,case when p_mode='api' then 'queued' else 'opened' end) returning * into m;
 insert into public.care_journey_events(member_id,actor,action,detail) values(p_member,auth.uid(),'whatsapp_prepared',jsonb_build_object('message',m.id,'mode',p_mode,'campaign',c.id));
 return jsonb_build_object('id',m.id,'body',m.body,'recipient',m.recipient,'state',m.state,'replayed',false);end$$;
create or replace function public.care_wa_record(p_message uuid,p_outcome text,p_note text,p_next timestamptz default null) returns void language plpgsql security definer set search_path='' as $$declare m public.care_wa_messages;begin
 select * into m from public.care_wa_messages where id=p_message for update;
 if not found or not care_private.wa_access(auth.uid(),m.member_id) or (m.actor<>auth.uid() and not care_private.wa_coordinator(auth.uid())) then raise exception 'Invitation activity access required.' using errcode='42501';end if;
 if p_outcome not in ('sent','replied','unsent') or p_note is null or length(btrim(p_note)) not between 3 and 2000 or (p_next is not null and p_next<=now()) then raise exception 'Record an outcome, note and a future next-contact date if needed.' using errcode='22023';end if;
 if m.recorded_at is not null then
 if m.outcome=p_outcome and m.note=p_note then return;end if;
 raise exception 'This activity is already recorded. Add a new care activity for later developments.' using errcode='22023';end if;
 update public.care_wa_messages set outcome=p_outcome,note=p_note,recorded_at=now(),updated_at=now(),state=case when mode='assisted' then 'staff_'||p_outcome else state end where id=p_message;
 insert into public.care_journey_contacts(member_id,actor,occurred_at,method,outcome,successful,note) values(m.member_id,auth.uid(),now(),'whatsapp',case when p_outcome='replied' then 'positive' when p_outcome='unsent' then 'unreachable' else 'no_answer' end,p_outcome='replied','Staff-reported WhatsApp '||p_outcome||': '||p_note);
 if p_next is not null and exists(select 1 from public.care_preferences cp join public.care_journeys j using(member_id) where cp.member_id=m.member_id and cp.contact_consent and j.followup_state='active') and not exists(select 1 from public.care_wa_permissions where member_id=m.member_id and not allowed) then insert into public.care_journey_tasks(member_id,due_at,kind,note) values(m.member_id,p_next,'followup',left(p_note,1000));end if;
 update public.care_journeys set version=version+1,updated_at=now() where member_id=m.member_id;
 insert into public.care_journey_events(member_id,actor,action,detail) values(m.member_id,auth.uid(),'whatsapp_staff_outcome',jsonb_build_object('message',m.id,'outcome',p_outcome,'note',p_note));end$$;
-- Service-only claim. Exactly one HTTP caller obtains the right to send; uncertain sends are never retried automatically.
create or replace function public.care_wa_claim(p_message uuid,p_daily_limit integer default 100) returns jsonb language plpgsql security definer set search_path='' as $$declare m public.care_wa_messages;c public.care_wa_campaigns;n text;current_phone text;begin
 select * into m from public.care_wa_messages where id=p_message and mode='api' for update;
 if not found then return null;end if;
 if m.state<>'queued' then return null;end if;
 if p_daily_limit not between 1 and 10000 then raise exception 'Invalid daily limit.';end if;
 perform pg_advisory_xact_lock(20020,1);
 if (select count(*) from public.care_wa_messages where dispatched_at>=(date_trunc('day',now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos'))>=p_daily_limit then update public.care_wa_messages set state='failed',retry_allowed=true,error_code='daily_limit_reached' where id=m.id;return null;end if;
 if not care_private.wa_access(m.actor,m.member_id) or not care_private.wa_coordinator(m.actor)
 or not exists(select 1 from public.care_preferences cp join public.care_journeys j using(member_id) where cp.member_id=m.member_id and cp.contact_consent and j.followup_state='active')
 or not exists(select 1 from public.care_wa_permissions where member_id=m.member_id and allowed) then update public.care_wa_messages set state='failed',retry_allowed=true,error_code='permission_changed' where id=m.id;return null;end if;
 select * into c from public.care_wa_campaigns where id=m.campaign_id and active;
 if not found then update public.care_wa_messages set state='failed',retry_allowed=true,error_code='campaign_inactive' where id=m.id;return null;end if;
 select other_names||' '||surname,care_private.normalize_phone(coalesce(nullif(btrim(whatsapp),''),phone)) into n,current_phone from public.care_members where id=m.member_id;
 if current_phone is distinct from m.recipient or replace(c.body,'{{1}}',n)<>m.body then update public.care_wa_messages set state='failed',retry_allowed=true,error_code='identity_changed' where id=m.id;return null;end if;
 update public.care_wa_messages set state='sending',dispatched_at=now(),updated_at=now() where id=m.id;
 return jsonb_build_object('id',m.id,'recipient',m.recipient,'name',n,'body',m.body,'template',c.template_name,'language',c.language,'templateBody',c.body,'flyer',c.flyer);end$$;
create or replace function public.care_wa_finish(p_message uuid,p_state text,p_provider text default null,p_error text default null) returns void language plpgsql security definer set search_path='' as $$begin
 if p_state not in ('accepted','failed','unknown') then raise exception 'Invalid result.';end if;
 update public.care_wa_messages set state=p_state,retry_allowed=p_state='failed',provider_id=coalesce(provider_id,p_provider),error_code=left(p_error,150),updated_at=now() where id=p_message and mode='api' and state='sending';
 -- A webhook can arrive before this request returns; do not regress its status.
 update public.care_wa_messages set provider_id=p_provider where id=p_message and provider_id is null and p_provider is not null;
end$$;
create or replace function public.care_wa_webhook(p_statuses jsonb,p_replies jsonb) returns void language plpgsql security definer set search_path='' as $$
declare x jsonb;m public.care_wa_messages;person uuid;newstate text;stamp timestamptz;begin
 if jsonb_typeof(p_statuses)<>'array' or jsonb_typeof(p_replies)<>'array' or jsonb_array_length(p_statuses)>500 or jsonb_array_length(p_replies)>500 then raise exception 'Invalid event batch.';end if;
 for x in select * from jsonb_array_elements(p_statuses) loop
  newstate:=x->>'status';if newstate not in ('sent','delivered','read','failed') then continue;end if;
  select * into m from public.care_wa_messages where mode='api' and (provider_id=x->>'id' or (id::text=x->>'callback' and provider_id is null)) limit 1 for update;
  if not found or regexp_replace(m.recipient,'[^0-9]','','g') is distinct from x->>'recipient' then continue;end if;
  stamp:=to_timestamp((x->>'timestamp')::double precision);
  -- Duplicate/out-of-order notifications never downgrade read/delivered evidence.
  if (newstate='failed' and m.state in ('delivered','read')) or (newstate='sent' and m.state in ('delivered','read')) or (newstate='delivered' and m.state='read') or (m.provider_at is not null and stamp<m.provider_at and newstate not in ('delivered','read')) then continue;end if;
  insert into public.care_wa_events(id,member_id,message_id,action,detail) values((x->>'id')||':'||newstate||':'||(x->>'timestamp'),m.member_id,m.id,'provider_status',jsonb_build_object('status',newstate,'timestamp',x->>'timestamp','error',x->>'error')) on conflict do nothing;
  update public.care_wa_messages set provider_id=x->>'id',state=newstate,retry_allowed=false,provider_at=stamp,error_code=case when newstate='failed' then left(x->>'error',150) else null end,updated_at=now() where id=m.id;
 end loop;
 for x in select * from jsonb_array_elements(p_replies) loop
  -- Match only one known central recipient; ambiguous shared numbers are not assigned by guesswork.
  select case when count(distinct wm.member_id)=1 then (array_agg(distinct wm.member_id))[1] end into person from public.care_wa_messages wm join public.care_members cm on cm.id=wm.member_id where regexp_replace(wm.recipient,'[^0-9]','','g')=x->>'from' and wm.mode='api' and regexp_replace(coalesce(nullif(btrim(cm.whatsapp),''),cm.phone),'[^0-9]','','g')=x->>'from';
  if person is null then
   if upper(btrim(x->>'body')) in ('STOP','UNSUBSCRIBE','CANCEL') then
    insert into public.care_wa_permissions(member_id,allowed,evidence)
    select distinct wm.member_id,false,'Recipient WhatsApp opt-out on shared number' from public.care_wa_messages wm join public.care_members cm on cm.id=wm.member_id where wm.mode='api' and regexp_replace(wm.recipient,'[^0-9]','','g')=x->>'from' and regexp_replace(coalesce(nullif(btrim(cm.whatsapp),''),cm.phone),'[^0-9]','','g')=x->>'from'
    on conflict(member_id) do update set allowed=false,evidence=excluded.evidence,recorded_by=null,updated_at=now();
    insert into public.care_wa_events(id,action,detail) values((x->>'id')||':shared-optout','shared_number_opt_out',jsonb_build_object('source','verified_meta_webhook')) on conflict do nothing;
   end if;
   continue;
  end if;
  insert into public.care_wa_replies(provider_id,member_id,body,received_at) values(x->>'id',person,left(x->>'body',4000),to_timestamp((x->>'timestamp')::double precision)) on conflict do nothing;
  if found and upper(btrim(x->>'body')) in ('STOP','UNSUBSCRIBE','CANCEL') then
   insert into public.care_wa_permissions(member_id,allowed,evidence) values(person,false,'Recipient WhatsApp opt-out') on conflict(member_id) do update set allowed=false,evidence='Recipient WhatsApp opt-out',recorded_by=null,updated_at=now();
   insert into public.care_wa_events(id,member_id,action,detail) values((x->>'id')||':optout',person,'recipient_opt_out',jsonb_build_object('provider_id',x->>'id','source','verified_meta_webhook')) on conflict do nothing;
  end if;
 end loop;
end$$;
create or replace function public.care_wa_dispatch_allowed(p_message uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.care_wa_messages x join public.care_members m on m.id=x.member_id join public.care_journeys j on j.member_id=m.id join public.care_preferences cp on cp.member_id=m.id join public.care_wa_permissions wp on wp.member_id=m.id join public.care_wa_campaigns c on c.id=x.campaign_id where x.id=p_message and x.state='sending' and c.active and care_private.wa_access(x.actor,x.member_id) and care_private.wa_coordinator(x.actor) and cp.contact_consent and j.followup_state='active' and wp.allowed and care_private.normalize_phone(coalesce(nullif(btrim(m.whatsapp),''),m.phone))=x.recipient and replace(c.body,'{{1}}',m.other_names||' '||m.surname)=x.body)
$$;
revoke all on function public.care_wa_dispatch_allowed(uuid) from public,anon,authenticated;
grant execute on function public.care_wa_dispatch_allowed(uuid) to service_role;
revoke all on function care_private.wa_coordinator(uuid),care_private.wa_access(uuid,uuid) from public,anon,authenticated;
revoke all on function public.care_wa_read(uuid),public.care_wa_campaign(text,text,text,text),public.care_wa_permission(uuid,boolean,text),public.care_wa_prepare(uuid,uuid,text,text,uuid),public.care_wa_record(uuid,text,text,timestamptz) from public,anon;
grant execute on function public.care_wa_read(uuid),public.care_wa_campaign(text,text,text,text),public.care_wa_permission(uuid,boolean,text),public.care_wa_prepare(uuid,uuid,text,text,uuid),public.care_wa_record(uuid,text,text,timestamptz) to authenticated;
revoke all on function public.care_wa_claim(uuid,integer),public.care_wa_finish(uuid,text,text,text),public.care_wa_webhook(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.care_wa_claim(uuid,integer),public.care_wa_finish(uuid,text,text,text),public.care_wa_webhook(jsonb,jsonb) to service_role;
commit;
