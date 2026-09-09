-- Synthetic append-only fixtures; every change and identity is rolled back.
begin;
insert into private.aqari_allowed_users values('reminder-terms-test@example.invalid','اختبار الربط','general_manager','aqari-v267-staging',true,now());
insert into auth.users(id,email) values('67233333-3333-4333-8333-333333333333','reminder-terms-test@example.invalid');
select set_config('request.jwt.claim.sub','67233333-3333-4333-8333-333333333333',true);
-- Capture the synthetic user's workspace while fixture setup still runs as the test owner.
-- Application roles intentionally cannot read aqari_memberships directly; public RPCs enforce scope.
select set_config('reminder.test.workspace',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active limit 1),true);
set local role authenticated;
do $$
<<verify>>
declare w uuid:=current_setting('reminder.test.workspace')::uuid; state jsonb; d jsonb; candidate jsonb; t jsonb; c jsonb; saved jsonb; ledger jsonb; receipt jsonb; row_data jsonb; f text; n bigint; doc record; lease_id uuid; paid_row jsonb; pay jsonb;
begin
 state:=public.aqari_read_state_v267(w);d:=state->'payload';
 d:=case when d->>'format'='aqari-cloud-state-v1' then d#>'{snapshot,values,aqari_v30}' when d->>'schema'='aqari-local-snapshot-v1' then d#>'{values,aqari_v30}' else d end;
 t:='{"id":"reminder-terms-t","nameAr":"مستأجر اختبار ربط","nameEn":"Linked Test Tenant","civilId":"678901234567","passportNo":"TEST-PASSPORT","phone":"55550000","nationality":"اختبار","email":"linked-tenant@example.invalid","address":"","preferredContact":"whatsapp","attachments":[]}'::jsonb;
 c:='{"id":"reminder-terms-c","contract_no":"REMINDER-TERMS-TEST","source":"v267-cloud","detailsVersion":2,"tenantId":"reminder-terms-t","tenant":"مستأجر اختبار ربط","property":"عقار اختبار ربط مؤقت","unit":"TEST-01","floor":"الأول","contractRent":100,"discount":10,"rent":90,"deposit":50,"advance":0,"cleaningFee":5,"start_date":"2026-01-01","end_date":"2027-12-31","status":"draft","accountant":"محاسب اختبار","contractReceived":"مستلم","evictionNotice":"لم يُبلّغ"}'::jsonb
 ||jsonb_build_object('tenantProfile',t,'writtenOn',to_char(now() at time zone 'Asia/Kuwait','YYYY-MM-DD'),'receivedAt',to_char((now()-interval '1 hour') at time zone 'Asia/Kuwait','YYYY-MM-DD"T"HH24:MI:SS')||'+03:00');
 c:=c||'{"rentalTermsVersion":1,"contractReceived":"لم يستلم","receivedAt":"","depositReceivedOn":"","freeMonthApproved":false,"freeMonthPeriod":"","rentAdjustments":[]}'::jsonb;
 d:=jsonb_set(d,'{properties}',coalesce(d->'properties','[]')||'[["عقار اختبار ربط مؤقت"]]'::jsonb);
 d:=jsonb_set(d,'{tenantProfilesV267}',coalesce(d->'tenantProfilesV267','[]')||jsonb_build_array(t));
 d:=jsonb_set(d,'{contractsV202}',coalesce(d->'contractsV202','[]')||jsonb_build_array(c));
 saved:=public.aqari_save_state_v267(w,d,(state->>'revision')::bigint);
 if jsonb_array_length(public.aqari_contract_history(w,c->>'id'))<>1 then raise exception 'INITIAL_VERSION_MISSING';end if;
 -- Transactional Storage metadata fixture, NOT an actual uploaded signed document.
 select * into doc from public.aqari_reserve_document(w,'signed_contract','lease',c->>'id','Rollback-only test document','fixture.jpg','image/jpeg','{"test":"rollback-only"}');
 insert into storage.objects(bucket_id,name,metadata) values('aqari-documents',doc.storage_path,'{"size":100,"mimetype":"image/jpeg"}');
 perform public.aqari_finalize_document(doc.document_id,100,'image/jpeg',repeat('a',64));
 c:=c||'{"status":"signed","changeReason":"Synthetic signed metadata fixture"}';
 d:=jsonb_set(d,'{contractsV202}',(select jsonb_agg(case when x->>'id'=c->>'id' then c else x end) from jsonb_array_elements(d->'contractsV202') x));
 saved:=public.aqari_save_state_v267(w,d,(saved->>'revision')::bigint);
 select id into lease_id from public.aqari_leases where workspace_id=w and external_ref=c->>'id';
 perform public.aqari_prepare_rent_reminders(w,'2026-09-28',5);
 if (select count(*) from public.aqari_notification_outbox where aqari_notification_outbox.lease_id=verify.lease_id and period='2026-10-01' and status='awaiting_configuration')<>1 then raise exception 'REMINDER_PREFERENCE_PREPARATION_FAILED';end if;
 if not exists(select 1 from public.aqari_notification_outbox where aqari_notification_outbox.lease_id=verify.lease_id and period='2026-10-01' and kind='rent_reminder' and channel='whatsapp' and status='awaiting_configuration') then raise exception 'WHATSAPP_PREFERENCE_NOT_USED';end if;
 if exists(select 1 from public.aqari_notification_outbox where aqari_notification_outbox.lease_id=verify.lease_id and period='2026-10-01' and kind='rent_reminder' and channel='email' and status<>'cancelled') then raise exception 'EMAIL_IGNORED_PREFERENCE';end if;
 c:=c||'{"freeMonthApproved":true,"freeMonthPeriod":"2026-10","changeReason":"Documented free-month test"}';
 d:=jsonb_set(d,'{contractsV202}',(select jsonb_agg(case when x->>'id'=c->>'id' then c else x end) from jsonb_array_elements(d->'contractsV202') x));
 saved:=public.aqari_save_state_v267(w,d,(saved->>'revision')::bigint);
 if (select count(*) from public.aqari_notification_outbox where aqari_notification_outbox.lease_id=verify.lease_id and period='2026-10-01' and status='cancelled')<>1 then raise exception 'APPROVED_FREE_MONTH_DID_NOT_CANCEL_QUEUE';end if;
 perform public.aqari_prepare_rent_reminders(w,'2026-09-30',5);
 if exists(select 1 from public.aqari_notification_outbox where aqari_notification_outbox.lease_id=verify.lease_id and period='2026-10-01' and status<>'cancelled') then raise exception 'FREE_MONTH_REMINDER';end if;
 c:=c||'{"rentAdjustments":[{"effectiveMonth":"2026-11","discount":20,"rent":80,"reason":"Synthetic future discount approval"}],"changeReason":"Approve future discount for test"}';
 d:=jsonb_set(d,'{contractsV202}',(select jsonb_agg(case when x->>'id'=c->>'id' then c else x end) from jsonb_array_elements(d->'contractsV202') x));
 saved:=public.aqari_save_state_v267(w,d,(saved->>'revision')::bigint);
 perform public.aqari_prepare_rent_reminders(w,'2026-10-28',5);
 perform public.aqari_prepare_rent_reminders(w,'2026-10-28',5);
 perform public.aqari_prepare_rent_reminders(w,'2026-10-29',5);
 if (select count(*) from public.aqari_notification_outbox where aqari_notification_outbox.lease_id=verify.lease_id and period='2026-11-01')<>1 then raise exception 'REMINDER_IDEMPOTENCE_OR_PREFERENCE';end if;
 -- Save a full discounted payment through the same state RPC used by the browser.
 paid_row:=jsonb_build_array('REMINDER-TEST-R1',c->>'tenant',80,'مدفوع',c->>'property','2026-11-01',c->>'unit','اختبار','2026-11','نقدي');
 pay:=jsonb_build_object('receiptNo','REMINDER-TEST-R1','contractId',c->>'id','contractNo',c->>'contract_no','property',c->>'property','unit',c->>'unit','tenant',c->>'tenant','paid',80,'due',80,'period','2026-11','paidAt','2026-11-01','status','مدفوع','method','نقدي','transactionNo','','accountant',c->>'accountant');
 receipt:=jsonb_build_object('id','REMINDER-TEST-R1','template','rent-voucher-v267-1','detailsVersion',2,'accountant',c->>'accountant','transactionNo','','record',paid_row,'contract',c);
 d:=jsonb_set(jsonb_set(jsonb_set(d,'{collections}',coalesce(d->'collections','[]')||jsonb_build_array(paid_row)),'{rentLedgerV202}',coalesce(d->'rentLedgerV202','[]')||jsonb_build_array(pay)),'{rentReceiptsV267}',coalesce(d->'rentReceiptsV267','[]')||jsonb_build_array(receipt));
 saved:=public.aqari_save_state_v267(w,d,(saved->>'revision')::bigint);
 if (select count(*) from public.aqari_notification_outbox where aqari_notification_outbox.lease_id=verify.lease_id and period='2026-11-01' and kind='payment_thanks' and channel='whatsapp')<>1 then raise exception 'PREFERRED_PAYMENT_THANKS_MISSING';end if;
 if (select count(*) from public.aqari_notification_outbox where aqari_notification_outbox.lease_id=verify.lease_id and period='2026-11-01' and kind='rent_reminder' and status='cancelled')<>1 then raise exception 'DISCOUNTED_FULL_PAYMENT_DID_NOT_CANCEL';end if;
 perform public.aqari_prepare_rent_reminders(w,'2026-10-30',5);
 if exists(select 1 from public.aqari_notification_outbox where aqari_notification_outbox.lease_id=verify.lease_id and period='2026-11-01' and kind='rent_reminder' and status<>'cancelled') then raise exception 'PAID_DISCOUNTED_TENANT_REMINDER';end if;
 -- Another 1 KWD must fail even though the original rent was 90 KWD.
 paid_row:=jsonb_set(jsonb_set(paid_row,'{0}','"REMINDER-TEST-R2"'),'{2}','1');
 pay:=pay||'{"receiptNo":"REMINDER-TEST-R2","paid":1}';receipt:=receipt||jsonb_build_object('id','REMINDER-TEST-R2','record',paid_row);
 candidate:=jsonb_set(jsonb_set(jsonb_set(d,'{collections}',(d->'collections')||jsonb_build_array(paid_row)),'{rentLedgerV202}',(d->'rentLedgerV202')||jsonb_build_array(pay)),'{rentReceiptsV267}',(d->'rentReceiptsV267')||jsonb_build_array(receipt));
 begin perform public.aqari_save_state_v267(w,candidate,(saved->>'revision')::bigint);raise exception 'DISCOUNTED_OVERPAYMENT_ACCEPTED';exception when raise_exception then if sqlerrm<>'PAYMENT_EXCEEDS_PERIOD_BALANCE' then raise;end if;end;
 if exists(select 1 from public.aqari_rent_payments where reference='REMINDER-TEST-R2') then raise exception 'FAILED_PAYMENT_PARTIALLY_SAVED';end if;
 perform set_config('aqari.test.reminder_workspace',w::text,true);
