-- AQARI V267 isolated trial: prepare immutable execution PDFs before signing,
-- then consume the exact package inside the same app-state transaction that
-- signs the contract, records payment, updates dues and creates official docs.
begin;

create table if not exists private.aqari_contract_execution_packages(
 id uuid primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 settlement_id uuid not null unique,
 contract_ref text not null,
 contract_no text not null,
 actor_id uuid not null,
 prepared_at timestamptz not null,
 expires_at timestamptz not null,
 source jsonb not null check(jsonb_typeof(source)='object'),
 receipt_artifacts jsonb,
 tenant_pdf_bytes bytea not null check(octet_length(tenant_pdf_bytes) between 8 and 2097152),
 tenant_pdf_sha256 text not null check(tenant_pdf_sha256=encode(sha256(tenant_pdf_bytes),'hex')),
 owner_pdf_bytes bytea not null check(octet_length(owner_pdf_bytes) between 8 and 2097152),
 owner_pdf_sha256 text not null check(owner_pdf_sha256=encode(sha256(owner_pdf_bytes),'hex')),
 receipt_pdf_bytes bytea,
 receipt_pdf_sha256 text,
 renderer_version text not null check(length(renderer_version) between 1 and 100),
 created_at timestamptz not null default now(),
 unique(workspace_id,id),
 unique(workspace_id,settlement_id),
 check(expires_at>prepared_at and expires_at<=prepared_at+interval '30 minutes'),
 check((receipt_pdf_bytes is null and receipt_pdf_sha256 is null and receipt_artifacts is null)
    or (receipt_pdf_bytes is not null and octet_length(receipt_pdf_bytes) between 8 and 2097152
        and receipt_pdf_sha256=encode(sha256(receipt_pdf_bytes),'hex') and jsonb_typeof(receipt_artifacts)='object'))
);
alter table private.aqari_contract_execution_packages enable row level security;
revoke all on private.aqari_contract_execution_packages from public,anon,authenticated,service_role;
create trigger aqari_contract_execution_package_immutable
 before update or delete on private.aqari_contract_execution_packages
 for each row execute function private.aqari_reject_immutable_change();

create table if not exists private.aqari_contract_execution_package_consumptions(
 package_id uuid primary key references private.aqari_contract_execution_packages(id),
 workspace_id uuid not null references public.aqari_workspaces(id),
 settlement_id uuid not null unique,
 consumed_by uuid not null,
 consumed_at timestamptz not null default now(),
 unique(workspace_id,settlement_id)
);
alter table private.aqari_contract_execution_package_consumptions enable row level security;
revoke all on private.aqari_contract_execution_package_consumptions from public,anon,authenticated,service_role;
create trigger aqari_contract_execution_package_consumption_immutable
 before update or delete on private.aqari_contract_execution_package_consumptions
 for each row execute function private.aqari_reject_immutable_change();

create or replace function private.aqari_contract_execution_package_source(
 p_workspace_id uuid,
 p_contract_ref text,
 p_settlement_id uuid,
 p_contract_document_id uuid,
 p_prepared_at timestamptz,
 p_receipt_no text default '',
 p_contract_receipt_sequence integer default null
) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
 data jsonb; c jsonb; signed_c jsonb; lease public.aqari_leases%rowtype;
 reservation private.aqari_rent_receipt_serial_reservations%rowtype;
 actor text; first_period date; due_on date; entitlement_due numeric(15,3); credit_amount numeric(15,3); rent_payable numeric(15,3);
 contract_deposit numeric(15,3); deposit_balance numeric(15,3); deposit_due numeric(15,3); advance_due numeric(15,3); fees_due numeric(15,3); total_due numeric(15,3);
 clauses text; canonical_title text; canonical_body text; canonical_payload jsonb; canonical_hash text; template_version integer;
 tenant_title text; tenant_body text; tenant_payload jsonb; tenant_hash text;
 owner_title text; owner_body text; owner_payload jsonb; owner_hash text;
