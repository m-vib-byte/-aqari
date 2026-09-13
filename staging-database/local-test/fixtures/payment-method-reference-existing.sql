-- LOCAL ONLY: create a real old-format cash receipt before installing the new guard.
-- The runner is an in-memory database; never apply this fixture to a hosted database.
begin;
insert into public.aqari_workspaces(id,slug,name)values('768b0000-0000-4000-8000-000000000098','payment-method-reference-isolated','اختبار طرق التحصيل المعزول');
insert into public.aqari_app_state(workspace_id,payload)values('768b0000-0000-4000-8000-000000000098','{}');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug)values('payment-method-manager@example.invalid','مدير اختبار طرق الدفع','general_manager','payment-method-reference-isolated');
insert into auth.users(id,email,email_confirmed_at)values('768b0000-0000-4000-8000-000000000001','payment-method-manager@example.invalid',now());
select set_config('request.jwt.claim.sub','768b0000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
set local role authenticated;
do $$declare w uuid:='768b0000-0000-4000-8000-000000000098';d jsonb;rev bigint;t jsonb;c jsonb;r jsonb;v jsonb;l jsonb;doc record;p uuid;begin
 d:='{"properties":[["عقار اختبار طرق الدفع"]],"tenantProfilesV267":[],"contractsV202":[],"collections":[],"rentLedgerV202":[],"rentReceiptsV267":[]}';
 t:='{"id":"payment-method-tenant","nameAr":"مستأجر اختبار طرق الدفع","nameEn":"Payment Method Tenant","civilId":"768100000001","passportNo":"TEST-PASSPORT","phone":"55550091","email":"payment-tenant@example.invalid","nationality":"اختبار"}';
 d:=jsonb_set(d,'{tenantProfilesV267}',jsonb_build_array(t));
 select revision into rev from public.aqari_app_state where workspace_id=w;
 perform public.aqari_save_state_v267(w,d,rev);
 select payload,revision into d,rev from public.aqari_app_state where workspace_id=w;
 select id into strict p from public.aqari_properties where workspace_id=w and name='عقار اختبار طرق الدفع';
 if to_regprocedure('public.aqari_unit_readiness_register(uuid,text,jsonb)') is not null then
  perform public.aqari_unit_readiness_register(w,'record',jsonb_build_object('id','768b0000-0000-4000-8000-000000000050','property_id',p,'unit_no','1','expected_revision',0,'state','ready','inspected_on','2026-01-01','source_ref','اختبار طرق الدفع','reason','جاهزية اختبار معزول'));
 end if;
 c:='{"id":"payment-method-contract","contract_no":"PAYMENT-METHOD-CONTRACT","source":"v267-cloud","detailsVersion":2,"rentalTermsVersion":1,"tenantId":"payment-method-tenant","tenant":"مستأجر اختبار طرق الدفع","property":"عقار اختبار طرق الدفع","unit":"1","floor":"الأول","contractRent":100,"discount":0,"rent":100,"deposit":0,"advance":0,"cleaningFee":0,"start_date":"2026-01-01","end_date":"2027-12-31","status":"draft","accountant":"محاسب اختبار","contractReceived":"لم يستلم","receivedAt":"","evictionNotice":"لم يُبلّغ","depositReceivedOn":"","freeMonthApproved":false,"freeMonthPeriod":"","rentAdjustments":[]}'||jsonb_build_object('tenantProfile',t,'writtenOn',to_char(now() at time zone 'Asia/Kuwait','YYYY-MM-DD'));
 d:=jsonb_set(d,'{contractsV202}',jsonb_build_array(c));perform public.aqari_save_state_v267(w,d,rev);
 select * into doc from public.aqari_reserve_document(w,'signed_contract','lease','payment-method-contract','عقد اختبار دون بيانات فعلية','test.jpg','image/jpeg','{}');
 insert into storage.objects(bucket_id,name,metadata)values('aqari-documents',doc.storage_path,'{"size":100,"mimetype":"image/jpeg"}');
 perform public.aqari_finalize_document(doc.document_id,100,'image/jpeg',repeat('a',64));
 select payload,revision into d,rev from public.aqari_app_state where workspace_id=w;
 c:=c||'{"status":"signed","changeReason":"اعتماد عقد اختبار طرق الدفع"}';d:=jsonb_set(d,'{contractsV202}',jsonb_build_array(c));perform public.aqari_save_state_v267(w,d,rev);
 select payload,revision into d,rev from public.aqari_app_state where workspace_id=w;
 r:='["PAYMENT-LEGACY-CASH","مستأجر اختبار طرق الدفع",10,"جزئي","عقار اختبار طرق الدفع","2026-09-10","1","اختبار تاريخي","2026-09","نقدي"]';
 l:='{"receiptNo":"PAYMENT-LEGACY-CASH","contractId":"payment-method-contract","contractNo":"PAYMENT-METHOD-CONTRACT","property":"عقار اختبار طرق الدفع","unit":"1","tenant":"مستأجر اختبار طرق الدفع","paid":10,"due":100,"period":"2026-09","paidAt":"2026-09-10","status":"جزئي","method":"نقدي","accountant":"محاسب اختبار","transactionNo":""}';
 v:=jsonb_build_object('id','PAYMENT-LEGACY-CASH','template','rent-voucher-v267-1','record',r,'contract',c,'detailsVersion',2,'accountant','محاسب اختبار','transactionNo','');
 d:=jsonb_set(jsonb_set(jsonb_set(d,'{collections}',jsonb_build_array(r)),'{rentLedgerV202}',jsonb_build_array(l)),'{rentReceiptsV267}',jsonb_build_array(v));perform public.aqari_save_state_v267(w,d,rev);
 if not exists(select 1 from public.aqari_rent_payments where workspace_id=w and reference='PAYMENT-LEGACY-CASH' and record=l and receipt=v) then raise exception 'LEGACY_CASH_FIXTURE_FAILED';end if;
end $$;
reset role;
commit;
