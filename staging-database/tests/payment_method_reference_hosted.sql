-- Hosted acceptance after payment-method-reference-guard.sql. No production data used.
-- A dedicated synthetic workspace/account plus document metadata only; no real Auth or file-byte acceptance.
-- Entire test rolls back. No DDL, privilege grants, disabled triggers, or historical receipt fixtures.
begin;
insert into public.aqari_workspaces(id,slug,name)values('768c0000-0000-4000-8000-000000000098','payment-method-reference-hosted','اختبار طرق التحصيل المعزول');
insert into public.aqari_app_state(workspace_id,payload)values('768c0000-0000-4000-8000-000000000098','{}');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug)values('payment-method-hosted-manager@example.invalid','مدير اختبار طرق الدفع','general_manager','payment-method-reference-hosted');
insert into auth.users(id,email,email_confirmed_at)values('768c0000-0000-4000-8000-000000000001','payment-method-hosted-manager@example.invalid',now());
select set_config('request.jwt.claim.sub','768c0000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
set local role authenticated;
do $$declare w uuid:='768c0000-0000-4000-8000-000000000098';d jsonb;rev bigint;t jsonb;c jsonb;r jsonb;v jsonb;l jsonb;doc record;p uuid;candidate jsonb;sample jsonb;before_count bigint;savedpay jsonb;payid uuid;begin
 d:='{"properties":[["عقار اختبار طرق الدفع"]],"tenantProfilesV267":[],"contractsV202":[],"collections":[],"rentLedgerV202":[],"rentReceiptsV267":[]}';
 t:='{"id":"payment-method-hosted-tenant","nameAr":"مستأجر اختبار طرق الدفع","nameEn":"Payment Method Tenant","civilId":"768100000001","passportNo":"TEST-PASSPORT","phone":"55550091","email":"payment-hosted-tenant@example.invalid","nationality":"اختبار"}';
 d:=jsonb_set(d,'{tenantProfilesV267}',jsonb_build_array(t));
 select revision into rev from public.aqari_app_state where workspace_id=w;
 perform public.aqari_save_state_v267(w,d,rev);
 select payload,revision into d,rev from public.aqari_app_state where workspace_id=w;
 select id into strict p from public.aqari_properties where workspace_id=w and name='عقار اختبار طرق الدفع';
 if to_regprocedure('public.aqari_unit_readiness_register(uuid,text,jsonb)') is not null then
  perform public.aqari_unit_readiness_register(w,'record',jsonb_build_object('id','768c0000-0000-4000-8000-000000000050','property_id',p,'unit_no','1','expected_revision',0,'state','ready','inspected_on','2026-01-01','source_ref','اختبار طرق الدفع','reason','جاهزية اختبار معزول'));
 end if;
 c:='{"id":"payment-method-hosted-contract","contract_no":"PAYMENT-METHOD-HOSTED-CONTRACT","source":"v267-cloud","detailsVersion":2,"rentalTermsVersion":1,"tenantId":"payment-method-hosted-tenant","tenant":"مستأجر اختبار طرق الدفع","property":"عقار اختبار طرق الدفع","unit":"1","floor":"الأول","contractRent":100,"discount":0,"rent":100,"deposit":0,"advance":0,"cleaningFee":0,"start_date":"2026-01-01","end_date":"2027-12-31","status":"draft","accountant":"محاسب اختبار","contractReceived":"لم يستلم","receivedAt":"","evictionNotice":"لم يُبلّغ","depositReceivedOn":"","freeMonthApproved":false,"freeMonthPeriod":"","rentAdjustments":[]}'||jsonb_build_object('tenantProfile',t,'writtenOn',to_char(now() at time zone 'Asia/Kuwait','YYYY-MM-DD'));
 d:=jsonb_set(d,'{contractsV202}',jsonb_build_array(c));perform public.aqari_save_state_v267(w,d,rev);
 select * into doc from public.aqari_reserve_document(w,'signed_contract','lease','payment-method-hosted-contract','عقد اختبار دون بيانات فعلية','test.jpg','image/jpeg','{}');
 insert into storage.objects(bucket_id,name,metadata)values('aqari-documents',doc.storage_path,'{"size":100,"mimetype":"image/jpeg"}');
 perform public.aqari_finalize_document(doc.document_id,100,'image/jpeg',repeat('a',64));
 select payload,revision into d,rev from public.aqari_app_state where workspace_id=w;
 c:=c||'{"status":"signed","changeReason":"اعتماد عقد اختبار طرق الدفع"}';d:=jsonb_set(d,'{contractsV202}',jsonb_build_array(c));perform public.aqari_save_state_v267(w,d,rev);
 select payload,revision into d,rev from public.aqari_app_state where workspace_id=w;

 -- Each rejection goes through the actual public save/projection transaction.
 select count(*) into before_count from public.aqari_rent_payments where workspace_id=w;
 for sample in select value from jsonb_array_elements('[
  {"method":"","ref":"TX-EMPTY-METHOD","error":"PAYMENT_TRANSACTION_REQUIRED"},
  {"method":"unknown","ref":"TX-UNKNOWN","error":"اختر طريقة دفع صحيحة قبل إصدار الوصل."},
  {"method":"نقدي","ref":"","error":"أدخل مرجع الحركة من 1 إلى 150 حرفاً، بما فيه سند القبض النقدي."},
  {"method":"نقدي","ref":"   ","error":"أدخل مرجع الحركة من 1 إلى 150 حرفاً، بما فيه سند القبض النقدي."},
  {"method":"نقدي","ref":"\u00A0","error":"أدخل مرجع الحركة من 1 إلى 150 حرفاً، بما فيه سند القبض النقدي."},
  {"method":"نقدي","ref":"\u00A0\u1680\u2007\u202F\u205F\u3000","error":"أدخل مرجع الحركة من 1 إلى 150 حرفاً، بما فيه سند القبض النقدي."},
  {"method":"نقدي","ref":"TX\u061C1","error":"أدخل مرجع الحركة من 1 إلى 150 حرفاً، بما فيه سند القبض النقدي."},
  {"method":"نقدي","ref":"TX\u00AD1","error":"أدخل مرجع الحركة من 1 إلى 150 حرفاً، بما فيه سند القبض النقدي."},
  {"method":"نقدي","ref":"TX\u180E1","error":"أدخل مرجع الحركة من 1 إلى 150 حرفاً، بما فيه سند القبض النقدي."},
  {"method":"نقدي","ref":"سند نقدي-١٢٣"}
 ]') loop
  r:=jsonb_build_array('PAYMENT-HOSTED-TEST',c->>'tenant',10,'جزئي',c->>'property','2026-09-10','1','اختبار معزول يرجع بالكامل','2026-09',sample->>'method');
  l:=jsonb_build_object('receiptNo','PAYMENT-HOSTED-TEST','contractId',c->>'id','contractNo',c->>'contract_no','property',c->>'property','unit','1','tenant',c->>'tenant','paid',10,'due',100,'period','2026-09','paidAt','2026-09-10','status','جزئي','method',sample->>'method','accountant',c->>'accountant','transactionNo',sample->>'ref');
  v:=jsonb_build_object('id','PAYMENT-HOSTED-TEST','template','rent-voucher-v267-1','record',r,'contract',c,'detailsVersion',2,'accountant',c->>'accountant','transactionNo',sample->>'ref');
  candidate:=jsonb_set(jsonb_set(jsonb_set(d,'{collections}',d->'collections'||jsonb_build_array(r)),'{rentLedgerV202}',d->'rentLedgerV202'||jsonb_build_array(l)),'{rentReceiptsV267}',d->'rentReceiptsV267'||jsonb_build_array(v));
  if sample ? 'error' then
   begin
    perform public.aqari_save_state_v267(w,candidate,rev);
    raise exception 'INVALID_HOSTED_PAYMENT_ACCEPTED';
   exception when check_violation or raise_exception then
    if sqlerrm is distinct from sample->>'error' then raise;end if;
   end;
   if (select count(*) from public.aqari_rent_payments where workspace_id=w)<>before_count or (select revision from public.aqari_app_state where workspace_id=w)<>rev then raise exception 'REJECTED_HOSTED_PAYMENT_LEFT_DATA';end if;
  else
   perform public.aqari_save_state_v267(w,candidate,rev);
   select to_jsonb(pay),id into strict savedpay,payid from public.aqari_rent_payments pay where workspace_id=w and reference='PAYMENT-HOSTED-TEST';
   if savedpay->>'payment_method'<>'نقدي' or savedpay->'record' is distinct from l or savedpay->'receipt' is distinct from v then raise exception 'HOSTED_CASH_READBACK_MISMATCH';end if;
   if not exists(select 1 from jsonb_array_elements(public.aqari_read_state_v267(w)->'payload'->'collections') x where x=r) then raise exception 'HOSTED_CASH_COLLECTION_NOT_VISIBLE';end if;
  end if;
 end loop;
 -- Cancellation is audited and preserves the complete newly saved cash receipt.
 perform public.aqari_final_gap_register(w,'cancel_receipt',jsonb_build_object('id','768c0000-0000-4000-8000-000000000080','payment_id',payid,'reason','إلغاء وصل اختبار معزول بعد التحقق من مرجعه'));
 if (select to_jsonb(pay) from public.aqari_rent_payments pay where id=payid) is distinct from savedpay then raise exception 'HOSTED_CANCELLATION_REWROTE_RECEIPT';end if;
 if not exists(select 1 from jsonb_array_elements(public.aqari_final_gap_register(w,'list')->'cancellations') x where x->>'payment_id'=payid::text and x->>'approved_by'=auth.uid()::text and nullif(x->>'approved_by_name','') is not null and x->>'cancelled_at' is not null and x->'snapshot'=savedpay) then raise exception 'HOSTED_CANCELLATION_AUDIT_MISSING';end if;
 if exists(select 1 from jsonb_array_elements(public.aqari_final_gap_register(w,'list')->'payments') x where x->>'id'=payid::text) then raise exception 'HOSTED_CANCELLED_PAYMENT_STILL_ACTIVE';end if;
end $$;
reset role;
set constraints all immediate;
rollback;
select 'PASS: new isolated workspace; unknown/blank methods and cash without reference rejected atomically; valid cash persisted/reread; cancellation audited without changing receipt; all synthetic records rolled back';
