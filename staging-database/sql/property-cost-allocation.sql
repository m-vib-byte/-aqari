-- AQARI V267 isolated trial: authoritative property allocation for actual paid/approved costs.
-- Additive only. Allocation revisions are append-only; source records remain authoritative.
begin;

create table if not exists private.aqari_property_cost_allocation_heads(
 workspace_id uuid not null references public.aqari_workspaces(id),
 source_kind text not null check(source_kind in('financial_expense','payroll','utility')),
 source_id uuid not null,
 current_revision bigint not null default 0 check(current_revision>=0),
 source_total numeric(15,3) not null check(source_total>=0),
 source_date date not null,
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(workspace_id,source_kind,source_id)
);
create table if not exists private.aqari_property_cost_allocations(
 workspace_id uuid not null,
 source_kind text not null,
 source_id uuid not null,
 revision bigint not null check(revision>0),
 property_id uuid not null,
 amount numeric(15,3) not null check(amount>0 and amount=round(amount,3)),
 reason text not null check(length(btrim(reason)) between 3 and 1000),
 actor_id uuid not null references auth.users(id),
 actor_name text not null,
 created_at timestamptz not null default now(),
 primary key(workspace_id,source_kind,source_id,revision,property_id),
 foreign key(workspace_id,source_kind,source_id) references private.aqari_property_cost_allocation_heads(workspace_id,source_kind,source_id),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id)
);
create index if not exists aqari_cost_allocation_property on private.aqari_property_cost_allocations(workspace_id,property_id,created_at desc);
alter table private.aqari_property_cost_allocation_heads enable row level security;
alter table private.aqari_property_cost_allocations enable row level security;
revoke all on private.aqari_property_cost_allocation_heads,private.aqari_property_cost_allocations from public,anon,authenticated,service_role;
drop trigger if exists aqari_cost_allocation_no_change on private.aqari_property_cost_allocations;
create trigger aqari_cost_allocation_no_change before update or delete on private.aqari_property_cost_allocations for each row execute function private.aqari_reject_immutable_change();
drop trigger if exists aqari_cost_allocation_head_no_delete on private.aqari_property_cost_allocation_heads;
create trigger aqari_cost_allocation_head_no_delete before delete on private.aqari_property_cost_allocation_heads for each row execute function private.aqari_reject_immutable_change();

