-- Additive/repeatable upgrade after operations-register.sql.
-- Link a maintenance request to one work order without modifying the request or its history.
begin;
alter table private.aqari_work_orders add column if not exists unit_id uuid,
 add column if not exists request_snapshot jsonb;
-- Reject ambiguous historical links for review instead of guessing or rewriting them.
do $$begin
 if exists(select 1 from private.aqari_work_orders o
  left join public.aqari_maintenance_requests m on m.id=o.maintenance_request_id and m.workspace_id=o.workspace_id
  left join public.aqari_leases l on l.id=m.lease_id and l.workspace_id=m.workspace_id and l.tenant_id=m.tenant_id
  left join public.aqari_units u on u.id=l.unit_id and u.workspace_id=l.workspace_id
  where o.maintenance_request_id is not null and (u.id is null or u.property_id is distinct from o.property_id or (o.unit_id is not null and o.unit_id is distinct from u.id)))
 then raise exception 'WORK_ORDER_EXISTING_LINK_REVIEW_REQUIRED';end if;
end $$;
create unique index if not exists aqari_work_order_request_unique
 on private.aqari_work_orders(workspace_id,maintenance_request_id) where maintenance_request_id is not null;
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='private.aqari_work_orders'::regclass and conname='aqari_work_order_request_fk') then
  alter table private.aqari_work_orders add constraint aqari_work_order_request_fk foreign key(maintenance_request_id) references public.aqari_maintenance_requests(id);
 end if;
 if not exists(select 1 from pg_constraint where conrelid='private.aqari_work_orders'::regclass and conname='aqari_work_order_unit_fk') then
  alter table private.aqari_work_orders add constraint aqari_work_order_unit_fk foreign key(workspace_id,unit_id) references public.aqari_units(workspace_id,id);
 end if;
end $$;

create or replace function private.aqari_work_order_request_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare r record;
begin
 if auth.uid() is null then raise insufficient_privilege using message='AUTH_REQUIRED';end if;
 if tg_op='UPDATE' and (new.workspace_id is distinct from old.workspace_id or new.property_id is distinct from old.property_id
  or new.maintenance_request_id is distinct from old.maintenance_request_id or new.unit_id is distinct from old.unit_id
  or new.request_snapshot is distinct from old.request_snapshot) then raise exception 'WORK_ORDER_LINK_IMMUTABLE' using errcode='23514';end if;
 if tg_op='INSERT' and new.maintenance_request_id is not null then
  select m.id,m.request_no,m.workspace_id,m.status,m.description,m.revision,u.property_id,u.id as unit_id,u.unit_no
   into r from public.aqari_maintenance_requests m
   join public.aqari_leases l on l.workspace_id=m.workspace_id and l.id=m.lease_id and l.tenant_id=m.tenant_id
   join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
   where m.id=new.maintenance_request_id and m.workspace_id=new.workspace_id for update of m;
  if not found or r.property_id is distinct from new.property_id then raise exception 'REQUEST_PROPERTY_MISMATCH' using errcode='23514';end if;
  if r.status in('completed','cancelled') then raise exception 'MAINTENANCE_REQUEST_CLOSED' using errcode='23514';end if;
  if new.unit_id is not null and new.unit_id is distinct from r.unit_id then raise exception 'REQUEST_UNIT_MISMATCH' using errcode='23514';end if;
  if exists(select 1 from private.aqari_work_orders o where o.workspace_id=new.workspace_id and o.maintenance_request_id=new.maintenance_request_id) then raise exception 'REQUEST_ALREADY_HAS_WORK_ORDER' using errcode='23505';end if;
  new.unit_id:=r.unit_id;
  new.request_snapshot:=jsonb_build_object('id',r.id,'request_no',r.request_no,'revision',r.revision,'description',r.description,'property_id',r.property_id,'unit_id',r.unit_id,'unit_no',r.unit_no);
 end if;
 return new;
end $$;
revoke all on function private.aqari_work_order_request_guard() from public,anon,authenticated;
drop trigger if exists aqari_work_order_request_guard on private.aqari_work_orders;
create trigger aqari_work_order_request_guard before insert or update on private.aqari_work_orders
 for each row execute function private.aqari_work_order_request_guard();

-- Preserve the reviewed base RPC; only the guarded public entry remains callable by clients.
do $$begin
 if to_regprocedure('private.aqari_operations_register_base(uuid,text,text,jsonb)') is null then
  alter function public.aqari_operations_register(uuid,text,text,jsonb) set schema private;
  alter function private.aqari_operations_register(uuid,text,text,jsonb) rename to aqari_operations_register_base;
 end if;
