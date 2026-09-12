-- Unified vacating balance splits confirmed tenant payments between rent and
-- active commercial sales allocations and excludes cancelled receipts.
create or replace function private.aqari_vacating_balances(w uuid,lid uuid,vdate date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare l public.aqari_leases;due_total numeric:=0;payment_total numeric:=0;commercial_due numeric:=0;commercial_paid numeric:=0;rent_paid_total numeric:=0;deposit_balance numeric:=0;period_start date;period_end date;
begin
 select * into l from public.aqari_leases where workspace_id=w and id=lid;
 if not found then raise exception 'VACATING_LEASE_NOT_FOUND' using errcode='22023';end if;
 if l.start_date is null or l.monthly_rent is null or l.end_date is null or vdate<l.start_date then raise exception 'VACATING_INCOMPLETE_CONTRACT' using errcode='22023';end if;
 period_start:=date_trunc('month',coalesce(l.start_date,vdate))::date;period_end:=date_trunc('month',vdate)::date;
 if period_start<=period_end then
  select coalesce(sum(case when l.snapshot->>'rentalTermsVersion'='1' then coalesce(private.aqari_contract_due(l.snapshot,to_char(p,'YYYY-MM')),l.monthly_rent) else l.monthly_rent end),0)
  into due_total from generate_series(period_start,period_end,interval '1 month') p;
 end if;
 select coalesce(sum(p.amount),0) into payment_total from public.aqari_rent_payments p
 where p.workspace_id=w and p.lease_id=lid and p.paid_at<=vdate and p.status in ('مدفوع','جزئي','paid','partial')
  and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id);
 select coalesce(sum(s.amount),0) into commercial_due from private.aqari_commercial_sales s
 where s.workspace_id=w and s.lease_id=lid and s.period_end<=vdate
  and not exists(select 1 from private.aqari_commercial_sales_reversals sr where sr.workspace_id=w and sr.sale_id=s.id);
 select coalesce(sum(v.amount),0) into commercial_paid from private.aqari_commercial_active_allocations v
 where v.workspace_id=w and v.lease_id=lid and v.sale_period_end<=vdate and v.paid_at<=vdate;
 rent_paid_total:=greatest(payment_total-commercial_paid,0);
 select coalesce(sum(case e.kind when 'receipt' then e.amount else -e.amount end),0) into deposit_balance
 from private.aqari_deposit_entries e where e.workspace_id=w and e.lease_id=lid;
 return jsonb_build_object(
  'rent_due_total',due_total::numeric(18,3)::text,
  'rent_payment_total',payment_total::numeric(18,3)::text,
  'commercial_allocated_from_payments',commercial_paid::numeric(18,3)::text,
  'rent_paid_total',rent_paid_total::numeric(18,3)::text,
  'rent_balance',greatest(due_total-rent_paid_total,0)::numeric(18,3)::text,
  'tenant_credit',greatest(rent_paid_total-due_total,0)::numeric(18,3)::text,
  'commercial_sales_due_total',commercial_due::numeric(18,3)::text,
  'commercial_sales_paid_total',commercial_paid::numeric(18,3)::text,
  'commercial_sales_balance',greatest(commercial_due-commercial_paid,0)::numeric(18,3)::text,
  'unified_due_balance',(greatest(due_total-rent_paid_total,0)+greatest(commercial_due-commercial_paid,0))::numeric(18,3)::text,
  'deposit_balance',deposit_balance::numeric(18,3)::text);
end $$;