create or replace function private.aqari_cost_source(w uuid,k text,i uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare total numeric;source_date date;props uuid[];label text;
begin
 if k='financial_expense' then
  select e.amount,e.expense_date,array[e.property_id],coalesce(nullif(e.category,''),'مصروف')||' — '||coalesce(nullif(e.payee,''),e.id::text)
   into total,source_date,props,label from private.aqari_financial_expenses e where e.workspace_id=w and e.id=i and e.state='approved';
 elsif k='payroll' then
  select coalesce(p.net,p.basic+p.allowances+p.overtime-p.deductions-p.advance_repayment),coalesce(p.paid_at::date,p.month),
   coalesce((select array_agg(distinct j.value::uuid order by j.value::uuid) from jsonb_array_elements_text(coalesce(p.snapshot->'property_ids',to_jsonb(h.property_ids))) as j(value)),h.property_ids),
   'راتب — '||coalesce(nullif(h.profile->>'name_ar',''),nullif(h.profile->>'name_en',''),h.id::text)||' — '||to_char(p.month,'YYYY-MM')
   into total,source_date,props,label from private.aqari_hr_payroll p join private.aqari_hr_employees h on h.workspace_id=p.workspace_id and h.id=p.employee_id
   where p.workspace_id=w and p.id=i and p.state='paid';
 elsif k='utility' then
  select u.amount_paid,u.payment_date,array[u.property_id],coalesce(nullif(u.invoice_no,''),nullif(u.source_ref,''),u.id::text)
   into total,source_date,props,label from public.aqari_utility_entries u where u.workspace_id=w and u.id=i and u.entry_type='bill' and u.amount_paid>0 and u.payment_date is not null and u.payment_document_id is not null;
 else raise invalid_parameter_value using message='INVALID_COST_SOURCE_KIND';end if;
 if total is null or source_date is null or total<=0 or props is null or cardinality(props)=0 then raise no_data_found using message='COST_SOURCE_NOT_FINALIZED';end if;
 if total<>round(total,3) then raise check_violation using message='COST_SOURCE_PRECISION_INVALID';end if;
 return jsonb_build_object('kind',k,'id',i,'total',total,'date',source_date,'propertyIds',to_jsonb(props),'label',label);
end $$;
revoke all on function private.aqari_cost_source(uuid,text,uuid) from public,anon,authenticated,service_role;

create or replace function private.aqari_cost_amount(w uuid,k text,i uuid,p uuid,total numeric,defaults uuid[])
returns numeric language plpgsql stable security definer set search_path='' as $$
declare rev bigint;allocated numeric;
begin
 select current_revision into rev from private.aqari_property_cost_allocation_heads where workspace_id=w and source_kind=k and source_id=i;
 if coalesce(rev,0)>0 then
  select coalesce(sum(a.amount),0) into allocated from private.aqari_property_cost_allocations a where a.workspace_id=w and a.source_kind=k and a.source_id=i and a.revision=rev and a.property_id=p;
  return coalesce(allocated,0);
 end if;
 if cardinality(defaults)=1 and defaults[1]=p then return total;end if;
 return 0;
end $$;
revoke all on function private.aqari_cost_amount(uuid,text,uuid,uuid,numeric,uuid[]) from public,anon,authenticated,service_role;

create or replace function public.aqari_property_cost_allocation(p_workspace_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare w uuid:=p_workspace_id;kind text;ident uuid;source jsonb;expected bigint;next_rev bigint;why text;actor text;rows jsonb;sum_amount numeric;property_ids uuid[];head private.aqari_property_cost_allocation_heads%rowtype;
begin
 if auth.uid() is null or not private.aqari_can(w,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_action='list' then
  if jsonb_typeof(p_data) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_data)k where k not in('from','to')) then raise invalid_parameter_value using message='INVALID_ALLOCATION_QUERY';end if;
  return jsonb_build_object(
   'workspace_id',w,'user_id',auth.uid(),'manager',private.aqari_manager(w),
   'properties',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name) from public.aqari_properties p where p.workspace_id=w),'[]'::jsonb),
   'sources',(
    select coalesce(jsonb_agg(x order by x->>'date' desc,x->>'label'),'[]'::jsonb) from(
     select private.aqari_cost_source(w,'financial_expense',e.id)||jsonb_build_object('revision',coalesce(h.current_revision,0),'allocations',coalesce(a.rows,'[]'::jsonb)) x
      from private.aqari_financial_expenses e left join private.aqari_property_cost_allocation_heads h on h.workspace_id=e.workspace_id and h.source_kind='financial_expense' and h.source_id=e.id
      left join lateral(select jsonb_agg(jsonb_build_object('propertyId',q.property_id,'amount',q.amount) order by q.property_id) rows from private.aqari_property_cost_allocations q where q.workspace_id=e.workspace_id and q.source_kind='financial_expense' and q.source_id=e.id and q.revision=h.current_revision)a on true
      where e.workspace_id=w and e.state='approved'
     union all
     select private.aqari_cost_source(w,'payroll',pay.id)||jsonb_build_object('revision',coalesce(h.current_revision,0),'allocations',coalesce(a.rows,'[]'::jsonb)) x
      from private.aqari_hr_payroll pay left join private.aqari_property_cost_allocation_heads h on h.workspace_id=pay.workspace_id and h.source_kind='payroll' and h.source_id=pay.id
      left join lateral(select jsonb_agg(jsonb_build_object('propertyId',q.property_id,'amount',q.amount) order by q.property_id) rows from private.aqari_property_cost_allocations q where q.workspace_id=pay.workspace_id and q.source_kind='payroll' and q.source_id=pay.id and q.revision=h.current_revision)a on true
      where pay.workspace_id=w and pay.state='paid'
     union all
     select private.aqari_cost_source(w,'utility',u.id)||jsonb_build_object('revision',coalesce(h.current_revision,0),'allocations',coalesce(a.rows,'[]'::jsonb)) x
      from public.aqari_utility_entries u left join private.aqari_property_cost_allocation_heads h on h.workspace_id=u.workspace_id and h.source_kind='utility' and h.source_id=u.id
      left join lateral(select jsonb_agg(jsonb_build_object('propertyId',q.property_id,'amount',q.amount) order by q.property_id) rows from private.aqari_property_cost_allocations q where q.workspace_id=u.workspace_id and q.source_kind='utility' and q.source_id=u.id and q.revision=h.current_revision)a on true
      where u.workspace_id=w and u.entry_type='bill' and u.amount_paid>0 and u.payment_date is not null and u.payment_document_id is not null
    )s
   )
  );
 end if;
 if p_action<>'save' or jsonb_typeof(p_data) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_data)k where k not in('sourceKind','sourceId','revision','allocations','reason')) then raise invalid_parameter_value using message='INVALID_ALLOCATION_REQUEST';end if;
 if not private.aqari_manager(w) or not private.aqari_can(w,'finance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 perform private.aqari_require_sensitive_aal2(w);
 kind:=p_data->>'sourceKind';ident:=nullif(p_data->>'sourceId','')::uuid;expected:=coalesce((p_data->>'revision')::bigint,-1);why:=btrim(coalesce(p_data->>'reason',''));rows:=p_data->'allocations';
 if kind not in('financial_expense','payroll','utility') or ident is null or expected<0 or jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) not between 1 and 50 or length(why) not between 3 and 1000 then raise invalid_parameter_value using message='ALLOCATION_FIELDS_REQUIRED';end if;
 source:=private.aqari_cost_source(w,kind,ident);
 if exists(select 1 from jsonb_array_elements(rows)r where jsonb_typeof(r)<>'object' or exists(select 1 from jsonb_object_keys(r)k where k not in('propertyId','amount')) or coalesce(r->>'propertyId','') !~ '^[0-9a-f-]{36}$' or coalesce(r->>'amount','') !~ '^\d{1,12}(\.\d{1,3})?$' or (r->>'amount')::numeric<=0) then raise invalid_parameter_value using message='INVALID_ALLOCATION_ROW';end if;
 if (select count(*) from jsonb_array_elements(rows))<>(select count(distinct r->>'propertyId') from jsonb_array_elements(rows)r) then raise unique_violation using message='DUPLICATE_ALLOCATION_PROPERTY';end if;
 select coalesce(array_agg((r->>'propertyId')::uuid order by (r->>'propertyId')::uuid),'{}'::uuid[]),coalesce(sum((r->>'amount')::numeric),0) into property_ids,sum_amount from jsonb_array_elements(rows)r;
 if sum_amount is distinct from (source->>'total')::numeric then raise check_violation using message='ALLOCATION_TOTAL_MISMATCH';end if;
 if exists(select 1 from unnest(property_ids)p where not exists(select 1 from public.aqari_properties x where x.workspace_id=w and x.id=p)) then raise insufficient_privilege using message='ALLOCATION_PROPERTY_NOT_FOUND';end if;
 if kind='payroll' and exists(
  select 1 from unnest(property_ids) allocated_property
  where not exists(select 1 from jsonb_array_elements_text(coalesce(source->'propertyIds','[]'::jsonb)) as allowed(value) where allowed.value=allocated_property::text)
 ) then raise insufficient_privilege using message='PAYROLL_ALLOCATION_OUTSIDE_EMPLOYEE_PROPERTIES';end if;
 select * into head from private.aqari_property_cost_allocation_heads where workspace_id=w and source_kind=kind and source_id=ident for update;
 if coalesce(head.current_revision,0) is distinct from expected then raise serialization_failure using message='ALLOCATION_REVISION_CONFLICT';end if;
 next_rev:=expected+1;select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
 insert into private.aqari_property_cost_allocation_heads(workspace_id,source_kind,source_id,current_revision,source_total,source_date,updated_by,updated_at)
 values(w,kind,ident,next_rev,(source->>'total')::numeric,(source->>'date')::date,auth.uid(),now())
 on conflict(workspace_id,source_kind,source_id) do update set current_revision=excluded.current_revision,source_total=excluded.source_total,source_date=excluded.source_date,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 insert into private.aqari_property_cost_allocations(workspace_id,source_kind,source_id,revision,property_id,amount,reason,actor_id,actor_name)
 select w,kind,ident,next_rev,(r->>'propertyId')::uuid,(r->>'amount')::numeric,why,auth.uid(),actor from jsonb_array_elements(rows)r;
 return jsonb_build_object('workspace_id',w,'sourceKind',kind,'sourceId',ident,'revision',next_rev,'total',(source->>'total')::numeric,'allocations',rows,'actor',actor,'recordedAt',now());
