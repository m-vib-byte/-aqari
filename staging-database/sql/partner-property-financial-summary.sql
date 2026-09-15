-- AQARI V267 isolated Preview only: read-only property finance for an authorized partner.
-- This exposes aggregate property totals only. It never exposes tenant rows, payroll rows,
-- expense rows, other partners, allocation internals or write operations.
begin;

create or replace function public.aqari_partner_property_finance(
 p_property_id uuid,
 p_month date
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 account_email text;
 w uuid;
 month_start date:=p_month;
 month_end date;
 year_start date;
 as_of date;
 today_kw date:=(now() at time zone 'Asia/Kuwait')::date;
 income_month numeric:=0; income_year numeric:=0;
 expected_month numeric:=0; expected_year numeric:=0; arrears numeric:=0;
 finance_month numeric:=0; finance_year numeric:=0;
 payroll_month numeric:=0; payroll_year numeric:=0;
 utility_month numeric:=0; utility_year numeric:=0;
 expense_month numeric:=0; expense_year numeric:=0;
 unallocated_payroll numeric:=0;
 complete boolean:=true;
begin
 if auth.uid() is null then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select lower(email) into account_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if account_email is null then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select a.workspace_id into w
 from private.aqari_partner_access a
 where a.property_id=p_property_id and a.user_id=auth.uid() and a.email=account_email and a.is_active
   and not exists(select 1 from public.aqari_memberships m where m.user_id=auth.uid() and m.workspace_id=a.workspace_id);
 if w is null then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if month_start is null or month_start<>date_trunc('month',month_start)::date
    or month_start not between date '2000-01-01' and date '2100-12-01' then
  raise invalid_parameter_value using message='INVALID_MONTH';
 end if;
 if month_start>date_trunc('month',today_kw)::date then
  return jsonb_build_object('user_id',auth.uid(),'workspace_id',w,'property_id',p_property_id,
   'period',month_start,'currency','KWD','available',false,'reason','FUTURE_MONTH');
 end if;
 month_end:=(month_start+interval '1 month-1 day')::date;
 as_of:=least(month_end,today_kw);
 year_start:=date_trunc('year',month_start)::date;

 select
  coalesce(sum(r.amount) filter(where r.paid_at between month_start and as_of),0),
  coalesce(sum(r.amount) filter(where r.paid_at between year_start and as_of),0)
 into income_month,income_year
 from public.aqari_rent_payments r
 join public.aqari_leases l on l.workspace_id=r.workspace_id and l.id=r.lease_id
 join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
 where r.workspace_id=w and u.property_id=p_property_id
   and r.status not in('cancelled','ملغى')
   and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=r.workspace_id and c.payment_id=r.id);

 select
  coalesce(sum(d.due_amount) filter(where d.period=month_start),0),
  coalesce(sum(d.due_amount) filter(where d.period between year_start and month_start),0),
  coalesce(sum(greatest(d.balance,0)) filter(where d.period<=month_start),0)
 into expected_month,expected_year,arrears
 from private.aqari_rent_due_periods d
 join public.aqari_leases l on l.workspace_id=d.workspace_id and l.id=d.lease_id
 join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
 where d.workspace_id=w and u.property_id=p_property_id;

 select
  coalesce(sum(private.aqari_cost_amount(w,'financial_expense',e.id,p_property_id,e.amount,array[e.property_id])) filter(where e.expense_date between month_start and as_of),0),
  coalesce(sum(private.aqari_cost_amount(w,'financial_expense',e.id,p_property_id,e.amount,array[e.property_id])) filter(where e.expense_date between year_start and as_of),0)
 into finance_month,finance_year
 from private.aqari_financial_expenses e where e.workspace_id=w and e.state='approved';

 select
  coalesce(sum(private.aqari_cost_amount(w,'payroll',pay.id,p_property_id,coalesce(pay.net,pay.basic+pay.allowances+pay.overtime-pay.deductions-pay.advance_repayment),h.property_ids)) filter(where coalesce(pay.paid_at::date,pay.month) between month_start and as_of),0),
  coalesce(sum(private.aqari_cost_amount(w,'payroll',pay.id,p_property_id,coalesce(pay.net,pay.basic+pay.allowances+pay.overtime-pay.deductions-pay.advance_repayment),h.property_ids)) filter(where coalesce(pay.paid_at::date,pay.month) between year_start and as_of),0)
 into payroll_month,payroll_year
 from private.aqari_hr_payroll pay
 join private.aqari_hr_employees h on h.workspace_id=pay.workspace_id and h.id=pay.employee_id
 where pay.workspace_id=w and pay.state='paid';

 select
  coalesce(sum(private.aqari_cost_amount(w,'utility',u.id,p_property_id,u.amount_paid,array[u.property_id])) filter(where u.payment_date between month_start and as_of),0),
  coalesce(sum(private.aqari_cost_amount(w,'utility',u.id,p_property_id,u.amount_paid,array[u.property_id])) filter(where u.payment_date between year_start and as_of),0)
 into utility_month,utility_year
 from public.aqari_utility_entries u
 where u.workspace_id=w and u.entry_type='bill' and u.amount_paid>0 and u.payment_date is not null and u.payment_document_id is not null;

 select coalesce(sum(coalesce(pay.net,pay.basic+pay.allowances+pay.overtime-pay.deductions-pay.advance_repayment)),0)
 into unallocated_payroll
 from private.aqari_hr_payroll pay
 join private.aqari_hr_employees h on h.workspace_id=pay.workspace_id and h.id=pay.employee_id
 where pay.workspace_id=w and pay.state='paid' and coalesce(pay.paid_at::date,pay.month) between year_start and as_of
   and p_property_id=any(h.property_ids) and cardinality(h.property_ids)>1
   and not exists(select 1 from private.aqari_property_cost_allocation_heads a where a.workspace_id=w and a.source_kind='payroll' and a.source_id=pay.id and a.current_revision>0);

 expense_month:=finance_month+payroll_month+utility_month;
 expense_year:=finance_year+payroll_year+utility_year;
 complete:=unallocated_payroll=0;

 return jsonb_build_object(
  'user_id',auth.uid(),'workspace_id',w,'property_id',p_property_id,'period',month_start,'asOf',as_of,
  'currency','KWD','available',true,'complete',complete,
  'warning',case when complete then '' else 'UNALLOCATED_SHARED_PAYROLL' end,
  'arrears_fils',(round(arrears*1000))::bigint::text,
  'month',jsonb_build_object(
   'income_fils',(round(income_month*1000))::bigint::text,
   'expected_income_fils',(round(expected_month*1000))::bigint::text,
   'expenses_fils',(round(expense_month*1000))::bigint::text,
   'net_fils',(round((income_month-expense_month)*1000))::bigint::text,
   'collection_variance_fils',(round((income_month-expected_month)*1000))::bigint::text),
  'year',jsonb_build_object(
   'income_fils',(round(income_year*1000))::bigint::text,
   'expected_income_fils',(round(expected_year*1000))::bigint::text,
   'expenses_fils',(round(expense_year*1000))::bigint::text,
   'net_fils',(round((income_year-expense_year)*1000))::bigint::text,
   'collection_variance_fils',(round((income_year-expected_year)*1000))::bigint::text),
  'policy','aggregate actual non-cancelled rent collections minus approved property allocations; shared payroll must be allocated before totals are complete'
 );
end $$;

revoke all on function public.aqari_partner_property_finance(uuid,date) from public,anon;
grant execute on function public.aqari_partner_property_finance(uuid,date) to authenticated;
commit;
