-- Positive synthetic MFA fixture: include a current supported second-factor event.
-- Negative AAL1/expired-MFA cases and all production guards remain unchanged.
-- Local/isolated test target only. All financial/account fixtures are rolled back.
-- A savepoint restores all fixtures before comparing the captured counts.
begin;
create temporary table deposit_before_counts as select
 (select count(*) from auth.users) users,(select count(*) from public.aqari_memberships) members,
 (select count(*) from public.aqari_tenants) tenants,(select count(*) from public.aqari_leases) leases,
 (select count(*) from public.aqari_rent_payments) rent_payments,
 (select count(*) from private.aqari_deposit_entries) deposit_entries;
savepoint deposit_fixtures;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('deposit-manager@example.invalid','مدير اختبار التأمين','general_manager','aqari-v267-staging'),
 ('deposit-collector@example.invalid','محصل اختبار التأمين','accountant','aqari-v267-staging'),
 ('deposit-maintenance@example.invalid','صيانة اختبار التأمين','property_manager','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values
 ('f267d000-0000-4000-8000-000000000001','deposit-manager@example.invalid',now()),
 ('f267d000-0000-4000-8000-000000000002','deposit-collector@example.invalid',now()),
 ('f267d000-0000-4000-8000-000000000003','deposit-maintenance@example.invalid',now());
select set_config('request.jwt.claim.sub','f267d000-0000-4000-8000-000000000001',true);
-- This suite validates deposit policy under the production MFA guard. Manager-only
-- setup/actions run under an explicit synthetic AAL2 claim; scoped staff remain AAL1.
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
select set_config('deposit.test.workspace',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active),true);
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values
 ('f267d100-0000-4000-8000-000000000001',current_setting('deposit.test.workspace')::uuid,'deposit-a','عقار التأمين أ','{}'),
 ('f267d100-0000-4000-8000-000000000002',current_setting('deposit.test.workspace')::uuid,'deposit-b','عقار التأمين ب','{}');
insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile) values
 ('f267d200-0000-4000-8000-000000000001',current_setting('deposit.test.workspace')::uuid,'deposit-tenant-a','مستأجر اختبار أ','999000111221','+96599992221','{}'),
 ('f267d200-0000-4000-8000-000000000002',current_setting('deposit.test.workspace')::uuid,'deposit-tenant-b','مستأجر اختبار ب','999000111222','+96599992222','{}');
insert into public.aqari_units(id,workspace_id,property_id,unit_no) values
 ('f267d300-0000-4000-8000-000000000001',current_setting('deposit.test.workspace')::uuid,'f267d100-0000-4000-8000-000000000001','101'),
 ('f267d300-0000-4000-8000-000000000002',current_setting('deposit.test.workspace')::uuid,'f267d100-0000-4000-8000-000000000002','201'),
 ('f267d300-0000-4000-8000-000000000003',current_setting('deposit.test.workspace')::uuid,'f267d100-0000-4000-8000-000000000001','102');
insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot) values
 ('f267d400-0000-4000-8000-000000000001',current_setting('deposit.test.workspace')::uuid,'deposit-lease-a','f267d200-0000-4000-8000-000000000001','f267d300-0000-4000-8000-000000000001','TEST-DP-A','2026-01-01','2026-12-31',350,200.001,'signed','{}'),
 ('f267d400-0000-4000-8000-000000000002',current_setting('deposit.test.workspace')::uuid,'deposit-lease-b','f267d200-0000-4000-8000-000000000002','f267d300-0000-4000-8000-000000000002','TEST-DP-B','2026-01-01','2026-12-31',350,100,'signed','{}'),
 ('f267d400-0000-4000-8000-000000000003',current_setting('deposit.test.workspace')::uuid,'deposit-lease-draft','f267d200-0000-4000-8000-000000000001','f267d300-0000-4000-8000-000000000003','TEST-DP-DRAFT','2026-01-01','2026-12-31',350,100,'draft','{}');