end $$;
revoke all on function public.aqari_property_cost_allocation(uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_property_cost_allocation(uuid,text,jsonb) to authenticated;

create or replace function public.aqari_property_financial_summary(p_workspace_id uuid,p_property_id uuid,p_as_of date default (now() at time zone 'Asia/Kuwait')::date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w uuid:=p_workspace_id;p uuid:=p_property_id;month_start date;year_start date;income_month numeric:=0;income_year numeric:=0;expense_month numeric:=0;expense_year numeric:=0;finance_month numeric:=0;finance_year numeric:=0;payroll_month numeric:=0;payroll_year numeric:=0;utility_month numeric:=0;utility_year numeric:=0;unallocated_payroll numeric:=0;
begin
 if not private.aqari_can_property(w,p,'properties','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if not private.aqari_can(w,'collections','read') or not private.aqari_can(w,'finance','read') then return jsonb_build_object('workspace_id',w,'property_id',p,'available',false,'reason','PERMISSION_DENIED');end if;
 if p_as_of<'2000-01-01' or p_as_of>(now() at time zone 'Asia/Kuwait')::date+1 then raise invalid_parameter_value using message='INVALID_SUMMARY_DATE';end if;
 month_start:=date_trunc('month',p_as_of)::date;year_start:=date_trunc('year',p_as_of)::date;
 select coalesce(sum(r.amount) filter(where r.paid_at between month_start and p_as_of),0),coalesce(sum(r.amount) filter(where r.paid_at between year_start and p_as_of),0) into income_month,income_year
 from public.aqari_rent_payments r join public.aqari_leases l on l.workspace_id=r.workspace_id and l.id=r.lease_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
 where r.workspace_id=w and u.property_id=p and r.status not in('cancelled','ملغى') and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=r.workspace_id and c.payment_id=r.id);
 select coalesce(sum(private.aqari_cost_amount(w,'financial_expense',e.id,p,e.amount,array[e.property_id])) filter(where e.expense_date between month_start and p_as_of),0),coalesce(sum(private.aqari_cost_amount(w,'financial_expense',e.id,p,e.amount,array[e.property_id])) filter(where e.expense_date between year_start and p_as_of),0) into finance_month,finance_year from private.aqari_financial_expenses e where e.workspace_id=w and e.state='approved';
 select coalesce(sum(private.aqari_cost_amount(w,'payroll',pay.id,p,coalesce(pay.net,pay.basic+pay.allowances+pay.overtime-pay.deductions-pay.advance_repayment),coalesce((select array_agg(distinct j.value::uuid) from jsonb_array_elements_text(coalesce(pay.snapshot->'property_ids',to_jsonb(h.property_ids))) as j(value)),h.property_ids))) filter(where coalesce(pay.paid_at::date,pay.month) between month_start and p_as_of),0),coalesce(sum(private.aqari_cost_amount(w,'payroll',pay.id,p,coalesce(pay.net,pay.basic+pay.allowances+pay.overtime-pay.deductions-pay.advance_repayment),coalesce((select array_agg(distinct j.value::uuid) from jsonb_array_elements_text(coalesce(pay.snapshot->'property_ids',to_jsonb(h.property_ids))) as j(value)),h.property_ids))) filter(where coalesce(pay.paid_at::date,pay.month) between year_start and p_as_of),0) into payroll_month,payroll_year from private.aqari_hr_payroll pay join private.aqari_hr_employees h on h.workspace_id=pay.workspace_id and h.id=pay.employee_id where pay.workspace_id=w and pay.state='paid';
 select coalesce(sum(private.aqari_cost_amount(w,'utility',u.id,p,u.amount_paid,array[u.property_id])) filter(where u.payment_date between month_start and p_as_of),0),coalesce(sum(private.aqari_cost_amount(w,'utility',u.id,p,u.amount_paid,array[u.property_id])) filter(where u.payment_date between year_start and p_as_of),0) into utility_month,utility_year from public.aqari_utility_entries u where u.workspace_id=w and u.entry_type='bill' and u.amount_paid>0 and u.payment_date is not null and u.payment_document_id is not null;
 select coalesce(sum(coalesce(pay.net,pay.basic+pay.allowances+pay.overtime-pay.deductions-pay.advance_repayment)),0) into unallocated_payroll from private.aqari_hr_payroll pay join private.aqari_hr_employees h on h.workspace_id=pay.workspace_id and h.id=pay.employee_id where pay.workspace_id=w and pay.state='paid' and coalesce(pay.paid_at::date,pay.month) between year_start and p_as_of and p=any(h.property_ids) and cardinality(h.property_ids)>1 and not exists(select 1 from private.aqari_property_cost_allocation_heads a where a.workspace_id=w and a.source_kind='payroll' and a.source_id=pay.id and a.current_revision>0);
 expense_month:=finance_month+payroll_month+utility_month;expense_year:=finance_year+payroll_year+utility_year;
 return jsonb_build_object('workspace_id',w,'property_id',p,'available',true,'asOf',p_as_of,
  'month',jsonb_build_object('income',income_month,'expenses',expense_month,'net',income_month-expense_month,'finance',finance_month,'payroll',payroll_month,'utilities',utility_month),
  'year',jsonb_build_object('income',income_year,'expenses',expense_year,'net',income_year-expense_year,'finance',finance_year,'payroll',payroll_year,'utilities',utility_year),
  'unallocatedSharedPayroll',unallocated_payroll,
  'policy','rent collections minus approved financial expenses, paid payroll and evidenced utility payments; maintenance/work-order invoices enter only through the financial expense ledger, so they are never added twice');
end $$;
revoke all on function public.aqari_property_financial_summary(uuid,uuid,date) from public,anon;
grant execute on function public.aqari_property_financial_summary(uuid,uuid,date) to authenticated;

commit;
