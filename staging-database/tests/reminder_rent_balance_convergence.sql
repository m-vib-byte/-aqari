-- Positive synthetic MFA fixture: include a current supported second-factor event.
-- Negative AAL1/expired-MFA cases and all production guards remain unchanged.
-- Synthetic isolated acceptance, with no DDL or external delivery. Everything rolls back.
begin;
insert into public.aqari_workspaces(id,slug,name) values
 ('76730000-0000-4000-8000-000000000099','reminder-rent-balance-fixture','Synthetic reminder reconciliation');
insert into public.aqari_app_state(workspace_id,payload) values('76730000-0000-4000-8000-000000000099','{}');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('reminder-balance-manager@example.invalid','مدير اختبار رصيد التذكير','general_manager','reminder-rent-balance-fixture');
insert into auth.users(id,email,email_confirmed_at) values
 ('76730000-0000-4000-8000-000000000001','reminder-balance-manager@example.invalid',now());
select set_config('request.jwt.claim.sub','76730000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values
 ('76730000-0000-4000-8000-000000000101','76730000-0000-4000-8000-000000000099','REMINDER-BALANCE-P','Synthetic reminder property','{}');
do $$declare w uuid:='76730000-0000-4000-8000-000000000099';u uuid;t uuid;l uuid;r jsonb;begin
 for i in 1..3 loop
  u:=('76730000-0000-4000-8000-00000000020'||i)::uuid;
  t:=('76730000-0000-4000-8000-00000000030'||i)::uuid;
  l:=('76730000-0000-4000-8000-00000000040'||i)::uuid;
  insert into public.aqari_units(id,workspace_id,property_id,unit_no) values(u,w,'76730000-0000-4000-8000-000000000101','REM-'||i);
  r:=public.aqari_unit_readiness_register(w,'record',jsonb_build_object('id',gen_random_uuid(),'property_id','76730000-0000-4000-8000-000000000101','unit_no','REM-'||i,'expected_revision',0,'state','ready','inspected_on','2026-01-01','source_ref','Synthetic reminder inspection','reason','Isolated readiness fixture'));
  if r->>'state'<>'ready' then raise exception 'REMINDER_FIXTURE_UNIT_NOT_READY';end if;
  insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,email,profile,import_source)
   values(t,w,'REMINDER-BALANCE-T'||i,'Synthetic tenant '||i,'76730000000'||i,'+9655730000'||i,'reminder-tenant-'||i||'@example.invalid',jsonb_build_object('preferredContact',case when i=1 then 'email' else 'both' end),'{"fixture":true}');
  insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot,import_source)
   values(l,w,'REMINDER-BALANCE-L'||i,t,u,'REMINDER-BALANCE-L'||i,'2026-01-01','2026-12-31',100.001,0,'signed',
    '{"rentalTermsVersion":1,"rent":100.001,"freeMonthApproved":true,"freeMonthPeriod":"2026-10","rentAdjustments":[{"effectiveMonth":"2026-11","rent":99.999}]}','{"fixture":true}');
 end loop;
 insert into private.aqari_commercial_terms(lease_id,workspace_id,grace_days,sales_percentage,permitted_activity,license_no,compliance_reviewed_by,compliance_reviewed_at,compliance_reference)
 values('76730000-0000-4000-8000-000000000401',w,12,10,'Synthetic trade','REMINDER-LIC',auth.uid(),now(),'Synthetic compliance'),
       ('76730000-0000-4000-8000-000000000402',w,0,10,'Synthetic trade zero grace','REMINDER-ZERO',auth.uid(),now(),'Synthetic compliance');
 insert into private.aqari_tenant_preferences(workspace_id,tenant_id,preferred_channel,consent_at,updated_by)
 values(w,'76730000-0000-4000-8000-000000000301','whatsapp',null,auth.uid());
 insert into public.aqari_documents(id,workspace_id,document_no,document_type,entity_type,entity_ref,title,original_filename,mime_type,storage_path,created_by)
 values('76730000-0000-4000-8000-000000000501',w,'REMINDER-BALANCE-DOC','property_document','property','REMINDER-BALANCE-P','Synthetic sales evidence','fixture.pdf','application/pdf',w::text||'/76730000-0000-4000-8000-000000000501.pdf',auth.uid());
 insert into storage.objects(bucket_id,name,metadata) values('aqari-documents',w::text||'/76730000-0000-4000-8000-000000000501.pdf','{"size":100,"mimetype":"application/pdf"}');
 perform public.aqari_finalize_document('76730000-0000-4000-8000-000000000501',100,'application/pdf',repeat('d',64));