begin
 if auth.uid() is null or not private.aqari_manager(p_workspace_id)
   or not private.aqari_can(p_workspace_id,'contracts','write')
   or not private.aqari_can(p_workspace_id,'collections','write') then
  raise insufficient_privilege using message='GENERAL_MANAGER_EXECUTION_APPROVAL_REQUIRED';
 end if;
 if p_settlement_id is null or p_contract_document_id is null or btrim(coalesce(p_contract_ref,''))=''
   or length(p_contract_ref)>200 or p_contract_ref ~ '[[:cntrl:]]'
   or p_prepared_at < now()-interval '10 minutes' or p_prepared_at > now()+interval '1 minute' then
  raise exception 'EXECUTION_PACKAGE_INVALID_REQUEST' using errcode='22023';
 end if;
 select private.aqari_unwrap(s.payload) into data from public.aqari_app_state s where s.workspace_id=p_workspace_id;
 if data is null then raise exception 'EXECUTION_PACKAGE_STATE_REQUIRED' using errcode='P0002';end if;
 if (select count(*) from jsonb_array_elements(coalesce(data->'contractsV202','[]'::jsonb)) x where x->>'id'=p_contract_ref)<>1 then
  raise exception 'EXECUTION_PACKAGE_CONTRACT_REQUIRED' using errcode='P0002';
 end if;
 select value into c from jsonb_array_elements(data->'contractsV202') x where x->>'id'=p_contract_ref;
 if c->>'source'<>'v267-cloud' or c->>'status'<>'signing' or btrim(coalesce(c->>'contract_no',''))='' then
  raise exception 'EXECUTION_PACKAGE_SIGNING_REQUIRED' using errcode='23514';
 end if;
 select * into lease from public.aqari_leases l where l.workspace_id=p_workspace_id and l.external_ref=p_contract_ref;
 if not found or lease.status<>'signing' or lease.contract_no<>c->>'contract_no'
   or not private.aqari_can_lease(p_workspace_id,lease.id,'collections','write') then
  raise exception 'EXECUTION_PACKAGE_LEASE_REQUIRED' using errcode='23514';
 end if;
 if coalesce(c#>>'{rentEntitlement,startDate}','') !~ '^\d{4}-\d{2}-\d{2}$' then
  raise exception 'EXECUTION_PACKAGE_ENTITLEMENT_REQUIRED' using errcode='23514';
 end if;
 first_period:=date_trunc('month',(c#>>'{rentEntitlement,startDate}')::date)::date;
 select d.due_amount,d.credit_amount,private.aqari_rent_due_on(lease.snapshot,lease.start_date,d.period)
 into entitlement_due,credit_amount,due_on
 from private.aqari_rent_due_periods d
 where d.workspace_id=p_workspace_id and d.lease_id=lease.id and d.period=first_period;
 if entitlement_due is null then raise exception 'EXECUTION_PACKAGE_DUE_REQUIRED' using errcode='23514';end if;
 rent_payable:=greatest(entitlement_due-coalesce(credit_amount,0),0)::numeric(15,3);
 contract_deposit:=coalesce(nullif(c->>'deposit','')::numeric,0);
 select coalesce(sum(case x.kind when 'receipt' then x.amount else -x.amount end),0)::numeric(15,3)
 into deposit_balance from private.aqari_deposit_entries x where x.workspace_id=p_workspace_id and x.lease_id=lease.id;
 deposit_due:=greatest(contract_deposit-deposit_balance,0)::numeric(15,3);
 advance_due:=coalesce(nullif(c->>'advance','')::numeric,0)::numeric(15,3);
 fees_due:=coalesce(nullif(c->>'cleaningFee','')::numeric,0)::numeric(15,3);
 total_due:=(rent_payable+deposit_due+advance_due+fees_due)::numeric(15,3);
 if rent_payable>0 then
  select * into reservation from private.aqari_rent_receipt_serial_reservations r
   where r.receipt_no=btrim(coalesce(p_receipt_no,'')) and r.operation_ref=p_settlement_id;
  if not found or reservation.workspace_id<>p_workspace_id or reservation.contract_ref<>p_contract_ref
     or reservation.contract_sequence is distinct from p_contract_receipt_sequence or reservation.consumed_at is not null then
   raise exception 'EXECUTION_PACKAGE_RECEIPT_RESERVATION_REQUIRED' using errcode='23514';
  end if;
 else
  if btrim(coalesce(p_receipt_no,''))<>'' or p_contract_receipt_sequence is not null then
   raise exception 'EXECUTION_PACKAGE_FAKE_RECEIPT' using errcode='23514';
  end if;
 end if;
 select coalesce(nullif(p.display_name,''),auth.uid()::text) into actor from public.aqari_profiles p where p.user_id=auth.uid();
 actor:=coalesce(actor,auth.uid()::text);
 signed_c:=c||jsonb_build_object('status','signed','changeReason','اعتماد تسوية الإبرام وإتمام توقيع العقد');
 clauses:=(select string_agg(btrim(coalesce(x.value->>'title',''))||E'\n'||btrim(coalesce(x.value->>'text','')),E'\n\n' order by x.ordinality)
   from jsonb_array_elements(coalesce(signed_c->'clauses','[]'::jsonb)) with ordinality x(value,ordinality));
 if coalesce(length(btrim(clauses)),0)<5 then raise exception 'EXECUTION_PACKAGE_CONTRACT_CLAUSES_REQUIRED' using errcode='23514';end if;
 canonical_title:='عقد إيجار '||signed_c->>'contract_no';
 canonical_body:='عقد إيجار رقم '||signed_c->>'contract_no'||E'\nالمستأجر: '||coalesce(signed_c->>'tenant','')||E'\nالعقار: '||signed_c->>'property'||' — الوحدة: '||signed_c->>'unit'||E'\nمدة العقد: '||signed_c->>'start_date'||' إلى '||signed_c->>'end_date'||E'\nالإيجار الأصلي: '||coalesce(signed_c->>'contractRent',signed_c->>'rent')||' د.ك — الخصم: '||coalesce(signed_c->>'discount','0')||' د.ك'||E'\nالتأمين: '||coalesce(signed_c->>'deposit','0')||' د.ك — العربون: '||coalesce(signed_c->>'advance','0')||' د.ك — الرسوم: '||coalesce(signed_c->>'cleaningFee','0')||' د.ك'||E'\n\n'||clauses;
 canonical_payload:=jsonb_build_object('contractNo',signed_c->>'contract_no','tenant',signed_c->>'tenant','property',signed_c->>'property','unit',signed_c->>'unit','startDate',signed_c->>'start_date','endDate',signed_c->>'end_date','contractRent',signed_c->>'contractRent','discount',signed_c->>'discount','deposit',signed_c->>'deposit','advance',signed_c->>'advance','fees',signed_c->>'cleaningFee','template',signed_c->'contractTemplate','executionSettlementId',p_settlement_id,'contractSnapshot',signed_c);
 canonical_hash:=encode(extensions.digest(canonical_title||E'\n'||canonical_body||E'\n'||canonical_payload::text,'sha256'),'hex');
 template_version:=coalesce(nullif(signed_c#>>'{contractTemplate,version}','')::integer,1);
 tenant_title:=canonical_title||' — نسخة المستأجر'; tenant_body:='نسخة المستأجر'||E'\n'||canonical_body;
 tenant_payload:=canonical_payload||jsonb_build_object('copyRole','tenant','copyLabelAr','نسخة المستأجر','canonicalSeriesId',p_contract_document_id,'contractNo',signed_c->>'contract_no');
 tenant_hash:=encode(extensions.digest(tenant_title||E'\n'||tenant_body||E'\n'||tenant_payload::text,'sha256'),'hex');
 owner_title:=canonical_title||' — نسخة المالك / الإدارة'; owner_body:='نسخة المالك / الإدارة'||E'\n'||canonical_body;
 owner_payload:=canonical_payload||jsonb_build_object('copyRole','owner','copyLabelAr','نسخة المالك / الإدارة','canonicalSeriesId',p_contract_document_id,'contractNo',signed_c->>'contract_no');
 owner_hash:=encode(extensions.digest(owner_title||E'\n'||owner_body||E'\n'||owner_payload::text,'sha256'),'hex');
 return jsonb_build_object(
  'workspace_id',p_workspace_id,'contract_ref',p_contract_ref,'contract_no',signed_c->>'contract_no','lease_id',lease.id,
  'settlement_id',p_settlement_id,'contract_document_id',p_contract_document_id,'prepared_at',p_prepared_at,'actor_id',auth.uid(),'actor_name',actor,
  'pre_contract_snapshot',c,'signed_contract_snapshot',signed_c,
  'first_period',first_period,'due_on',due_on,'entitlement_due',entitlement_due,'credit_amount',coalesce(credit_amount,0),
  'amounts',jsonb_build_object('rent',rent_payable,'deposit',deposit_due,'advance',advance_due,'fees',fees_due,'total',total_due),
  'receipt_no',btrim(coalesce(p_receipt_no,'')),'contract_receipt_sequence',p_contract_receipt_sequence,
  'tenant_document',jsonb_build_object('document_no','CT-'||(signed_c->>'contract_no')||'-TENANT','title',tenant_title,'body',tenant_body,'payload',tenant_payload,'content_sha256',tenant_hash,'template_version',template_version,'issued_at',p_prepared_at,'issued_by_name',actor),
  'owner_document',jsonb_build_object('document_no','CT-'||(signed_c->>'contract_no')||'-OWNER','title',owner_title,'body',owner_body,'payload',owner_payload,'content_sha256',owner_hash,'template_version',template_version,'issued_at',p_prepared_at,'issued_by_name',actor),
  'canonical_content_sha256',canonical_hash
 );
end $$;
revoke all on function private.aqari_contract_execution_package_source(uuid,text,uuid,uuid,timestamptz,text,integer) from public,anon,authenticated,service_role;

create or replace function public.aqari_contract_execution_package_source(
 p_workspace_id uuid,p_contract_ref text,p_settlement_id uuid,p_contract_document_id uuid,p_prepared_at timestamptz,p_receipt_no text default '',p_contract_receipt_sequence integer default null
) returns jsonb
language sql volatile security definer set search_path='' as $$
 select private.aqari_contract_execution_package_source(p_workspace_id,p_contract_ref,p_settlement_id,p_contract_document_id,p_prepared_at,p_receipt_no,p_contract_receipt_sequence)
$$;
revoke all on function public.aqari_contract_execution_package_source(uuid,text,uuid,uuid,timestamptz,text,integer) from public,anon;
grant execute on function public.aqari_contract_execution_package_source(uuid,text,uuid,uuid,timestamptz,text,integer) to authenticated;

create or replace function public.aqari_contract_execution_package_commit(
 p_package_id uuid,p_actor_id uuid,p_source jsonb,p_receipt_artifacts jsonb,
 p_tenant_pdf_base64 text,p_tenant_pdf_sha256 text,p_owner_pdf_base64 text,p_owner_pdf_sha256 text,
 p_receipt_pdf_base64 text default null,p_receipt_pdf_sha256 text default null,p_renderer_version text default 'v267-contract-execution-package-1'
) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
 old_sub text:=current_setting('request.jwt.claim.sub',true); old_claims text:=current_setting('request.jwt.claims',true);
 current_source jsonb; tenant_bytes bytea; owner_bytes bytea; receipt_bytes bytea; existing private.aqari_contract_execution_packages%rowtype;
 w uuid; settlement uuid; contract_doc uuid; prepared timestamptz; receipt_no text; receipt_seq integer; rent_amount numeric; receipt jsonb; record jsonb; ledger jsonb;
begin
 if current_setting('role',true) is distinct from 'service_role' or p_package_id is null or p_actor_id is null or jsonb_typeof(p_source) is distinct from 'object' then
  raise insufficient_privilege using message='TRUSTED_RENDERER_REQUIRED';
 end if;
 begin
  w:=(p_source->>'workspace_id')::uuid; settlement:=(p_source->>'settlement_id')::uuid; contract_doc:=(p_source->>'contract_document_id')::uuid; prepared:=(p_source->>'prepared_at')::timestamptz;
 exception when others then raise exception 'EXECUTION_PACKAGE_INVALID_SOURCE' using errcode='22023'; end;
 receipt_no:=btrim(coalesce(p_source->>'receipt_no','')); receipt_seq:=nullif(p_source->>'contract_receipt_sequence','')::integer;
 perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor_id,'role','authenticated')::text,true);
 current_source:=private.aqari_contract_execution_package_source(w,p_source->>'contract_ref',settlement,contract_doc,prepared,receipt_no,receipt_seq);
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 if current_source is distinct from p_source or p_source->>'actor_id' is distinct from p_actor_id::text then
  raise exception 'EXECUTION_PACKAGE_SOURCE_CHANGED' using errcode='23514';
 end if;
 if p_tenant_pdf_base64 is null or p_owner_pdf_base64 is null or p_tenant_pdf_sha256!~'^[a-f0-9]{64}$' or p_owner_pdf_sha256!~'^[a-f0-9]{64}$'
   or length(p_tenant_pdf_base64)>2796204 or length(p_owner_pdf_base64)>2796204 or length(p_renderer_version) not between 1 and 100 then
  raise exception 'EXECUTION_PACKAGE_INVALID_PDF' using errcode='23514';
 end if;
 tenant_bytes:=decode(p_tenant_pdf_base64,'base64'); owner_bytes:=decode(p_owner_pdf_base64,'base64');
 if octet_length(tenant_bytes) not between 8 and 2097152 or substring(tenant_bytes from 1 for 5)<>convert_to('%PDF-','UTF8') or encode(sha256(tenant_bytes),'hex')<>p_tenant_pdf_sha256
   or octet_length(owner_bytes) not between 8 and 2097152 or substring(owner_bytes from 1 for 5)<>convert_to('%PDF-','UTF8') or encode(sha256(owner_bytes),'hex')<>p_owner_pdf_sha256 then
  raise exception 'EXECUTION_PACKAGE_INVALID_PDF' using errcode='23514';
 end if;
 rent_amount:=(p_source#>>'{amounts,rent}')::numeric;
 if rent_amount>0 then
  if jsonb_typeof(p_receipt_artifacts) is distinct from 'object' or p_receipt_pdf_base64 is null or p_receipt_pdf_sha256!~'^[a-f0-9]{64}$' or length(p_receipt_pdf_base64)>2796204 then
   raise exception 'EXECUTION_PACKAGE_RECEIPT_REQUIRED' using errcode='23514';
  end if;
  receipt:=p_receipt_artifacts->'receipt'; record:=p_receipt_artifacts->'record'; ledger:=p_receipt_artifacts->'ledger';
  if jsonb_typeof(receipt) is distinct from 'object' or jsonb_typeof(record) is distinct from 'array' or jsonb_typeof(ledger) is distinct from 'object'
    or receipt->>'id' is distinct from receipt_no or record->>0 is distinct from receipt_no or ledger->>'receiptNo' is distinct from receipt_no
    or nullif(receipt->>'contractReceiptSequence','')::integer is distinct from receipt_seq
    or nullif(ledger->>'contractReceiptSequence','')::integer is distinct from receipt_seq
    or receipt#>>'{contract,id}' is distinct from p_source->>'contract_ref' or receipt#>>'{contract,contract_no}' is distinct from p_source->>'contract_no'
    or receipt#>>'{contract,status}' is distinct from 'signed'
    or (record->>2)::numeric is distinct from rent_amount or (ledger->>'paid')::numeric is distinct from rent_amount then
   raise exception 'EXECUTION_PACKAGE_RECEIPT_MISMATCH' using errcode='23514';
  end if;
  receipt_bytes:=decode(p_receipt_pdf_base64,'base64');
  if octet_length(receipt_bytes) not between 8 and 2097152 or substring(receipt_bytes from 1 for 5)<>convert_to('%PDF-','UTF8') or encode(sha256(receipt_bytes),'hex')<>p_receipt_pdf_sha256 then
   raise exception 'EXECUTION_PACKAGE_INVALID_RECEIPT_PDF' using errcode='23514';
  end if;
 else
  if p_receipt_artifacts is not null or p_receipt_pdf_base64 is not null or p_receipt_pdf_sha256 is not null then raise exception 'EXECUTION_PACKAGE_FAKE_RECEIPT' using errcode='23514';end if;
 end if;
 select * into existing from private.aqari_contract_execution_packages where workspace_id=w and settlement_id=settlement;
 if found then
  if existing.id<>p_package_id or existing.actor_id<>p_actor_id or existing.source<>p_source or existing.tenant_pdf_sha256<>p_tenant_pdf_sha256 or existing.owner_pdf_sha256<>p_owner_pdf_sha256
    or existing.receipt_artifacts is distinct from p_receipt_artifacts or existing.receipt_pdf_sha256 is distinct from p_receipt_pdf_sha256 then
   raise exception 'EXECUTION_PACKAGE_REPLAY_CONFLICT' using errcode='23505';
  end if;
  return jsonb_build_object('package_id',existing.id,'replayed',true,'expires_at',existing.expires_at);
 end if;
 insert into private.aqari_contract_execution_packages(id,workspace_id,settlement_id,contract_ref,contract_no,actor_id,prepared_at,expires_at,source,receipt_artifacts,tenant_pdf_bytes,tenant_pdf_sha256,owner_pdf_bytes,owner_pdf_sha256,receipt_pdf_bytes,receipt_pdf_sha256,renderer_version)
 values(p_package_id,w,settlement,p_source->>'contract_ref',p_source->>'contract_no',p_actor_id,prepared,prepared+interval '15 minutes',p_source,p_receipt_artifacts,tenant_bytes,p_tenant_pdf_sha256,owner_bytes,p_owner_pdf_sha256,receipt_bytes,p_receipt_pdf_sha256,p_renderer_version);
 return jsonb_build_object('package_id',p_package_id,'replayed',false,'expires_at',prepared+interval '15 minutes');
end $$;
revoke all on function public.aqari_contract_execution_package_commit(uuid,uuid,jsonb,jsonb,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.aqari_contract_execution_package_commit(uuid,uuid,jsonb,jsonb,text,text,text,text,text,text,text) to service_role;

create or replace function private.aqari_project_contract_execution_artifacts() returns trigger
language plpgsql security definer set search_path='' as $$
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
   if package.receipt_artifacts->'receipt' is distinct from payment.receipt or package.receipt_artifacts->'record' is distinct from payment.record then
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
end $$;
revoke all on function private.aqari_project_contract_execution_artifacts() from public,anon,authenticated,service_role;

commit;
