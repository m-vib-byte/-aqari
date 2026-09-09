-- Synthetic append-only fixtures; every change and identity is rolled back.
begin;
insert into private.aqari_allowed_users values('linked-details-test@example.invalid','اختبار الربط','general_manager','aqari-v267-staging',true,now());
insert into auth.users(id,email) values('67222222-2222-4222-8222-222222222222','linked-details-test@example.invalid');
select set_config('request.jwt.claim.sub','67222222-2222-4222-8222-222222222222',true);
set local role authenticated;
do $$
<<verify>>
declare w uuid; state jsonb; d jsonb; candidate jsonb; t jsonb; c jsonb; saved jsonb; ledger jsonb; receipt jsonb; row_data jsonb; f text; n bigint;
begin
 select workspace_id into w from public.aqari_memberships where user_id=auth.uid() and is_active;
 state:=public.aqari_read_state_v267(w);d:=state->'payload';
 d:=case when d->>'format'='aqari-cloud-state-v1' then d#>'{snapshot,values,aqari_v30}' when d->>'schema'='aqari-local-snapshot-v1' then d#>'{values,aqari_v30}' else d end;
 t:='{"id":"linked-details-t","nameAr":"مستأجر اختبار ربط","nameEn":"Linked Test Tenant","civilId":"678901234567","passportNo":"TEST-PASSPORT","phone":"55550000","nationality":"اختبار","email":"linked-tenant@example.invalid","address":"","attachments":[]}'::jsonb;
 c:='{"id":"linked-details-c","contract_no":"LINKED-TEST","source":"v267-cloud","detailsVersion":2,"tenantId":"linked-details-t","tenant":"مستأجر اختبار ربط","property":"عقار اختبار ربط مؤقت","unit":"TEST-01","floor":"الأول","contractRent":100,"discount":10,"rent":90,"deposit":50,"advance":0,"cleaningFee":5,"start_date":"2026-01-01","end_date":"2027-12-31","status":"signed","accountant":"محاسب اختبار","contractReceived":"مستلم","evictionNotice":"لم يُبلّغ"}'::jsonb
 ||jsonb_build_object('tenantProfile',t,'writtenOn',to_char(now() at time zone 'Asia/Kuwait','YYYY-MM-DD'),'receivedAt',to_char((now()-interval '1 hour') at time zone 'Asia/Kuwait','YYYY-MM-DD"T"HH24:MI:SS')||'+03:00');
 d:=jsonb_set(d,'{properties}',coalesce(d->'properties','[]')||'[["عقار اختبار ربط مؤقت"]]'::jsonb);
 d:=jsonb_set(d,'{tenantProfilesV267}',coalesce(d->'tenantProfilesV267','[]')||jsonb_build_array(t));
 foreach f in array array['floor','advance','cleaningFee','discount','accountant','receivedAt','writtenOn'] loop
  candidate:=jsonb_set(d,'{contractsV202}',coalesce(d->'contractsV202','[]')||jsonb_build_array(c-f));
  begin perform public.aqari_save_state_v267(w,candidate,(state->>'revision')::bigint);raise exception 'MISSING_FIELD_ACCEPTED:%',f;
  exception when raise_exception then if sqlerrm like 'MISSING_FIELD_ACCEPTED:%' then raise;end if;end;
 end loop;
 foreach f in array array['passportNo','email'] loop
  candidate:=jsonb_set(d,'{tenantProfilesV267}',(select jsonb_agg(case when x->>'id'=t->>'id' then x-f else x end) from jsonb_array_elements(d->'tenantProfilesV267') x));
  candidate:=jsonb_set(candidate,'{contractsV202}',coalesce(d->'contractsV202','[]')||jsonb_build_array(c||jsonb_build_object('tenantProfile',t-f)));
  begin perform public.aqari_save_state_v267(w,candidate,(state->>'revision')::bigint);raise exception 'MISSING_TENANT_FIELD_ACCEPTED';
  exception when raise_exception then if sqlerrm not like 'TENANT_FIELD_REQUIRED:%' then raise;end if;end;
 end loop;
 d:=jsonb_set(d,'{contractsV202}',coalesce(d->'contractsV202','[]')||jsonb_build_array(c));
 saved:=public.aqari_save_state_v267(w,d,(state->>'revision')::bigint);
 if not exists(select 1 from public.aqari_leases where workspace_id=w and external_ref='linked-details-c' and monthly_rent=90 and snapshot->>'floor'='الأول' and snapshot->>'contractRent'='100' and snapshot#>>'{tenantProfile,passportNo}'='TEST-PASSPORT') then raise exception 'DETAILS_PROJECTION_FAILED';end if;
 candidate:=jsonb_set(d,'{contractsV202}',(select jsonb_agg(case when x->>'id'=c->>'id' then x||'{"contractRent":101,"rent":91}'::jsonb else x end) from jsonb_array_elements(d->'contractsV202') x));
 begin perform public.aqari_save_state_v267(w,candidate,(saved->>'revision')::bigint);raise exception 'ORIGINAL_RENT_CHANGED';
 exception when raise_exception then if sqlerrm<>'CONTRACT_ORIGINAL_TERMS_IMMUTABLE' then raise;end if;end;
 row_data:='["LINKED-R1","مستأجر اختبار ربط",90,"مدفوع","عقار اختبار ربط مؤقت","2026-09-09","TEST-01","اختبار","2026-09","كي نت"]'::jsonb;
 ledger:='{"receiptNo":"LINKED-R1","contractId":"linked-details-c","contractNo":"LINKED-TEST","property":"عقار اختبار ربط مؤقت","unit":"TEST-01","tenant":"مستأجر اختبار ربط","paid":90,"period":"2026-09","paidAt":"2026-09-09","status":"مدفوع","method":"كي نت","transactionNo":"TX-LINKED-1","accountant":"محاسب اختبار"}'::jsonb;
 receipt:=jsonb_build_object('id','LINKED-R1','template','rent-voucher-v267-1','detailsVersion',2,'record',row_data,'contract',c,'accountant','محاسب اختبار','transactionNo','TX-LINKED-1');
 d:=jsonb_set(d,'{collections}',coalesce(d->'collections','[]')||jsonb_build_array(row_data));
 d:=jsonb_set(d,'{rentLedgerV202}',coalesce(d->'rentLedgerV202','[]')||jsonb_build_array(ledger));
 d:=jsonb_set(d,'{rentReceiptsV267}',coalesce(d->'rentReceiptsV267','[]')||jsonb_build_array(receipt));
 candidate:=jsonb_set(d,'{rentReceiptsV267}',jsonb_build_array(receipt||'{"accountant":"خطأ"}'::jsonb));
 begin perform public.aqari_save_state_v267(w,candidate,(saved->>'revision')::bigint);raise exception 'ACCOUNTANT_MISMATCH_ACCEPTED';
 exception when raise_exception then if sqlerrm<>'RECEIPT_ACCOUNTANT_MISMATCH' then raise;end if;end;
 saved:=public.aqari_save_state_v267(w,d,(saved->>'revision')::bigint);
 if not exists(select 1 from public.aqari_rent_payments payment where workspace_id=w and reference='LINKED-R1' and amount=90 and payment.receipt=verify.receipt and payment.record=ledger) then raise exception 'PAYMENT_DETAILS_READBACK_FAILED';end if;
 select count(*) into n from public.aqari_rent_payments where workspace_id=w and reference='LINKED-R1';if n<>1 then raise exception 'RECEIPT_COUNT';end if;
end $$;
reset role;
rollback;
select 'PASS: mandatory fields, tenant snapshot, immutable original rent, discounted rent projection, accountant mismatch rejection, linked payment and receipt readback; rolled back' as result;
