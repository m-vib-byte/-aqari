-- Full rollback-only atomic execution acceptance.
-- Storage rows below are synthetic metadata only; no files are uploaded.
-- Preview/isolated database only. Synthetic identities, no real sessions or data.
-- All fixture rows and package commits are rolled back. This is SQL acceptance,
-- not authenticated browser/API or production acceptance.
-- Run twice, with SET LOCAL aqari.execution_package_test_rent = '0' or '100'
-- immediately after BEGIN (default: zero). PDF bytes below are SQL-only fixtures.
begin;
set local statement_timeout='20s';
select set_config('aqari.execution_package_test',jsonb_build_object(
 'workspace',gen_random_uuid(),'manager',gen_random_uuid(),'viewer',gen_random_uuid(),
 'property',gen_random_uuid(),'unit',gen_random_uuid(),'tenant',gen_random_uuid(),
 'lease',gen_random_uuid(),'settlement',gen_random_uuid(),'document',gen_random_uuid(),
 'package',gen_random_uuid(),'prepared',now(),'rent',coalesce(nullif(current_setting('aqari.execution_package_test_rent',true),''),'0')::numeric)::text,true);
do $$
declare t jsonb:=current_setting('aqari.execution_package_test')::jsonb; w uuid:=(t->>'workspace')::uuid; c jsonb; role_name text; u uuid;
begin
 t:=t||jsonb_build_object('tenant',md5(w::text||':tenant:package-tenant')::uuid,'lease',md5(w::text||':lease:package-lease')::uuid,'unit',md5((t->>'property')||':unit:PACKAGE-TEST')::uuid);
 perform set_config('aqari.execution_package_test',t::text,true);
 insert into public.aqari_workspaces(id,slug,name) values(w,'package-test-'||w::text,'Synthetic execution package test');
 foreach role_name in array array['manager','viewer'] loop
  u:=(t->>role_name)::uuid;
  insert into private.aqari_allowed_users(email,display_name,role,workspace_slug)
  values('package-test-'||u::text||'@example.invalid','Synthetic package '||role_name,
   (case role_name when 'manager' then 'general_manager' else 'viewer' end)::public.aqari_role,'package-test-'||w::text);
  insert into auth.users(id,email,email_confirmed_at) values(u,'package-test-'||u::text||'@example.invalid',now());
 end loop;
 perform set_config('request.jwt.claim.sub',t->>'manager',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',t->>'manager','role','authenticated')::text,true);
 insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata)
 values((t->>'property')::uuid,w,'package-property','Synthetic package property','{}');
 insert into public.aqari_units(id,workspace_id,property_id,unit_no)
 values((t->>'unit')::uuid,w,(t->>'property')::uuid,'PACKAGE-TEST');
 insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,email,profile)
 values((t->>'tenant')::uuid,w,'package-tenant','Synthetic package tenant','123456789019','55559002','package-tenant@example.invalid','{}');
 insert into private.aqari_unit_readiness(id,workspace_id,unit_id,revision,state,inspected_on,source_ref,reason,recorded_by)
 values(gen_random_uuid(),w,(t->>'unit')::uuid,1,'ready',current_date,'synthetic','Rollback fixture only',(t->>'manager')::uuid);
 c:=jsonb_build_object('detailsVersion',2,'paymentCycleMonths',1,'floor','1','accountant','Synthetic accountant','writtenOn',current_date::text,'contractReceived','لم يستلم','evictionNotice','غير محدد','id','package-lease','source','v267-cloud','status','signing','contract_no','PACKAGE-TEST',
 'tenant','Synthetic package tenant','property','Synthetic package property','unit','PACKAGE-TEST',
 'tenantId','package-tenant','start_date','2026-10-01','end_date','2027-09-30',
 'rentalTermsVersion',1,'rentAdjustments','[]'::jsonb,'freeMonthApproved',false,'rent',100,'contractRent',100,'discount',0,'deposit',0,'advance',0,'cleaningFee',0,
 'rentEntitlement',jsonb_build_object('version',1,'startDate','2026-10-01','firstPeriodPolicy','manual_first_period','manualFirstPeriodAmount',(t->>'rent')::numeric),
 'clauses',jsonb_build_array(jsonb_build_object('title','Synthetic clause','text','Synthetic contract for rollback acceptance only')));
 c:=c||jsonb_build_object('tenantProfile',jsonb_build_object('id','package-tenant','nameAr','Synthetic package tenant','nameEn','Synthetic package tenant','nationality','Synthetic','civilId','123456789019','passportNo','TEST123','phone','55559002','email','package-tenant@example.invalid'));
 insert into public.aqari_app_state(workspace_id,payload) values(w,jsonb_build_object('contractsV202',jsonb_build_array(c),'tenantProfilesV267',jsonb_build_array(jsonb_build_object('id','package-tenant','nameAr','Synthetic package tenant','nameEn','Synthetic package tenant','nationality','Synthetic','civilId','123456789019','passportNo','TEST123','phone','55559002','email','package-tenant@example.invalid'))));
 insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot)
 values((t->>'lease')::uuid,w,'package-lease',(t->>'tenant')::uuid,(t->>'unit')::uuid,'PACKAGE-TEST','2026-10-01','2027-09-30',100,0,'signing',c);