end $$;
reset role;
do $$ declare c jsonb:='{"rentalTermsVersion":1,"rent":90,"freeMonthApproved":true,"freeMonthPeriod":"2026-10","rentAdjustments":[{"effectiveMonth":"2026-11","rent":80}]}';begin
 if private.aqari_reminder_due(c,90,'2026-09-01')<>90 or private.aqari_reminder_due(c,90,'2026-10-01')<>0 or private.aqari_reminder_due(c,90,'2026-11-01')<>80 or private.aqari_reminder_due('{}',90,'2026-11-01')<>90 then raise exception 'PERIOD_OR_LEGACY_AMOUNT_FAILED';end if;
 if not private.aqari_contact_channel_allowed('{"preferredContact":"whatsapp"}','whatsapp') or private.aqari_contact_channel_allowed('{"preferredContact":"whatsapp"}','email') or private.aqari_contact_channel_allowed('{"preferredContact":"none"}','email') then raise exception 'CONTACT_HELPER_FAILED';end if;
end $$;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
set local role authenticated;
do $$ begin
 begin perform public.aqari_prepare_rent_reminders(current_setting('aqari.test.reminder_workspace')::uuid,'2026-10-28',5);raise exception 'OUTSIDER_ALLOWED';exception when insufficient_privilege then null;end;
 begin perform private.aqari_reconcile_reminder_queue(current_setting('aqari.test.reminder_workspace')::uuid);raise exception 'INTERNAL_HELPER_PUBLIC';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS: contact preference, free-month cancellation, future discount, idempotency, alternate-day window, preferred payment thanks, overpayment rollback, outsider denial; synthetic fixtures rolled back' result;