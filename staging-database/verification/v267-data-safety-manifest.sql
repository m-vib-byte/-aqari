-- AQARI V267 data-safety verification manifest.
-- Read-only except for transaction-local TEMP tables. It does NOT create a backup.
-- Run immediately before a backup and after an independent restore. Business-row,
-- database-structure and safe Auth/Storage metadata fingerprints must match.
-- Storage metadata/config fingerprints do NOT replace byte-for-byte object backup and hash comparison.
begin;
create temp table v267_manifest_rows(
  schema_name text not null,
  table_name text not null,
  row_count bigint not null,
  content_sha256 text not null,
  primary key(schema_name,table_name)
) on commit drop;

do $$
declare r record; q text; n bigint; h text;
begin
  for r in
    select n.nspname schema_name,c.relname table_name
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind='r' and n.nspname in('public','private') and c.relname like 'aqari\_%' escape '\'
    order by n.nspname,c.relname
  loop
    q:=format($sql$
      select count(*)::bigint,
             encode(digest(coalesce(string_agg(row_hash,'' order by row_hash),''),'sha256'),'hex')
      from (
        select encode(digest(to_jsonb(t)::text,'sha256'),'hex') row_hash
        from %I.%I t
      ) x
    $sql$,r.schema_name,r.table_name);
    execute q into n,h;
    insert into v267_manifest_rows values(r.schema_name,r.table_name,n,h);
  end loop;
end $$;

