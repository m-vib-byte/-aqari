begin;
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
create function pg_temp.vacating_expect(action text,d jsonb,expected text) returns void language plpgsql security invoker as $$
begin
 begin
  perform public.aqari_vacating_review(current_setting('deposit.test.workspace')::uuid,action,d);
  raise exception 'UNEXPECTED_SUCCESS: %',expected;
 exception when others then if sqlerrm<>expected then raise;end if;end;
end $$;
grant execute on function pg_temp.vacating_expect(text,jsonb,text) to authenticated;
set local role authenticated;
do $$
declare w uuid:=current_setting('deposit.test.workspace')::uuid;l text:='f267d400-0000-4000-8000-000000000001';r jsonb;d jsonb;saved jsonb;
begin
 r:=public.aqari_vacating_review(w,'read',jsonb_build_object('lease_id',l));
 if r->>'revision'<>'0' or r->'review'<>'null' or r->>'can_finalize'<>'false' then raise exception 'INITIAL_REVIEW_NOT_BLOCKED';end if;
 if r#>>'{evidence,lease,balance}'<>'0.000' then raise exception 'CONTRACT_DEPOSIT_INFERRED_AS_CASH';end if;
 d:=jsonb_build_object('id','f267e500-0000-4000-8000-000000000001','lease_id',l,'revision',0,'evidence_token',r->>'evidence_token','vacate_date','2026-08-31','keys_returned',false,'inspection_complete',false,'utilities_verified',false,'rent_due',null,'utilities_due','0','damage_due','1.001','other_due',null,'reason','مراجعة تجريبية دون إخلاء أو براءة');
 perform pg_temp.vacating_expect('save',d||'{"reason":""}','VACATING_REASON_REQUIRED');
 perform pg_temp.vacating_expect('save',d||'{"rent_due":"-1"}','VACATING_INVALID_AMOUNT');
 perform pg_temp.vacating_expect('save',d||'{"rent_due":"1.0001"}','VACATING_INVALID_AMOUNT');
 perform pg_temp.vacating_expect('save',d||'{"rent_due":1}','VACATING_INVALID_AMOUNT');
 perform pg_temp.vacating_expect('save',d-'rent_due','VACATING_INVALID_AMOUNT');
 perform pg_temp.vacating_expect('save',d||'{"keys_returned":"true"}','VACATING_INVALID_CHECKLIST');
 perform pg_temp.vacating_expect('save',d||'{"vacate_date":"2025-12-31"}','VACATING_BEFORE_CONTRACT');
 perform pg_temp.vacating_expect('save',d||'{"can_finalize":true}','VACATING_UNKNOWN_FIELD');
 perform pg_temp.vacating_expect('finalize',d,'VACATING_ACTION_UNAVAILABLE');
 perform pg_temp.vacating_expect('clearance',d,'VACATING_ACTION_UNAVAILABLE');
 saved:=public.aqari_vacating_review(w,'save',d)->'review';
 if saved->>'revision'<>'1' or saved#>>'{request_data,damage_due}'<>'1.001' or saved#>>'{request_data,utilities_due}'<>'0.000' or saved#>'{request_data,rent_due}'<>'null'::jsonb then raise exception 'REVIEW_VALUES_LOST';end if;
 if saved->>'actor_id'<>auth.uid()::text or saved->>'actor_name'<>'مدير اختبار التأمين' then raise exception 'AUDIT_IDENTITY_WRONG';end if;
 if public.aqari_vacating_review(w,'save',d)->'review' is distinct from saved then raise exception 'RETRY_CREATED_REVISION';end if;
 if public.aqari_vacating_review(w,'get',jsonb_build_object('id',saved->>'id'))->'review' is distinct from saved then raise exception 'READBACK_FAILED';end if;
 perform pg_temp.vacating_expect('save',d||'{"damage_due":"1.002"}','VACATING_REQUEST_CONFLICT');
 perform pg_temp.vacating_expect('save',d||'{"id":"f267e500-0000-4000-8000-000000000002"}','VACATING_REVISION_CONFLICT');
 perform set_config('vacating.test.request',d::text,true);
 perform set_config('vacating.test.saved',saved::text,true);
 begin perform count(*) from private.aqari_vacating_reviews;raise exception 'DIRECT_TABLE_ACCESS';exception when insufficient_privilege then null;end;
 begin perform public.aqari_vacating_review('70000000-0000-4000-8000-000000000099','list','{}');raise exception 'CROSS_WORKSPACE_ACCESS';exception when insufficient_privilege then null;end;
