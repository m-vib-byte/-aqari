-- V267 isolated staging: atomic contract execution settlement.
-- A V267 contract may transition to signed only with one immutable execution
-- settlement in the same app-state transaction. Zero-due contracts record an
-- explicit reason and create no fake payment or rent receipt.
begin;

create table private.aqari_contract_execution_settlements(
 id uuid primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 lease_id uuid not null,
 contract_ref text not null,
 contract_no text not null,
 on_date date not null,
 method text not null check(method in ('none','cash','knet','bank','cheque')),
 transaction_reference text not null default '',
 rent_amount numeric(15,3) not null check(rent_amount>=0),
 deposit_amount numeric(15,3) not null check(deposit_amount>=0),
 advance_amount numeric(15,3) not null check(advance_amount>=0),
 fees_amount numeric(15,3) not null check(fees_amount>=0),
 total_amount numeric(15,3) not null check(total_amount=rent_amount+deposit_amount+advance_amount+fees_amount),
 rent_receipt_no text not null default '',
 zero_reason text not null default '',
 contract_document_id uuid not null,
 created_by uuid not null,
 created_by_name text not null,
 created_at timestamptz not null default now(),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 unique(workspace_id,id),
 unique(workspace_id,lease_id),
 unique(workspace_id,contract_document_id),
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id),
 check((total_amount=0 and method='none' and transaction_reference='' and rent_receipt_no='' and length(btrim(zero_reason)) between 3 and 500)
    or (total_amount>0 and method<>'none' and length(btrim(transaction_reference)) between 3 and 150)),
 check((rent_amount=0 and rent_receipt_no='') or (rent_amount>0 and length(btrim(rent_receipt_no)) between 3 and 150))
);
create unique index aqari_contract_execution_transaction_unique
 on private.aqari_contract_execution_settlements(workspace_id,lower(transaction_reference))
 where total_amount>0;
create index aqari_contract_execution_contract_history
 on private.aqari_contract_execution_settlements(workspace_id,contract_ref,created_at,id);
alter table private.aqari_contract_execution_settlements enable row level security;
revoke all on private.aqari_contract_execution_settlements from public,anon,authenticated;
create trigger aqari_contract_execution_immutable before update or delete on private.aqari_contract_execution_settlements
 for each row execute function private.aqari_reject_immutable_change();

-- Preparation drafts follow contract permissions. Final execution manifests
-- follow collections permissions; the final signing guard below additionally
-- requires the general manager.
create or replace function private.aqari_state_section(k text) returns text
language sql immutable set search_path='' as $$
 select case
 when k in ('properties','units','propertyFilesV202','propertyBankAccountsV267') then 'properties'
 when k in ('tenants','tenantProfilesV267') then 'tenants'
 when k in ('leases','contractsV202','contractTemplatesV202','tenantDirectoryV202','contractPreparationDraftsV267') then 'contracts'
 when k in ('collections','rentLedgerV202','rentReceiptsV267','depositReceiptsV267','depositRefundsV267','contractExecutionSettlementsV267') then 'collections'
 when k in ('maintenance','maintenanceContracts','maintenanceRequestsV267') then 'maintenance'
 when k in ('expenses','services','invoices','accounts','bankAccounts','journalEntries','openingBalancesV267') then 'finance'
 when k in ('employees','payroll') then 'employees'
 when k in ('propertySharesV267','propertyPartnersV267','partnerDistributionsV267','partnerAdjustmentsV267','partnerReservesV267') then 'partners'
 when k in ('documents','documentsV267','documentArchiveV267') then 'documents'
 when k in ('notifications','reminders','notificationSettingsV267') then 'notifications'
 else 'administration' end
$$;

