-- Freeze new issued payroll allocations; never invent historical allocations.
begin;
create table if not exists private.aqari_hr_payroll_cost_snapshots (
 payroll_id uuid not null references private.aqari_hr_payroll(id),
 workspace_id uuid not null references public.aqari_workspaces(id),
 property_id uuid not null references public.aqari_properties(id),
 share numeric(5,2) not null check(share>=0 and share<=100),
 allocated_net numeric(15,3) not null check(allocated_net>=0),
 captured_at timestamptz not null default now(),
 primary key(payroll_id,property_id)
);
alter table private.aqari_hr_payroll_cost_snapshots enable row level security;
revoke all on private.aqari_hr_payroll_cost_snapshots from public,anon,authenticated;
create index if not exists hr_payroll_cost_snapshot_workspace on private.aqari_hr_payroll_cost_snapshots(workspace_id);
create index if not exists hr_payroll_cost_snapshot_property on private.aqari_hr_payroll_cost_snapshots(property_id);
create or replace function private.aqari_hr_capture_payroll_cost() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.state='draft' then return new;end if;
 if tg_op='UPDATE' and old.state<>'draft' then return new;end if;
 -- Called AFTER the write so the stored generated net is available.
 insert into private.aqari_hr_payroll_cost_snapshots(payroll_id,workspace_id,property_id,share,allocated_net)
 select new.id,new.workspace_id,a.property_id,a.share,a.allocated_net
 from private.aqari_hr_cost_split(new.workspace_id,new.employee_id,new.net) a;
 return new;
end $$;
revoke all on function private.aqari_hr_capture_payroll_cost() from public,anon,authenticated;
drop trigger if exists aqari_hr_capture_payroll_cost on private.aqari_hr_payroll;
create trigger aqari_hr_capture_payroll_cost after insert or update of state on private.aqari_hr_payroll
 for each row execute function private.aqari_hr_capture_payroll_cost();
create or replace function private.aqari_hr_cost_snapshot_immutable() returns trigger
language plpgsql security invoker set search_path='' as $$
begin raise exception 'HR_COST_SNAPSHOT_IMMUTABLE';end $$;
revoke all on function private.aqari_hr_cost_snapshot_immutable() from public,anon,authenticated;
drop trigger if exists aqari_hr_cost_snapshot_immutable on private.aqari_hr_payroll_cost_snapshots;
create trigger aqari_hr_cost_snapshot_immutable before update or delete on private.aqari_hr_payroll_cost_snapshots
 for each row execute function private.aqari_hr_cost_snapshot_immutable();
create or replace function private.aqari_hr_payroll_cost_split(p_workspace uuid,p_payroll uuid)
returns table(property_id uuid,share numeric,allocated_net numeric,cost_basis text)
language plpgsql stable security invoker set search_path='' as $$
declare p private.aqari_hr_payroll;
begin
 select * into p from private.aqari_hr_payroll x where x.workspace_id=p_workspace and x.id=p_payroll;
 if p.id is null then raise exception 'PAYROLL_NOT_FOUND';end if;
 if exists(select 1 from private.aqari_hr_payroll_cost_snapshots s where s.payroll_id=p.id and s.workspace_id=p_workspace) then
  return query select s.property_id,s.share,s.allocated_net,'issued_snapshot'::text
   from private.aqari_hr_payroll_cost_snapshots s where s.payroll_id=p.id and s.workspace_id=p_workspace order by s.property_id;
 else
  return query select a.property_id,a.share,a.allocated_net,case when p.state='draft' then 'draft_current' else 'legacy_current' end
   from private.aqari_hr_cost_split(p_workspace,p.employee_id,p.net) a;
 end if;
end $$;
revoke all on function private.aqari_hr_payroll_cost_split(uuid,uuid) from public,anon,authenticated;