with
business_array as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'schema',schema_name,'table',table_name,'rows',row_count,'sha256',content_sha256
  ) order by schema_name,table_name),'[]'::jsonb) value
  from v267_manifest_rows
),
business as (
  select jsonb_build_object(
    'table_count',(select count(*) from v267_manifest_rows),
    'row_count',(select coalesce(sum(row_count),0) from v267_manifest_rows),
    'sha256',encode(digest(value::text,'sha256'),'hex'),
    'tables',value
  ) value from business_array
),
schema_columns as (
  select count(*)::bigint rows,
         encode(digest(coalesce(string_agg(h,'' order by h),''),'sha256'),'hex') sha256
  from (
    select encode(digest(jsonb_build_object(
      'schema',table_schema,'table',table_name,'ordinal',ordinal_position,'name',column_name,
      'data_type',data_type,'udt_schema',udt_schema,'udt_name',udt_name,'nullable',is_nullable,
      'default',column_default,'generated',is_generated,'identity',is_identity
    )::text,'sha256'),'hex') h
    from information_schema.columns
    where table_schema in('public','private') and table_name like 'aqari\_%' escape '\'
  ) q
),
schema_constraints as (
  select count(*)::bigint rows,
         encode(digest(coalesce(string_agg(h,'' order by h),''),'sha256'),'hex') sha256
  from (
    select encode(digest(jsonb_build_object(
      'schema',n.nspname,'table',c.relname,'name',con.conname,'type',con.contype,
      'definition',pg_get_constraintdef(con.oid,true)
    )::text,'sha256'),'hex') h
    from pg_constraint con
    join pg_class c on c.oid=con.conrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in('public','private') and c.relname like 'aqari\_%' escape '\'
  ) q
),
schema_indexes as (
  select count(*)::bigint rows,
         encode(digest(coalesce(string_agg(h,'' order by h),''),'sha256'),'hex') sha256
  from (
    select encode(digest(jsonb_build_object(
      'schema',schemaname,'table',tablename,'name',indexname,'definition',indexdef
    )::text,'sha256'),'hex') h
    from pg_indexes
    where schemaname in('public','private') and tablename like 'aqari\_%' escape '\'
  ) q
),
schema_functions as (
  select count(*)::bigint rows,
         encode(digest(coalesce(string_agg(h,'' order by h),''),'sha256'),'hex') sha256
  from (
    select encode(digest(jsonb_build_object(
      'schema',n.nspname,'name',p.proname,'kind',p.prokind,
      'identity_args',pg_get_function_identity_arguments(p.oid),
      'definition',pg_get_functiondef(p.oid)
    )::text,'sha256'),'hex') h
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in('public','private') and p.proname like 'aqari\_%' escape '\'
  ) q
),
schema_triggers as (
  select count(*)::bigint rows,
         encode(digest(coalesce(string_agg(h,'' order by h),''),'sha256'),'hex') sha256
  from (
    select encode(digest(jsonb_build_object(
      'schema',n.nspname,'table',c.relname,'name',t.tgname,
      'definition',pg_get_triggerdef(t.oid,true)
    )::text,'sha256'),'hex') h
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and n.nspname in('public','private') and c.relname like 'aqari\_%' escape '\'
  ) q
),
schema_safe as (
  select jsonb_build_object(
    'columns',jsonb_build_object('rows',schema_columns.rows,'sha256',schema_columns.sha256),
    'constraints',jsonb_build_object('rows',schema_constraints.rows,'sha256',schema_constraints.sha256),
    'indexes',jsonb_build_object('rows',schema_indexes.rows,'sha256',schema_indexes.sha256),
    'functions',jsonb_build_object('rows',schema_functions.rows,'sha256',schema_functions.sha256),
    'triggers',jsonb_build_object('rows',schema_triggers.rows,'sha256',schema_triggers.sha256)
  ) value
  from schema_columns,schema_constraints,schema_indexes,schema_functions,schema_triggers
),
auth_safe as (
  select jsonb_build_object(
    'users',jsonb_build_object(
      'rows',(select count(*) from auth.users),
      'sha256',(select encode(digest(coalesce(string_agg(h,'' order by h),''),'sha256'),'hex') from (
        select encode(digest(jsonb_build_object(
          'id',id,'email',lower(coalesce(email,'')),'phone',coalesce(phone,''),
          'email_confirmed_at',email_confirmed_at,'phone_confirmed_at',phone_confirmed_at,
          'banned_until',banned_until,'deleted_at',deleted_at,'is_sso_user',is_sso_user,'is_anonymous',is_anonymous
        )::text,'sha256'),'hex') h from auth.users
      )q)
    ),
    'identities',jsonb_build_object(
      'rows',(select count(*) from auth.identities),
      'sha256',(select encode(digest(coalesce(string_agg(h,'' order by h),''),'sha256'),'hex') from (
        select encode(digest(jsonb_build_object('id',id,'user_id',user_id,'provider',provider,'provider_id',provider_id,'email',lower(coalesce(email,'')))::text,'sha256'),'hex') h
        from auth.identities
      )q)
    ),
    'mfa_factors',jsonb_build_object(
      'rows',(select count(*) from auth.mfa_factors),
      'sha256',(select encode(digest(coalesce(string_agg(h,'' order by h),''),'sha256'),'hex') from (
        select encode(digest(jsonb_build_object('id',id,'user_id',user_id,'friendly_name',coalesce(friendly_name,''),'factor_type',factor_type::text,'status',status::text,'phone',coalesce(phone,''))::text,'sha256'),'hex') h
        from auth.mfa_factors
      )q)
    ),
    'sessions',jsonb_build_object(
      'rows',(select count(*) from auth.sessions),
      'sha256',(select encode(digest(coalesce(string_agg(h,'' order by h),''),'sha256'),'hex') from (
        select encode(digest(jsonb_build_object('id',id,'user_id',user_id,'aal',aal,'not_after',not_after)::text,'sha256'),'hex') h
        from auth.sessions
      )q)
    )
  ) value
),
storage_safe as (
  select jsonb_build_object(
    'objects',(select count(*) from storage.objects),
    'buckets',(select count(*) from storage.buckets),
    'metadata_sha256',(select encode(digest(coalesce(string_agg(h,'' order by h),''),'sha256'),'hex') from (
      select encode(digest(jsonb_build_object(
        'id',id,'bucket_id',bucket_id,'name',name,'version',coalesce(version,''),
        'metadata',coalesce(metadata,'{}'::jsonb),'archived_at',archived_at,
        'is_delete_marker',coalesce(is_delete_marker,false),'is_versioned',coalesce(is_versioned,false)
      )::text,'sha256'),'hex') h from storage.objects
    )q),
    'bucket_config_sha256',(select encode(digest(coalesce(string_agg(h,'' order by h),''),'sha256'),'hex') from (
      select encode(digest(to_jsonb(b)::text,'sha256'),'hex') h from storage.buckets b
    )q),
    'bytes_reported',coalesce((select sum(case when coalesce(metadata->>'size','')~'^[0-9]+$' then (metadata->>'size')::bigint else 0 end) from storage.objects),0)
  ) value
)
select jsonb_pretty(jsonb_build_object(
  'format','AQARI-V267-DATA-SAFETY-MANIFEST-2',
  'generated_at',statement_timestamp(),
  'business',business.value,
  'schema_safe',schema_safe.value,
  'auth_safe',auth_safe.value,
  'storage_safe',storage_safe.value,
  'warning','This manifest verifies canonical business data, database structure and safe Auth/Storage metadata only. It is not a backup and Storage acceptance still requires original object bytes plus byte-for-byte restore hashes.'
)) as v267_data_safety_manifest
from business,schema_safe,auth_safe,storage_safe;
rollback;
