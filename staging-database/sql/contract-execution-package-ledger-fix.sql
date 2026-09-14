-- Follow-up to contract-execution-package-atomic.sql: aqari_rent_payments.record
-- is the immutable rent-ledger entry, while collections keeps the display row.
begin;
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
end $$;
revoke all on function private.aqari_project_contract_execution_artifacts() from public,anon,authenticated,service_role;
commit;
