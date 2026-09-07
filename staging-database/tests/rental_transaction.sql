-- Run only against djkpkkgoibruaezdrchb. Synthetic data; rolled back in full.
begin;
insert into private.aqari_allowed_users values('aqari-test@example.invalid','اختبار آلي','general_manager','aqari-v267-staging',true,now());
insert into auth.users(id,email) values('22222222-2222-4222-8222-222222222222','aqari-test@example.invalid');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
set local role authenticated;
update public.aqari_app_state set payload='{"properties":[["عقار اختبار"]],"tenantProfilesV267":[{"id":"t1","nameAr":"مستأجر اختبار","nameEn":"Test Tenant","nationality":"اختبار","civilId":"123456789012","phone":"55550000","email":"tenant@example.invalid"}],"contractsV202":[{"id":"c1","source":"v267-cloud","contract_no":"L1","tenantId":"t1","tenant":"مستأجر اختبار","property":"عقار اختبار","unit":"1","rent":100,"deposit":200,"status":"signed","start_date":"2026-01-01","end_date":"2026-12-31"}],"rentLedgerV202":[],"collections":[],"rentReceiptsV267":[]}'::jsonb;
do $$ begin
 if (select count(*) from public.aqari_tenants)<>1 or (select count(*) from public.aqari_leases)<>1 then raise exception 'PROJECTION_READBACK_FAILED';end if;
 begin
  update public.aqari_app_state set payload=jsonb_set(payload,'{contractsV202}',(payload->'contractsV202')||jsonb_build_array((payload#>'{contractsV202,0}')||'{"id":"c2","contract_no":"L2"}'::jsonb));
  raise exception 'OVERLAP_ACCEPTED';
 exception when exclusion_violation then null;end;
 begin
  update public.aqari_app_state set payload=jsonb_set(payload,'{tenantProfilesV267}','[]');
  raise exception 'TENANT_DELETION_ACCEPTED';
 exception when raise_exception then if sqlerrm<>'TENANT_HISTORY_REQUIRED' then raise;end if;end;
end $$;
do $$ declare w uuid;begin
 select workspace_id into w from public.aqari_memberships where user_id=auth.uid();
 if public.aqari_prepare_rent_reminders(w,'2026-08-28',5)<>2 then raise exception 'REMINDER_START_FAILED';end if;
 if public.aqari_prepare_rent_reminders(w,'2026-08-28',5)<>0 then raise exception 'DUPLICATE_REMINDER';end if;
 if public.aqari_prepare_rent_reminders(w,'2026-08-29',5)<>0 then raise exception 'ALTERNATE_DAY_FAILED';end if;
 if public.aqari_prepare_rent_reminders(w,'2026-08-30',5)<>2 then raise exception 'SECOND_REMINDER_FAILED';end if;
 if public.aqari_prepare_rent_reminders(w,'2026-09-06',5)<>0 then raise exception 'GRACE_DEADLINE_FAILED';end if;
end $$;
do $$ begin
 begin
  update public.aqari_app_state set payload=payload||'{"collections":[["R1","مستأجر اختبار",100,"مدفوع","عقار اختبار","2026-09-07","1","اختبار","2026-09","كي نت"]],"rentLedgerV202":[{"receiptNo":"R1","contractId":"c1","contractNo":"L1","property":"عقار اختبار","unit":"1","tenant":"مستأجر اختبار","paid":100,"period":"2026-09","paidAt":"2026-09-07","status":"مدفوع","method":"كي نت"}],"rentReceiptsV267":[{"id":"R1","template":"rent-voucher-v267-1","record":["R1","مستأجر اختبار",100,"مدفوع","عقار اختبار","2026-09-07","1","اختبار","2026-09","كي نت"],"contract":{"id":"c1"}}]}'::jsonb;
  raise exception 'INCOMPLETE_RECEIPT_ACCEPTED';
 exception when raise_exception then if sqlerrm<>'RECEIPT_SNAPSHOT_INVALID' then raise;end if;end;
 if (select count(*) from public.aqari_rent_payments)<>0 then raise exception 'FAILED_RECEIPT_PARTIAL_SAVE';end if;
end $$;
update public.aqari_app_state set payload=payload||'{"collections":[["R1","مستأجر اختبار",100,"مدفوع","عقار اختبار","2026-09-07","1","اختبار","2026-09","كي نت"]],"rentLedgerV202":[{"receiptNo":"R1","contractId":"c1","contractNo":"L1","property":"عقار اختبار","unit":"1","tenant":"مستأجر اختبار","paid":100,"period":"2026-09","paidAt":"2026-09-07","status":"مدفوع","method":"كي نت"}],"rentReceiptsV267":[{"id":"R1","template":"rent-voucher-v267-1","record":["R1","مستأجر اختبار",100,"مدفوع","عقار اختبار","2026-09-07","1","اختبار","2026-09","كي نت"],"contract":{"id":"c1","contract_no":"L1","status":"signed","tenant":"مستأجر اختبار","property":"عقار اختبار","unit":"1","start_date":"2026-01-01","end_date":"2026-12-31"}}]}'::jsonb;
do $$ begin
 if (select count(*) from public.aqari_rent_payments)<>1 or (select sum(amount) from public.aqari_rent_payments)<>100 then raise exception 'PAYMENT_READBACK_FAILED';end if;
 if (select count(*) from public.aqari_notification_outbox where kind='rent_reminder' and status='cancelled')<>4 then raise exception 'REMINDERS_NOT_CANCELLED';end if;
 if public.aqari_prepare_rent_reminders((select workspace_id from public.aqari_memberships where user_id=auth.uid()),'2026-09-01',5)<>0 then raise exception 'PAID_TENANT_REMINDER';end if;
 if (select count(*) from public.aqari_notification_outbox where kind='payment_thanks' and status='awaiting_configuration')<>1 then raise exception 'THANKS_QUEUE_FAILED';end if;
 begin
  update public.aqari_app_state set payload=jsonb_set(payload,'{rentLedgerV202,0,paid}','90');raise exception 'PAYMENT_EDIT_ACCEPTED';
 exception when raise_exception then if sqlerrm<>'PAYMENT_IMMUTABLE' then raise;end if;end;
 begin
  update public.aqari_app_state set payload=jsonb_set(payload,'{collections,0,2}','90');raise exception 'COLLECTION_EDIT_ACCEPTED';
 exception when raise_exception then if sqlerrm<>'SAVED_PAYMENT_CHANGED' then raise;end if;end;
end $$;
reset role;
insert into auth.users(id,email) values('44444444-4444-4444-8444-444444444444','tenant@example.invalid');
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
set local role authenticated;
do $$ begin
 begin perform public.aqari_tenant_portal_snapshot();raise exception 'UNVERIFIED_TENANT_ALLOWED';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
update auth.users set email_confirmed_at=now() where id='44444444-4444-4444-8444-444444444444';
set local role authenticated;
do $$ declare snap jsonb;begin
 snap:=public.aqari_tenant_portal_snapshot();
 if jsonb_array_length(snap->'leases')<>1 or jsonb_array_length(snap->'payments')<>1 then raise exception 'TENANT_READBACK_FAILED';end if;
 if (select count(*) from public.aqari_app_state)<>0 or (select count(*) from public.aqari_memberships)<>0 then raise exception 'TENANT_ADMIN_ACCESS';end if;
 insert into public.aqari_maintenance_requests(workspace_id,tenant_id,lease_id,description) values((snap#>>'{account,workspace_id}')::uuid,(snap#>>'{account,tenant_id}')::uuid,(snap#>>'{leases,0,id}')::uuid,'طلب صيانة للاختبار الآلي');
 if (select count(*) from public.aqari_maintenance_requests)<>1 then raise exception 'MAINTENANCE_READBACK_FAILED';end if;
 update public.aqari_maintenance_requests set cost=500;
 if (select sum(cost) from public.aqari_maintenance_requests)<>0 then raise exception 'TENANT_CHANGED_COST';end if;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ declare affected integer;begin
 update public.aqari_maintenance_requests set status='in_progress',cost=12.500 where revision=1;
 get diagnostics affected=row_count;if affected<>1 then raise exception 'STAFF_MAINTENANCE_UPDATE_FAILED';end if;
 if (select count(*) from public.aqari_maintenance_requests where revision=2 and status='in_progress' and cost=12.500)<>1 then raise exception 'STAFF_MAINTENANCE_READBACK_FAILED';end if;
 update public.aqari_maintenance_requests set cost=99 where revision=1;
 get diagnostics affected=row_count;if affected<>0 then raise exception 'STALE_MAINTENANCE_OVERWRITE';end if;
 update public.aqari_maintenance_requests set status='completed' where revision=2;
 begin
  update public.aqari_maintenance_requests set status='received';raise exception 'CLOSED_REQUEST_CHANGED';
 exception when raise_exception then if sqlerrm<>'MAINTENANCE_CLOSED' then raise;end if;end;
 if (select count(*) from public.aqari_operation_audit where action like '%maintenance_update%')<>2 then raise exception 'MAINTENANCE_AUDIT_FAILED';end if;
end $$;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
do $$ begin
 if (public.aqari_tenant_portal_snapshot()#>>'{maintenance,0,status}')<>'completed' then raise exception 'TENANT_STATUS_READBACK_FAILED';end if;
end $$;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$ begin if (select count(*) from public.aqari_rent_payments)<>0 or (select count(*) from public.aqari_app_state)<>0 then raise exception 'CROSS_USER_LEAK';end if;end $$;
reset role;
rollback;
select 'PASS: linked save/readback, incomplete receipt transaction rollback, overlap rejection, history retention, immutable payment/receipt, alternate-day reminder window, duplicate reminder prevention, payment cancellation, queued thanks, outsider isolation, verified tenant portal, tenant/admin separation, maintenance save/readback, tenant cost restriction, staff status/cost persistence, stale-write rejection, maintenance audit, tenant status refresh; fixtures rolled back' result;