-- The current lease_required_or_import CHECK permits a NULL deposit only for
-- imported drafts. A signed nullable fixture is rejected by this named constraint.
-- The RPC also fails closed independently if a legacy schema ever permits one.
do $$
declare violated text;
begin
 begin
  update public.aqari_leases set deposit=null where id='f267d400-0000-4000-8000-000000000001';
  raise exception 'NULL_CONTRACT_DEPOSIT_ACCEPTED';
 exception when check_violation then
  get stacked diagnostics violated=constraint_name;
  if violated<>'lease_required_or_import' then raise;end if;
 end;
end $$;
create function pg_temp.deposit_expect(action text,d jsonb,expected text) returns void language plpgsql security invoker as $$
declare code text;
begin
 begin
  perform public.aqari_deposit_register(current_setting('deposit.test.workspace')::uuid,action,d);
  raise exception 'UNEXPECTED_SUCCESS: %',expected;
 exception when others then
  get stacked diagnostics code=returned_sqlstate;
  if sqlerrm<>expected then raise;end if;
  if code<>(case when expected='ACCESS_DENIED' then '42501' else '22023' end) then raise exception 'WRONG_ERROR_STATE: % %',expected,code;end if;
 end;
end $$;
grant execute on function pg_temp.deposit_expect(text,jsonb,text) to authenticated;
set local role authenticated;
do $$
declare w uuid:=current_setting('deposit.test.workspace')::uuid;r jsonb;d jsonb;
begin
 perform public.aqari_staff_access(w,'save',jsonb_build_object('user_id','f267d000-0000-4000-8000-000000000002','operational_role','collector','property_ids',jsonb_build_array('f267d100-0000-4000-8000-000000000001'),'is_active',true,'revision',0,'reason','اختبار نطاق محصل'));
 perform public.aqari_staff_access(w,'save',jsonb_build_object('user_id','f267d000-0000-4000-8000-000000000003','operational_role','maintenance','property_ids',jsonb_build_array('f267d100-0000-4000-8000-000000000001'),'is_active',true,'revision',0,'reason','اختبار صيانة محدود'));
 r:=public.aqari_deposit_register(w,'list','{}');
 if exists(select 1 from jsonb_array_elements(r->'leases') l where l->>'id' like 'f267d400%' and (l->>'received'<>'0.000' or l->>'balance'<>'0.000')) then raise exception 'CONTRACT_FIELDS_COUNTED_AS_CASH';end if;
 if public.aqari_deposit_register(w,'get','{"id":"f267d500-0000-4000-8000-000000000010"}') is distinct from '{"entry":null,"lease":null}'::jsonb then raise exception 'MISSING_READBACK_NOT_EXPLICIT';end if;
 d:='{"id":"f267d500-0000-4000-8000-000000000010","lease_id":"f267d400-0000-4000-8000-000000000001","amount":"80.001","on_date":"2026-05-10","method":"cash","reference":"","reason":""}';
 perform set_config('deposit.test.first',d::text,true);
 perform pg_temp.deposit_expect('receive',d||'{"lease_id":"f267d400-0000-4000-8000-000000000003"}','DEPOSIT_SIGNED_CONTRACT_REQUIRED');
 for r in select value from jsonb_array_elements('[{"amount":"0"},{"amount":"-1"},{"amount":"1.0001"},{"amount":1},{"amount":"1e2"},{"amount":"1000000000000"}]') loop perform pg_temp.deposit_expect('receive',d||r,'DEPOSIT_INVALID_AMOUNT');end loop;
 perform pg_temp.deposit_expect('receive',d||'{"method":"bank","reference":""}','DEPOSIT_INVALID_REFERENCE');
 perform pg_temp.deposit_expect('receive',d||'{"reason":null}','DEPOSIT_INVALID_REASON');
 perform pg_temp.deposit_expect('receive',d||'{"snapshot":{"tenant_name":"fake"}}','DEPOSIT_UNKNOWN_FIELD');
 perform pg_temp.deposit_expect('receive',d||'{"on_date":"9999-01-01"}','DEPOSIT_FUTURE_DATE');
 perform pg_temp.deposit_expect('receive',d||'{"amount":"200.002"}','DEPOSIT_RECEIPT_EXCEEDS_CONTRACT');
