-- READ ONLY. Run in the existing VBCMemberWelfare SQL Editor before and after
-- migration. This reports structure and privileges, never visitor data/secrets.
select current_database() as database_name;
select table_name, column_name, data_type
from information_schema.columns
where table_schema='public' and table_name in ('care_guest_submissions','care_members','care_staff','care_preferences')
order by table_name,ordinal_position;
select c.relname as table_name,c.relrowsecurity as rls_enabled
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('care_guest_submissions','care_members','care_staff','care_preferences');
select indexname,indexdef from pg_catalog.pg_indexes
where schemaname='public' and tablename='care_guest_submissions';
select to_regprocedure('public.care_record_guest(uuid,jsonb,text)') is not null as guest_record_ready,
 to_regprocedure('public.care_review_guest(uuid,timestamptz,text,uuid,timestamptz,text,boolean)') is not null as guest_review_ready,
 to_regprocedure('public.care_ingest_wordpress_gateway(uuid,jsonb,text,text,text)') is not null as gateway_ready;
select p.proname,
 has_function_privilege('service_role',p.oid,'EXECUTE') as service_can_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as staff_can_execute,
 has_function_privilege('anon',p.oid,'EXECUTE') as anonymous_can_execute
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='care_ingest_wordpress_gateway';