end$$;
set local role authenticated;
do $$declare w uuid:='76730000-0000-4000-8000-000000000099';n integer;begin
 n:=public.aqari_prepare_rent_reminders(w,'2026-08-28',5);
 if n<>5 then raise exception 'CANONICAL_CHANNEL_OR_LEGACY_BOTH_FAILED:%',n;end if;
 if not exists(select 1 from public.aqari_notification_outbox where workspace_id=w and lease_id='76730000-0000-4000-8000-000000000401' and channel='whatsapp' and status='awaiting_configuration')
  or exists(select 1 from public.aqari_notification_outbox where workspace_id=w and lease_id='76730000-0000-4000-8000-000000000401' and channel='email') then raise exception 'STALE_LEGACY_PROFILE_OVERRULED_CANONICAL';end if;
 if public.aqari_prepare_rent_reminders(w,'2026-08-28',5)<>0 or public.aqari_prepare_rent_reminders(w,'2026-08-29',5)<>0 then raise exception 'IDEMPOTENCE_OR_ALTERNATE_DAY_CHANGED';end if;
 begin perform private.aqari_reminder_rent_balance(w,'76730000-0000-4000-8000-000000000401','2026-09-01');raise exception 'PRIVATE_BALANCE_EXPOSED';exception when insufficient_privilege then null;end;
end$$;
reset role;
-- Both cancellation spellings and the append-only cancellation register are excluded.
insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt)
 values('76730000-0000-4000-8000-000000000901','76730000-0000-4000-8000-000000000099','76730000-0000-4000-8000-000000000401','REM-CANCEL-AR',1000,'2026-09-01','2026-09-01','ملغى','cash','{}','{}'),
 ('76730000-0000-4000-8000-000000000902','76730000-0000-4000-8000-000000000099','76730000-0000-4000-8000-000000000401','REM-CANCEL-EN',1000,'2026-09-01','2026-09-01','cancelled','cash','{}','{}'),
 ('76730000-0000-4000-8000-000000000903','76730000-0000-4000-8000-000000000099','76730000-0000-4000-8000-000000000401','REM-CANCEL-REGISTER',1000,'2026-09-01','2026-09-01','paid','cash','{}','{}');
insert into private.aqari_receipt_cancellations(id,workspace_id,payment_id,reason,approved_by,approved_by_name,snapshot)
 values('76730000-0000-4000-8000-000000000913','76730000-0000-4000-8000-000000000099','76730000-0000-4000-8000-000000000903','Synthetic receipt cancellation',auth.uid(),'Synthetic manager','{}');
do $$declare w uuid:='76730000-0000-4000-8000-000000000099';begin
 if private.aqari_reminder_rent_balance(w,'76730000-0000-4000-8000-000000000401','2026-09-01')<>100.001 then raise exception 'CANCELLED_RECEIPT_SUPPRESSED_REMINDER';end if;
 perform public.aqari_prepare_rent_reminders(w,'2026-08-30',5);
 if (select count(*) from public.aqari_notification_outbox where workspace_id=w and lease_id='76730000-0000-4000-8000-000000000401' and status='awaiting_configuration')<>2 then raise exception 'CANCELLATION_QUEUE_BALANCE_FAILED';end if;
end$$;
insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt)
 values('76730000-0000-4000-8000-000000000904','76730000-0000-4000-8000-000000000099','76730000-0000-4000-8000-000000000401','REM-MIXED-RENT-COMMERCIAL',100.001,'2026-09-01','2026-09-01','paid','cash','{}','{}');