end $$;
select set_config('request.jwt.claim.sub','f267d000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
do $$
declare w uuid:=current_setting('deposit.test.workspace')::uuid;r jsonb;d jsonb:=current_setting('deposit.test.first')::jsonb;
begin
 r:=public.aqari_deposit_register(w,'list','{}');
 if jsonb_array_length(r->'leases')<>2 or exists(select 1 from jsonb_array_elements(r->'leases') l where l->>'property_id'<>'f267d100-0000-4000-8000-000000000001' or l->>'can_refund'<>'false') then raise exception 'COLLECTOR_SCOPE_LEAK';end if;
 perform pg_temp.deposit_expect('list','{"lease_id":"f267d400-0000-4000-8000-000000000002"}','ACCESS_DENIED');
 perform pg_temp.deposit_expect('receive',d||'{"lease_id":"f267d400-0000-4000-8000-000000000002"}','ACCESS_DENIED');
 perform pg_temp.deposit_expect('refund',d||'{"reason":"غير مخول"}','ACCESS_DENIED');
 begin perform public.aqari_deposit_register('70000000-0000-4000-8000-000000000099','list','{}');raise exception 'CROSS_WORKSPACE_ACCESS';exception when insufficient_privilege then null;end;
 begin perform count(*) from private.aqari_deposit_entries;raise exception 'PRIVATE_TABLE_ACCESS';exception when insufficient_privilege then null;end;
 r:=public.aqari_deposit_register(w,'receive',d);
 if r#>>'{entry,amount}'<>'80.001' or r#>>'{lease,balance}'<>'80.001' or r#>>'{entry,balance_after}'<>'80.001' then raise exception 'EXACT_RECEIPT_FAILED';end if;
 if r#>>'{entry,voucher_no}' !~ '^DP-20260510-[0-9]{8,}$' or r#>>'{entry,actor_name}'<>'محصل اختبار التأمين' or r#>>'{entry,status}'<>'confirmed' then raise exception 'RECEIPT_AUDIT_MISSING';end if;
 if r#>>'{entry,snapshot,tenant_name}'<>'مستأجر اختبار أ' or r#>>'{entry,snapshot,property_name}'<>'عقار التأمين أ' or r#>>'{entry,snapshot,unit_no}'<>'101' or r#>>'{entry,snapshot,contract_no}'<>'TEST-DP-A' then raise exception 'RECEIPT_BINDING_WRONG';end if;
 if r->'entry' ? 'request_data' then raise exception 'INTERNAL_REQUEST_EXPOSED';end if;
 perform set_config('deposit.test.original_entry',(r->'entry')::text,true);
 if public.aqari_deposit_register(w,'receive',d)->'entry' is distinct from r->'entry' then raise exception 'RETRY_CHANGED_RECEIPT';end if;
 if public.aqari_deposit_register(w,'receive',d||'{"amount":"080.001"}')->'entry' is distinct from r->'entry' then raise exception 'NORMALIZED_RETRY_DUPLICATED';end if;
 perform pg_temp.deposit_expect('receive',d||'{"amount":"80.002"}','DEPOSIT_REQUEST_CONFLICT');
 r:=public.aqari_deposit_register(w,'receive',d||'{"id":"f267d500-0000-4000-8000-000000000011","amount":"70.000","method":"bank","reference":"BANK-TEST-1"}');
 if r#>>'{lease,balance}'<>'150.001' then raise exception 'CUMULATIVE_BALANCE_WRONG';end if;
 perform pg_temp.deposit_expect('receive',d||'{"id":"f267d500-0000-4000-8000-000000000012","amount":"1","method":"bank","reference":"bank-test-1"}','DEPOSIT_REFERENCE_EXISTS');
 if jsonb_array_length(public.aqari_deposit_register(w,'list','{"lease_id":"f267d400-0000-4000-8000-000000000001"}')->'entries')<>2 then raise exception 'RETRY_CREATED_RECORDS';end if;
end $$;
select set_config('request.jwt.claim.sub','f267d000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
do $$
declare w uuid:=current_setting('deposit.test.workspace')::uuid;r jsonb;d jsonb:=current_setting('deposit.test.first')::jsonb;
begin
 perform pg_temp.deposit_expect('receive',d,'DEPOSIT_REQUEST_CONFLICT');
 d:=d||'{"id":"f267d500-0000-4000-8000-000000000020","amount":"10.001","on_date":"2026-05-11","reason":"رد جزئي اختباري"}';
 perform pg_temp.deposit_expect('refund',d||'{"reason":""}','DEPOSIT_INVALID_REASON');
 perform pg_temp.deposit_expect('refund',d||'{"amount":"150.002"}','DEPOSIT_REFUND_EXCEEDS_BALANCE');
 perform pg_temp.deposit_expect('refund',d||'{"on_date":"2026-05-09"}','DEPOSIT_REFUND_DATE_BALANCE');
 r:=public.aqari_deposit_register(w,'refund',d);
 if r#>>'{lease,balance}'<>'140.000' or r#>>'{lease,refunded}'<>'10.001' or r#>>'{entry,kind}'<>'refund' or r#>>'{entry,voucher_no}' !~ '^DF-20260511-[0-9]{8,}$' or r#>>'{entry,reason}'<>'رد جزئي اختباري' then raise exception 'PARTIAL_REFUND_WRONG';end if;
 if public.aqari_deposit_register(w,'refund',d)->'entry' is distinct from r->'entry' then raise exception 'REFUND_RETRY_DUPLICATED';end if;
 perform set_config('deposit.test.refund',d::text,true);
 -- Property B remains private to the manager; its receipt cannot be read by A's collector.
 r:=public.aqari_deposit_register(w,'receive',d||'{"id":"f267d500-0000-4000-8000-000000000030","lease_id":"f267d400-0000-4000-8000-000000000002","amount":"50","reason":"قبض عقار ثان"}');
 if r#>>'{lease,balance}'<>'50.000' then raise exception 'SECOND_PROPERTY_RECEIPT_FAILED';end if;
 perform public.aqari_deposit_register(w,'refund',d||'{"id":"f267d500-0000-4000-8000-000000000031","lease_id":"f267d400-0000-4000-8000-000000000002","amount":"50","on_date":"2026-05-12","reason":"رد اختباري"}');
 perform pg_temp.deposit_expect('receive',d||'{"id":"f267d500-0000-4000-8000-000000000032","lease_id":"f267d400-0000-4000-8000-000000000002","amount":"100","on_date":"2026-05-11"}','DEPOSIT_RECEIPT_EXCEEDS_CONTRACT');
 perform public.aqari_deposit_register(w,'receive',d||'{"id":"f267d500-0000-4000-8000-000000000032","lease_id":"f267d400-0000-4000-8000-000000000002","amount":"100","on_date":"2026-05-13"}');
end $$;
select set_config('request.jwt.claim.sub','f267d000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
select pg_temp.deposit_expect('get','{"id":"f267d500-0000-4000-8000-000000000030"}','ACCESS_DENIED');
select set_config('request.jwt.claim.sub','f267d000-0000-4000-8000-000000000003',true);
select pg_temp.deposit_expect('list','{}','ACCESS_DENIED');
select set_config('request.jwt.claim.sub','',true);
select pg_temp.deposit_expect('get','{"id":"f267d500-0000-4000-8000-000000000010"}','ACCESS_DENIED');
reset role;
-- Copies remain as issued when source identity or lease status later changes.
update public.aqari_tenants set full_name='اسم مصدر معدل لاحقًا' where id='f267d200-0000-4000-8000-000000000001';
update public.aqari_leases set status='expired' where id='f267d400-0000-4000-8000-000000000001';
do $$
begin
 begin update private.aqari_deposit_entries set amount=1 where id='f267d500-0000-4000-8000-000000000010';raise exception 'IMMUTABLE_UPDATE_ACCEPTED';exception when check_violation then if sqlerrm<>'DEPOSIT_ENTRY_IMMUTABLE' then raise;end if;end;
 begin delete from private.aqari_deposit_entries where id='f267d500-0000-4000-8000-000000000010';raise exception 'IMMUTABLE_DELETE_ACCEPTED';exception when check_violation then if sqlerrm<>'DEPOSIT_ENTRY_IMMUTABLE' then raise;end if;end;
 if (select count(*) from public.aqari_rent_payments)<>(select rent_payments from deposit_before_counts) then raise exception 'DEPOSIT_COUNTED_AS_RENT';end if;
end $$;
select set_config('request.jwt.claim.sub','f267d000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
set local role authenticated;
do $$
declare w uuid:=current_setting('deposit.test.workspace')::uuid;r jsonb;d jsonb:=current_setting('deposit.test.refund')::jsonb;
begin
 if public.aqari_deposit_register(w,'get','{"id":"f267d500-0000-4000-8000-000000000010"}')->'entry' is distinct from current_setting('deposit.test.original_entry')::jsonb then raise exception 'PRINT_SNAPSHOT_CHANGED';end if;
 r:=public.aqari_deposit_register(w,'refund',d||'{"id":"f267d500-0000-4000-8000-000000000021","amount":"140.000"}');
 if r#>>'{lease,balance}'<>'0.000' or r#>>'{lease,refunded}'<>'150.001' then raise exception 'FULL_REFUND_EXPIRED_LEASE_FAILED';end if;
 perform pg_temp.deposit_expect('refund',d||'{"id":"f267d500-0000-4000-8000-000000000022","amount":"0.001"}','DEPOSIT_REFUND_EXCEEDS_BALANCE');
 perform public.aqari_financial_register(w,'close_period','{"month":"2026-05","reason":"إقفال شهر اختبار التأمين"}');
 -- Existing committed requests remain readable and idempotent after closure.
 if public.aqari_deposit_register(w,'refund',d)#>>'{entry,id}'<>d->>'id' then raise exception 'CLOSED_RETRY_FAILED';end if;
 perform pg_temp.deposit_expect('receive',(current_setting('deposit.test.first')::jsonb)||'{"id":"f267d500-0000-4000-8000-000000000090","lease_id":"f267d400-0000-4000-8000-000000000002","amount":"1"}','DEPOSIT_PERIOD_CLOSED');
 perform public.aqari_staff_access(w,'save',jsonb_build_object('user_id','f267d000-0000-4000-8000-000000000002','operational_role','collector','property_ids',jsonb_build_array('f267d100-0000-4000-8000-000000000001'),'is_active',false,'revision',1,'reason','سحب صلاحية اختبار'));
end $$;
select set_config('request.jwt.claim.sub','f267d000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
select pg_temp.deposit_expect('receive',current_setting('deposit.test.first')::jsonb,'ACCESS_DENIED');
reset role;
rollback to savepoint deposit_fixtures;
do $$
begin
 if (select row(users,members,tenants,leases,rent_payments,deposit_entries) from deposit_before_counts) is distinct from
  row((select count(*) from auth.users),(select count(*) from public.aqari_memberships),(select count(*) from public.aqari_tenants),(select count(*) from public.aqari_leases),(select count(*) from public.aqari_rent_payments),(select count(*) from private.aqari_deposit_entries)) then raise exception 'DEPOSIT_FIXTURE_ROLLBACK_INCOMPLETE';end if;
end $$;
rollback;
select 'PASS: exact deposit receipts and refunds; unchanged rent income; scoped roles/workspaces; amount/reference/date guards; server identity and immutable print snapshot; idempotent requests and definite errors; partial/full refund bounds; closed-month protection/recovery; revoked access; fixture counts restored' result;
