-- Function-only compatibility repair: read saved receipt collector aliases; no record changes.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create or replace function private.aqari_official_source(w uuid,k text,t text,i uuid,source_id uuid,fields jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare defaults jsonb;pay public.aqari_rent_payments;dep private.aqari_deposit_entries;
 expense private.aqari_financial_expenses;work private.aqari_work_orders;settlement private.aqari_vacating_settlements;
 required_entity text;receipt_count bigint;total numeric;on_date date;starts_on date;snap jsonb;v jsonb;
begin
 required_entity:=case when k in ('payment_voucher','expense_approval','daily_collection') then 'property' when k='work_order' then 'work_order'
 when k in ('rent_receipt','deposit_receipt','deposit_refund','tenant_statement','debt_notice','renewal_notice','nonrenewal_notice','receipt_voucher','key_handover','damage_report','final_settlement','clearance') then 'lease' else null end;
 if required_entity is null or t is distinct from required_entity then raise exception 'DOCUMENT_KIND_ENTITY_MISMATCH' using errcode='22023';end if;
 if not private.aqari_official_entity_scope(w,t,i,'read') then raise insufficient_privilege using message='DOCUMENT_ENTITY_NOT_FOUND';end if;
 if t='lease' then
  select jsonb_build_object('tenantName',q.full_name,'contractNo',l.contract_no,'propertyName',p.name,'unitNo',u.unit_no)
   into defaults from public.aqari_leases l join public.aqari_tenants q on q.workspace_id=w and q.id=l.tenant_id
   join public.aqari_units u on u.workspace_id=w and u.id=l.unit_id join public.aqari_properties p on p.workspace_id=w and p.id=u.property_id
   where l.workspace_id=w and l.id=i;
 elsif t='property' then select jsonb_build_object('propertyName',name) into defaults from public.aqari_properties where workspace_id=w and id=i;
 else
  select * into strict work from private.aqari_work_orders where workspace_id=w and id=i;
  if work.status not in ('approved','assigned','in_progress','completed') then raise exception 'DOCUMENT_APPROVED_SOURCE_REQUIRED' using errcode='23514';end if;
  select jsonb_build_object('propertyName',p.name,'vendorName',v.name,'description',work.description,'approvedAmount',work.approved_amount::text,
   'approvedBy',coalesce(nullif(pr.display_name,''),work.approved_by::text),'sourceId',work.id::text)
   into defaults from public.aqari_properties p join private.aqari_vendors v on v.workspace_id=w and v.id=work.vendor_id
   left join public.aqari_profiles pr on pr.user_id=work.approved_by where p.workspace_id=w and p.id=work.property_id;
 end if;

 if k in ('rent_receipt','receipt_voucher','deposit_receipt','deposit_refund','tenant_statement','debt_notice','daily_collection','final_settlement','clearance','payment_voucher','expense_approval') then
  if not private.aqari_can(w,'collections','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 end if;
 if k in ('rent_receipt','receipt_voucher') then
  select * into pay from public.aqari_rent_payments p where p.workspace_id=w and p.lease_id=i and p.id=source_id
   and p.status in ('paid','partial','مدفوع','جزئي') and p.amount>0
   and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id);
  if not found then raise exception 'DOCUMENT_CONFIRMED_PAYMENT_REQUIRED' using errcode='23514';end if;
  defaults:=defaults||jsonb_build_object('sourceId',pay.id::text,'amount',pay.amount::text,'period',to_char(pay.period,'YYYY-MM'),
   'paymentMethod',case pay.payment_method when 'cash' then 'نقداً' when 'knet' then 'كي نت' when 'bank' then 'تحويل بنكي' when 'cheque' then 'شيك' else pay.payment_method end,
   'paymentReference',coalesce(nullif(pay.reference,''),'نقداً دون مرجع بنكي'),'reference',coalesce(nullif(pay.reference,''),'نقداً دون مرجع بنكي'),
   'collectorName',coalesce(nullif(pay.receipt->>'collectorName',''),nullif(pay.receipt->>'collector',''),nullif(pay.receipt->>'accountant','')),
   'receivedFrom',defaults->>'tenantName','reason','إيجار الفترة '||to_char(pay.period,'YYYY-MM'));
 elsif k in ('deposit_receipt','deposit_refund') then
  select * into dep from private.aqari_deposit_entries e where e.workspace_id=w and e.lease_id=i and e.id=source_id
   and e.status='confirmed' and e.kind=case k when 'deposit_receipt' then 'receipt' else 'refund' end;
  if not found then raise exception 'DOCUMENT_CONFIRMED_DEPOSIT_REQUIRED' using errcode='23514';end if;
  defaults:=defaults||jsonb_build_object('sourceId',dep.id::text,'amount',dep.amount::text,'collectorName',dep.actor_name,'approvedBy',dep.actor_name,
   'reason',dep.reason,'paymentMethod',case dep.method when 'cash' then 'نقداً' when 'knet' then 'كي نت' when 'bank' then 'تحويل بنكي' when 'cheque' then 'شيك' else dep.method end);
 elsif k in ('payment_voucher','expense_approval') then
  select * into expense from private.aqari_financial_expenses e where e.workspace_id=w and e.property_id=i and e.id=source_id and e.state='approved';
  if not found then raise exception 'DOCUMENT_APPROVED_EXPENSE_REQUIRED' using errcode='23514';end if;
  defaults:=defaults||jsonb_build_object('sourceId',expense.id::text,'amount',expense.amount::text,'paidTo',expense.payee,
   'reason',expense.description,'expenseCategory',expense.category,'approvedBy',expense.approved_by_name,'invoiceReference',coalesce(nullif(expense.reference,''),expense.voucher_no));
 elsif k in ('renewal_notice','nonrenewal_notice') then
  select jsonb_build_object('currentEndDate',l.end_date::text) into v from public.aqari_leases l where l.workspace_id=w and l.id=i and l.status in ('signed','expired');
  if v is null then raise exception 'DOCUMENT_ACTIVE_LEASE_REQUIRED' using errcode='23514';end if;defaults:=defaults||v;
 elsif k in ('tenant_statement','debt_notice') then
  select start_date into starts_on from public.aqari_leases where workspace_id=w and id=i;
  on_date:=coalesce(nullif(fields->>case k when 'debt_notice' then 'dueDate' else 'toDate' end,'')::date,(now() at time zone 'Asia/Kuwait')::date);
  v:=private.aqari_official_statement(w,i,case k when 'debt_notice' then starts_on else coalesce(nullif(fields->>'fromDate','')::date,starts_on) end,on_date);
  if k='debt_notice' then
   if (v->>'closingBalance')::numeric<=0 then raise exception 'DOCUMENT_NO_ACTUAL_DEBT' using errcode='23514';end if;
   defaults:=defaults||jsonb_build_object('dueDate',on_date::text,'dueAmount',v->>'closingBalance');
  else defaults:=defaults||v;end if;
 elsif k='daily_collection' then
  if coalesce(fields->>'collectionDate','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'DOCUMENT_COLLECTION_DATE_REQUIRED' using errcode='22023';end if;
  on_date:=(fields->>'collectionDate')::date;
  select count(*),coalesce(sum(p.amount),0) into receipt_count,total from public.aqari_rent_payments p
   join public.aqari_leases l on l.workspace_id=w and l.id=p.lease_id join public.aqari_units u on u.workspace_id=w and u.id=l.unit_id
   where p.workspace_id=w and u.property_id=i and p.paid_at=on_date and p.status in ('paid','partial','مدفوع','جزئي')
    and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id);
  defaults:=defaults||jsonb_build_object('collectionDate',on_date::text,'receiptCount',receipt_count::text,'totalAmount',total::numeric(18,3)::text,
   'preparedBy',(select coalesce(nullif(display_name,''),auth.uid()::text) from public.aqari_profiles where user_id=auth.uid()));
 elsif k in ('final_settlement','clearance') then
  select * into settlement from private.aqari_vacating_settlements s where s.workspace_id=w and s.lease_id=i;
  if not found or settlement.status not in ('finalized','cleared','released') or (k='clearance' and settlement.status not in ('cleared','released')) then
   raise exception 'DOCUMENT_APPROVED_SETTLEMENT_REQUIRED' using errcode='23514';end if;
  snap:=case k when 'clearance' then settlement.clearance_snapshot else settlement.settlement_snapshot end;
  if snap is null then raise exception 'DOCUMENT_APPROVED_SETTLEMENT_REQUIRED' using errcode='23514';end if;
  -- The archived clearance must match the currently verified settlement balances.
  if k='clearance' and snap->'clearance_balances' is distinct from private.aqari_vacating_balances(w,i,settlement.vacate_date) then
   raise exception 'DOCUMENT_SETTLEMENT_CHANGED' using errcode='40001';end if;
  -- Supplemental obligations are not inferred to be settled by the old rent/deposit snapshot.
  if (exists(select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=i)
      or exists(select 1 from private.aqari_tenant_ledger_entries e where e.workspace_id=w and e.lease_id=i)) then
   raise exception 'DOCUMENT_SUPPLEMENTAL_SETTLEMENT_REVIEW_REQUIRED' using errcode='23514';end if;
  if k='clearance' then
   defaults:=defaults||jsonb_build_object('settlementReference',settlement.settlement_no,'approvedBy',settlement.clearance_by_name,'exceptionReason',settlement.exception_reason);
  else
   v:=snap->'final_balances';
   if v is null then raise exception 'DOCUMENT_APPROVED_SETTLEMENT_REQUIRED' using errcode='23514';end if;
   if not (snap ? 'utility_balance' and snap ? 'legal_balance') then raise exception 'DOCUMENT_SUPPLEMENTAL_SETTLEMENT_REVIEW_REQUIRED' using errcode='23514';end if;
   defaults:=defaults||jsonb_build_object('rentBalance',v->>'rent_balance','damageBalance',snap->>'damage_amount','utilityBalance',snap->>'utility_balance','legalBalance',snap->>'legal_balance',
    'depositBalance',v->>'deposit_balance','netBalance',((v->>'rent_balance')::numeric+(snap->>'utility_balance')::numeric+(snap->>'legal_balance')::numeric+coalesce((snap->>'damage_amount')::numeric,0)-(v->>'deposit_balance')::numeric)::numeric(18,3)::text,
    'approvedBy',settlement.finalized_by_name);
  end if;
 end if;
 return coalesce(defaults,'{}');
end $$;
revoke all on function private.aqari_official_source(uuid,text,text,uuid,uuid,jsonb) from public,anon,authenticated;

create or replace function private.aqari_financial_archive(w uuid,month_key text) returns jsonb
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
   p.reference,coalesce(nullif(p.receipt->>'collectorName',''),nullif(p.receipt->>'collector',''),nullif(p.receipt->>'accountant',''),'') description
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
commit;