do $patch$
declare source text:=pg_get_functiondef('public.aqari_hr_cycle(uuid,text,jsonb)'::regprocedure);
begin
 if strpos(source,'-- HR_PAYROLL_COST_SNAPSHOT_V1')>0 then return;end if;
 if (length(source)-length(replace(source,$old$private.aqari_hr_cost_split(w,x.employee_id,x.net)$old$,'')))/length($old$private.aqari_hr_cost_split(w,x.employee_id,x.net)$old$)<>3 then raise exception 'HR_COST_SNAPSHOT_PATCH_DRIFT';end if;
 source:=replace(source,$old$private.aqari_hr_cost_split(w,x.employee_id,x.net)$old$,$new$private.aqari_hr_payroll_cost_split(w,x.id)$new$);
 if (length(source)-length(replace(source,$old$ and property=any(q.property_ids)$old$,'')))/length($old$ and property=any(q.property_ids)$old$)<>3 then raise exception 'HR_COST_SNAPSHOT_PATCH_DRIFT';end if;
 source:=replace(source,$old$ and property=any(q.property_ids)$old$,$new$$new$);
 if (length(source)-length(replace(source,$old$x.month=period and x.state<>'paid'$old$,'')))/length($old$x.month=period and x.state<>'paid'$old$)<>1 then raise exception 'HR_COST_SNAPSHOT_PATCH_DRIFT';end if;
 source:=replace(source,$old$x.month=period and x.state<>'paid'$old$,$new$x.month=period and x.state<>'paid' and exists(select 1 from private.aqari_hr_payroll_cost_split(w,x.id) z where z.property_id=property)$new$);
 if (length(source)-length(replace(source,$old$from private.aqari_hr_payroll x join private.aqari_hr_employees employee_scope on employee_scope.id=x.employee_id
    join public.aqari_properties q on q.id=any(employee_scope.property_ids) and q.workspace_id=w
    join lateral private.aqari_hr_payroll_cost_split(w,x.id) a on a.property_id=q.id$old$,'')))/length($old$from private.aqari_hr_payroll x join private.aqari_hr_employees employee_scope on employee_scope.id=x.employee_id
    join public.aqari_properties q on q.id=any(employee_scope.property_ids) and q.workspace_id=w
    join lateral private.aqari_hr_payroll_cost_split(w,x.id) a on a.property_id=q.id$old$)<>1 then raise exception 'HR_COST_SNAPSHOT_PATCH_DRIFT';end if;
 source:=replace(source,$old$from private.aqari_hr_payroll x join private.aqari_hr_employees employee_scope on employee_scope.id=x.employee_id
    join public.aqari_properties q on q.id=any(employee_scope.property_ids) and q.workspace_id=w
    join lateral private.aqari_hr_payroll_cost_split(w,x.id) a on a.property_id=q.id$old$,$new$from private.aqari_hr_payroll x
    cross join lateral private.aqari_hr_payroll_cost_split(w,x.id) a
    join public.aqari_properties q on q.id=a.property_id and q.workspace_id=w$new$);
 if (length(source)-length(replace(source,$old$'share',a.share,'allocated_net',a.allocated_net$old$,'')))/length($old$'share',a.share,'allocated_net',a.allocated_net$old$)<>1 then raise exception 'HR_COST_SNAPSHOT_PATCH_DRIFT';end if;
 source:=replace(source,$old$'share',a.share,'allocated_net',a.allocated_net$old$,$new$'share',a.share,'allocated_net',a.allocated_net,'cost_basis',a.cost_basis$new$);
 if (length(source)-length(replace(source,$old$a.allocated_net as allocated_cost$old$,'')))/length($old$a.allocated_net as allocated_cost$old$)<>1 then raise exception 'HR_COST_SNAPSHOT_PATCH_DRIFT';end if;
 source:=replace(source,$old$a.allocated_net as allocated_cost$old$,$new$a.allocated_net as allocated_cost,a.cost_basis$new$);
 source:=replace(source,'if p_action=''month_report'' then',E'-- HR_PAYROLL_COST_SNAPSHOT_V1\n if p_action=''month_report'' then');
 execute source;
end $patch$;
-- Closed historical property months still protect the issued payroll after a transfer.
do $patch$
declare source text:=pg_get_functiondef('private.aqari_hr_closed_month_guard()'::regprocedure);
 old_text text:='m.property_id=any(e.property_ids)';
 new_text text:='(m.property_id=any(e.property_ids) or exists(select 1 from private.aqari_hr_payroll_cost_snapshots s where s.payroll_id=coalesce(new.id,old.id) and s.workspace_id=e.workspace_id and s.property_id=m.property_id))';
begin
 if strpos(source,'aqari_hr_payroll_cost_snapshots')>0 then return;end if;
 if (length(source)-length(replace(source,old_text,'')))/length(old_text)<>1 then raise exception 'HR_CLOSED_MONTH_SNAPSHOT_PATCH_DRIFT';end if;
 execute replace(source,old_text,new_text);
end $patch$;
commit;
