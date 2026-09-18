-- Positive synthetic MFA fixture: include a current supported second-factor event.
-- Negative AAL1/expired-MFA cases and all production guards remain unchanged.
-- Local in-memory PostgreSQL acceptance only. No hosted database connection.
begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('vacating-manager@example.invalid','مدير اختبار الإخلاء','general_manager','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values
 ('f267e000-0000-4000-8000-000000000001','vacating-manager@example.invalid',now());
select set_config('request.jwt.claim.sub','f267e000-0000-4000-8000-000000000001',true);
-- Vacating finalization and clearance are sensitive writes; model a verified manager session.
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
select set_config('vac.test.workspace',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active limit 1),true);

insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values
 ('f267e100-0000-4000-8000-000000000001',current_setting('vac.test.workspace')::uuid,'vac-property','عقار اختبار الإخلاء','{}');
insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile) values
 ('f267e200-0000-4000-8000-000000000001',current_setting('vac.test.workspace')::uuid,'vac-tenant','مستأجر اختبار الإخلاء','999000111333','+96599993333','{}');
insert into public.aqari_units(id,workspace_id,property_id,unit_no) values
 ('f267e300-0000-4000-8000-000000000001',current_setting('vac.test.workspace')::uuid,'f267e100-0000-4000-8000-000000000001','301');
insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot) values
 ('f267e400-0000-4000-8000-000000000001',current_setting('vac.test.workspace')::uuid,'vac-lease','f267e200-0000-4000-8000-000000000001','f267e300-0000-4000-8000-000000000001','TEST-VAC-1','2026-01-01','2026-12-31',100,50,'signed','{"rent":100,"rentalTermsVersion":"1","freeMonthApproved":false,"freeMonthPeriod":"","rentAdjustments":[]}');
insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt) values
 ('f267e500-0000-4000-8000-000000000001',current_setting('vac.test.workspace')::uuid,'f267e400-0000-4000-8000-000000000001','VAC-CONFIRMED',100,'2026-01-01','2026-01-05','مدفوع','cash','{}','{}'),
 ('f267e500-0000-4000-8000-000000000002',current_setting('vac.test.workspace')::uuid,'f267e400-0000-4000-8000-000000000001','VAC-CANCELLED',900,'2026-01-01','2026-01-06','cancelled','cash','{}','{}');

create function pg_temp.vac_expect(action text,d jsonb,expected text) returns void language plpgsql security invoker as $$
begin
 begin
  perform public.aqari_vacating_settlement(current_setting('vac.test.workspace')::uuid,action,d);
  raise exception 'UNEXPECTED_SUCCESS: %',expected;
 exception when others then
  if sqlerrm<>expected then raise;end if;
 end;
end $$;
grant execute on function pg_temp.vac_expect(text,jsonb,text) to authenticated;

set local role authenticated;
do $$
declare w uuid:=current_setting('vac.test.workspace')::uuid;r jsonb;rev bigint;
begin
 begin perform count(*) from private.aqari_vacating_settlements;raise exception 'PRIVATE_SETTLEMENT_TABLE_EXPOSED';exception when insufficient_privilege then null;end;
 perform public.aqari_deposit_register(w,'receive','{"id":"f267e600-0000-4000-8000-000000000001","lease_id":"f267e400-0000-4000-8000-000000000001","amount":"50.000","on_date":"2026-01-10","method":"cash","reference":"","reason":""}');
 r:=public.aqari_vacating_settlement(w,'save','{"lease_id":"f267e400-0000-4000-8000-000000000001","vacate_date":"2026-01-31","keys_returned":true,"inspection_completed":true,"meters_recorded":true,"damage_amount":"0.000","damage_notes":"","charges_resolved":true,"charges_reference":"inspection-and-charges-review-123","revision":0}');
 if r#>>'{settlement,balances,rent_due_total}'<>'100.000' then raise exception 'VACATING_DUE_WRONG';end if;
 if r#>>'{settlement,balances,rent_paid_total}'<>'100.000' then raise exception 'CANCELLED_PAYMENT_COUNTED';end if;
 if r#>>'{settlement,balances,rent_balance}'<>'0.000' or r#>>'{settlement,balances,tenant_credit}'<>'0.000' then raise exception 'VACATING_RENT_BALANCE_WRONG';end if;
 if r#>>'{settlement,balances,deposit_balance}'<>'50.000' then raise exception 'VACATING_DEPOSIT_BALANCE_WRONG';end if;
 rev:=(r#>>'{settlement,revision}')::bigint;
 r:=public.aqari_vacating_settlement(w,'finalize',jsonb_build_object('lease_id','f267e400-0000-4000-8000-000000000001','revision',rev));
 if r#>>'{settlement,status}'<>'finalized' or r#>>'{settlement,settlement_no}' !~ '^VS-20260131-[0-9]{8,}$' then raise exception 'VACATING_FINALIZE_FAILED';end if;
 if r#>>'{settlement,settlement_snapshot,status}'<>'finalized' or r#>>'{settlement,settlement_snapshot,settlement_no}'<>r#>>'{settlement,settlement_no}' then raise exception 'SETTLEMENT_SNAPSHOT_NOT_NORMALIZED';end if;
 rev:=(r#>>'{settlement,revision}')::bigint;
 perform pg_temp.vac_expect('clearance',jsonb_build_object('lease_id','f267e400-0000-4000-8000-000000000001','revision',rev,'exception_reason',''),'VACATING_OUTSTANDING_BALANCE');
 perform public.aqari_deposit_register(w,'refund','{"id":"f267e600-0000-4000-8000-000000000002","lease_id":"f267e400-0000-4000-8000-000000000001","amount":"50.000","on_date":"2026-01-31","method":"cash","reference":"","reason":"رد التأمين عند الإخلاء"}');
 r:=public.aqari_vacating_settlement(w,'clearance',jsonb_build_object('lease_id','f267e400-0000-4000-8000-000000000001','revision',rev,'exception_reason',''));
 if r#>>'{settlement,status}'<>'cleared' or r#>>'{settlement,clearance_no}' !~ '^CL-[0-9]{8}-[0-9]{8,}$' then raise exception 'VACATING_CLEARANCE_FAILED';end if;
 if r#>>'{settlement,balances,deposit_balance}'<>'0.000' or r#>>'{settlement,balances,rent_balance}'<>'0.000' then raise exception 'CLEARANCE_BALANCE_NOT_ZERO';end if;
 if r#>>'{settlement,clearance_snapshot,status}'<>'cleared' or r#>>'{settlement,clearance_snapshot,clearance_no}'<>r#>>'{settlement,clearance_no}' then raise exception 'CLEARANCE_SNAPSHOT_NOT_NORMALIZED';end if;
end $$;
rollback;
