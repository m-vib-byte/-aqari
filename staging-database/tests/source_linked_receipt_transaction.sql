-- Staging only. Uses existing manager membership; no accounts created.
-- Every synthetic record is rolled back. Not a real tenant payment.
begin;
select set_config('request.jwt.claim.sub',(select linked_by::text from public.aqari_statement_links limit 1),true);
set local role authenticated;
do $$
declare w uuid; d jsonb; rev bigint; c jsonb; receipt_record jsonb; ledger jsonb; voucher jsonb;
begin
 select workspace_id into strict w from public.aqari_memberships where user_id=auth.uid() and role='general_manager' and is_active;
 select payload,revision into d,rev from public.aqari_app_state where workspace_id=w;
 d:=jsonb_set(d,'{properties}',(d->'properties')||'[["اختبار عزل المعاملة"]]'::jsonb);
 d:=jsonb_set(d,'{tenantProfilesV267}',(d->'tenantProfilesV267')||'[{"id":"receipt-transaction-test","nameAr":"مستأجر اختبار المعاملة","nameEn":"Transaction Test","nationality":"Test","civilId":"123456789012","phone":"55550000","email":""}]'::jsonb);
 c:='{"id":"receipt-transaction-test","source":"v267-cloud","contract_no":"TEST-ROLLBACK-ONLY","tenantId":"receipt-transaction-test","tenant":"مستأجر اختبار المعاملة","property":"اختبار عزل المعاملة","unit":"TEST","rent":100,"deposit":0,"status":"signed","start_date":"2026-01-01","end_date":"2026-12-31"}'::jsonb;
 d:=jsonb_set(d,'{contractsV202}',(d->'contractsV202')||jsonb_build_array(c));
 perform public.aqari_save_state_v267(w,d,rev);
 select revision,payload into rev,d from public.aqari_app_state where workspace_id=w;
 receipt_record:='["TEST-ROLLBACK-ONLY","مستأجر اختبار المعاملة",100,"مدفوع","اختبار عزل المعاملة","2026-09-08","TEST","اختبار","2026-09","كي نت"]'::jsonb;
 ledger:='{"receiptNo":"TEST-ROLLBACK-ONLY","contractId":"receipt-transaction-test","contractNo":"TEST-ROLLBACK-ONLY","property":"اختبار عزل المعاملة","unit":"TEST","tenant":"مستأجر اختبار المعاملة","paid":100,"period":"2026-09","paidAt":"2026-09-08","status":"مدفوع","method":"كي نت"}'::jsonb;
 voucher:=jsonb_build_object('id','TEST-ROLLBACK-ONLY','template','rent-voucher-v267-1','record',receipt_record,'contract',c);
 d:=jsonb_set(d,'{collections}',(d->'collections')||jsonb_build_array(receipt_record));
 d:=jsonb_set(d,'{rentLedgerV202}',(d->'rentLedgerV202')||jsonb_build_array(ledger));
 d:=jsonb_set(d,'{rentReceiptsV267}',(d->'rentReceiptsV267')||jsonb_build_array(voucher));
 perform public.aqari_save_state_v267(w,d,rev);
 if not exists(select 1 from public.aqari_rent_payments where workspace_id=w and reference='TEST-ROLLBACK-ONLY' and amount=100 and receipt=voucher) then raise exception 'PAYMENT_RECEIPT_NOT_PERSISTED';end if;
 if not exists(select 1 from jsonb_array_elements(public.aqari_read_state_v267(w)->'payload'->'collections') x where x=receipt_record) then raise exception 'COLLECTION_NOT_RELOADED';end if;
 select revision into rev from public.aqari_app_state where workspace_id=w;
 perform public.aqari_save_state_v267(w,d,rev);
 if (select count(*) from public.aqari_rent_payments where workspace_id=w and reference='TEST-ROLLBACK-ONLY')<>1 then raise exception 'DUPLICATE_PAYMENT';end if;
end $$;
rollback;
select 'PASS: signed fixture lease, persisted payment and receipt, state reread and idempotency; all fixture writes rolled back' as proof;