end $$;
revoke all on function private.aqari_operations_register_base(uuid,text,text,jsonb) from public,anon,authenticated;

create or replace function private.aqari_operations_request_link(w uuid,domain text,action text,d jsonb default '{}') returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare result jsonb;request_row record;order_row private.aqari_work_orders;contract private.aqari_vendor_contracts;prop uuid;request_id uuid;
begin
 if auth.uid() is null or not private.aqari_manager(w) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>32000 then raise exception 'INVALID_OPERATION_DATA' using errcode='22023';end if;
 if action<>'list' then perform private.aqari_require_sensitive_aal2(w);end if;
 if domain='work_orders' then
  if action='create' then
   prop:=nullif(d->>'property_id','')::uuid;request_id:=nullif(d->>'maintenance_request_id','')::uuid;
   if not private.aqari_can_property(w,prop,'maintenance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
   if request_id is not null then
    select m.id,m.revision,u.property_id,u.id as unit_id into request_row from public.aqari_maintenance_requests m
     join public.aqari_leases l on l.workspace_id=m.workspace_id and l.id=m.lease_id and l.tenant_id=m.tenant_id
     join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
     where m.workspace_id=w and m.id=request_id for update of m;
    if not found or request_row.property_id is distinct from prop then raise exception 'REQUEST_PROPERTY_MISMATCH' using errcode='23514';end if;
    if nullif(d->>'unit_id','')::uuid is distinct from request_row.unit_id then raise exception 'REQUEST_UNIT_MISMATCH' using errcode='23514';end if;
    if nullif(d->>'request_revision','')::bigint is distinct from request_row.revision then raise serialization_failure using message='REQUEST_REVISION_CONFLICT';end if;
   elsif nullif(d->>'unit_id','') is not null then raise exception 'REQUEST_REQUIRED_FOR_UNIT' using errcode='23514';
   end if;
   if nullif(d->>'vendor_contract_id','') is not null then
    select * into contract from private.aqari_vendor_contracts c where c.workspace_id=w and c.id=(d->>'vendor_contract_id')::uuid;
    if not found or contract.vendor_id is distinct from (d->>'vendor_id')::uuid or (contract.property_id is not null and contract.property_id is distinct from prop)
     or contract.status not in('approved','active') or (now() at time zone 'Asia/Kuwait')::date not between contract.starts_on and contract.ends_on then raise exception 'VENDOR_CONTRACT_MISMATCH' using errcode='23514';end if;
   end if;
  elsif action<>'list' then
   select * into order_row from private.aqari_work_orders o where o.workspace_id=w and o.id=nullif(d->>'id','')::uuid;
   if not found or not private.aqari_can_property(w,order_row.property_id,'maintenance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  end if;
 end if;
 result:=private.aqari_operations_register_base(w,domain,action,d);
 if domain='work_orders' and action='list' then
  result:=result||jsonb_build_object('request_link_version',1,'requests',(
   select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'request_no',m.request_no,'description',m.description,'status',m.status,'revision',m.revision,
    'property_id',u.property_id,'unit_id',u.id,'unit_no',u.unit_no,'work_order_id',o.id,'work_order_no',o.order_no) order by m.request_no desc),'[]')
   from public.aqari_maintenance_requests m
   join public.aqari_leases l on l.workspace_id=m.workspace_id and l.id=m.lease_id and l.tenant_id=m.tenant_id
   join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
   left join private.aqari_work_orders o on o.workspace_id=m.workspace_id and o.maintenance_request_id=m.id
   where m.workspace_id=w and private.aqari_can_property(w,u.property_id,'maintenance','read') and (m.status not in('completed','cancelled') or o.id is not null)
  ));
 end if;
 return result;
end $$;
revoke all on function private.aqari_operations_request_link(uuid,text,text,jsonb) from public,anon;
grant execute on function private.aqari_operations_request_link(uuid,text,text,jsonb) to authenticated;
create or replace function public.aqari_operations_register(p_workspace_id uuid,p_domain text,p_action text,p_data jsonb default '{}') returns jsonb
language sql volatile security invoker set search_path='' as $$select private.aqari_operations_request_link(p_workspace_id,p_domain,p_action,p_data)$$;
revoke all on function public.aqari_operations_register(uuid,text,text,jsonb) from public,anon;
grant execute on function public.aqari_operations_register(uuid,text,text,jsonb) to authenticated;
commit;