set local role authenticated;
do $$declare w uuid:='76730000-0000-4000-8000-000000000099';r jsonb;begin
 perform public.aqari_commercial_sales(w,'record','{"id":"76730000-0000-4000-8000-000000000601","lease_id":"76730000-0000-4000-8000-000000000401","month":"2026-08","gross_sales":"300.000","terms_revision":1,"source_document_id":"76730000-0000-4000-8000-000000000501","source_reference":"Synthetic reminder balance sales","calculation_basis":"additional_to_base_rent"}');
 perform public.aqari_commercial_payment_allocations(w,'allocate','{"id":"76730000-0000-4000-8000-000000000701","sale_id":"76730000-0000-4000-8000-000000000601","payment_id":"76730000-0000-4000-8000-000000000904","amount":"30.000"}');
 perform public.aqari_final_gap_register(w,'tenant_entry','{"id":"76730000-0000-4000-8000-000000000801","tenant_id":"76730000-0000-4000-8000-000000000301","lease_id":"76730000-0000-4000-8000-000000000401","direction":"credit","kind":"synthetic_credit","amount":"30.000","occurred_on":"2026-09-01","reason":"Synthetic allocated credit","source_type":"synthetic-reminder","source_id":"credit-one"}');
 perform public.aqari_final_gap_register(w,'allocate_credit','{"id":"76730000-0000-4000-8000-000000000811","credit_entry_id":"76730000-0000-4000-8000-000000000801","lease_id":"76730000-0000-4000-8000-000000000401","period":"2026-09-01","amount":"29.999","reason":"Synthetic scheduled credit allocation"}');
 select x into r from jsonb_array_elements(public.aqari_rent_due_schedule(w,'76730000-0000-4000-8000-000000000401')->'periods')x where x->>'period'='2026-09-01';
 if (r->>'paid_amount')::numeric<>70.001 or (r->>'credit_amount')::numeric<>29.999 or (r->>'balance')::numeric<>0.001 then raise exception 'FIXTURE_AUTHORITATIVE_SCHEDULE_FAILED:%',r;end if;
 perform public.aqari_prepare_rent_reminders(w,'2026-09-01',5);
 if (select count(*) from public.aqari_notification_outbox where workspace_id=w and lease_id='76730000-0000-4000-8000-000000000401' and status='awaiting_configuration')<>3 then raise exception 'COMMERCIAL_OR_CREDIT_DOUBLE_COUNTED';end if;
 if exists(select 1 from public.aqari_notification_outbox where workspace_id=w and lease_id='76730000-0000-4000-8000-000000000402' and scheduled_at=('2026-09-01'::timestamp at time zone 'Asia/Kuwait')) then raise exception 'ZERO_GRACE_LOST';end if;
end$$;
reset role;
do $$declare w uuid:='76730000-0000-4000-8000-000000000099';begin
 if private.aqari_reminder_rent_balance(w,'76730000-0000-4000-8000-000000000401','2026-09-01')<>0.001 then raise exception 'ONE_FILS_REMAINDER_LOST';end if;
 if exists(select 1 from private.aqari_tenant_preferences where workspace_id=w and consent_at is not null) then raise exception 'PREFERENCE_INVENTED_CONSENT';end if;
end$$;
-- A new credit source settles the final fils; no mutation of the first allocation.
set local role authenticated;
do $$declare w uuid:='76730000-0000-4000-8000-000000000099';begin
 perform public.aqari_final_gap_register(w,'tenant_entry','{"id":"76730000-0000-4000-8000-000000000802","tenant_id":"76730000-0000-4000-8000-000000000301","lease_id":"76730000-0000-4000-8000-000000000401","direction":"credit","kind":"synthetic_credit","amount":"0.001","occurred_on":"2026-09-01","reason":"Synthetic last fils credit","source_type":"synthetic-reminder","source_id":"credit-two"}');
 perform public.aqari_final_gap_register(w,'allocate_credit','{"id":"76730000-0000-4000-8000-000000000812","credit_entry_id":"76730000-0000-4000-8000-000000000802","lease_id":"76730000-0000-4000-8000-000000000401","period":"2026-09-01","amount":"0.001","reason":"Synthetic final fils allocation"}');
 perform public.aqari_prepare_rent_reminders(w,'2026-09-03',5);
 if exists(select 1 from public.aqari_notification_outbox where workspace_id=w and lease_id='76730000-0000-4000-8000-000000000401' and status in ('queued','awaiting_configuration')) then raise exception 'CREDIT_SETTLEMENT_DID_NOT_CANCEL_REMINDER';end if;
 if (select count(*) from public.aqari_notification_outbox where workspace_id=w and lease_id='76730000-0000-4000-8000-000000000401' and status='cancelled')<>3 then raise exception 'TERMINAL_QUEUE_HISTORY_LOST';end if;
end$$;
reset role;
-- Cancelling the mixed receipt reopens rent, while previous cancelled queue rows stay terminal.
insert into private.aqari_receipt_cancellations(id,workspace_id,payment_id,reason,approved_by,approved_by_name,snapshot)
 values('76730000-0000-4000-8000-000000000914','76730000-0000-4000-8000-000000000099','76730000-0000-4000-8000-000000000904','Synthetic mixed receipt cancellation',auth.uid(),'Synthetic manager','{}');
