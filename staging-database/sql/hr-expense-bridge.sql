-- Net salary disbursements, not gross accrual accounting. No historical backfill.
begin;
create table if not exists private.aqari_hr_expense_links (
 payroll_id uuid primary key references private.aqari_hr_payroll(id),
 workspace_id uuid not null references public.aqari_workspaces(id),
 employee_id uuid not null references private.aqari_hr_employees(id),
 document_id uuid not null references private.aqari_hr_documents(id),
 expense_date date not null, paid_at timestamptz not null,
 amount numeric(15,3) not null check(amount>=0),
 method text not null, reference text not null, voucher_no text not null,
 payee text not null, salary_month date not null,
 created_at timestamptz not null default now()
);
alter table private.aqari_hr_expense_links enable row level security;
revoke all on private.aqari_hr_expense_links from public,anon,authenticated;
create index if not exists hr_expense_link_period on private.aqari_hr_expense_links(workspace_id,expense_date);
create or replace function private.aqari_hr_expense_link_immutable() returns trigger
language plpgsql security invoker set search_path='' as $$
begin raise exception 'HR_EXPENSE_LINK_IMMUTABLE';end $$;
revoke all on function private.aqari_hr_expense_link_immutable() from public,anon,authenticated;
drop trigger if exists hr_expense_link_immutable on private.aqari_hr_expense_links;
create trigger hr_expense_link_immutable before update or delete on private.aqari_hr_expense_links
 for each row execute function private.aqari_hr_expense_link_immutable();

-- Both existing RPCs lock app_state before payroll/expense rows. This same
-- serialization point protects a payment racing a manual expense approval.
create or replace function private.aqari_salary_expense_reference_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare payment_method text; payment_ref text;
begin
 if tg_table_name='aqari_hr_payroll' then
  if new.state<>'paid' then return new;end if;
  if tg_op='UPDATE' and old.state='paid' then return new;end if;
 else
  if new.state<>'approved' then return new;end if;
  if tg_op='UPDATE' and old.state='approved' then return new;end if;
 end if;
 if new.method='cash' then return new;end if;
 payment_method:=case when new.method='transfer' then 'bank' else new.method end;
 payment_ref:=btrim(new.reference);
 if payment_ref='' then raise exception 'مرجع الصرف غير النقدي مطلوب.';end if;
 perform 1 from public.aqari_app_state where workspace_id=new.workspace_id for update;
 if not found then raise exception 'WORKSPACE_NOT_FOUND';end if;
 if exists(select 1 from private.aqari_hr_payroll p where p.workspace_id=new.workspace_id and p.state='paid'
   and (tg_table_name<>'aqari_hr_payroll' or p.id<>new.id)
   and (case when p.method='transfer' then 'bank' else p.method end)=payment_method and btrim(p.reference)=payment_ref)
 or exists(select 1 from private.aqari_financial_expenses e where e.workspace_id=new.workspace_id and e.state='approved'
   and (tg_table_name<>'aqari_financial_expenses' or e.id<>new.id) and e.method=payment_method and btrim(e.reference)=payment_ref)
 then raise exception 'مرجع الصرف مستخدم في راتب مصروف أو مصروف معتمد؛ راجع الأصل لتجنب التكرار.';end if;
 return new;
end $$;
revoke all on function private.aqari_salary_expense_reference_guard() from public,anon,authenticated;
drop trigger if exists salary_expense_reference_guard on private.aqari_hr_payroll;
create trigger salary_expense_reference_guard before insert or update of state on private.aqari_hr_payroll
 for each row execute function private.aqari_salary_expense_reference_guard();
drop trigger if exists salary_expense_reference_guard on private.aqari_financial_expenses;
create trigger salary_expense_reference_guard before insert or update of state on private.aqari_financial_expenses
 for each row execute function private.aqari_salary_expense_reference_guard();

create or replace function private.aqari_hr_link_paid_expense() returns trigger
language plpgsql security invoker set search_path='' as $$
declare signed_id uuid; allocated numeric;
begin
 if new.state<>'paid' then return new;end if;
 if tg_op='UPDATE' and old.state='paid' then return new;end if;
 select sum(s.allocated_net) into allocated from private.aqari_hr_payroll_cost_snapshots s
 where s.payroll_id=new.id and s.workspace_id=new.workspace_id;
 -- Existing issued salaries have no historical allocation: retain their flow,
 -- explicitly report them as unlinked, never manufacture an allocation.
 if allocated is null then return new;end if;
 if allocated<>new.net then raise exception 'HR_EXPENSE_ALLOCATION_MISMATCH';end if;
 select d.id into signed_id from private.aqari_hr_documents d
 where d.payroll_id=new.id and d.workspace_id=new.workspace_id and d.employee_id=new.employee_id
 and d.kind='signed_salary' and d.status='ready' and d.attestations='{"signature":true,"fingerprint":true,"stamp":true}'::jsonb
 order by d.uploaded_at,d.id limit 1;
 if signed_id is null or new.paid_at is null or new.voucher_no is null then raise exception 'HR_EXPENSE_PAYMENT_EVIDENCE_REQUIRED';end if;
 insert into private.aqari_hr_expense_links(payroll_id,workspace_id,employee_id,document_id,expense_date,paid_at,amount,method,reference,voucher_no,payee,salary_month)
 values(new.id,new.workspace_id,new.employee_id,signed_id,(new.paid_at at time zone 'Asia/Kuwait')::date,new.paid_at,new.net,
 case when new.method='transfer' then 'bank' else new.method end,new.reference,new.voucher_no,
 coalesce(nullif(new.snapshot->>'name_ar',''),new.snapshot->>'name_en',''),new.month);
 return new;
