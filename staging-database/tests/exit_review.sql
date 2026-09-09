-- Local/isolated test target only. All financial/account fixtures are rolled back.
-- A savepoint restores all fixtures before comparing the captured counts.
begin;
create temporary table deposit_before_counts as select
 (select count(*) from auth.users) users,(select count(*) from public.aqari_memberships) members,
 (select count(*) from public.aqari_tenants) tenants,(select count(*) from public.aqari_leases) leases,
 (select count(*) from public.aqari_rent_payments) rent_payments,
 (select count(*) from private.aqari_deposit_entries) deposit_entries;
alter table deposit_before_counts add column exit_reviews bigint default (0);
update deposit_before_counts set exit_reviews=(select count(*) from private.aqari_exit_reviews);
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
create function pg_temp.exit_expect(action text,d jsonb,expected text) returns void language plpgsql security invoker as $$
begin
 begin
  perform public.aqari_exit_review(current_setting('deposit.test.workspace')::uuid,action,d);
  raise exception 'UNEXPECTED_SUCCESS: %',expected;
 exception when others then if sqlerrm<>expected then raise;end if;end;
end $$;
grant execute on function pg_temp.exit_expect(text,jsonb,text) to authenticated;
-- Synthetic records exercise actual Arabic/English payment statuses; rolled back.
create function pg_temp.exit_payment_fixture() returns void language sql security definer set search_path='' as $$
 insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt)
 select gen_random_uuid(),current_setting('deposit.test.workspace')::uuid,'f267d400-0000-4000-8000-000000000001'::uuid,
  'EXIT-TEST-'||n,amount,'2026-05-01'::date,'2026-05-10'::date,status,'cash','{}','{}'
 from (values(1,10.111,'مدفوع'),(2,20.222,'partial'),(3,50.000,'unconfirmed')) fixtures(n,amount,status);
$$;
grant execute on function pg_temp.exit_payment_fixture() to authenticated;
set local role authenticated;
do $$
declare w uuid:=current_setting('deposit.test.workspace')::uuid;r jsonb;d jsonb;checks jsonb;k text;
begin
 checks:='{}';foreach k in array array['rent','deposit','utilities','maintenance','keys','other'] loop checks:=checks||jsonb_build_object(k,jsonb_build_object('status','pending','note',''));end loop;
 d:=jsonb_build_object('request_id','f267e500-0000-4000-8000-000000000001','lease_id','f267d400-0000-4000-8000-000000000001','revision',0,'vacate_on','2026-09-30','reason','طلب إخلاء اختباري فقط','document_id',null,'checks',checks);
 perform set_config('exit.test.request',d::text,true);
 perform pg_temp.exit_expect('issue_clearance','{}','EXIT_UNKNOWN_ACTION');
 perform pg_temp.exit_expect('terminate','{}','EXIT_UNKNOWN_ACTION');
 perform pg_temp.exit_expect('save',d||'{"clearance_issued":true}','EXIT_UNKNOWN_FIELD');
 perform pg_temp.exit_expect('save',d||'{"revision":0.5}','EXIT_INVALID_REVISION');
 perform pg_temp.exit_expect('save',d||'{"reason":""}','EXIT_INVALID_REASON');
 perform pg_temp.exit_expect('save',d||'{"vacate_on":"2025-12-31"}','EXIT_BEFORE_CONTRACT');
 perform pg_temp.exit_expect('save',d||'{"lease_id":"f267d400-0000-4000-8000-000000000003"}','EXIT_CONTRACT_REQUIRED');
 perform pg_temp.exit_expect('save',d||'{"document_id":"f267e900-0000-4000-8000-000000000001"}','EXIT_INVALID_DOCUMENT');
 perform pg_temp.exit_expect('save',d||jsonb_build_object('checks',checks-'keys'),'EXIT_INVALID_CHECKS');
 perform pg_temp.exit_expect('save',d||jsonb_build_object('checks',checks||'{"keys":{"status":"reviewed","note":""}}'),'EXIT_INVALID_CHECKS');
 perform pg_temp.exit_expect('save',d||jsonb_build_object('checks',checks||'{"keys":{"status":"paid","note":"مرفوض"}}'),'EXIT_INVALID_CHECKS');
 perform pg_temp.exit_expect('save',d||jsonb_build_object('checks',checks||'{"keys":{"status":null,"note":"مرفوض"}}'),'EXIT_INVALID_CHECKS');
 if public.aqari_exit_review(w,'get',jsonb_build_object('request_id',d->>'request_id'))->'entry'<>'null' then raise exception 'GET_ABSENT_INVALID';end if;
 r:=public.aqari_exit_review(w,'save',d);
 if r#>>'{entry,revision}'<>'1' or r#>>'{entry,snapshot,contract_no}'<>'TEST-DP-A' or r#>>'{entry,snapshot,unit_no}'<>'101' or r#>>'{entry,snapshot,tenant_name}'<>'مستأجر اختبار أ' or r#>>'{entry,actor_id}'<>auth.uid()::text then raise exception 'EXIT_SNAPSHOT_BINDING';end if;
 if r#>>'{entry,snapshot,clearance_issued}'<>'false' or r#>>'{entry,snapshot,lease_terminated}'<>'false' or r#>>'{entry,snapshot,final_balance_verified}'<>'false' then raise exception 'EXIT_FALSE_CLEARANCE';end if;
 if r#>>'{entry,snapshot,deposit_balance}'<>'0.000' or r#>>'{entry,snapshot,rent_payments_total}'<>'0.000' then raise exception 'CONTRACT_AMOUNT_INFERRED_AS_CASH';end if;
 if r->'entry' ? 'request_data' then raise exception 'PRIVATE_REQUEST_EXPOSED';end if;
 perform set_config('exit.test.original',r::text,true);
 if public.aqari_exit_review(w,'get',jsonb_build_object('request_id',d->>'request_id'))<>r then raise exception 'READBACK_DIFFERS';end if;
 if public.aqari_exit_review(w,'save',d)<>r then raise exception 'RETRY_DUPLICATES';end if;
 perform pg_temp.exit_expect('save',d||'{"reason":"تعديل بنفس هوية العملية"}','EXIT_REQUEST_CONFLICT');
 perform pg_temp.exit_expect('save',d||'{"request_id":"f267e500-0000-4000-8000-000000000002"}','EXIT_STALE_REVISION');
 perform pg_temp.exit_payment_fixture();
 perform public.aqari_deposit_register(w,'receive',jsonb_build_object('id','f267e600-0000-4000-8000-000000000001','lease_id',d->>'lease_id','amount','20.125','on_date','2026-05-10','method','cash'));
 d:=d||'{"request_id":"f267e500-0000-4000-8000-000000000002","revision":1}'||jsonb_build_object('checks',checks||'{"keys":{"status":"outstanding","note":"لم تستلم المفاتيح بعد"}}');
 r:=public.aqari_exit_review(w,'save',d);
 if r#>>'{entry,snapshot,deposit_balance}'<>'20.125' then raise exception 'DEPOSIT_BALANCE_NOT_CAPTURED';end if;
 if r#>>'{entry,snapshot,rent_payments_total}'<>'30.333' then raise exception 'CONFIRMED_PAYMENT_STATUSES_WRONG';end if;
 if r#>>'{entry,revision}'<>'2' or r#>>'{entry,checks,keys,status}'<>'outstanding' then raise exception 'SECOND_VERSION_NOT_SAVED';end if;
 if jsonb_array_length(public.aqari_exit_review(w,'list',jsonb_build_object('lease_id',d->>'lease_id'))->'entries')<>2 then raise exception 'VERSION_HISTORY_MISSING';end if;
 if public.aqari_exit_review(w,'save',current_setting('exit.test.request')::jsonb)<>current_setting('exit.test.original')::jsonb then raise exception 'OLD_RETRY_CHANGED_HISTORY';end if;
 -- Manager-only finance/contract review, no collector/maintenance access.
 perform set_config('request.jwt.claim.sub','f267d000-0000-4000-8000-000000000002',true);
 perform pg_temp.exit_expect('list','{}','ACCESS_DENIED');
 perform pg_temp.exit_expect('get',jsonb_build_object('request_id',d->>'request_id'),'ACCESS_DENIED');
 perform pg_temp.exit_expect('save',d,'ACCESS_DENIED');
 perform set_config('request.jwt.claim.sub','f267d000-0000-4000-8000-000000000001',true);
 begin perform public.aqari_exit_review('70000000-0000-4000-8000-000000000099','list','{}');raise exception 'CROSS_WORKSPACE';exception when insufficient_privilege then null;end;
 begin perform count(*) from private.aqari_exit_reviews;raise exception 'DIRECT_TABLE_READ';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.aqari_tenants set full_name='اسم تغير بعد المراجعة' where id='f267d200-0000-4000-8000-000000000001';
