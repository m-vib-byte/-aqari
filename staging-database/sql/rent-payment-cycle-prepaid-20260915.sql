-- AQARI V267 Preview/Staging: explicit rent payment cycle + atomic multi-period prepaid batches.
-- Monthly entitlements remain authoritative; installment cycles group them without replacing the monthly ledger.
begin;

create or replace function private.aqari_payment_cycle_months(c jsonb)
returns integer language plpgsql immutable set search_path='' as $$
declare raw text:=coalesce(c->>'paymentCycleMonths','');n integer;
begin
 if raw='' then return 1;end if;
 if raw !~ '^[0-9]+$' then raise check_violation using message='INVALID_PAYMENT_CYCLE';end if;
 n:=raw::integer;if n not in(1,3,6,12) then raise check_violation using message='INVALID_PAYMENT_CYCLE';end if;return n;
end $$;
revoke all on function private.aqari_payment_cycle_months(jsonb) from public,anon,authenticated,service_role;

create or replace function private.aqari_validate_contract_payment_cycle()
returns trigger language plpgsql security definer set search_path='' as $$
declare old_d jsonb:=private.aqari_unwrap(old.payload);new_d jsonb:=private.aqari_unwrap(new.payload);c jsonb;previous jsonb;raw text;
begin
 for c in select value from jsonb_array_elements(coalesce(new_d->'contractsV202','[]'::jsonb)) loop
  if c->>'source' is distinct from 'v267-cloud' then continue;end if;
  raw:=coalesce(c->>'paymentCycleMonths','');
  if raw !~ '^(1|3|6|12)$' then raise check_violation using message='PAYMENT_CYCLE_REQUIRED';end if;
  select value into previous from jsonb_array_elements(coalesce(old_d->'contractsV202','[]'::jsonb)) where value->>'id'=c->>'id' limit 1;
  if previous is not null and previous->>'status' in('approved','signing','signed','expired')
   and coalesce(previous->>'paymentCycleMonths','1') is distinct from raw then
   raise check_violation using message='PAYMENT_CYCLE_LOCKED_AFTER_APPROVAL';
  end if;
 end loop;return new;
end $$;
revoke all on function private.aqari_validate_contract_payment_cycle() from public,anon,authenticated,service_role;
drop trigger if exists aqari_ay_contract_payment_cycle on public.aqari_app_state;
create trigger aqari_ay_contract_payment_cycle before update of payload on public.aqari_app_state for each row execute function private.aqari_validate_contract_payment_cycle();

create or replace function public.aqari_rent_installment_schedule(p_workspace_id uuid,p_lease_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare w uuid:=p_workspace_id;lid uuid:=p_lease_id;l public.aqari_leases%rowtype;property_ref uuid;cycle integer;anchor date;rows jsonb;
begin
 if auth.uid() is null then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select * into l from public.aqari_leases where workspace_id=w and id=lid;if not found then raise no_data_found using message='LEASE_NOT_FOUND';end if;
 select u.property_id into property_ref from public.aqari_units u where u.workspace_id=w and u.id=l.unit_id;
 if property_ref is null or not private.aqari_can_property(w,property_ref,'properties','read') or not(private.aqari_can(w,'contracts','read') or private.aqari_can(w,'collections','read')) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 perform private.aqari_refresh_rent_due_schedule(w,lid);
 cycle:=private.aqari_payment_cycle_months(l.snapshot);
 begin anchor:=date_trunc('month',(l.snapshot#>>'{rentEntitlement,startDate}')::date)::date;exception when others then anchor:=date_trunc('month',l.start_date)::date;end;
 anchor:=coalesce(anchor,date_trunc('month',l.start_date)::date);
 with monthly as(
  select d.*,greatest(0,(extract(year from age(d.period,anchor))*12+extract(month from age(d.period,anchor)))::integer) month_offset
  from private.aqari_rent_due_periods d where d.workspace_id=w and d.lease_id=lid
 ), grouped as(
  select floor(month_offset::numeric/cycle)::integer installment_index,min(period) coverage_start,max(period) coverage_end,
   sum(due_amount)::numeric(15,3) due_amount,sum(paid_amount)::numeric(15,3) paid_amount,sum(credit_amount)::numeric(15,3) credit_amount,sum(balance)::numeric(15,3) balance
  from monthly group by 1
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'installmentNo',installment_index+1,'cycleMonths',cycle,'coverageStart',coverage_start,'coverageEnd',coverage_end,
  'dueOn',private.aqari_rent_due_on(l.snapshot,l.start_date,coverage_start),'due_amount',due_amount,'paid_amount',paid_amount,'credit_amount',credit_amount,'balance',balance,
  'status',case when due_amount=0 then 'waived' when balance<0 then 'overpaid' when balance=0 then 'paid' when paid_amount+credit_amount=0 then 'due' else 'partial' end
 ) order by installment_index),'[]'::jsonb) into rows from grouped;
 return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'lease_id',lid,'contractNo',l.contract_no,'cycleMonths',cycle,'periods',rows);
