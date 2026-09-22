begin;

alter table private.aqari_hr_payroll drop constraint if exists aqari_hr_payroll_method_check;
alter table private.aqari_hr_payroll add constraint aqari_hr_payroll_method_check check(method in ('cash','cheque','transfer','knet'));

create or replace function private.aqari_hr_month_transition_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' and new.state<>'reviewed' then raise exception 'MONTH_REVIEW_REQUIRED';end if;
 if tg_op='UPDATE' and not ((old.state='reviewed' and new.state='approved') or (old.state='approved' and new.state='closed')) then raise exception 'INVALID_MONTH_TRANSITION';end if;
 return new;
end $$;
drop trigger if exists aqari_hr_month_transition_guard on private.aqari_hr_months;
create trigger aqari_hr_month_transition_guard before insert or update on private.aqari_hr_months for each row execute function private.aqari_hr_month_transition_guard();

create or replace function private.aqari_hr_salary_snapshot_guard() returns trigger
language plpgsql set search_path='' as $$
declare a numeric;d numeric;n numeric;
begin
 if jsonb_typeof(new.snapshot)<>'object' or new.snapshot->>'employee_id'<>new.employee_id::text or new.snapshot->>'id'<>new.payroll_id::text or coalesce(new.snapshot->>'month','') !~ '^\d{4}-\d{2}-01' then raise exception 'INVALID_SALARY_SNAPSHOT_SCOPE';end if;
 if new.replaces_id is not null then
  if not exists(select 1 from private.aqari_hr_salary_registry x where x.id=new.replaces_id and x.payroll_id=new.payroll_id and x.employee_id=new.employee_id and x.status='void') then raise exception 'VOID_SALARY_REQUIRED';end if;
  begin
   a:=coalesce((new.snapshot->>'basic')::numeric,0)+coalesce((new.snapshot->>'allowances')::numeric,0)+coalesce((new.snapshot->>'overtime')::numeric,0)+coalesce((new.snapshot->>'reward')::numeric,0)+coalesce((new.snapshot->>'loan_payment')::numeric,0)+coalesce((new.snapshot->>'housing')::numeric,0)+coalesce((new.snapshot->>'indemnity')::numeric,0)+coalesce((new.snapshot->>'holidays')::numeric,0);
   d:=coalesce((new.snapshot->>'late')::numeric,0)+coalesce((new.snapshot->>'absence')::numeric,0)+coalesce((new.snapshot->>'deductions')::numeric,0)+coalesce((new.snapshot->>'advance_repayment')::numeric,0);n:=(new.snapshot->>'net')::numeric;
  exception when others then raise exception 'INVALID_SALARY_SNAPSHOT_AMOUNTS';end;
  if least(a,d,n)<0 or round(a-d,3)<>round(n,3) then raise exception 'INVALID_SALARY_SNAPSHOT_TOTAL';end if;
 end if;
 return new;
end $$;
drop trigger if exists aqari_hr_salary_snapshot_guard on private.aqari_hr_salary_registry;
create trigger aqari_hr_salary_snapshot_guard before insert on private.aqari_hr_salary_registry for each row execute function private.aqari_hr_salary_snapshot_guard();

create or replace function public.aqari_hr_payroll_cycle(p_workspace_id uuid,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w uuid:=p_workspace_id;d jsonb:=coalesce(p_data,'{}'::jsonb);e private.aqari_hr_employees;p private.aqari_hr_payroll;result jsonb;k text;
begin
 if auth.uid() is null or jsonb_typeof(d)<>'object' then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select * into e from private.aqari_hr_employees where workspace_id=w and id=(d->>'employee_id')::uuid for update;
 if e.id is null or not private.aqari_hr_can(w,e.property_ids,case when p_action='get' then 'read' else 'edit' end) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select * into p from private.aqari_hr_payroll where workspace_id=w and employee_id=e.id and id=(d->>'payroll_id')::uuid for update;
 if p.id is null then raise exception 'PAYROLL_NOT_FOUND';end if;
 if p_action='get' then return to_jsonb(p);end if;
 if p_action='save_draft' then
  if p.state<>'draft' or p.revision<>(d->>'revision')::bigint then raise serialization_failure using message='REVISION_CONFLICT';end if;
  if d->>'method' not in ('cash','cheque','transfer','knet') or (d->>'method'<>'cash' and length(btrim(coalesce(d->>'reference','')))<1) or length(coalesce(d->>'reference',''))>120 or length(coalesce(d->>'notes',''))>1000 then raise exception 'INVALID_PAYMENT_DETAILS';end if;
  foreach k in array array['overtime','reward','loan_payment','housing','indemnity','holidays','late','absence','deductions','advance_repayment'] loop perform private.aqari_hr_money(d->k);end loop;
  update private.aqari_hr_payroll x set overtime=private.aqari_hr_money(d->'overtime'),reward=private.aqari_hr_money(d->'reward'),loan_payment=private.aqari_hr_money(d->'loan_payment'),housing=private.aqari_hr_money(d->'housing'),indemnity=private.aqari_hr_money(d->'indemnity'),holidays=private.aqari_hr_money(d->'holidays'),late=private.aqari_hr_money(d->'late'),absence=private.aqari_hr_money(d->'absence'),deductions=private.aqari_hr_money(d->'deductions'),advance_repayment=private.aqari_hr_money(d->'advance_repayment'),method=d->>'method',reference=coalesce(d->>'reference',''),notes=coalesce(d->>'notes',''),revision=x.revision+1,updated_at=now() where x.id=p.id returning * into p;
  return to_jsonb(p);
 end if;
 if p_action in ('issue','approve_admin','approve_chairman','paid') then
  result:=public.aqari_hr(w,p_action,jsonb_build_object('employee_id',e.id,'payroll_id',p.id,'revision',p.revision));return result;
 end if;
 raise exception 'UNKNOWN_PAYROLL_ACTION';
end $$;

revoke all on function private.aqari_hr_month_transition_guard(),private.aqari_hr_salary_snapshot_guard(),public.aqari_hr_payroll_cycle(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_hr_payroll_cycle(uuid,text,jsonb) to authenticated;
commit;
