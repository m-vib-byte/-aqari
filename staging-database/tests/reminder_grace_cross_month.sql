-- Positive synthetic MFA fixture: include a current supported second-factor event.
-- Negative AAL1/expired-MFA cases and all production guards remain unchanged.
-- Preview SQL acceptance only. Dedicated identities and workspace; no DDL or external send.
-- All fixture rows and session settings roll back. Fresh payments satisfy the current reference guard.
begin;
insert into public.aqari_workspaces(id,slug,name) values
 ('76740000-0000-4000-8000-000000000099','reminder-cross-month-fixture','Synthetic cross-month reminders');
insert into public.aqari_app_state(workspace_id,payload) values('76740000-0000-4000-8000-000000000099','{}');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('reminder-cross-month-manager@example.invalid','مدير اختبار التذكير عبر الأشهر','general_manager','reminder-cross-month-fixture');
insert into auth.users(id,email,email_confirmed_at) values
 ('76740000-0000-4000-8000-000000000001','reminder-cross-month-manager@example.invalid',now());
select set_config('request.jwt.claim.sub','76740000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values
 ('76740000-0000-4000-8000-000000000101','76740000-0000-4000-8000-000000000099','REMINDER-CROSS-P','Synthetic calendar property','{}');
do $$declare w uuid:='76740000-0000-4000-8000-000000000099';u uuid;t uuid;l uuid;r jsonb;g integer;begin
 for i in 1..5 loop
  u:=('76740000-0000-4000-8000-00000000020'||i)::uuid;
  t:=('76740000-0000-4000-8000-00000000030'||i)::uuid;
  l:=('76740000-0000-4000-8000-00000000040'||i)::uuid;
  insert into public.aqari_units(id,workspace_id,property_id,unit_no) values(u,w,'76740000-0000-4000-8000-000000000101','CROSS-'||i);
  r:=public.aqari_unit_readiness_register(w,'record',jsonb_build_object('id',gen_random_uuid(),'property_id','76740000-0000-4000-8000-000000000101','unit_no','CROSS-'||i,'expected_revision',0,'state','ready','inspected_on','2024-01-01','source_ref','Synthetic calendar inspection','reason','Isolated calendar readiness'));
  if r->>'state'<>'ready' then raise exception 'CROSS_MONTH_FIXTURE_NOT_READY';end if;
  insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,email,profile,import_source)
   values(t,w,'REMINDER-CROSS-T'||i,'Synthetic calendar tenant '||i,'76740000000'||i,'+9655740000'||i,'calendar-tenant-'||i||'@example.invalid','{"preferredContact":"email"}','{"fixture":true}');
  insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot,import_source)
   values(l,w,'REMINDER-CROSS-L'||i,t,u,'REMINDER-CROSS-L'||i,'2024-01-01','2030-12-31',100.001,0,'signed',
    jsonb_build_object('rentalTermsVersion',1,'rent',100.001,'freeMonthApproved',i=1,'freeMonthPeriod',case when i=1 then '2026-11' else '' end,'rentAdjustments','[]'::jsonb),'{"fixture":true}');
  if i<>4 then
   g:=case i when 1 then 28 when 2 then 45 when 3 then 366 else 0 end;
   insert into private.aqari_commercial_terms(lease_id,workspace_id,grace_days,sales_percentage,permitted_activity,license_no,compliance_reviewed_by,compliance_reviewed_at,compliance_reference)
    values(l,w,g,0,'Synthetic calendar activity','CROSS-LIC-'||i,auth.uid(),now(),'Synthetic approved calendar terms');
  end if;
  insert into private.aqari_tenant_preferences(workspace_id,tenant_id,preferred_channel,consent_at,updated_by)
   values(w,t,'whatsapp',null,auth.uid());
 end loop;
 -- Use matching record/receipt method + reference; no reliance on pre-guard history.
 for r in select value from jsonb_array_elements('[
  {"id":"76740000-0000-4000-8000-000000000901","reference":"CROSS-PARTIAL","amount":100.000,"period":"2026-09-01","status":"partial"},
  {"id":"76740000-0000-4000-8000-000000000902","reference":"CROSS-FULL","amount":100.001,"period":"2026-10-01","status":"paid"},
  {"id":"76740000-0000-4000-8000-000000000903","reference":"CROSS-CANCELLED","amount":100.001,"period":"2026-11-01","status":"ملغى"}
 ]') loop
  insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt)
   values((r->>'id')::uuid,w,'76740000-0000-4000-8000-000000000402',r->>'reference',(r->>'amount')::numeric,(r->>'period')::date,'2026-09-01',r->>'status','cash',
    jsonb_build_object('method','cash','transactionNo',r->>'reference'),
    jsonb_build_object('transactionNo',r->>'reference','record',jsonb_build_array(r->>'reference','Synthetic calendar tenant 2',(r->>'amount')::numeric,r->>'status','Synthetic calendar property','2026-09-01','CROSS-2','Synthetic fixture',left(r->>'period',7),'cash')));
 end loop;
 -- Existing delivered/cancelled history is never revived or rewritten by preparation.
 insert into public.aqari_notification_outbox(workspace_id,lease_id,period,kind,channel,status,scheduled_at,idempotency_key) values
  (w,'76740000-0000-4000-8000-000000000401','2026-11-01','rent_reminder','whatsapp','sent','2026-10-28T00:00:00+03','CROSS-SENT-HISTORY'),
  (w,'76740000-0000-4000-8000-000000000401','2026-10-01','rent_reminder','whatsapp','cancelled','2026-10-26T00:00:00+03','reminder:76740000-0000-4000-8000-000000000401:2026-10-01:2026-10-26:whatsapp');
