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
-- Manager-only fixture setup must cross the same sensitive-operation MFA guard as
-- production. Use an explicit synthetic AAL2 claim rather than weakening the guard.
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
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
insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt)
 values('f267e700-0000-4000-8000-000000000001',current_setting('deposit.test.workspace')::uuid,'f267d400-0000-4000-8000-000000000001','VOID-SETTLEMENT-TEST',2800,'2026-08-01','2026-08-01','cancelled','cash','[]','{}');
do $$
declare r jsonb;
begin
 r:=private.aqari_vacating_balances(current_setting('deposit.test.workspace')::uuid,'f267d400-0000-4000-8000-000000000001','2026-08-31');
 if r->>'rent_paid_total'<>'0.000' or r->>'rent_balance'<>'2800.000' then raise exception 'CANCELLED_PAYMENT_CLEARS_DEBT';end if;
end $$;
set local role authenticated;
do $$
declare w uuid:=current_setting('deposit.test.workspace')::uuid;d jsonb;r jsonb;failed boolean:=false;
begin
 d:='{"lease_id":"f267d400-0000-4000-8000-000000000001","vacate_date":"2026-08-31","keys_returned":true,"inspection_completed":true,"meters_recorded":true,"damage_amount":"0.000","damage_notes":"","charges_resolved":false,"charges_reference":"","revision":0}';
 if jsonb_array_length(public.aqari_vacating_settlement(w,'list','{}')->'leases')<>3 then raise exception 'MANAGER_SETTLEMENT_LIST_FAILED';end if;
 r:=public.aqari_vacating_settlement(w,'save',d);
 if r#>>'{settlement,revision}'<>'1' then raise exception 'VALID_DRAFT_SAVE_FAILED';end if;
 begin perform public.aqari_vacating_settlement(w,'finalize',jsonb_build_object('lease_id',d->>'lease_id','revision',1));
 exception when others then if sqlerrm<>'VACATING_DAMAGE_OPEN' then raise;end if;failed:=true;end;
 if not failed then raise exception 'UNREVIEWED_CHARGES_FINALIZED';end if;
 r:=public.aqari_vacating_settlement(w,'save',d||'{"revision":1,"charges_resolved":true,"charges_reference":"review-123"}');
 r:=public.aqari_vacating_settlement(w,'finalize',jsonb_build_object('lease_id',d->>'lease_id','revision',2));
 if r#>>'{settlement,status}'<>'finalized' then raise exception 'REVIEWED_FINALIZATION_FAILED';end if;
 failed:=false;
 begin perform public.aqari_vacating_settlement(w,'clearance',jsonb_build_object('lease_id',d->>'lease_id','revision',3,'exception_reason',''));
 exception when others then if sqlerrm<>'VACATING_OUTSTANDING_BALANCE' then raise;end if;failed:=true;end;
 if not failed then raise exception 'CANCELLED_PAYMENT_ISSUED_CLEARANCE';end if;
 perform public.aqari_staff_access(w,'save',jsonb_build_object('user_id','f267d000-0000-4000-8000-000000000003','operational_role','property_manager','property_ids',jsonb_build_array('f267d100-0000-4000-8000-000000000001'),'is_active',true,'revision',0,'reason','نطاق مدير عقار دون التحصيل'));
end $$;
reset role;
select set_config('request.jwt.claim.sub','f267d000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
set local role authenticated;
do $$
declare w uuid:=current_setting('deposit.test.workspace')::uuid;
begin
 if not private.aqari_can(w,'contracts','read') or private.aqari_can(w,'collections','read') then raise exception 'ROLE_FIXTURE_WRONG';end if;
 begin perform public.aqari_vacating_settlement(w,'list','{}');raise exception 'CONTRACT_ROLE_LEAKS_FINANCIAL_BALANCES';exception when insufficient_privilege then null;end;
 begin perform public.aqari_vacating_settlement(w,'get','{"lease_id":"f267d400-0000-4000-8000-000000000001"}');raise exception 'DIRECT_READ_LEAKS_FINANCIAL_BALANCES';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS: cancelled payments cannot clear debts; valid save; unresolved zero-damage charges block finalization; outstanding balance blocks clearance; contract-only role cannot read financial settlement' result;