end $$;
-- A real deposit movement invalidates the review. Saving a draft never moves cash.
do $$
declare w uuid:=current_setting('deposit.test.workspace')::uuid;r jsonb;d jsonb:=current_setting('vacating.test.request')::jsonb;
begin
 perform public.aqari_deposit_register(w,'receive','{"id":"f267e600-0000-4000-8000-000000000001","lease_id":"f267d400-0000-4000-8000-000000000001","amount":"10.001","on_date":"2026-05-10","method":"cash"}');
 r:=public.aqari_vacating_review(w,'read',jsonb_build_object('lease_id',d->>'lease_id'));
 if r->>'stale'<>'true' or r#>>'{evidence,lease,balance}'<>'10.001' then raise exception 'CHANGED_EVIDENCE_NOT_DETECTED';end if;
 perform pg_temp.vacating_expect('save',d||'{"id":"f267e500-0000-4000-8000-000000000002","revision":1}','VACATING_EVIDENCE_CHANGED');
 -- A lost successful reply is recoverable despite later source changes.
 if public.aqari_vacating_review(w,'save',d)->'review' is distinct from current_setting('vacating.test.saved')::jsonb then raise exception 'STALE_SUCCESS_NOT_RECOVERABLE';end if;
 d:=d||jsonb_build_object('id','f267e500-0000-4000-8000-000000000002','revision',1,'evidence_token',r->>'evidence_token','rent_due','0.000');
 if public.aqari_vacating_review(w,'save',d)#>>'{review,revision}'<>'2' then raise exception 'REVIEW_UPDATE_FAILED';end if;
 r:=public.aqari_vacating_review(w,'read',jsonb_build_object('lease_id',d->>'lease_id'));
 if r->>'stale'<>'false' or r->>'can_finalize'<>'false' then raise exception 'REVIEW_NOT_REFRESHED_OR_FINALIZED';end if;
 perform set_config('vacating.test.current',d::text,true);
end $$;
select set_config('request.jwt.claim.sub','f267d000-0000-4000-8000-000000000002',true);
select pg_temp.vacating_expect('list','{}','ACCESS_DENIED');
select pg_temp.vacating_expect('get','{"id":"f267e500-0000-4000-8000-000000000001"}','ACCESS_DENIED');
select set_config('request.jwt.claim.sub','',true);
select pg_temp.vacating_expect('list','{}','ACCESS_DENIED');
reset role;
do $$
begin
 if (select status from public.aqari_leases where id='f267d400-0000-4000-8000-000000000001')<>'signed' then raise exception 'REVIEW_ENDED_LEASE';end if;
 if (select count(*) from private.aqari_deposit_entries where lease_id='f267d400-0000-4000-8000-000000000001')<>1 then raise exception 'REVIEW_MOVED_DEPOSIT';end if;
 if exists(select 1 from public.aqari_rent_payments where lease_id='f267d400-0000-4000-8000-000000000001') then raise exception 'REVIEW_CREATED_PAYMENT';end if;
 begin update private.aqari_vacating_reviews set actor_name='changed' where id='f267e500-0000-4000-8000-000000000001';raise exception 'REVIEW_MUTABLE';exception when check_violation then if sqlerrm<>'VACATING_REVIEW_IMMUTABLE' then raise;end if;end;
 begin delete from private.aqari_vacating_reviews where id='f267e500-0000-4000-8000-000000000001';raise exception 'REVIEW_DELETABLE';exception when check_violation then if sqlerrm<>'VACATING_REVIEW_IMMUTABLE' then raise;end if;end;
end $$;
-- Source contract edits invalidate the next save, while the issued draft stays unchanged.
update public.aqari_leases set contract_no='TEST-DP-CHANGED' where id='f267d400-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','f267d000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$
declare w uuid:=current_setting('deposit.test.workspace')::uuid;d jsonb:=current_setting('vacating.test.current')::jsonb;r jsonb;
begin
 r:=public.aqari_vacating_review(w,'read',jsonb_build_object('lease_id',d->>'lease_id'));
 if r->>'stale'<>'true' then raise exception 'CONTRACT_EDIT_NOT_DETECTED';end if;
 perform pg_temp.vacating_expect('save',d||'{"id":"f267e500-0000-4000-8000-000000000003","revision":2}','VACATING_EVIDENCE_CHANGED');
 if public.aqari_vacating_review(w,'get','{"id":"f267e500-0000-4000-8000-000000000001"}')->'review' is distinct from current_setting('vacating.test.saved')::jsonb then raise exception 'OLD_PRINT_SNAPSHOT_CHANGED';end if;
end $$;
reset role;
update public.aqari_memberships set is_active=false where user_id='f267d000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.vacating_expect('get','{"id":"f267e500-0000-4000-8000-000000000001"}','ACCESS_DENIED');
reset role;
rollback;
select 'PASS: immutable vacating review versions, unknown versus zero amounts, source-change and revision conflicts, idempotent recovery, manager-only access, no lease termination or cash movements, clearance blocked, fixtures rolled back' result;
