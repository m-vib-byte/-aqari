-- AQARI V267 KPI projection from normalized, persisted records only.
-- CODE ONLY: read-only RPC; no cached or invented metrics.
begin;
create or replace function public.aqari_kpi_dashboard(p_workspace_id uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare w uuid:=p_workspace_id;from_date date:=p_from;to_date date:=p_to;units_count integer;occupied_count integer;expected numeric;collected numeric;expenses numeric;lag numeric;period_expected numeric;period_paid numeric;
begin
 if auth.uid() is null or not private.aqari_manager(w) or not private.aqari_can(w,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if from_date is null or to_date is null or from_date>to_date or to_date-from_date>366 then raise exception 'INVALID_KPI_PERIOD' using errcode='22023';end if;
 select count(*) into units_count from public.aqari_units u where u.workspace_id=w;
 select count(distinct l.unit_id),coalesce(sum(l.monthly_rent),0) into occupied_count,expected from public.aqari_leases l
  where l.workspace_id=w and l.status='signed' and l.start_date<=to_date and l.end_date>=from_date;
 select coalesce(sum(p.amount),0),avg(greatest(0,p.paid_at::date-p.period::date)) into collected,lag from public.aqari_rent_payments p
  where p.workspace_id=w and lower(p.status) in ('paid','partial','مدفوع','جزئي') and p.paid_at between from_date and to_date
   and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id);
 -- Match rent payments to the same contractual due dates, as of the report end.
 -- Keep cash received during the period separate from settlement of its dues.
 with periods as (
  select l.id as lease_id,g.period::date as period,
   private.aqari_reminder_due(l.snapshot,l.monthly_rent,g.period::date) as due_amount
  from public.aqari_leases l
  cross join lateral generate_series(
   greatest(date_trunc('month',l.start_date),date_trunc('month',from_date)),
   least(date_trunc('month',l.end_date),date_trunc('month',to_date)),interval '1 month') g(period)
  where l.workspace_id=w and l.status='signed'
   and private.aqari_rent_due_on(l.snapshot,l.start_date,g.period::date) between from_date and to_date
 ), matched as (
  select d.due_amount,coalesce(sum(p.amount),0) as paid_amount
  from periods d left join public.aqari_rent_payments p
   on p.workspace_id=w and p.lease_id=d.lease_id and p.period=d.period
   and p.paid_at<=to_date and lower(p.status) in ('paid','partial','مدفوع','جزئي')
   and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id)
  group by d.lease_id,d.period,d.due_amount
 )
 select coalesce(sum(due_amount),0),coalesce(sum(paid_amount),0)
 into period_expected,period_paid from matched;
 select coalesce(sum(e.amount),0) into expenses from private.aqari_financial_expenses e
  where e.workspace_id=w and e.state='approved' and e.expense_date between from_date and to_date;
 return jsonb_build_object(
  'period',jsonb_build_object('from',from_date,'to',to_date),
  'units',jsonb_build_object('total',units_count,'occupied',occupied_count,'vacant',greatest(units_count-occupied_count,0),
   'vacancy_rate',case when units_count=0 then null else round((greatest(units_count-occupied_count,0)::numeric/units_count)*100,2) end),
  'collections',jsonb_build_object('expected_monthly_snapshot',expected::text,'expected_period',period_expected::text,
   'period_paid',period_paid::text,'basis','contract_due_dates_cash_as_of_end_v1','actual',collected::text,
   'rate',case when period_expected=0 then null else round((period_paid/period_expected)*100,2) end,
   'average_days',case when lag is null then null else round(lag,2) end),
  'profit',jsonb_build_object('actual_income',collected::text,'approved_expenses',expenses::text,'actual_net',(collected-expenses)::text,
   'projected_net',(period_expected-expenses)::text,'projection_basis','contract_period_dues_minus_period_approved_expenses'),
  'sources',jsonb_build_array('public.aqari_units','public.aqari_leases','public.aqari_rent_payments','private.aqari_financial_expenses'),
  'generated_at',now()
 );
end $$;
commit;
