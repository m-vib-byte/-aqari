-- Preview candidate. Archives a property without moving or deleting any linked record.
-- Existing contract servicing remains available; new units/leases and draft activation stop.
begin;
create table if not exists private.aqari_property_lifecycle(
 workspace_id uuid not null,
 property_id uuid not null,
 state text not null check(state in('active','archived')),
 revision bigint not null check(revision>0),
 operation_id uuid not null,
 reason text not null check(length(btrim(reason)) between 3 and 1000),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(workspace_id,property_id),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id)
);
alter table private.aqari_property_lifecycle enable row level security;
revoke all on private.aqari_property_lifecycle from public,anon,authenticated,service_role;
drop trigger if exists aqari_property_lifecycle_no_delete on private.aqari_property_lifecycle;
create trigger aqari_property_lifecycle_no_delete before delete on private.aqari_property_lifecycle
 for each row execute function private.aqari_reject_immutable_change();

create table if not exists private.aqari_property_lifecycle_audit(
 id bigint generated always as identity primary key,
 workspace_id uuid not null,
 property_id uuid not null,
 operation_id uuid not null,
 previous_state text not null check(previous_state in('active','archived')),
 state text not null check(state in('active','archived')),
 revision bigint not null check(revision>0),
 reason text not null check(length(btrim(reason)) between 3 and 1000),
 actor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(workspace_id,operation_id),
 unique(workspace_id,property_id,revision),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id)
);
alter table private.aqari_property_lifecycle_audit enable row level security;
revoke all on private.aqari_property_lifecycle_audit from public,anon,authenticated,service_role;
drop trigger if exists aqari_property_lifecycle_audit_immutable on private.aqari_property_lifecycle_audit;
create trigger aqari_property_lifecycle_audit_immutable before update or delete on private.aqari_property_lifecycle_audit
 for each row execute function private.aqari_reject_immutable_change();

-- Invoked only by the guarded RPC, and indirectly by already-authorized property snapshots.
create or replace function private.aqari_property_lifecycle_snapshot(w uuid,p uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('state',x.state,'revision',x.revision,
  'operationId',x.operation_id,'reason',x.reason,'updatedAt',x.updated_at)
  from private.aqari_property_lifecycle x where x.workspace_id=w and x.property_id=p),
  jsonb_build_object('state','active','revision',0,'operationId',null))
