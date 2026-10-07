-- Preview-only: bind automatic execution documents to reserved numbers and
-- their immutable, current execution package. Generic document validation is unchanged.
create or replace function private.aqari_validate_execution_document(
 s private.aqari_official_document_series,
 v private.aqari_official_document_versions
) returns void language plpgsql security definer set search_path='' as $binding$
declare
 package private.aqari_contract_execution_packages;
 lease public.aqari_leases;
 source jsonb; expected jsonb; manifest jsonb; c jsonb; settlement_id uuid;
 copy_role text; clauses text; title text; body text; payload jsonb; hash text;
 document_no text; template_version integer;
begin
 if auth.uid() is null or not private.aqari_manager(s.workspace_id)
  or not private.aqari_official_entity_scope(s.workspace_id,s.entity_type,s.entity_id,'write')
  or s.entity_type is distinct from 'lease' or s.status is distinct from 'issued'
  or s.current_version is distinct from 1 or v.version is distinct from 1
  or s.created_by is distinct from auth.uid() or v.issued_by is distinct from auth.uid()
 then raise exception 'EXECUTION_DOCUMENT_ACCESS_DENIED' using errcode='42501';end if;
 select * into package from private.aqari_contract_execution_packages p
 where p.workspace_id=s.workspace_id and p.settlement_id::text=v.payload->>'executionSettlementId' for update;
 if not found or package.actor_id is distinct from auth.uid() or package.expires_at<=now()
  or exists(select 1 from private.aqari_contract_execution_package_consumptions z where z.package_id=package.id)
 then raise exception 'EXECUTION_DOCUMENT_PACKAGE_UNAVAILABLE' using errcode='23514';end if;
 source:=package.source;settlement_id:=package.settlement_id;c:=source->'signed_contract_snapshot';
 select * into lease from public.aqari_leases l where l.workspace_id=s.workspace_id and l.id=s.entity_id;
 if not found or lease.status is distinct from 'signed' or lease.snapshot is distinct from c
  or lease.id::text is distinct from source->>'lease_id' or lease.external_ref is distinct from package.contract_ref
  or lease.contract_no is distinct from package.contract_no
 then raise exception 'EXECUTION_DOCUMENT_LEASE_MISMATCH' using errcode='23514';end if;
 select e into manifest from public.aqari_app_state a
 cross join lateral jsonb_array_elements(coalesce(private.aqari_unwrap(a.payload)->'contractExecutionSettlementsV267','[]')) e
 where a.workspace_id=s.workspace_id and e->>'id'=settlement_id::text;
 if manifest is null or manifest->>'executionPackageId' is distinct from package.id::text
  or manifest->>'contractDocumentId' is distinct from source->>'contract_document_id'
  or manifest->>'contractId' is distinct from package.contract_ref
 then raise exception 'EXECUTION_DOCUMENT_MANIFEST_MISMATCH' using errcode='23514';end if;
 copy_role:=v.payload->>'copyRole';
 if copy_role is null then
  if s.id::text is distinct from source->>'contract_document_id'
   then raise exception 'EXECUTION_DOCUMENT_CANONICAL_ID_MISMATCH' using errcode='23514';end if;
  clauses:=(select string_agg(btrim(coalesce(x.value->>'title',''))||E'\n'||btrim(coalesce(x.value->>'text','')),E'\n\n' order by x.ordinality) from jsonb_array_elements(coalesce(c->'clauses','[]'::jsonb)) with ordinality x(value,ordinality));
  if coalesce(length(btrim(clauses)),0)<5 then raise exception 'EXECUTION_CONTRACT_CLAUSES_REQUIRED' using errcode='23514';end if;
  title:='عقد إيجار '||(c->>'contract_no');
  body:='عقد إيجار رقم '||(c->>'contract_no')||E'\nالمستأجر: '||coalesce(c->>'tenant','')||E'\nالعقار: '||(c->>'property')||' — الوحدة: '||(c->>'unit')||E'\nمدة العقد: '||(c->>'start_date')||' إلى '||(c->>'end_date')||E'\nالإيجار الأصلي: '||coalesce(c->>'contractRent',c->>'rent')||' د.ك — الخصم: '||coalesce(c->>'discount','0')||' د.ك'||E'\nالتأمين: '||coalesce(c->>'deposit','0')||' د.ك — العربون: '||coalesce(c->>'advance','0')||' د.ك — الرسوم: '||coalesce(c->>'cleaningFee','0')||' د.ك'||E'\n\n'||clauses;
  payload:=jsonb_build_object('contractNo',c->>'contract_no','tenant',c->>'tenant','property',c->>'property','unit',c->>'unit','startDate',c->>'start_date','endDate',c->>'end_date','contractRent',c->>'contractRent','discount',c->>'discount','deposit',c->>'deposit','advance',c->>'advance','fees',c->>'cleaningFee','template',c->'contractTemplate','executionSettlementId',settlement_id,'contractSnapshot',c);
  hash:=pg_catalog.encode(extensions.digest(title||E'\n'||body||E'\n'||payload::text,'sha256'),'hex');

  document_no:='CT-'||(c->>'contract_no');
  template_version:=coalesce(nullif(c#>>'{contractTemplate,version}','')::integer,1);
  if hash is distinct from source->>'canonical_content_sha256' then raise exception 'EXECUTION_DOCUMENT_SOURCE_HASH_MISMATCH' using errcode='23514';end if;
 else
  if copy_role not in ('tenant','owner') then raise exception 'EXECUTION_DOCUMENT_COPY_ROLE_INVALID' using errcode='23514';end if;
  expected:=source->(copy_role||'_document');
  if jsonb_typeof(expected) is distinct from 'object' then raise exception 'EXECUTION_DOCUMENT_COPY_REQUIRED' using errcode='23514';end if;
  title:=expected->>'title';body:=expected->>'body';payload:=expected->'payload';
  hash:=expected->>'content_sha256';document_no:=expected->>'document_no';
  template_version:=(expected->>'template_version')::integer;
  if v.issued_at is distinct from (expected->>'issued_at')::timestamptz then raise exception 'EXECUTION_DOCUMENT_ISSUED_AT_MISMATCH' using errcode='23514';end if;
 end if;
 if s.document_no is distinct from document_no or v.title is distinct from title
  or v.body is distinct from body or v.payload is distinct from payload
  or v.content_sha256 is distinct from hash or v.template_version is distinct from template_version
  or v.issued_by_name is distinct from source->>'actor_name'
  or hash is distinct from encode(extensions.digest(title||E'\n'||body||E'\n'||payload::text,'sha256'),'hex')
 then raise exception 'EXECUTION_DOCUMENT_CONTENT_MISMATCH' using errcode='23514';end if;
end $binding$;
revoke all on function private.aqari_validate_execution_document(private.aqari_official_document_series,private.aqari_official_document_versions) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.aqari_official_source_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s private.aqari_official_document_series;defaults jsonb;key text;value jsonb;v_source_key text;
begin
 select * into strict s from private.aqari_official_document_series where workspace_id=new.workspace_id and id=new.series_id;
 if new.version=1 and not exists(select 1 from private.aqari_official_number_reservations r where r.workspace_id=s.workspace_id and r.id=s.id and r.document_no=s.document_no and r.kind=s.kind and r.entity_id=s.entity_id and r.actor_id=auth.uid()) then raise exception 'DOCUMENT_RESERVED_NUMBER_REQUIRED' using errcode='23514';end if;
 if s.kind='rental_contract' then
  perform private.aqari_validate_execution_document(s,new);
  return new;
 end if;
 perform private.aqari_official_validate(s.kind,s.document_no,new.template_version,new.title,new.body,new.payload,new.content_sha256);
 if not private.aqari_official_entity_scope(s.workspace_id,s.entity_type,s.entity_id,'write') then raise insufficient_privilege using message='DOCUMENT_ENTITY_NOT_FOUND';end if;
 -- Serialize mutable work-order state with issuance. Financial mutations also
 -- take the workspace ledger lock held by the public registration RPC.
 if s.kind='work_order' then perform 1 from private.aqari_work_orders where workspace_id=s.workspace_id and id=s.entity_id for share;end if;
 defaults:=private.aqari_official_source(s.workspace_id,s.kind,s.entity_type,s.entity_id,nullif(new.payload->>'sourceId','')::uuid,new.payload);
 for key,value in select * from jsonb_each(defaults) loop
  if new.payload->key is distinct from value then raise exception 'DOCUMENT_SOURCE_MISMATCH: %',key using errcode='23514';end if;
 end loop;
 if s.kind in ('rent_receipt','receipt_voucher','deposit_receipt','deposit_refund','payment_voucher','expense_approval','work_order') then v_source_key:=defaults->>'sourceId';
 elsif s.kind='daily_collection' then v_source_key:=s.entity_id::text||':'||(defaults->>'collectionDate');end if;
 if s.source_key is not null and s.source_key is distinct from v_source_key then raise exception 'DOCUMENT_SOURCE_CANNOT_CHANGE' using errcode='23514';end if;
 if v_source_key is not null then update private.aqari_official_document_series set source_key=v_source_key where workspace_id=s.workspace_id and id=s.id;end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION private.aqari_project_contract_execution()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if exists(select 1 from jsonb_array_elements(old_rows) o where not exists(select 1 from jsonb_array_elements(new_rows) n where n=o)) then raise exception 'EXECUTION_SETTLEMENT_IMMUTABLE' using errcode='23514';
 end if;
 if exists(select x->>'id' from jsonb_array_elements(new_rows) x group by x->>'id' having count(*)>1) then raise exception 'EXECUTION_SETTLEMENT_DUPLICATE_ID' using errcode='23505';
 end if;

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
  title:='عقد إيجار '||(c->>'contract_no');
  body:='عقد إيجار رقم '||(c->>'contract_no')||E'\nالمستأجر: '||coalesce(c->>'tenant','')||E'\nالعقار: '||(c->>'property')||' — الوحدة: '||(c->>'unit')||E'\nمدة العقد: '||(c->>'start_date')||' إلى '||(c->>'end_date')||E'\nالإيجار الأصلي: '||coalesce(c->>'contractRent',c->>'rent')||' د.ك — الخصم: '||coalesce(c->>'discount','0')||' د.ك'||E'\nالتأمين: '||coalesce(c->>'deposit','0')||' د.ك — العربون: '||coalesce(c->>'advance','0')||' د.ك — الرسوم: '||coalesce(c->>'cleaningFee','0')||' د.ك'||E'\n\n'||clauses;
  payload:=jsonb_build_object('contractNo',c->>'contract_no','tenant',c->>'tenant','property',c->>'property','unit',c->>'unit','startDate',c->>'start_date','endDate',c->>'end_date','contractRent',c->>'contractRent','discount',c->>'discount','deposit',c->>'deposit','advance',c->>'advance','fees',c->>'cleaningFee','template',c->'contractTemplate','executionSettlementId',settlement_id,'contractSnapshot',c);
  hash:=pg_catalog.encode(extensions.digest(title||E'\n'||body||E'\n'||payload::text,'sha256'),'hex');
  template_version:=coalesce(nullif(c#>>'{contractTemplate,version}','')::integer,1);
  insert into private.aqari_official_number_reservations(id,workspace_id,document_no,kind,entity_id,actor_id)
   values(document_id,new.workspace_id,'CT-'||(c->>'contract_no'),'rental_contract',lease.id,auth.uid());
  insert into private.aqari_official_document_series(id,workspace_id,kind,document_no,entity_type,entity_id,status,current_version,created_by)
   values(document_id,new.workspace_id,'rental_contract','CT-'||(c->>'contract_no'),'lease',lease.id,'issued',1,auth.uid());
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
end $function$
;
CREATE OR REPLACE FUNCTION private.aqari_project_contract_execution_artifacts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 old_d jsonb:=private.aqari_unwrap(old.payload); new_d jsonb:=private.aqari_unwrap(new.payload);
 old_rows jsonb; new_rows jsonb; e jsonb; c jsonb; old_c jsonb;
 settlement private.aqari_contract_execution_settlements%rowtype; lease public.aqari_leases%rowtype; reservation private.aqari_rent_receipt_serial_reservations%rowtype;
 package private.aqari_contract_execution_packages%rowtype; source jsonb; tenant_doc jsonb; owner_doc jsonb;
 tenant_id uuid; tenant_version uuid; tenant_event uuid; owner_id uuid; owner_version uuid; owner_event uuid;
 receipt_sequence integer; payment public.aqari_rent_payments%rowtype; receipt_snapshot_sha text; property_id uuid; package_id uuid;
begin
 old_rows:=coalesce(old_d->'contractExecutionSettlementsV267','[]'::jsonb); new_rows:=coalesce(new_d->'contractExecutionSettlementsV267','[]'::jsonb);
 if jsonb_typeof(old_rows)<>'array' or jsonb_typeof(new_rows)<>'array' then return null;end if;
 for e in select value from jsonb_array_elements(new_rows) n where not exists(select 1 from jsonb_array_elements(old_rows) o where o=n) loop
  begin package_id:=(e->>'executionPackageId')::uuid; exception when others then raise exception 'EXECUTION_PACKAGE_REQUIRED' using errcode='23514';end;
  select * into strict settlement from private.aqari_contract_execution_settlements s where s.workspace_id=new.workspace_id and s.id=(e->>'id')::uuid;
  select * into strict lease from public.aqari_leases l where l.workspace_id=new.workspace_id and l.id=settlement.lease_id;
  select value into strict c from jsonb_array_elements(coalesce(new_d->'contractsV202','[]'::jsonb)) x where x->>'id'=settlement.contract_ref;
  select value into strict old_c from jsonb_array_elements(coalesce(old_d->'contractsV202','[]'::jsonb)) x where x->>'id'=settlement.contract_ref;
  select * into package from private.aqari_contract_execution_packages p where p.id=package_id and p.workspace_id=new.workspace_id and p.settlement_id=settlement.id for update;
  if not found or package.actor_id<>auth.uid() or package.expires_at<now() or exists(select 1 from private.aqari_contract_execution_package_consumptions z where z.package_id=package.id) then
   raise exception 'EXECUTION_PACKAGE_UNAVAILABLE' using errcode='23514';
  end if;
  source:=package.source;
  if source->'pre_contract_snapshot' is distinct from old_c or source->'signed_contract_snapshot' is distinct from c
    or source->>'contract_no' is distinct from settlement.contract_no or source->>'contract_ref' is distinct from settlement.contract_ref
    or source->>'contract_document_id' is distinct from settlement.contract_document_id::text
    or (source#>>'{amounts,rent}')::numeric is distinct from settlement.rent_amount
    or (source#>>'{amounts,deposit}')::numeric is distinct from settlement.deposit_amount
    or (source#>>'{amounts,advance}')::numeric is distinct from settlement.advance_amount
    or (source#>>'{amounts,fees}')::numeric is distinct from settlement.fees_amount
    or (source#>>'{amounts,total}')::numeric is distinct from settlement.total_amount then
   raise exception 'EXECUTION_PACKAGE_SETTLEMENT_MISMATCH' using errcode='23514';
  end if;
  if settlement.contract_no is distinct from lease.contract_no or c->>'contract_no' is distinct from settlement.contract_no then raise exception 'CONTRACT_SERIAL_MISMATCH' using errcode='23514';end if;
  update private.aqari_contract_serial_reservations r set consumed_at=coalesce(r.consumed_at,now()) where r.workspace_id=new.workspace_id and r.contract_ref=settlement.contract_ref and r.contract_no=settlement.contract_no;
  if settlement.rent_amount>0 then
   receipt_sequence:=nullif(e->>'contractReceiptSequence','')::integer;
   select * into strict reservation from private.aqari_rent_receipt_serial_reservations r where r.receipt_no=settlement.rent_receipt_no and r.operation_ref=settlement.id;
   if reservation.workspace_id<>new.workspace_id or reservation.contract_ref<>settlement.contract_ref or reservation.contract_sequence<>receipt_sequence or reservation.consumed_at is not null
     or source->>'receipt_no' is distinct from settlement.rent_receipt_no or nullif(source->>'contract_receipt_sequence','')::integer is distinct from receipt_sequence then
    raise exception 'RECEIPT_SERIAL_RESERVATION_MISMATCH' using errcode='23514';
   end if;
   update private.aqari_rent_receipt_serial_reservations set consumed_at=now() where receipt_no=reservation.receipt_no;
  else
   if coalesce(e->>'contractReceiptSequence','')<>'' or coalesce(source->>'receipt_no','')<>'' or source->>'contract_receipt_sequence' is not null then raise exception 'ZERO_RENT_RECEIPT_SEQUENCE_FORBIDDEN' using errcode='23514';end if;
   receipt_sequence:=null;
  end if;
  tenant_doc:=source->'tenant_document'; owner_doc:=source->'owner_document';
  if jsonb_typeof(tenant_doc) is distinct from 'object' or jsonb_typeof(owner_doc) is distinct from 'object' then raise exception 'EXECUTION_PACKAGE_DOCUMENT_REQUIRED' using errcode='23514';end if;
  tenant_id:=extensions.gen_random_uuid();tenant_version:=extensions.gen_random_uuid();tenant_event:=extensions.gen_random_uuid();
  owner_id:=extensions.gen_random_uuid();owner_version:=extensions.gen_random_uuid();owner_event:=extensions.gen_random_uuid();
  insert into private.aqari_official_number_reservations(id,workspace_id,document_no,kind,entity_id,actor_id)
   values(tenant_id,new.workspace_id,tenant_doc->>'document_no','rental_contract',lease.id,auth.uid()),
         (owner_id,new.workspace_id,owner_doc->>'document_no','rental_contract',lease.id,auth.uid());
  insert into private.aqari_official_document_series(id,workspace_id,kind,document_no,entity_type,entity_id,status,current_version,created_by)
   values(tenant_id,new.workspace_id,'rental_contract',tenant_doc->>'document_no','lease',lease.id,'issued',1,auth.uid()),(owner_id,new.workspace_id,'rental_contract',owner_doc->>'document_no','lease',lease.id,'issued',1,auth.uid());
  insert into private.aqari_official_document_versions(id,workspace_id,series_id,version,template_version,title,body,payload,content_sha256,issued_by,issued_by_name,issued_at)
   values
    (tenant_version,new.workspace_id,tenant_id,1,(tenant_doc->>'template_version')::integer,tenant_doc->>'title',tenant_doc->>'body',tenant_doc->'payload',tenant_doc->>'content_sha256',auth.uid(),tenant_doc->>'issued_by_name',(tenant_doc->>'issued_at')::timestamptz),
    (owner_version,new.workspace_id,owner_id,1,(owner_doc->>'template_version')::integer,owner_doc->>'title',owner_doc->>'body',owner_doc->'payload',owner_doc->>'content_sha256',auth.uid(),owner_doc->>'issued_by_name',(owner_doc->>'issued_at')::timestamptz);
  insert into private.aqari_official_document_events(id,workspace_id,series_id,action,reason,actor_id,details)
   values(tenant_event,new.workspace_id,tenant_id,'issue','نسخة المستأجر التلقائية ضمن معاملة إبرام العقد',auth.uid(),jsonb_build_object('version',1,'hash',tenant_doc->>'content_sha256','execution_settlement_id',settlement.id)),
         (owner_event,new.workspace_id,owner_id,'issue','نسخة المالك / الإدارة التلقائية ضمن معاملة إبرام العقد',auth.uid(),jsonb_build_object('version',1,'hash',owner_doc->>'content_sha256','execution_settlement_id',settlement.id));
  insert into private.aqari_official_pdf_artifacts(workspace_id,series_id,version,snapshot_sha256,pdf_bytes,pdf_sha256,renderer_version,archived_by)
   values(new.workspace_id,tenant_id,1,tenant_doc->>'content_sha256',package.tenant_pdf_bytes,package.tenant_pdf_sha256,package.renderer_version,auth.uid()),
         (new.workspace_id,owner_id,1,owner_doc->>'content_sha256',package.owner_pdf_bytes,package.owner_pdf_sha256,package.renderer_version,auth.uid());
  if settlement.rent_amount>0 then
   select * into strict payment from public.aqari_rent_payments p where p.workspace_id=new.workspace_id and p.reference=settlement.rent_receipt_no;
   if package.receipt_artifacts->'receipt' is distinct from payment.receipt or package.receipt_artifacts->'ledger' is distinct from payment.record then
    raise exception 'EXECUTION_PACKAGE_RECEIPT_PERSISTENCE_MISMATCH' using errcode='23514';
   end if;
   receipt_snapshot_sha:=encode(sha256(convert_to(payment.receipt::text,'UTF8')),'hex');
   insert into private.aqari_rent_receipt_pdf_artifacts(workspace_id,receipt_no,payment_id,snapshot_sha256,pdf_bytes,pdf_sha256,renderer_version,archived_by)
    values(new.workspace_id,settlement.rent_receipt_no,payment.id,receipt_snapshot_sha,package.receipt_pdf_bytes,package.receipt_pdf_sha256,package.renderer_version,auth.uid());
  end if;
  insert into private.aqari_contract_execution_artifacts(settlement_id,workspace_id,lease_id,contract_ref,contract_no,tenant_document_id,owner_document_id,rent_receipt_no,contract_receipt_sequence,created_by)
   values(settlement.id,new.workspace_id,lease.id,settlement.contract_ref,settlement.contract_no,tenant_id,owner_id,settlement.rent_receipt_no,receipt_sequence,auth.uid());
  insert into private.aqari_contract_execution_package_consumptions(package_id,workspace_id,settlement_id,consumed_by)
   values(package.id,new.workspace_id,settlement.id,auth.uid());
  select u.property_id into property_id from public.aqari_units u where u.workspace_id=new.workspace_id and u.id=lease.unit_id;
  insert into private.aqari_financial_audit(workspace_id,property_id,entity_id,action,actor_id,actor_name,reason,after_value)
   values(new.workspace_id,property_id,settlement.id::text,'contract_execution_atomic_package_consumed',auth.uid(),settlement.created_by_name,'حفظ العقد والدفع ونسختي PDF والوصل المؤرشف ضمن معاملة واحدة',jsonb_build_object('package_id',package.id,'contract_no',settlement.contract_no,'tenant_document_id',tenant_id,'owner_document_id',owner_id,'rent_receipt_no',settlement.rent_receipt_no,'contract_receipt_sequence',receipt_sequence,'tenant_pdf_sha256',package.tenant_pdf_sha256,'owner_pdf_sha256',package.owner_pdf_sha256,'receipt_pdf_sha256',package.receipt_pdf_sha256));
 end loop;
 return null;
end $function$
;