end$$;
set local role authenticated;
do $$declare w uuid:='76740000-0000-4000-8000-000000000099';c jsonb;tz text;lid uuid;d date;mon date;n integer;before_count bigint;after_count bigint;present boolean;expected boolean;actual jsonb;begin
 -- Hard-coded boundary cases: expected dates were checked independently of the SQL loop.
 foreach tz in array array['UTC','America/Los_Angeles','Pacific/Apia'] loop
  perform set_config('TimeZone',tz,true);
  for c in select value from jsonb_array_elements('[
   {"lease":1,"period":"2026-10-01","day":"2026-10-28","present":true},
   {"lease":1,"period":"2026-10-01","day":"2026-10-29","present":false},
   {"lease":1,"period":"2026-11-01","day":"2026-11-27","present":false},
   {"lease":1,"period":"2027-03-01","day":"2027-03-28","present":true},
   {"lease":1,"period":"2028-03-01","day":"2028-03-27","present":true},
   {"lease":1,"period":"2028-03-01","day":"2028-03-28","present":false},
   {"lease":2,"period":"2026-09-01","day":"2026-09-29","present":true},
   {"lease":2,"period":"2026-09-01","day":"2026-10-14","present":false},
   {"lease":2,"period":"2026-09-01","day":"2026-10-15","present":true},
   {"lease":2,"period":"2026-09-01","day":"2026-10-16","present":false},
   {"lease":2,"period":"2026-10-01","day":"2026-10-28","present":false},
   {"lease":2,"period":"2026-11-01","day":"2026-10-28","present":true},
   {"lease":2,"period":"2026-12-01","day":"2027-01-13","present":true},
   {"lease":2,"period":"2026-12-01","day":"2027-01-14","present":false},
   {"lease":2,"period":"2026-12-01","day":"2027-01-15","present":false},
   {"lease":2,"period":"2027-02-01","day":"2027-03-17","present":true},
   {"lease":2,"period":"2027-02-01","day":"2027-03-18","present":false},
   {"lease":2,"period":"2028-02-01","day":"2028-03-16","present":true},
   {"lease":2,"period":"2028-02-01","day":"2028-03-17","present":false},
   {"lease":2,"period":"2026-12-01","day":"2026-12-28","present":true},
   {"lease":2,"period":"2027-01-01","day":"2026-12-28","present":true},
   {"lease":3,"period":"2026-03-01","day":"2027-03-01","present":true},
   {"lease":3,"period":"2026-03-01","day":"2027-03-02","present":false},
   {"lease":3,"period":"2027-03-01","day":"2028-02-29","present":true},
   {"lease":3,"period":"2027-03-01","day":"2028-03-02","present":false},
   {"lease":4,"period":"2026-09-01","day":"2026-09-07","present":false},
   {"lease":4,"period":"2026-10-01","day":"2026-09-28","present":true},
   {"lease":5,"period":"2026-09-01","day":"2026-08-30","present":true},
   {"lease":5,"period":"2026-09-01","day":"2026-09-01","present":false},
   {"lease":5,"period":"2027-03-01","day":"2027-02-28","present":true},
   {"lease":5,"period":"2028-03-01","day":"2028-02-29","present":false},
   {"lease":5,"period":"2028-03-01","day":"2028-03-01","present":false}
  ]') loop
   lid:=('76740000-0000-4000-8000-00000000040'||(c->>'lease'))::uuid;
   d:=(c->>'day')::date;mon:=(c->>'period')::date;expected:=(c->>'present')::boolean;
   select count(*) into before_count from public.aqari_notification_outbox where workspace_id=w;
   n:=public.aqari_prepare_rent_reminders(w,d,5);
   select count(*) into after_count from public.aqari_notification_outbox where workspace_id=w;
   if n<>after_count-before_count then raise exception 'CROSS_MONTH_INSERT_COUNT_WRONG:%',c;end if;
   if tz<>'UTC' and n<>0 then raise exception 'TIMEZONE_CHANGED_IDEMPOTENCY:%:%',tz,c;end if;
   select exists(select 1 from public.aqari_notification_outbox where workspace_id=w and lease_id=lid and period=mon
    and idempotency_key='reminder:'||lid::text||':'||mon::text||':'||d::text||':whatsapp' and status='awaiting_configuration') into present;
   if present is distinct from expected then raise exception 'CROSS_MONTH_BOUNDARY_FAILED:%:%',tz,c;end if;
   if exists(select 1 from public.aqari_notification_outbox where workspace_id=w and idempotency_key='reminder:'||lid::text||':'||mon::text||':'||d::text||':whatsapp'
    and to_char(scheduled_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS')<>to_char(d-1,'YYYY-MM-DD')||' 21:00:00') then raise exception 'SCHEDULED_KUWAIT_MIDNIGHT_DRIFTED:%:%',tz,c;end if;
  end loop;
 end loop;
 -- Full 366-day overlapping set at the earliest included boundary; no period is lost or added.
 select jsonb_agg(period::text order by period) into actual from public.aqari_notification_outbox
  where workspace_id=w and lease_id='76740000-0000-4000-8000-000000000403' and kind='rent_reminder'
   and scheduled_at='2027-03-01T00:00:00+03'::timestamptz and status='awaiting_configuration';
 if actual is distinct from '["2026-03-01","2026-04-01","2026-07-01","2026-08-01","2026-10-01","2026-11-01","2027-02-01"]'::jsonb then raise exception 'FULL_366_DAY_PERIOD_SET_WRONG:%',actual;end if;
 select jsonb_agg(period::text order by period) into actual from public.aqari_notification_outbox
  where workspace_id=w and lease_id='76740000-0000-4000-8000-000000000403' and kind='rent_reminder'
   and scheduled_at='2028-02-29T00:00:00+03'::timestamptz and status='awaiting_configuration';
 if actual is distinct from '["2027-03-01","2027-04-01","2027-07-01","2027-08-01","2027-10-01","2027-11-01","2028-02-01"]'::jsonb then raise exception 'LEAP_366_DAY_PERIOD_SET_WRONG:%',actual;end if;
 perform public.aqari_prepare_rent_reminders(w,'2026-10-26',5);
 if not exists(select 1 from public.aqari_notification_outbox where workspace_id=w and idempotency_key='reminder:76740000-0000-4000-8000-000000000401:2026-10-01:2026-10-26:whatsapp' and status='cancelled')
  or not exists(select 1 from public.aqari_notification_outbox where workspace_id=w and idempotency_key='CROSS-SENT-HISTORY' and status='sent') then raise exception 'TERMINAL_OR_SENT_HISTORY_CHANGED';end if;
 if exists(select 1 from public.aqari_notification_outbox where workspace_id=w and channel<>'whatsapp') then raise exception 'CANONICAL_CHANNEL_REGRESSED';end if;
 if exists(select 1 from public.aqari_notification_outbox where workspace_id=w and status not in ('awaiting_configuration','cancelled') and idempotency_key<>'CROSS-SENT-HISTORY') then raise exception 'MESSAGE_WAS_SENT_OR_ADVANCED';end if;
 begin perform private.aqari_v267_prepare_reminders(w,'2026-09-29',5);raise exception 'PRIVATE_PREPARER_EXPOSED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_prepare_rent_reminders(w,'2026-09-29',28);raise exception 'RESIDENTIAL_FALLBACK_POLICY_CHANGED';exception when raise_exception then if sqlerrm<>'INVALID_REMINDER_WINDOW' then raise;end if;end;
end$$;
reset role;
do $$declare w uuid:='76740000-0000-4000-8000-000000000099';begin
 if private.aqari_reminder_rent_balance(w,'76740000-0000-4000-8000-000000000402','2026-09-01')<>0.001
  or private.aqari_reminder_rent_balance(w,'76740000-0000-4000-8000-000000000402','2026-10-01')<>0
  or private.aqari_reminder_rent_balance(w,'76740000-0000-4000-8000-000000000402','2026-11-01')<>100.001 then raise exception 'EXACT_PAYMENT_BALANCE_CHANGED';end if;
 if (select count(*) from public.aqari_rent_payments where workspace_id=w)<>3
  or exists(select 1 from private.aqari_tenant_preferences where workspace_id=w and consent_at is not null) then raise exception 'PAYMENT_HISTORY_OR_CONSENT_CHANGED';end if;
end$$;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
set local role authenticated;
do $$begin
 begin perform public.aqari_prepare_rent_reminders('76740000-0000-4000-8000-000000000099','2026-09-29',5);raise exception 'OUTSIDER_PREPARED_CROSS_MONTH';exception when insufficient_privilege then null;end;
end$$;
reset role;
rollback;
select 'PASS: 28/45/366-day grace across months, year and leap/common February; exact overlapping month sets; three timezones; Kuwait midnight; canonical contact, free month, paid/cancelled receipts, one fils, zero/default grace, count/idempotency and terminal history; no messages sent, synthetic rows rolled back' result;