end $$;
revoke all on function public.aqari_rent_installment_schedule(uuid,uuid) from public,anon;
grant execute on function public.aqari_rent_installment_schedule(uuid,uuid) to authenticated;

create or replace function private.aqari_validate_prepaid_rent_batches()
returns trigger language plpgsql security definer set search_path='' as $$
declare old_d jsonb:=private.aqari_unwrap(old.payload);new_d jsonb:=private.aqari_unwrap(new.payload);old_rows jsonb:=coalesce(old_d->'prepaidRentBatchesV267','[]'::jsonb);new_rows jsonb:=coalesce(new_d->'prepaidRentBatchesV267','[]'::jsonb);b jsonb;a jsonb;l public.aqari_leases%rowtype;due private.aqari_rent_due_periods%rowtype;reservation private.aqari_rent_receipt_serial_reservations%rowtype;ledger jsonb;receipt jsonb;collection jsonb;contract jsonb;property_ref uuid;actor text;batch_id uuid;lease_id uuid;operation_ref uuid;receipt_no text;period_date date;amount_value numeric;total_value numeric;sum_value numeric;sequence_value integer;method_code text;method_label text;tx text;paid_on date;
begin
 if jsonb_typeof(old_rows)<>'array' or jsonb_typeof(new_rows)<>'array' then raise check_violation using message='PREPAID_BATCH_ARRAY_REQUIRED';end if;
 for b in select value from jsonb_array_elements(old_rows) loop if not exists(select 1 from jsonb_array_elements(new_rows)x where x=b) then raise check_violation using message='PREPAID_BATCH_IMMUTABLE';end if;end loop;
 for b in select value from jsonb_array_elements(new_rows)n where not exists(select 1 from jsonb_array_elements(old_rows)o where o=n) loop
  if auth.uid() is null or not private.aqari_manager(new.workspace_id) or not private.aqari_can(new.workspace_id,'collections','write') then raise insufficient_privilege using message='PREPAID_RENT_ACCESS_DENIED';end if;
  perform private.aqari_require_sensitive_aal2(new.workspace_id);
  if jsonb_typeof(b)<>'object' or exists(select 1 from jsonb_object_keys(b)k where k not in('id','contractId','contractNo','leaseId','method','transactionNo','paidAt','total','allocations','status')) then raise check_violation using message='INVALID_PREPAID_BATCH';end if;
  begin batch_id:=(b->>'id')::uuid;lease_id:=(b->>'leaseId')::uuid;total_value:=(b->>'total')::numeric;paid_on:=(b->>'paidAt')::date;exception when others then raise check_violation using message='INVALID_PREPAID_BATCH';end;
  method_code:=b->>'method';method_label:=case method_code when 'knet' then 'كي نت' when 'bank' then 'تحويل بنكي' when 'cash' then 'نقدي' when 'cheque' then 'شيك' else null end;tx:=btrim(coalesce(b->>'transactionNo',''));
  if batch_id is null or lease_id is null or total_value<=0 or total_value<>round(total_value,3) or paid_on>current_date or method_label is null or length(tx) not between 1 and 150 or b->>'status'<>'confirmed' or jsonb_typeof(b->'allocations')<>'array' or jsonb_array_length(b->'allocations') not between 1 and 24 then raise check_violation using message='INVALID_PREPAID_BATCH';end if;
  select * into l from public.aqari_leases where workspace_id=new.workspace_id and id=lease_id and status='signed' for update;if not found or l.external_ref is distinct from b->>'contractId' or l.contract_no is distinct from b->>'contractNo' then raise check_violation using message='PREPAID_SIGNED_LEASE_REQUIRED';end if;
  select u.property_id into property_ref from public.aqari_units u where u.workspace_id=l.workspace_id and u.id=l.unit_id;if not private.aqari_can_property(new.workspace_id,property_ref,'properties','write') then raise insufficient_privilege using message='PREPAID_PROPERTY_ACCESS_DENIED';end if;
  select value into contract from jsonb_array_elements(coalesce(new_d->'contractsV202','[]'::jsonb)) where value->>'id'=l.external_ref limit 1;if contract is null or contract->>'status'<>'signed' then raise check_violation using message='PREPAID_SIGNED_CONTRACT_REQUIRED';end if;
  perform private.aqari_refresh_rent_due_schedule(new.workspace_id,lease_id);sum_value:=0;
  if (select count(*) from jsonb_array_elements(b->'allocations'))<>(select count(distinct x->>'period') from jsonb_array_elements(b->'allocations')x) then raise check_violation using message='PREPAID_PERIOD_DUPLICATE';end if;
  if (select count(*) from jsonb_array_elements(b->'allocations'))<>(select count(distinct x->>'receiptNo') from jsonb_array_elements(b->'allocations')x) then raise check_violation using message='PREPAID_RECEIPT_DUPLICATE';end if;
  for a in select value from jsonb_array_elements(b->'allocations') loop
   if jsonb_typeof(a)<>'object' or exists(select 1 from jsonb_object_keys(a)k where k not in('operationRef','receiptNo','contractReceiptSequence','period','amount')) then raise check_violation using message='INVALID_PREPAID_ALLOCATION';end if;
   begin operation_ref:=(a->>'operationRef')::uuid;sequence_value:=(a->>'contractReceiptSequence')::integer;period_date:=(a->>'period')::date;amount_value:=(a->>'amount')::numeric;exception when others then raise check_violation using message='INVALID_PREPAID_ALLOCATION';end;
   receipt_no:=btrim(coalesce(a->>'receiptNo',''));if operation_ref is null or sequence_value<1 or receipt_no!~'^AQ-R-[0-9]{4}-[0-9]{8,}$' or period_date<>date_trunc('month',period_date)::date or amount_value<=0 or amount_value<>round(amount_value,3) then raise check_violation using message='INVALID_PREPAID_ALLOCATION';end if;
   select * into due from private.aqari_rent_due_periods d where d.workspace_id=new.workspace_id and d.lease_id=lease_id and d.period=period_date;if not found or due.balance<=0 or amount_value>due.balance then raise check_violation using message='PREPAID_ALLOCATION_EXCEEDS_BALANCE';end if;
   select * into reservation from private.aqari_rent_receipt_serial_reservations r where r.receipt_no=receipt_no for update;
   if not found or reservation.workspace_id<>new.workspace_id or reservation.contract_ref<>l.external_ref or reservation.operation_ref<>operation_ref or reservation.contract_sequence<>sequence_value or reservation.reserved_by<>auth.uid() or reservation.consumed_at is not null then raise check_violation using message='PREPAID_RECEIPT_RESERVATION_MISMATCH';end if;
   if (select count(*) from jsonb_array_elements(coalesce(new_d->'rentLedgerV202','[]'::jsonb))x where x->>'receiptNo'=receipt_no)<>1 then raise check_violation using message='PREPAID_LEDGER_REQUIRED';end if;
   select value into ledger from jsonb_array_elements(new_d->'rentLedgerV202')x where x->>'receiptNo'=receipt_no limit 1;
   if ledger->>'contractId' is distinct from l.external_ref or ledger->>'contractNo' is distinct from l.contract_no or ledger->>'period' is distinct from to_char(period_date,'YYYY-MM') or (ledger->>'paid')::numeric is distinct from amount_value or ledger->>'transactionNo' is distinct from tx or ledger->>'method' is distinct from method_label or ledger->>'paidAt' is distinct from paid_on::text or ledger->>'prepaymentBatchId' is distinct from batch_id::text then raise check_violation using message='PREPAID_LEDGER_MISMATCH';end if;
   if (select count(*) from jsonb_array_elements(coalesce(new_d->'rentReceiptsV267','[]'::jsonb))x where x->>'id'=receipt_no)<>1 then raise check_violation using message='PREPAID_RECEIPT_REQUIRED';end if;
   select value into receipt from jsonb_array_elements(new_d->'rentReceiptsV267')x where x->>'id'=receipt_no limit 1;
   if receipt->>'transactionNo' is distinct from tx or receipt->>'prepaymentBatchId' is distinct from batch_id::text or receipt#>>'{contract,id}' is distinct from l.external_ref or receipt->>'contractReceiptSequence' is distinct from sequence_value::text then raise check_violation using message='PREPAID_RECEIPT_MISMATCH';end if;
   if (select count(*) from jsonb_array_elements(coalesce(new_d->'collections','[]'::jsonb))x where x->>0=receipt_no)<>1 then raise check_violation using message='PREPAID_COLLECTION_REQUIRED';end if;
   select value into collection from jsonb_array_elements(new_d->'collections')x where x->>0=receipt_no limit 1;if (collection->>2)::numeric is distinct from amount_value or collection->>5 is distinct from paid_on::text or collection->>8 is distinct from to_char(period_date,'YYYY-MM') or collection->>9 is distinct from method_label then raise check_violation using message='PREPAID_COLLECTION_MISMATCH';end if;
   update private.aqari_rent_receipt_serial_reservations set consumed_at=now() where receipt_no=reservation.receipt_no;sum_value:=sum_value+amount_value;
  end loop;
  if sum_value is distinct from total_value then raise check_violation using message='PREPAID_TOTAL_MISMATCH';end if;
  select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
  insert into private.aqari_financial_audit(workspace_id,property_id,entity_id,action,actor_id,actor_name,reason,after_value)
   values(new.workspace_id,property_ref,batch_id::text,'prepaid_rent_batch',auth.uid(),actor,'دفعة إيجار مقدمة موزعة على عدة فترات',b);
 end loop;return new;
end $$;
revoke all on function private.aqari_validate_prepaid_rent_batches() from public,anon,authenticated,service_role;
drop trigger if exists aqari_au_prepaid_rent_batches on public.aqari_app_state;
create trigger aqari_au_prepaid_rent_batches before update of payload on public.aqari_app_state for each row execute function private.aqari_validate_prepaid_rent_batches();

commit;