end $$;
do $$declare t jsonb:=current_setting('aqari.execution_package_test')::jsonb;begin
 if exists(select 1 from private.aqari_rent_due_periods where workspace_id=(t->>'workspace')::uuid) then raise exception 'TEST_SIGNING_MUST_NOT_POST_DUES';end if;
end $$;
set local role authenticated;
do $$
declare t jsonb:=current_setting('aqari.execution_package_test')::jsonb; s jsonb;r jsonb;
begin
 if (t->>'rent')::numeric>0 then
  r:=public.aqari_reserve_rent_receipt_serial((t->>'workspace')::uuid,'package-lease',(t->>'settlement')::uuid,2026);
  t:=t||jsonb_build_object('receipt',r->>'receipt_no','sequence',r->'contract_sequence');
  perform set_config('aqari.execution_package_test',t::text,true);
 end if;
 s:=public.aqari_contract_execution_package_source((t->>'workspace')::uuid,'package-lease',(t->>'settlement')::uuid,(t->>'document')::uuid,(t->>'prepared')::timestamptz,coalesce(t->>'receipt',''),(t->>'sequence')::integer);
 if (s#>>'{amounts,rent}')::numeric is distinct from (t->>'rent')::numeric then raise exception 'TEST_RENT_SOURCE_FAILED';end if;
 if s->>'actor_id'<>t->>'manager' or s#>>'{signed_contract_snapshot,status}'<>'signed'
 or s#>>'{tenant_document,payload,copyRole}'<>'tenant' or s#>>'{owner_document,payload,copyRole}'<>'owner' then raise exception 'TEST_CANONICAL_SOURCE_FAILED';end if;
 perform set_config('aqari.execution_package_source',s::text,true);
 begin
  perform public.aqari_contract_execution_package_commit((t->>'package')::uuid,(t->>'manager')::uuid,s,null,'bad','bad','bad','bad');
  raise exception 'TEST_AUTHENTICATED_COMMIT_NOT_DENIED';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',t->>'viewer',true);
 begin
  perform public.aqari_contract_execution_package_source((t->>'workspace')::uuid,'package-lease',(t->>'settlement')::uuid,(t->>'document')::uuid,(t->>'prepared')::timestamptz,coalesce(t->>'receipt',''),(t->>'sequence')::integer);
  raise exception 'TEST_VIEWER_SOURCE_NOT_DENIED';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role service_role;
do $$
declare t jsonb:=current_setting('aqari.execution_package_test')::jsonb;s jsonb:=current_setting('aqari.execution_package_source')::jsonb;r jsonb;artifacts jsonb;receipt_pdf text;receipt_hash text;
 pdf text:=encode(convert_to('%PDF-synthetic-package-fixture','UTF8'),'base64');
 hash text:=encode(sha256(convert_to('%PDF-synthetic-package-fixture','UTF8')),'hex');
begin
 if (t->>'rent')::numeric>0 then
  artifacts:=jsonb_build_object(
   'record',jsonb_build_array(t->>'receipt','Synthetic package tenant',(t->>'rent')::numeric,'مدفوع','Synthetic package property',current_date::text,'PACKAGE-TEST','دفعة الإبرام · تسلسل الوصل داخل العقد: '||(t->>'sequence'),'2026-10','نقدي'),
   'ledger',jsonb_build_object('id','rent-'||(t->>'receipt'),'receiptNo',t->>'receipt','contractId','package-lease','contractNo','PACKAGE-TEST','property','Synthetic package property','unit','PACKAGE-TEST','tenant','Synthetic package tenant','contractReceiptSequence',t->'sequence','period','2026-10','due',(t->>'rent')::numeric,'paid',(t->>'rent')::numeric,'balance',0,'paidAt',current_date::text,'method','نقدي','transactionNo','SYNTHETIC-EXECUTION','accountant','Synthetic accountant','status','مدفوع','note','دفعة الإبرام · تسلسل الوصل داخل العقد: '||(t->>'sequence'),'source','v267-contract-execution'),
   'receipt',jsonb_build_object('id',t->>'receipt','contractReceiptSequence',t->'sequence','template','rent-voucher-v267-1','contract',s->'signed_contract_snapshot','tenantId','package-tenant','tenantNameEn','Synthetic package tenant','brand',jsonb_build_object('ar','Synthetic package property','en','AQARI PROPERTY','website','myaqari.com'),'detailsVersion',2,'accountant','Synthetic accountant','transactionNo','SYNTHETIC-EXECUTION','rentPeriodBreakdown',jsonb_build_object('version',1,'period','2026-10','dueOn','2026-10-01','policy','manual_first_period','gross',null,'discount',null,'net',(t->>'rent')::numeric,'manual',true,'freeMonth',false)));
  artifacts:=jsonb_set(artifacts,'{receipt,record}',artifacts->'record');
  perform set_config('aqari.execution_test_receipt',artifacts::text,true);
  receipt_pdf:=pdf;receipt_hash:=hash;
 end if;
 r:=public.aqari_contract_execution_package_commit((t->>'package')::uuid,(t->>'manager')::uuid,s,artifacts,pdf,hash,pdf,hash,receipt_pdf,receipt_hash);
 if r->>'package_id'<>t->>'package' or (r->>'replayed')::boolean then raise exception 'TEST_PACKAGE_COMMIT_FAILED';end if;
 r:=public.aqari_contract_execution_package_commit((t->>'package')::uuid,(t->>'manager')::uuid,s,artifacts,pdf,hash,pdf,hash,receipt_pdf,receipt_hash);
 if not (r->>'replayed')::boolean then raise exception 'TEST_PACKAGE_REPLAY_FAILED';end if;
 begin
  perform public.aqari_contract_execution_package_commit(gen_random_uuid(),(t->>'manager')::uuid,s,artifacts,pdf,hash,pdf,hash,receipt_pdf,receipt_hash);
  raise exception 'TEST_CONFLICTING_REPLAY_NOT_DENIED';
 exception when unique_violation then if sqlerrm<>'EXECUTION_PACKAGE_REPLAY_CONFLICT' then raise;end if;end;
 begin
  perform public.aqari_contract_execution_package_commit((t->>'package')::uuid,(t->>'manager')::uuid,s,artifacts,pdf,repeat('0',64),pdf,hash,receipt_pdf,receipt_hash);
  raise exception 'TEST_CORRUPT_PDF_NOT_DENIED';
 exception when check_violation then if sqlerrm<>'EXECUTION_PACKAGE_INVALID_PDF' then raise;end if;end;
 begin
  perform public.aqari_contract_execution_package_commit((t->>'package')::uuid,(t->>'manager')::uuid,jsonb_set(s,'{amounts,rent}','99'),artifacts,pdf,hash,pdf,hash,receipt_pdf,receipt_hash);
  raise exception 'TEST_CHANGED_SOURCE_NOT_DENIED';
 exception when check_violation then if sqlerrm<>'EXECUTION_PACKAGE_SOURCE_CHANGED' then raise;end if;end;
 if (t->>'rent')::numeric=0 then
 begin
  perform public.aqari_contract_execution_package_commit((t->>'package')::uuid,(t->>'manager')::uuid,s,'{}',pdf,hash,pdf,hash);
  raise exception 'TEST_FAKE_RECEIPT_NOT_DENIED';
 exception when check_violation then if sqlerrm<>'EXECUTION_PACKAGE_FAKE_RECEIPT' then raise;end if;end;
 else
 begin
  perform public.aqari_contract_execution_package_commit((t->>'package')::uuid,(t->>'manager')::uuid,s,jsonb_set(artifacts,'{record,2}','101'),pdf,hash,pdf,hash,receipt_pdf,receipt_hash);
  raise exception 'TEST_RECEIPT_AMOUNT_NOT_DENIED';
 exception when check_violation then if sqlerrm<>'EXECUTION_PACKAGE_RECEIPT_MISMATCH' then raise;end if;end;
 end if;
end $$;
reset role;
do $$
declare t jsonb:=current_setting('aqari.execution_package_test')::jsonb;w uuid:=(t->>'workspace')::uuid;
begin
 if (select count(*) from private.aqari_contract_execution_packages where workspace_id=w)<>1 then raise exception 'TEST_PACKAGE_DUPLICATED';end if;
 if exists(select 1 from private.aqari_contract_execution_package_consumptions where workspace_id=w) then raise exception 'TEST_PREPARATION_CONSUMED_SETTLEMENT';end if;
 if (select status from public.aqari_leases where id=(t->>'lease')::uuid)<>'signing' then raise exception 'TEST_PREPARATION_SIGNED_CONTRACT';end if;
end $$;
select 'PASS: canonical source; viewer rejection; authenticated commit rejection; package commit; idempotent replay; conflicting replay rejection; PDF integrity; source integrity; receipt validation; no settlement or signing' as result, (current_setting('aqari.execution_package_test')::jsonb->>'rent')::numeric as tested_rent;
-- Run after the fixture/package setup in contract_execution_package_hosted.sql,
-- before its ROLLBACK. Executes the installed projector's actual text statements.
-- This validates canonical rendering parity, not the full signing transaction.
do $test$
declare definition text; statements text; number_expression text;
 source jsonb:=current_setting('aqari.execution_package_source')::jsonb;
begin
 select prosrc into definition from pg_proc where oid='private.aqari_project_contract_execution()'::regprocedure;
 statements:=substring(definition from '(clauses:=.*?)template_version:=');
 number_expression:=substring(definition from 'values\(document_id,new.workspace_id,''rental_contract'',(.*?),''lease''');
 if statements is null or number_expression is null then raise exception 'TEST_PROJECTOR_STATEMENTS_NOT_FOUND';end if;
 execute format($sql$
 do $check$
 declare source jsonb:=%L::jsonb; c jsonb:=source->'signed_contract_snapshot';
 settlement_id uuid:=(source->>'settlement_id')::uuid;
 clauses text; title text; body text; payload jsonb; hash text; document_no text;
 begin
 %s
 document_no:=%s;
 if title is distinct from 'عقد إيجار '||(c->>'contract_no') then raise exception 'TEST_TITLE_MISMATCH';end if;
 if document_no is distinct from 'CT-'||(c->>'contract_no') then raise exception 'TEST_DOCUMENT_NUMBER_MISMATCH';end if;
 if hash is distinct from source->>'canonical_content_sha256' then raise exception 'TEST_PACKAGE_CANONICAL_HASH_MISMATCH';end if;
 if source#>>'{tenant_document,body}' is distinct from 'نسخة المستأجر'||E'\n'||body then raise exception 'TEST_TENANT_BODY_MISMATCH';end if;
 if source#>>'{owner_document,body}' is distinct from 'نسخة المالك / الإدارة'||E'\n'||body then raise exception 'TEST_OWNER_BODY_MISMATCH';end if;
 end $check$;
 $sql$,source,statements,number_expression);
end $test$;
select 'PASS: installed projector title, body, document number, canonical SHA256 and package copy parity' result;


reset role;
do $fixture$
declare t jsonb:=current_setting('aqari.execution_package_test')::jsonb;s jsonb:=current_setting('aqari.execution_package_source')::jsonb;doc uuid:=gen_random_uuid();
begin
 perform set_config('request.jwt.claim.sub',t->>'manager',true);
 insert into public.aqari_documents(id,workspace_id,document_no,document_type,entity_type,entity_ref,title,original_filename,mime_type,storage_path,status,created_by)
 values(doc,(t->>'workspace')::uuid,'FIXTURE-'||doc,'signed_contract','lease','package-lease','Synthetic signed fixture','fixture.pdf','application/pdf',(t->>'workspace')||'/'||doc||'.pdf','draft',(t->>'manager')::uuid);
 insert into storage.objects(bucket_id,name,metadata) values('aqari-documents',(t->>'workspace')||'/'||doc||'.pdf','{"size":32,"mimetype":"application/pdf"}');
 update public.aqari_documents set status='uploaded',size_bytes=32 where id=doc;
 insert into private.aqari_contract_signature_reviews(id,workspace_id,document_id,required_signers,signed_by,contract_sha256,reviewed_by,status)
 values(gen_random_uuid(),(t->>'workspace')::uuid,doc,'["tenant","owner"]','["tenant","owner"]',encode(sha256(convert_to(((s->'signed_contract_snapshot')-array['status','changeReason','updatedAt'])::text,'UTF8')),'hex'),(t->>'manager')::uuid,'complete');
end $fixture$;
set local role authenticated;
do $sign$
declare t jsonb:=current_setting('aqari.execution_package_test')::jsonb;s jsonb:=current_setting('aqari.execution_package_source')::jsonb;e jsonb;p jsonb;
begin
 e:=jsonb_build_object('id',t->>'settlement','contractId','package-lease','contractNo','PACKAGE-TEST','tenantId','package-tenant','property','Synthetic package property','unit','PACKAGE-TEST','onDate',current_date,'method','none','transactionNo','','components',s->'amounts','rentReceiptNo','','contractReceiptSequence',null,'zeroReason','Synthetic zero settlement','contractDocumentId',t->>'document','contractDocumentVersionId',gen_random_uuid(),'contractDocumentEventId',gen_random_uuid(),'status','confirmed','executionPackageId',t->>'package');
 select payload into p from public.aqari_app_state where workspace_id=(t->>'workspace')::uuid;
 if (t->>'rent')::numeric>0 then
  e:=e||jsonb_build_object('method','cash','transactionNo','SYNTHETIC-EXECUTION','rentReceiptNo',t->>'receipt','contractReceiptSequence',t->'sequence','zeroReason','');
  p:=p||jsonb_build_object('collections',jsonb_build_array(current_setting('aqari.execution_test_receipt')::jsonb->'record'),'rentLedgerV202',jsonb_build_array(current_setting('aqari.execution_test_receipt')::jsonb->'ledger'),'rentReceiptsV267',jsonb_build_array(current_setting('aqari.execution_test_receipt')::jsonb->'receipt'));
 end if;
 p:=p||jsonb_build_object('contractsV202',jsonb_build_array(s->'signed_contract_snapshot'),'contractExecutionSettlementsV267',jsonb_build_array(e));
 begin
  update public.aqari_app_state set payload=jsonb_set(p,'{contractExecutionSettlementsV267,0,executionPackageId}',to_jsonb(gen_random_uuid()::text)) where workspace_id=(t->>'workspace')::uuid;
  raise exception 'TEST_WRONG_PACKAGE_ACCEPTED';
 exception when check_violation then
  if sqlerrm<>'EXECUTION_DOCUMENT_MANIFEST_MISMATCH' then raise;end if;
 end;
 if (select status from public.aqari_leases where id=(t->>'lease')::uuid)<>'signing' then raise exception 'TEST_FAILED_SIGNING_NOT_ROLLED_BACK';end if;
 if exists(select 1 from public.aqari_rent_payments where workspace_id=(t->>'workspace')::uuid) then raise exception 'TEST_FAILED_PAYMENT_NOT_ROLLED_BACK';end if;
 update public.aqari_app_state set payload=p where workspace_id=(t->>'workspace')::uuid;
 if not found then raise exception 'TEST_STATE_NOT_UPDATED';end if;
 -- Replaying the identical state must not duplicate financial or document rows.
 update public.aqari_app_state set payload=p where workspace_id=(t->>'workspace')::uuid;
end $sign$;
reset role;
do $assert$
declare t jsonb:=current_setting('aqari.execution_package_test')::jsonb;w uuid:=(t->>'workspace')::uuid;
begin
 if (select status from public.aqari_leases where id=(t->>'lease')::uuid)<>'signed' then raise exception 'TEST_NOT_SIGNED';end if;
 if (select count(*) from private.aqari_contract_execution_settlements where workspace_id=w)<>1 then raise exception 'TEST_SETTLEMENT_COUNT';end if;
 if (select count(*) from private.aqari_official_number_reservations where workspace_id=w)<>3 then raise exception 'TEST_RESERVATION_COUNT';end if;
 if (select count(*) from private.aqari_official_document_series where workspace_id=w)<>3 then raise exception 'TEST_DOCUMENT_COUNT';end if;
 if (select count(*) from private.aqari_official_pdf_artifacts where workspace_id=w)<>2 then raise exception 'TEST_PDF_COUNT';end if;
 if (select count(*) from private.aqari_contract_execution_package_consumptions where workspace_id=w)<>1 then raise exception 'TEST_CONSUMPTION_COUNT';end if;
 if (select count(*) from public.aqari_rent_payments where workspace_id=w)<>(case when (t->>'rent')::numeric>0 then 1 else 0 end) then raise exception 'TEST_PAYMENT_COUNT';end if;
 if (select count(*) from private.aqari_rent_receipt_pdf_artifacts where workspace_id=w)<>(case when (t->>'rent')::numeric>0 then 1 else 0 end) then raise exception 'TEST_RECEIPT_PDF_COUNT';end if;
 if exists(select 1 from private.aqari_rent_due_periods where workspace_id=w and period='2026-10-01' and balance<>0) then raise exception 'TEST_FIRST_PERIOD_UNSETTLED';end if;
 if (t->>'rent')::numeric>0 and not exists(select 1 from private.aqari_rent_receipt_serial_reservations where workspace_id=w and consumed_at is not null) then raise exception 'TEST_RECEIPT_RESERVATION_NOT_CONSUMED';end if;
end $assert$;

do $denials$
declare t jsonb:=current_setting('aqari.execution_package_test')::jsonb;w uuid:=(t->>'workspace')::uuid;
 s private.aqari_official_document_series;v private.aqari_official_document_versions;p private.aqari_contract_execution_packages;
 role_name text;
begin
 select * into strict s from private.aqari_official_document_series where id=(t->>'document')::uuid;
 select * into strict v from private.aqari_official_document_versions where series_id=s.id;
 select * into strict p from private.aqari_contract_execution_packages where id=(t->>'package')::uuid;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(role_name,'private.aqari_validate_execution_document(private.aqari_official_document_series,private.aqari_official_document_versions)','execute') then raise exception 'TEST_HELPER_EXPOSED';end if;
 end loop;
 begin
  perform private.aqari_validate_execution_document(s,v);
  raise exception 'TEST_CONSUMED_PACKAGE_ACCEPTED';
 exception when check_violation then if sqlerrm<>'EXECUTION_DOCUMENT_PACKAGE_UNAVAILABLE' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',t->>'viewer',true);
 begin
  perform private.aqari_validate_execution_document(s,v);
  raise exception 'TEST_VIEWER_DOCUMENT_ACCEPTED';
 exception when insufficient_privilege then if sqlerrm<>'EXECUTION_DOCUMENT_ACCESS_DENIED' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',t->>'manager',true);
 -- Privileged synthetic fixture only: clone an already validated package as
 -- expired. The expected helper exception rolls its insertion back immediately.
 p.id:=gen_random_uuid();p.settlement_id:=gen_random_uuid();
 p.prepared_at:=now()-interval '1 hour';p.expires_at:=now()-interval '45 minutes';
 v.payload:=jsonb_set(v.payload,'{executionSettlementId}',to_jsonb(p.settlement_id::text));
 begin
  insert into private.aqari_contract_execution_packages select (p).*;
  perform private.aqari_validate_execution_document(s,v);
  raise exception 'TEST_EXPIRED_PACKAGE_ACCEPTED';
 exception when check_violation then if sqlerrm<>'EXECUTION_DOCUMENT_PACKAGE_UNAVAILABLE' then raise;end if;end;
 if exists(select 1 from private.aqari_contract_execution_packages where id=p.id) then raise exception 'TEST_EXPIRED_FIXTURE_REMAINED';end if;
end $denials$;

select 'PASS: atomic signing, payment/zero-rent, reserved documents, archived PDFs, single consumption, wrong-package rollback, idempotent replay, viewer/expired/consumed-package rejection and private-helper ACL' result, (current_setting('aqari.execution_package_test')::jsonb->>'rent')::numeric tested_rent;

rollback;