do $$declare w uuid:='76730000-0000-4000-8000-000000000099';channel text;n integer;begin
 if private.aqari_reminder_rent_balance(w,'76730000-0000-4000-8000-000000000401','2026-09-01')<>70.001 then raise exception 'MIXED_RECEIPT_CANCEL_BALANCE_FAILED';end if;
 perform public.aqari_prepare_rent_reminders(w,'2026-09-07',5);
 if not exists(select 1 from public.aqari_notification_outbox where workspace_id=w and lease_id='76730000-0000-4000-8000-000000000401' and status='awaiting_configuration') then raise exception 'COMMERCIAL_EXTENDED_GRACE_LOST';end if;
 if exists(select 1 from public.aqari_notification_outbox where workspace_id=w and lease_id in ('76730000-0000-4000-8000-000000000402','76730000-0000-4000-8000-000000000403') and scheduled_at=('2026-09-07'::timestamp at time zone 'Asia/Kuwait')) then raise exception 'RESIDENTIAL_OR_ZERO_GRACE_EXTENDED';end if;
 -- Canonical unsupported/manual preferences never silently fall back to email/WhatsApp.
 foreach channel in array array['none','phone','sms','push'] loop
  update private.aqari_tenant_preferences set preferred_channel=channel where workspace_id=w and tenant_id='76730000-0000-4000-8000-000000000301';
  perform public.aqari_prepare_rent_reminders(w,'2026-09-09',5);
  if exists(select 1 from public.aqari_notification_outbox where workspace_id=w and lease_id='76730000-0000-4000-8000-000000000401' and status in ('queued','awaiting_configuration')) then raise exception 'MANUAL_OR_UNSUPPORTED_CHANNEL_FELL_BACK:%',channel;end if;
 end loop;
 update private.aqari_tenant_preferences set preferred_channel='whatsapp' where workspace_id=w and tenant_id='76730000-0000-4000-8000-000000000301';
 update public.aqari_tenants set phone=null where workspace_id=w and id='76730000-0000-4000-8000-000000000301';
 perform public.aqari_prepare_rent_reminders(w,'2026-09-11',5);
 if exists(select 1 from public.aqari_notification_outbox where workspace_id=w and lease_id='76730000-0000-4000-8000-000000000401' and status in ('queued','awaiting_configuration')) then raise exception 'MISSING_PHONE_FELL_BACK';end if;
 update public.aqari_tenants set phone='+96557300001' where workspace_id=w and id='76730000-0000-4000-8000-000000000301';
 n:=public.aqari_prepare_rent_reminders(w,'2026-09-13',5);
 if n<>0 then raise exception 'CONTRACT_GRACE_END_IGNORED';end if;
 if public.aqari_prepare_rent_reminders(w,'2026-09-28',5)<>0 then raise exception 'FREE_MONTH_GENERATED_REMINDER';end if;
 if private.aqari_reminder_rent_balance(w,'76730000-0000-4000-8000-000000000401','2026-11-01')<>99.999 then raise exception 'FUTURE_DISCOUNT_IGNORED';end if;
 if exists(select 1 from private.aqari_rent_due_periods d where d.workspace_id=w and private.aqari_reminder_rent_balance(w,d.lease_id,d.period) is distinct from d.balance) then raise exception 'REMINDER_AND_SCHEDULE_DIVERGE';end if;
 if exists(select 1 from public.aqari_notification_outbox where workspace_id=w and status not in ('awaiting_configuration','cancelled')) then raise exception 'EXTERNAL_DELIVERY_OR_STATUS_ESCALATION';end if;
 if (select count(*) from public.aqari_rent_payments where workspace_id=w)<>4 or
  (select count(*) from private.aqari_credit_allocations where workspace_id=w)<>2 or
  (select count(*) from private.aqari_receipt_cancellations where workspace_id=w)<>2 then raise exception 'FINANCIAL_HISTORY_REWRITTEN';end if;
end$$;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
set local role authenticated;
do $$begin
 begin perform public.aqari_prepare_rent_reminders('76730000-0000-4000-8000-000000000099','2026-09-28',5);raise exception 'OUTSIDER_PREPARED_REMINDERS';exception when insufficient_privilege then null;end;
end$$;
reset role;
rollback;
select 'PASS: canonical channels/no fabricated consent, cancelled receipts, commercial residual, allocated credit once, exact one-fils balance, schedule parity, free month, future discount, zero/extended/residential grace, terminal queue history and outsider denial; synthetic fixtures rolled back' result;
