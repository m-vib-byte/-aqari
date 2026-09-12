-- Commercial statement reads the same active-allocation source as clearance.
create or replace function private.aqari_commercial_statement_data(w uuid,lid uuid,from_d date,to_d date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare due_total numeric:=0;paid_total numeric:=0;
begin
 if from_d is null or to_d is null or from_d>to_d then raise invalid_parameter_value using message='INVALID_COMMERCIAL_STATEMENT_PERIOD';end if;
 select coalesce(sum(s.amount),0) into due_total from private.aqari_commercial_sales s
 where s.workspace_id=w and s.lease_id=lid and s.period_end between from_d and to_d
  and not exists(select 1 from private.aqari_commercial_sales_reversals r where r.workspace_id=w and r.sale_id=s.id);
 select coalesce(sum(v.amount),0) into paid_total from private.aqari_commercial_active_allocations v
 where v.workspace_id=w and v.lease_id=lid and v.sale_period_end between from_d and to_d;
 return jsonb_build_object(
  'lease_id',lid,'from_date',from_d,'to_date',to_d,
  'commercial_due_total',due_total::numeric(18,3)::text,
  'commercial_paid_total',paid_total::numeric(18,3)::text,
  'commercial_balance',greatest(due_total-paid_total,0)::numeric(18,3)::text,
  'sales',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object(
    'reversal',(select to_jsonb(sr) from private.aqari_commercial_sales_reversals sr where sr.workspace_id=w and sr.sale_id=s.id),
    'allocations',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object(
      'payment_reference',p.reference,'payment_status',p.status,'payment_amount',p.amount::text,
      'receipt_cancelled',exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id),
      'reversal',(select to_jsonb(ar) from private.aqari_commercial_payment_allocation_reversals ar where ar.workspace_id=w and ar.allocation_id=a.id)
     ) order by a.recorded_at,a.id)
     from private.aqari_commercial_payment_allocations a join public.aqari_rent_payments p on p.id=a.payment_id
     where a.workspace_id=w and a.sale_id=s.id),'[]'::jsonb),
    'paid_amount',coalesce((select sum(v.amount) from private.aqari_commercial_active_allocations v where v.workspace_id=w and v.sale_id=s.id),0)::numeric(18,3)::text
   ) order by s.month,s.recorded_at,s.id)
   from private.aqari_commercial_sales s where s.workspace_id=w and s.lease_id=lid and s.period_end between from_d and to_d),'[]'::jsonb)
 );
end $$;