create function private.aqari_project_contract_execution() returns trigger
language plpgsql security definer set search_path='' as $$
declare
 old_d jsonb:=private.aqari_unwrap(old.payload); new_d jsonb:=private.aqari_unwrap(new.payload);
 old_rows jsonb; new_rows jsonb; e jsonb; c jsonb; old_c jsonb;
 settlement_id uuid; contract_id text; tenant_id text; document_id uuid; version_id uuid; event_id uuid;
 lease public.aqari_leases; payment public.aqari_rent_payments;
 rent_due numeric(15,3); rent_amount numeric(15,3); deposit_amount numeric(15,3); advance_amount numeric(15,3); fees_amount numeric(15,3); total_amount numeric(15,3);
 contract_deposit numeric(15,3); contract_advance numeric(15,3); contract_fees numeric(15,3); deposit_balance numeric(15,3);
 operation_date date; first_period date; method_code text; payment_method text; tx text; receipt_no text; zero_reason text;
 actor text; voucher_seq text; deposit_id uuid; property_id uuid; title text; body text; clauses text; payload jsonb; hash text; template_version integer;
begin
 old_rows:=coalesce(old_d->'contractExecutionSettlementsV267','[]'::jsonb);
 new_rows:=coalesce(new_d->'contractExecutionSettlementsV267','[]'::jsonb);
 if jsonb_typeof(old_rows)<>'array' or jsonb_typeof(new_rows)<>'array' then raise exception 'EXECUTION_SETTLEMENT_ARRAY_REQUIRED' using errcode='22023';end if;
 if jsonb_array_length(new_rows)>5000 then raise exception 'EXECUTION_SETTLEMENT_LIMIT' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(old_rows) o where not exists(select 1 from jsonb_array_elements(new_rows) n where n=o)) then
  raise exception 'EXECUTION_SETTLEMENT_IMMUTABLE' using errcode='23514';
 end if;
 if exists(select x->>'id' from jsonb_array_elements(new_rows) x group by x->>'id' having count(*)>1) then
  raise exception 'EXECUTION_SETTLEMENT_DUPLICATE_ID' using errcode='23505';
 end if;

 -- No V267 contract can newly become signed without a settlement created in
 -- this exact state revision.
 for c in select value from jsonb_array_elements(coalesce(new_d->'contractsV202','[]'::jsonb)) loop
  if c->>'source'='v267-cloud' and c->>'status'='signed' then
   select value into old_c from jsonb_array_elements(coalesce(old_d->'contractsV202','[]'::jsonb)) where value->>'id'=c->>'id' limit 1;
   if coalesce(old_c->>'status','')<>'signed' and not exists(
    select 1 from jsonb_array_elements(new_rows) n
     where n->>'contractId'=c->>'id' and not exists(select 1 from jsonb_array_elements(old_rows) o where o=n)
   ) then raise exception 'EXECUTION_SETTLEMENT_REQUIRED_BEFORE_SIGNING' using errcode='23514';end if;
  end if;
 end loop;

 for e in select value from jsonb_array_elements(new_rows) n where not exists(select 1 from jsonb_array_elements(old_rows) o where o=n) loop
  if not private.aqari_manager(new.workspace_id) then raise insufficient_privilege using message='GENERAL_MANAGER_EXECUTION_APPROVAL_REQUIRED';end if;
  if jsonb_typeof(e)<>'object' or jsonb_typeof(e->'components')<>'object' then raise exception 'EXECUTION_SETTLEMENT_INVALID' using errcode='22023';end if;
  begin settlement_id:=(e->>'id')::uuid; document_id:=(e->>'contractDocumentId')::uuid; version_id:=(e->>'contractDocumentVersionId')::uuid; event_id:=(e->>'contractDocumentEventId')::uuid;
  exception when others then raise exception 'EXECUTION_SETTLEMENT_INVALID_ID' using errcode='22023';end;
  contract_id:=btrim(coalesce(e->>'contractId',''));tenant_id:=btrim(coalesce(e->>'tenantId',''));
  if contract_id='' or tenant_id='' or btrim(coalesce(e->>'contractNo',''))='' or btrim(coalesce(e->>'property',''))='' or btrim(coalesce(e->>'unit',''))='' then raise exception 'EXECUTION_SETTLEMENT_LINK_REQUIRED' using errcode='22023';end if;
  if (select count(*) from jsonb_array_elements(coalesce(new_d->'contractsV202','[]'::jsonb)) x where x->>'id'=contract_id)<>1 then raise exception 'EXECUTION_CONTRACT_REQUIRED' using errcode='22023';end if;
  select value into c from jsonb_array_elements(new_d->'contractsV202') x where x->>'id'=contract_id;
  select value into old_c from jsonb_array_elements(coalesce(old_d->'contractsV202','[]'::jsonb)) x where x->>'id'=contract_id limit 1;
  if c->>'source'<>'v267-cloud' or c->>'status'<>'signed' or coalesce(old_c->>'status','')<>'signing'
   or c->>'contract_no'<>e->>'contractNo' or c->>'tenantId'<>tenant_id or c->>'property'<>e->>'property' or c->>'unit'<>e->>'unit' then
   raise exception 'EXECUTION_CONTRACT_SIGNING_TRANSITION_REQUIRED' using errcode='23514';
  end if;
  select * into lease from public.aqari_leases l where l.workspace_id=new.workspace_id and l.external_ref=contract_id for update;
  if not found or lease.status<>'signed' or lease.contract_no<>e->>'contractNo' then raise exception 'EXECUTION_SIGNED_LEASE_REQUIRED' using errcode='23514';end if;

  if coalesce(e->>'onDate','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'EXECUTION_DATE_REQUIRED' using errcode='22023';end if;
  operation_date:=(e->>'onDate')::date;
  if operation_date>(now() at time zone 'Asia/Kuwait')::date then raise exception 'EXECUTION_FUTURE_DATE' using errcode='22023';end if;
  perform private.aqari_financial_open(new.workspace_id,operation_date);
  if coalesce(e#>>'{components,rent}','') !~ '^[0-9]{1,12}(\.[0-9]{1,3})?$'
   or coalesce(e#>>'{components,deposit}','') !~ '^[0-9]{1,12}(\.[0-9]{1,3})?$'
   or coalesce(e#>>'{components,advance}','') !~ '^[0-9]{1,12}(\.[0-9]{1,3})?$'
   or coalesce(e#>>'{components,fees}','') !~ '^[0-9]{1,12}(\.[0-9]{1,3})?$'
   or coalesce(e#>>'{components,total}','') !~ '^[0-9]{1,12}(\.[0-9]{1,3})?$' then raise exception 'EXECUTION_INVALID_AMOUNT' using errcode='22023';end if;
  rent_amount:=(e#>>'{components,rent}')::numeric;deposit_amount:=(e#>>'{components,deposit}')::numeric;advance_amount:=(e#>>'{components,advance}')::numeric;fees_amount:=(e#>>'{components,fees}')::numeric;total_amount:=(e#>>'{components,total}')::numeric;
  if total_amount<>rent_amount+deposit_amount+advance_amount+fees_amount then raise exception 'EXECUTION_TOTAL_MISMATCH' using errcode='23514';end if;
  contract_deposit:=coalesce(nullif(c->>'deposit','')::numeric,0);contract_advance:=coalesce(nullif(c->>'advance','')::numeric,0);contract_fees:=coalesce(nullif(c->>'cleaningFee','')::numeric,0);
  select coalesce(sum(case x.kind when 'receipt' then x.amount else -x.amount end),0)::numeric(15,3) into deposit_balance from private.aqari_deposit_entries x where x.workspace_id=new.workspace_id and x.lease_id=lease.id;
  if deposit_amount<>greatest(contract_deposit-deposit_balance,0) or advance_amount<>contract_advance or fees_amount<>contract_fees then raise exception 'EXECUTION_COMPONENT_MISMATCH' using errcode='23514';end if;
  if coalesce(c#>>'{rentEntitlement,startDate}','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'EXECUTION_ENTITLEMENT_REQUIRED' using errcode='23514';end if;
  first_period:=date_trunc('month',(c#>>'{rentEntitlement,startDate}')::date)::date;
  select greatest(d.due_amount-coalesce(d.credit_amount,0),0)::numeric(15,3) into rent_due from private.aqari_rent_due_periods d where d.workspace_id=new.workspace_id and d.lease_id=lease.id and d.period=first_period;
  if rent_due is null then raise exception 'EXECUTION_DUE_SCHEDULE_REQUIRED' using errcode='23514';end if;
  if rent_amount<>rent_due then raise exception 'EXECUTION_FIRST_RENT_MISMATCH' using errcode='23514';end if;

  method_code:=btrim(coalesce(e->>'method',''));tx:=btrim(coalesce(e->>'transactionNo',''));receipt_no:=btrim(coalesce(e->>'rentReceiptNo',''));zero_reason:=btrim(coalesce(e->>'zeroReason',''));
  if total_amount=0 then
   if method_code<>'none' or tx<>'' or receipt_no<>'' or length(zero_reason) not between 3 and 500 then raise exception 'EXECUTION_ZERO_DOCUMENTATION_REQUIRED' using errcode='23514';end if;
  else
   if method_code not in ('cash','knet','bank','cheque') or length(tx) not between 3 and 150 then raise exception 'EXECUTION_PAYMENT_REFERENCE_REQUIRED' using errcode='23514';end if;
  end if;
  payment_method:=case method_code when 'cash' then 'نقدي' when 'knet' then 'كي نت' when 'bank' then 'تحويل بنكي' when 'cheque' then 'شيك' else '' end;
  if rent_amount>0 then
   if receipt_no='' then raise exception 'EXECUTION_RENT_RECEIPT_REQUIRED' using errcode='23514';end if;
   select * into payment from public.aqari_rent_payments p where p.workspace_id=new.workspace_id and p.reference=receipt_no;
   if not found or payment.lease_id<>lease.id or payment.amount<>rent_amount or payment.paid_at<>operation_date or payment.payment_method<>payment_method or coalesce(payment.record->>'transactionNo','')<>tx then raise exception 'EXECUTION_RENT_PAYMENT_MISMATCH' using errcode='23514';end if;
   if exists(select 1 from private.aqari_rent_due_periods d where d.workspace_id=new.workspace_id and d.lease_id=lease.id and d.period=first_period and d.balance<>0) then raise exception 'EXECUTION_FIRST_RENT_NOT_SETTLED' using errcode='23514';end if;
  elsif receipt_no<>'' then raise exception 'EXECUTION_FAKE_RENT_RECEIPT' using errcode='23514';end if;

  select coalesce(nullif(p.display_name,''),auth.uid()::text) into actor from public.aqari_profiles p where p.user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
  if deposit_amount>0 then
   deposit_id:=extensions.gen_random_uuid();voucher_seq:=nextval('private.aqari_deposit_voucher_seq')::text;
   insert into private.aqari_deposit_entries(id,workspace_id,lease_id,kind,voucher_no,amount,on_date,method,reference,reason,actor_id,actor_name,snapshot,balance_after,request_data)
   values(deposit_id,new.workspace_id,lease.id,'receipt','DP-'||to_char(operation_date,'YYYYMMDD')||'-'||lpad(voucher_seq,8,'0'),deposit_amount,operation_date,method_code,tx,'تأمين عند إبرام العقد',auth.uid(),actor,
    jsonb_build_object('lease_id',lease.id,'contract_no',lease.contract_no,'tenant_id',lease.tenant_id,'property',e->>'property','unit',e->>'unit','execution_settlement_id',settlement_id),
    deposit_balance+deposit_amount,jsonb_build_object('settlement_id',settlement_id,'transaction_reference',tx,'amount',deposit_amount::text));
  end if;

  clauses:=(select string_agg(btrim(coalesce(x.value->>'title',''))||E'\n'||btrim(coalesce(x.value->>'text','')),E'\n\n' order by x.ordinality) from jsonb_array_elements(coalesce(c->'clauses','[]'::jsonb)) with ordinality x(value,ordinality));
  if coalesce(length(btrim(clauses)),0)<5 then raise exception 'EXECUTION_CONTRACT_CLAUSES_REQUIRED' using errcode='23514';end if;
  title:='عقد إيجار '||c->>'contract_no';
  body:='عقد إيجار رقم '||c->>'contract_no'||E'\nالمستأجر: '||coalesce(c->>'tenant','')||E'\nالعقار: '||c->>'property'||' — الوحدة: '||c->>'unit'||E'\nمدة العقد: '||c->>'start_date'||' إلى '||c->>'end_date'||E'\nالإيجار الأصلي: '||coalesce(c->>'contractRent',c->>'rent')||' د.ك — الخصم: '||coalesce(c->>'discount','0')||' د.ك'||E'\nالتأمين: '||coalesce(c->>'deposit','0')||' د.ك — العربون: '||coalesce(c->>'advance','0')||' د.ك — الرسوم: '||coalesce(c->>'cleaningFee','0')||' د.ك'||E'\n\n'||clauses;
  payload:=jsonb_build_object('contractNo',c->>'contract_no','tenant',c->>'tenant','property',c->>'property','unit',c->>'unit','startDate',c->>'start_date','endDate',c->>'end_date','contractRent',c->>'contractRent','discount',c->>'discount','deposit',c->>'deposit','advance',c->>'advance','fees',c->>'cleaningFee','template',c->'contractTemplate','executionSettlementId',settlement_id,'contractSnapshot',c);
  hash:=pg_catalog.encode(extensions.digest(title||E'\n'||body||E'\n'||payload::text,'sha256'),'hex');
  template_version:=coalesce(nullif(c#>>'{contractTemplate,version}','')::integer,1);
  insert into private.aqari_official_document_series(id,workspace_id,kind,document_no,entity_type,entity_id,status,current_version,created_by)
   values(document_id,new.workspace_id,'rental_contract','CT-'||c->>'contract_no','lease',lease.id,'issued',1,auth.uid());
  insert into private.aqari_official_document_versions(id,workspace_id,series_id,version,template_version,title,body,payload,content_sha256,issued_by,issued_by_name)
   values(version_id,new.workspace_id,document_id,1,template_version,title,body,payload,hash,auth.uid(),actor);
  insert into private.aqari_official_document_events(id,workspace_id,series_id,action,reason,actor_id,details)
   values(event_id,new.workspace_id,document_id,'issue','إصدار تلقائي بعد اعتماد تسوية إبرام العقد',auth.uid(),jsonb_build_object('version',1,'hash',hash,'execution_settlement_id',settlement_id));

  select u.property_id into property_id from public.aqari_units u where u.workspace_id=new.workspace_id and u.id=lease.unit_id;
  insert into private.aqari_contract_execution_settlements(id,workspace_id,lease_id,contract_ref,contract_no,on_date,method,transaction_reference,rent_amount,deposit_amount,advance_amount,fees_amount,total_amount,rent_receipt_no,zero_reason,contract_document_id,created_by,created_by_name,snapshot)
   values(settlement_id,new.workspace_id,lease.id,contract_id,lease.contract_no,operation_date,method_code,tx,rent_amount,deposit_amount,advance_amount,fees_amount,total_amount,receipt_no,zero_reason,document_id,auth.uid(),actor,e);
  insert into private.aqari_financial_audit(workspace_id,property_id,entity_id,action,actor_id,actor_name,reason,after_value)
   values(new.workspace_id,property_id,settlement_id::text,'contract_execution_confirmed',auth.uid(),actor,case when total_amount=0 then zero_reason else 'تسوية إبرام عقد مع مرجع حركة '||tx end,e);
 end loop;
 return null;
end $$;
revoke all on function private.aqari_project_contract_execution() from public,anon,authenticated;
create trigger zzz_v267_contract_execution after update of payload on public.aqari_app_state
 for each row execute function private.aqari_project_contract_execution();

commit;
