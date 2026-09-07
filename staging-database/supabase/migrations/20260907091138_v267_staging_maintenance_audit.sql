-- Independent V267 Staging only. No production data or outbound calls.
alter table public.aqari_maintenance_requests add column revision bigint not null default 1;
alter table public.aqari_maintenance_requests add column updated_at timestamptz not null default now();
create function private.aqari_v267_maintenance_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 if tg_op='UPDATE' then
  if not private.aqari_writer(new.workspace_id) then raise exception 'WRITE_DENIED' using errcode='42501';end if;
  if new.status=old.status and new.cost=old.cost then return old;end if;
  if old.status in ('completed','cancelled') then raise exception 'MAINTENANCE_CLOSED';end if;
  if new.status<>old.status and not (
   old.status='received' and new.status in ('assigned','in_progress','cancelled') or
   old.status='assigned' and new.status in ('in_progress','cancelled') or
   old.status='in_progress' and new.status in ('completed','cancelled')) then raise exception 'INVALID_MAINTENANCE_TRANSITION';end if;
  new.revision:=old.revision+1;new.updated_at:=now();
 end if;
 insert into public.aqari_operation_audit(workspace_id,user_id,action,revision) values(new.workspace_id,auth.uid(),jsonb_build_object('operation','maintenance_'||lower(tg_op),'request_id',new.id,'status',new.status,'cost',new.cost,'previous_status',case when tg_op='UPDATE' then old.status else null end,'previous_cost',case when tg_op='UPDATE' then old.cost else null end)::text,new.revision);
 return new;
end $$;
revoke all on function private.aqari_v267_maintenance_audit() from public,anon,authenticated;
create trigger aqari_maintenance_audit before insert or update on public.aqari_maintenance_requests for each row execute function private.aqari_v267_maintenance_audit();
