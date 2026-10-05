-- Read-only application DDL catalog. No business rows, credentials, or sequence values.
-- Auth/Storage services and their data are deliberately excluded.
with app_rel as (
 select c.*,n.nspname as schema_name from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','private') and c.relname like 'aqari_%'
), app_fn as (
 select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and p.proname like 'aqari_%' and p.prokind='f'
)
select jsonb_build_object(
 'source','Production application schema only; no rows, secrets, Storage bytes or sequence current values; Auth/Storage services excluded',
 'enums',(select coalesce(jsonb_agg(x),'[]') from (select n.nspname as schema,t.typname as name,array_agg(e.enumlabel order by e.enumsortorder) as values from pg_type t join pg_namespace n on n.oid=t.typnamespace join pg_enum e on e.enumtypid=t.oid where n.nspname in ('public','private') group by n.nspname,t.typname) x),
 'tables',(select coalesce(jsonb_agg(x),'[]') from (select c.schema_name as schema,c.relname as name,c.relkind as kind,c.relrowsecurity as rls,c.relforcerowsecurity as force_rls,c.relacl::text as acl,pg_get_userbyid(c.relowner) as owner,
 (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'identity',a.attidentity,'generated',a.attgenerated,'not_null',a.attnotnull,'expression',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns from app_rel c where c.relkind in ('r','p') order by c.schema_name,c.relname) x),
 'functions',(select coalesce(jsonb_agg(x),'[]') from (select oid::regprocedure::text as signature,pg_get_functiondef(oid) as definition,proacl::text as acl,pg_get_userbyid(proowner) as owner from app_fn order by oid::regprocedure::text) x),
 'constraints',(select coalesce(jsonb_agg(x),'[]') from (select con.conname as name,con.contype as type,format('%I.%I',c.schema_name,c.relname) as table,pg_get_constraintdef(con.oid) as definition from pg_constraint con join app_rel c on c.oid=con.conrelid order by con.oid) x),
 'indexes',(select coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid)),'[]') from pg_index i join app_rel c on c.oid=i.indrelid where not exists(select 1 from pg_constraint k where k.conindid=i.indexrelid)),
 'policies',(select coalesce(jsonb_agg(x),'[]') from (select p.schemaname as schema,p.tablename as table,p.policyname as name,p.permissive,p.roles,p.cmd,p.qual,p.with_check from pg_policies p where p.schemaname in ('public','private') and p.tablename like 'aqari_%') x),
 'triggers',(select coalesce(jsonb_agg(pg_get_triggerdef(t.oid)),'[]') from pg_trigger t join pg_proc p on p.oid=t.tgfoid where not t.tgisinternal and p.oid in(select oid from app_fn)),
 'views',(select coalesce(jsonb_agg(jsonb_build_object('schema',schema_name,'name',relname,'definition',pg_get_viewdef(oid,true),'acl',relacl::text,'options',reloptions)),'[]') from app_rel where relkind='v'),
 'sequences',(select coalesce(jsonb_agg(x),'[]') from (select c.schema_name as schema,c.relname as name,c.relacl::text as acl,exists(select 1 from pg_depend d where d.objid=c.oid and d.deptype='i') as identity from app_rel c where c.relkind='S') x),
 'column_acl',(select coalesce(jsonb_agg(jsonb_build_object('table',format('%I.%I',c.schema_name,c.relname),'column',a.attname,'acl',a.attacl::text)),'[]') from pg_attribute a join app_rel c on c.oid=a.attrelid where a.attnum>0 and not a.attisdropped and a.attacl is not null)
) as catalog;