do $$
begin
 begin update private.aqari_exit_reviews set reason='تغيير الأصل';raise exception 'MUTATED';exception when check_violation then if sqlerrm<>'EXIT_IMMUTABLE' then raise;end if;end;
 begin delete from private.aqari_exit_reviews;raise exception 'DELETED';exception when check_violation then if sqlerrm<>'EXIT_IMMUTABLE' then raise;end if;end;
 if (select status from public.aqari_leases where id='f267d400-0000-4000-8000-000000000001')<>'signed' then raise exception 'LEASE_TERMINATED';end if;
 if has_function_privilege('anon','public.aqari_exit_review(uuid,text,jsonb)','execute') then raise exception 'ANON_RPC_ACCESS';end if;
end $$;
set local role authenticated;
do $$
begin
 if public.aqari_exit_review(current_setting('deposit.test.workspace')::uuid,'get','{"request_id":"f267e500-0000-4000-8000-000000000001"}')<>current_setting('exit.test.original')::jsonb then raise exception 'SAVED_COPY_CHANGED';end if;
end $$;
reset role;
update public.aqari_memberships set is_active=false where workspace_id=current_setting('deposit.test.workspace')::uuid and user_id='f267d000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.exit_expect('get','{"request_id":"f267e500-0000-4000-8000-000000000001"}','ACCESS_DENIED');
reset role;
rollback to savepoint deposit_fixtures;
do $$
begin
 if (select row(users,members,tenants,leases,rent_payments,deposit_entries,exit_reviews) from deposit_before_counts) is distinct from
 row((select count(*) from auth.users),(select count(*) from public.aqari_memberships),(select count(*) from public.aqari_tenants),(select count(*) from public.aqari_leases),(select count(*) from public.aqari_rent_payments),(select count(*) from private.aqari_deposit_entries),(select count(*) from private.aqari_exit_reviews)) then raise exception 'EXIT_FIXTURES_NOT_RESTORED';end if;
end $$;
rollback;
select 'PASS: immutable exit review, saved versions, exact readback, retry/CAS, authority/workspace/revocation guards, unsupported clearance rejected and fixtures restored' result;
