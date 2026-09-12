-- Scoped monthly history projection. No financial writes or new accounting totals.
begin;
create function private.aqari_financial_archive(w uuid,month_key text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare first_day date;next_month date;base jsonb;entries jsonb;
begin
 if auth.uid() is null or not private.aqari_can(w,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if month_key is null or month_key!~'^[0-9]{4}-(0[1-9]|1[0-2])$' then raise invalid_parameter_value using message='INVALID_ARCHIVE_MONTH';end if;
 first_day:=(month_key||'-01')::date;next_month:=(first_day+interval '1 month')::date;
 base:=public.aqari_financial_register(w,'list',jsonb_build_object('month',month_key));
 select coalesce(jsonb_agg(to_jsonb(x) order by x.on_date,x.stream,x.id),'[]') into entries from(
  select 'rent'::text stream,p.id,u.property_id,p.lease_id,p.paid_at on_date,p.amount::text amount,'received'::text direction,
   case when exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id) then 'cancelled' else p.status end status,
   p.reference,coalesce(p.receipt->>'collectorName','') description
  from public.aqari_rent_payments p join public.aqari_leases l on l.workspace_id=p.workspace_id and l.id=p.lease_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
  where p.workspace_id=w and p.paid_at>=first_day and p.paid_at<next_month and private.aqari_can_property(w,u.property_id,'finance','read')
  union all
  select 'expense',e.id,e.property_id,null,e.expense_date,e.amount::text,'paid',e.state,coalesce(e.voucher_no,e.reference),e.description from private.aqari_financial_expenses e
  where e.workspace_id=w and e.expense_date>=first_day and e.expense_date<next_month and private.aqari_can_property(w,e.property_id,'finance','read')
  union all
  select 'deposit',e.id,u.property_id,e.lease_id,e.on_date,e.amount::text,e.kind,e.status,e.voucher_no,e.reason from private.aqari_deposit_entries e
  join public.aqari_leases l on l.workspace_id=e.workspace_id and l.id=e.lease_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
  where e.workspace_id=w and e.on_date>=first_day and e.on_date<next_month and private.aqari_can_property(w,u.property_id,'finance','read')
  union all
  select 'adjustment',e.id,u.property_id,e.lease_id,e.occurred_on,e.amount::text,e.direction,'recorded',e.source_type||':'||e.source_id,e.reason from private.aqari_tenant_adjustments e
  join public.aqari_leases l on l.workspace_id=e.workspace_id and l.id=e.lease_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
  where e.workspace_id=w and e.occurred_on>=first_day and e.occurred_on<next_month and private.aqari_can_property(w,u.property_id,'finance','read')
  union all
  select case when e.kind in ('opening_credit','opening_debit','opening_balance') then 'opening' else 'tenant_ledger' end,e.id,u.property_id,e.lease_id,e.occurred_on,e.amount::text,e.direction,'recorded',e.source_type||':'||e.source_id,e.reason from private.aqari_tenant_ledger_entries e
  left join public.aqari_leases l on l.workspace_id=e.workspace_id and l.id=e.lease_id left join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
  where e.workspace_id=w and e.occurred_on>=first_day and e.occurred_on<next_month and (private.aqari_can_property(w,u.property_id,'finance','read') or (e.lease_id is null and private.aqari_manager(w)))
  union all
  select 'credit_allocation',e.id,u.property_id,e.lease_id,e.period,e.amount::text,'allocation','recorded',e.credit_entry_id::text,'تخصيص رصيد سابق، وليس تحصيلاً جديداً' from private.aqari_credit_allocations e
  join public.aqari_leases l on l.workspace_id=e.workspace_id and l.id=e.lease_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
  where e.workspace_id=w and e.period>=first_day and e.period<next_month and private.aqari_can_property(w,u.property_id,'finance','read')
  union all
  select 'petty_cash',e.id,e.property_id,null,(e.created_at at time zone 'Asia/Kuwait')::date,e.amount::text,e.kind,'recorded',coalesce(e.invoice_id,''),'حركة عهدة مالية' from private.aqari_petty_cash_entries e
  where e.workspace_id=w and e.created_at>=(first_day::timestamp at time zone 'Asia/Kuwait') and e.created_at<(next_month::timestamp at time zone 'Asia/Kuwait') and (private.aqari_can_property(w,e.property_id,'finance','read') or (e.property_id is null and private.aqari_manager(w)))
 ) x;
 return jsonb_build_object('month',month_key,'properties',base->'properties','period',base->'period','summary',base->'summary','history',base->'history','history_truncated',jsonb_array_length(base->'history')>=100,'entries',entries,'scope','scoped_sources_not_consolidated_profit');
end $$;
revoke all on function private.aqari_financial_archive(uuid,text) from public,anon,authenticated;
grant execute on function private.aqari_financial_archive(uuid,text) to authenticated;
create function public.aqari_financial_archive(p_workspace_id uuid,p_month text) returns jsonb
language sql stable security invoker set search_path='' as $$select private.aqari_financial_archive(p_workspace_id,p_month)$$;
revoke all on function public.aqari_financial_archive(uuid,text) from public,anon,authenticated;
grant execute on function public.aqari_financial_archive(uuid,text) to authenticated;
commit;
