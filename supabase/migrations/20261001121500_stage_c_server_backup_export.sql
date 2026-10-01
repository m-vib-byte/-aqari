-- Stage C server-only backup helpers for the current AQARI project.
-- Raw database/Auth rows must never be exposed to browser roles.
create or replace function public.v267_stage_c_backup_catalog()
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare out jsonb:='[]'::jsonb; r record; n bigint;
begin
 if current_setting('role',true) is distinct from 'service_role' then
  raise insufficient_privilege using message='SERVER_ONLY';
 end if;
 for r in
  select n.nspname as schema_name,c.relname as table_name
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind='r'
    and ((n.nspname in('public','private') and left(c.relname,6)='aqari_') or n.nspname='auth')
  order by n.nspname,c.relname
 loop
  execute format('select count(*) from %I.%I',r.schema_name,r.table_name) into n;
  out:=out||jsonb_build_array(jsonb_build_object('schema',r.schema_name,'table',r.table_name,'rows',n));
 end loop;
 return jsonb_build_object(
  'tables',out,
  'migrations',coalesce((select jsonb_agg(to_jsonb(m) order by version)
    from supabase_migrations.schema_migrations m),'[]'::jsonb)
 );
end $$;

create or replace function public.v267_stage_c_backup_table(
 p_schema text,p_table text,p_offset integer default 0,p_limit integer default 500
)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare allowed boolean; rows jsonb;
begin
 if current_setting('role',true) is distinct from 'service_role' then
  raise insufficient_privilege using message='SERVER_ONLY';
 end if;
 if p_offset<0 or p_limit<1 or p_limit>1000 then
  raise invalid_parameter_value using message='INVALID_PAGE';
 end if;
 select exists(
  select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind='r' and n.nspname=p_schema and c.relname=p_table
    and ((n.nspname in('public','private') and left(c.relname,6)='aqari_') or n.nspname='auth')
 ) into allowed;
 if not allowed then raise insufficient_privilege using message='TABLE_NOT_ALLOWED'; end if;
 execute format(
  'select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from (select * from %I.%I order by ctid offset $1 limit $2) t',
  p_schema,p_table
 ) into rows using p_offset,p_limit;
 return jsonb_build_object('schema',p_schema,'table',p_table,'offset',p_offset,'rows',rows);
end $$;

revoke all on function public.v267_stage_c_backup_catalog() from public,anon,authenticated;
revoke all on function public.v267_stage_c_backup_table(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.v267_stage_c_backup_catalog() to service_role;
grant execute on function public.v267_stage_c_backup_table(text,text,integer,integer) to service_role;