$$;
revoke all on function private.aqari_property_lifecycle_snapshot(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function private.aqari_property_lifecycle_action(w uuid,p uuid,action text,expected bigint,operation uuid,why text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare prop public.aqari_properties%rowtype; old_value jsonb; new_state text; result jsonb;
begin
 if auth.uid() is null or not private.aqari_manager(w)
  or not private.aqari_can_property(w,p,'properties','write') then
  raise insufficient_privilege using message='PROPERTY_LIFECYCLE_MANAGER_ONLY';
 end if;
 if action not in('context','archive','restore') or action is null then
  raise invalid_parameter_value using message='PROPERTY_LIFECYCLE_ACTION_INVALID';
 end if;
 if action='context' then
  select * into prop from public.aqari_properties where workspace_id=w and id=p;
 else
  perform private.aqari_require_sensitive_aal2(w);
  if operation is null or length(btrim(coalesce(why,''))) not between 3 and 1000 then
   raise invalid_parameter_value using message='CHANGE_REASON_REQUIRED';
  end if;
  -- Same parent lock as the unit/lease guards: a concurrent new lease cannot pass an archive.
  select * into prop from public.aqari_properties where workspace_id=w and id=p for update;
 end if;
 if not found then raise no_data_found using message='PROPERTY_NOT_FOUND';end if;
 old_value:=private.aqari_property_lifecycle_snapshot(w,p);
 if action<>'context' then
  if expected is distinct from (old_value->>'revision')::bigint then
   raise serialization_failure using message='PROPERTY_LIFECYCLE_REVISION_CONFLICT';
  end if;
  new_state:=case when action='archive' then 'archived' else 'active' end;
  if old_value->>'state'=new_state then raise invalid_parameter_value using message='PROPERTY_LIFECYCLE_NO_CHANGE';end if;
  insert into private.aqari_property_lifecycle(workspace_id,property_id,state,revision,operation_id,reason,updated_by)
   values(w,p,new_state,expected+1,operation,btrim(why),auth.uid())
   on conflict(workspace_id,property_id) do update set state=excluded.state,revision=excluded.revision,
    operation_id=excluded.operation_id,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=now();
  insert into private.aqari_property_lifecycle_audit(workspace_id,property_id,operation_id,previous_state,state,revision,reason,actor_id)
   values(w,p,operation,old_value->>'state',new_state,expected+1,btrim(why),auth.uid());
 end if;
 result:=jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'propertyId',p,'name',prop.name,
  'lifecycle',private.aqari_property_lifecycle_snapshot(w,p),
  'units',(select count(*) from public.aqari_units u where u.workspace_id=w and u.property_id=p),
  'contracts',(select count(*) from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where u.workspace_id=w and u.property_id=p),
  'documents',(select count(*) from public.aqari_documents d where d.workspace_id=w and
   ((d.entity_type='property' and d.entity_ref in(p::text,prop.external_ref,prop.name)) or d.metadata->>'property_id'=p::text)));
 return result;
end $$;
revoke all on function private.aqari_property_lifecycle_action(uuid,uuid,text,bigint,uuid,text) from public,anon,service_role;
grant execute on function private.aqari_property_lifecycle_action(uuid,uuid,text,bigint,uuid,text) to authenticated;
create or replace function public.aqari_property_lifecycle(p_workspace_id uuid,p_property_id uuid,p_action text default 'context',p_expected_revision bigint default null,p_operation_id uuid default null,p_reason text default null)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select private.aqari_property_lifecycle_action(p_workspace_id,p_property_id,p_action,p_expected_revision,p_operation_id,p_reason)
$$;
revoke all on function public.aqari_property_lifecycle(uuid,uuid,text,bigint,uuid,text) from public,anon,service_role;
grant execute on function public.aqari_property_lifecycle(uuid,uuid,text,bigint,uuid,text) to authenticated;

create or replace function private.aqari_property_lifecycle_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare p uuid;
begin
 if tg_table_name='aqari_units' then
  if tg_op='UPDATE' and new.workspace_id is not distinct from old.workspace_id and new.property_id is not distinct from old.property_id then return new;end if;
  p:=new.property_id;
 else
  if tg_op='UPDATE' and new.workspace_id is not distinct from old.workspace_id and new.unit_id is not distinct from old.unit_id
   and (new.status is not distinct from old.status or new.status::text not in('ready','approved','signing','signed')) then return new;end if;
  select property_id into p from public.aqari_units where workspace_id=new.workspace_id and id=new.unit_id;
 end if;
 if p is null then return new;end if; -- Existing foreign-key validation handles missing units.
 perform 1 from public.aqari_properties where workspace_id=new.workspace_id and id=p for share;
 if exists(select 1 from private.aqari_property_lifecycle x where x.workspace_id=new.workspace_id and x.property_id=p and x.state='archived') then
  raise check_violation using message='PROPERTY_ARCHIVED_NEW_ACTIVITY_FORBIDDEN';
 end if;
 return new;
end $$;
revoke all on function private.aqari_property_lifecycle_guard() from public,anon,authenticated,service_role;
drop trigger if exists aqari_units_property_lifecycle on public.aqari_units;
-- AFTER handles INSERT ... ON CONFLICT as its actual UPDATE, preserving existing records.
create trigger aqari_units_property_lifecycle after insert or update of workspace_id,property_id on public.aqari_units
 for each row execute function private.aqari_property_lifecycle_guard();
drop trigger if exists aqari_leases_property_lifecycle on public.aqari_leases;
create trigger aqari_leases_property_lifecycle after insert or update of workspace_id,unit_id,status on public.aqari_leases
 for each row execute function private.aqari_property_lifecycle_guard();

-- Extend the existing read model without replacing its owner/contact/cleared-value fixes.
do $patch$
declare source text; anchor text:=$a$'revision',coalesce(m.revision,0)$a$;
begin
 source:=pg_get_functiondef('private.aqari_property_master_snapshot(uuid,uuid)'::regprocedure);
 if position('private.aqari_property_lifecycle_snapshot(w,p)' in source)=0 then
  if (length(source)-length(replace(source,anchor,'')))/length(anchor)<>1 then
   raise exception 'PROPERTY_LIFECYCLE_SNAPSHOT_ANCHOR_CHANGED';
  end if;
  execute replace(source,anchor,$b$'lifecycle',private.aqari_property_lifecycle_snapshot(w,p),'revision',coalesce(m.revision,0)$b$);
 end if;
end $patch$;
commit;