end $$;
revoke all on function private.aqari_hr_link_paid_expense() from public,anon,authenticated;
drop trigger if exists zz_hr_link_paid_expense on private.aqari_hr_payroll;
create trigger zz_hr_link_paid_expense after insert or update of state on private.aqari_hr_payroll
 for each row execute function private.aqari_hr_link_paid_expense();

create or replace function private.aqari_salary_expense_rows(w uuid,period date) returns setof jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id','salary:'||l.payroll_id::text||':'||s.property_id::text,
 'source','salary','payroll_id',l.payroll_id,'property_id',s.property_id,'expense_date',l.expense_date,
 'category','صافي راتب مصروف','payee',l.payee,'amount',s.allocated_net::text,'share',s.share,
 'method',l.method,'reference',l.reference,'voucher_no',l.voucher_no,'state','approved',
 'salary_month',l.salary_month,'paid_at',l.paid_at,'hr_document_id',l.document_id)
 from private.aqari_hr_expense_links l join private.aqari_hr_payroll_cost_snapshots s
 on s.payroll_id=l.payroll_id and s.workspace_id=l.workspace_id
 where l.workspace_id=w and l.expense_date>=period and l.expense_date<(period+interval '1 month')::date
 and private.aqari_can_property(w,s.property_id,'finance','read');
$$;
revoke all on function private.aqari_salary_expense_rows(uuid,date) from public,anon,authenticated;

do $patch$
declare source text:=pg_get_functiondef('public.aqari_financial_register(uuid,text,jsonb)'::regprocedure);a text;b text;
begin
 if strpos(source,'-- HR_EXPENSE_BRIDGE_V1')>0 then return;end if;
 a:='  return jsonb_build_object(''manager'',private.aqari_manager(w),';
 b:=$new$  -- HR_EXPENSE_BRIDGE_V1
  summary:=summary||jsonb_build_object('salary_disbursements',
   (select coalesce(sum((x->>'amount')::numeric),0)::text from private.aqari_salary_expense_rows(w,v_month) x),
   'salary_payment_count',(select count(distinct x->>'payroll_id') from private.aqari_salary_expense_rows(w,v_month) x),
   'unlinked_salary_count',(select count(*) from private.aqari_hr_payroll p join private.aqari_hr_employees employee_scope on employee_scope.id=p.employee_id
    where p.workspace_id=w and p.state='paid' and (p.paid_at at time zone 'Asia/Kuwait')::date>=v_month
    and (p.paid_at at time zone 'Asia/Kuwait')::date<(v_month+interval '1 month')::date
    and not exists(select 1 from private.aqari_hr_expense_links l where l.payroll_id=p.id)
    and (private.aqari_manager(w) or exists(select 1 from unnest(employee_scope.property_ids) visible_property(id) where private.aqari_can_property(w,visible_property.id,'finance','read')))));
  return jsonb_build_object('salary_expenses',coalesce((select jsonb_agg(x order by x->>'expense_date',x->>'id') from private.aqari_salary_expense_rows(w,v_month) x),'[]'),
   'manager',private.aqari_manager(w),$new$;
 if (length(source)-length(replace(source,a,'')))/length(a)<>1 then raise exception 'HR_EXPENSE_LIST_PATCH_DRIFT';end if;
 source:=replace(source,a,b);
 a:='  insert into private.aqari_financial_periods(workspace_id,month,closed_by,closed_by_name,reason,snapshot)';
 b:=$new$  summary:=summary||jsonb_build_object('salary_scope','linked_net_salary_disbursements_by_payment_date',
   'salary_disbursements',(select coalesce(sum(l.amount),0) from private.aqari_hr_expense_links l where l.workspace_id=w and l.expense_date>=v_month and l.expense_date<(v_month+interval '1 month')::date),
   'salary_payment_count',(select count(*) from private.aqari_hr_expense_links l where l.workspace_id=w and l.expense_date>=v_month and l.expense_date<(v_month+interval '1 month')::date),
   'unlinked_salary_count',(select count(*) from private.aqari_hr_payroll p where p.workspace_id=w and p.state='paid' and (p.paid_at at time zone 'Asia/Kuwait')::date>=v_month and (p.paid_at at time zone 'Asia/Kuwait')::date<(v_month+interval '1 month')::date and not exists(select 1 from private.aqari_hr_expense_links l where l.payroll_id=p.id)));
  insert into private.aqari_financial_periods(workspace_id,month,closed_by,closed_by_name,reason,snapshot)$new$;
 if (length(source)-length(replace(source,a,'')))/length(a)<>1 then raise exception 'HR_EXPENSE_CLOSE_PATCH_DRIFT';end if;
 execute replace(source,a,b);
end $patch$;
commit;
