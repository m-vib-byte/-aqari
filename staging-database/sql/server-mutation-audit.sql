-- AQARI V267 Preview/Staging only.
-- G07-01: server-side immutable audit for core business mutations without copying sensitive row contents.

begin;

create table if not exists private.aqari_server_mutation_audit(
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  entity_schema text not null,
  entity_table text not null,
  entity_id text not null,
  operation text not null check(operation in ('INSERT','UPDATE','DELETE')),
  actor_id uuid,
  actor_name text not null,
  actor_role text,
  actor_kind text not null check(actor_kind in ('authenticated','system')),
  changed_fields jsonb not null default '[]'::jsonb check(jsonb_typeof(changed_fields)='array'),
  before_sha256 text check(before_sha256 is null or before_sha256 ~ '^[a-f0-9]{64}$'),
  after_sha256 text check(after_sha256 is null or after_sha256 ~ '^[a-f0-9]{64}$'),
  transaction_id bigint not null default txid_current(),
  recorded_at timestamptz not null default now()
);
create index if not exists aqari_server_mutation_audit_scope
  on private.aqari_server_mutation_audit(workspace_id,recorded_at desc,id desc);
alter table private.aqari_server_mutation_audit enable row level security;
revoke all on private.aqari_server_mutation_audit from public,anon,authenticated,service_role;
drop trigger if exists aqari_server_mutation_audit_immutable on private.aqari_server_mutation_audit;
create trigger aqari_server_mutation_audit_immutable before update or delete on private.aqari_server_mutation_audit
for each row execute function private.aqari_reject_immutable_change();

create or replace function private.aqari_server_mutation_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  before_j jsonb:=case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  after_j jsonb:=case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  row_j jsonb:=coalesce(after_j,before_j);
  w uuid;
  entity text;
  actor uuid:=auth.uid();
  actor_name_value text;
  actor_role_value text;
  changes jsonb:='[]'::jsonb;
  before_hash text;
  after_hash text;
begin
  if coalesce(row_j->>'workspace_id','')='' then return coalesce(new,old); end if;
  w:=(row_j->>'workspace_id')::uuid;
  before_hash:=case when before_j is null then null else encode(sha256(convert_to(before_j::text,'UTF8')),'hex') end;
  after_hash:=case when after_j is null then null else encode(sha256(convert_to(after_j::text,'UTF8')),'hex') end;
  entity:=coalesce(nullif(row_j->>'id',''),nullif(row_j->>'user_id',''),nullif(row_j->>'document_no',''),nullif(row_j->>'external_ref',''),nullif(row_j->>'reference',''),'hash:'||substr(coalesce(after_hash,before_hash),1,24));
  if tg_op='UPDATE' then
    select coalesce(jsonb_agg(k order by k),'[]'::jsonb) into changes
    from (
      select key k from jsonb_object_keys(coalesce(before_j,'{}'::jsonb)) key
      union
      select key k from jsonb_object_keys(coalesce(after_j,'{}'::jsonb)) key
    ) q
    where before_j->q.k is distinct from after_j->q.k;
  end if;
  if actor is null then
    actor_name_value:='system';actor_role_value:=null;
  else
    select coalesce(nullif(p.display_name,''),actor::text) into actor_name_value from public.aqari_profiles p where p.user_id=actor;
    actor_name_value:=coalesce(actor_name_value,actor::text);
    select m.role::text into actor_role_value from public.aqari_memberships m where m.workspace_id=w and m.user_id=actor and m.is_active limit 1;
  end if;
  insert into private.aqari_server_mutation_audit(
    workspace_id,entity_schema,entity_table,entity_id,operation,actor_id,actor_name,actor_role,actor_kind,changed_fields,before_sha256,after_sha256
  ) values(
    w,tg_table_schema,tg_table_name,entity,tg_op,actor,actor_name_value,actor_role_value,case when actor is null then 'system' else 'authenticated' end,changes,before_hash,after_hash
  );
  return coalesce(new,old);
end $$;
revoke all on function private.aqari_server_mutation_audit_trigger() from public,anon,authenticated,service_role;

do $$declare target record; trigger_name text;begin
  for target in select * from (values
    ('public','aqari_memberships'),
    ('public','aqari_leases'),
    ('public','aqari_rent_payments'),
    ('public','aqari_documents'),
    ('public','aqari_maintenance_requests'),
    ('private','aqari_financial_expenses'),
    ('private','aqari_official_document_series'),
    ('private','aqari_work_orders')
  ) v(schema_name,table_name)
  loop
    if to_regclass(format('%I.%I',target.schema_name,target.table_name)) is null then continue; end if;
    trigger_name:='aqari_server_audit_'||target.table_name;
    execute format('drop trigger if exists %I on %I.%I',trigger_name,target.schema_name,target.table_name);
    execute format('create trigger %I after insert or update or delete on %I.%I for each row execute function private.aqari_server_mutation_audit_trigger()',trigger_name,target.schema_name,target.table_name);
  end loop;
end $$;

create or replace function public.aqari_server_audit_history(
  p_workspace_id uuid,
  p_entity_table text default null,
  p_entity_id text default null,
  p_limit integer default 100
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not private.aqari_manager(p_workspace_id) then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  if p_limit not between 1 and 500 then raise exception 'INVALID_AUDIT_LIMIT' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'entity_schema',a.entity_schema,'entity_table',a.entity_table,'entity_id',a.entity_id,
    'operation',a.operation,'actor_name',a.actor_name,'actor_role',a.actor_role,'actor_kind',a.actor_kind,
    'changed_fields',a.changed_fields,'before_sha256',a.before_sha256,'after_sha256',a.after_sha256,
    'transaction_id',a.transaction_id,'recorded_at',a.recorded_at
  ) order by a.id desc)
  from (select * from private.aqari_server_mutation_audit x
        where x.workspace_id=p_workspace_id
          and (p_entity_table is null or x.entity_table=p_entity_table)
          and (p_entity_id is null or x.entity_id=p_entity_id)
        order by x.id desc limit p_limit) a),'[]'::jsonb);
end $$;
revoke all on function public.aqari_server_audit_history(uuid,text,text,integer) from public,anon,service_role;
grant execute on function public.aqari_server_audit_history(uuid,text,text,integer) to authenticated;

commit;
