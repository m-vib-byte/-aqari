-- Positive synthetic MFA fixture: include a current supported second-factor event.
-- Negative AAL1/expired-MFA cases and all production guards remain unchanged.
-- Synthetic isolated acceptance. No production data; every row is rolled back.
begin;
insert into public.aqari_workspaces(id,slug,name) values('77660000-0000-4000-8000-000000000099','commercial-grace-fixture','Commercial grace fixture');
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values('77660000-0000-4000-8000-000000000101','77660000-0000-4000-8000-000000000099','GRACE-P1','Grace property','{}');
insert into public.aqari_units(id,workspace_id,property_id,unit_no) values
 ('77660000-0000-4000-8000-000000000201','77660000-0000-4000-8000-000000000099','77660000-0000-4000-8000-000000000101','G-1'),
 ('77660000-0000-4000-8000-000000000202','77660000-0000-4000-8000-000000000099','77660000-0000-4000-8000-000000000101','G-2');
-- Establish verified readiness through the normal RPC. Keep the lease guard active.
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('commercial-grace-manager@example.invalid','مدير اختبار السماح','general_manager','commercial-grace-fixture');
insert into auth.users(id,email,email_confirmed_at) values
 ('77660000-0000-4000-8000-000000000001','commercial-grace-manager@example.invalid',now());
select set_config('request.jwt.claim.sub','77660000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
do $$declare r jsonb;begin
 for i in 1..2 loop
  r:=public.aqari_unit_readiness_register('77660000-0000-4000-8000-000000000099','record',jsonb_build_object(
   'id',gen_random_uuid(),'property_id','77660000-0000-4000-8000-000000000101','unit_no','G-'||i,'expected_revision',0,
   'state','ready','inspected_on','2026-01-01','source_ref','Synthetic grace fixture inspection','reason','Isolated test readiness'));
  if r->>'state'<>'ready' then raise exception 'GRACE_FIXTURE_UNIT_NOT_READY';end if;
 end loop;
end $$;
insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile) values
 ('77660000-0000-4000-8000-000000000301','77660000-0000-4000-8000-000000000099','GRACE-T1','Synthetic grace tenant 1','776600000001','77660001','{}'),
 ('77660000-0000-4000-8000-000000000302','77660000-0000-4000-8000-000000000099','GRACE-T2','Synthetic grace tenant 2','776600000002','77660002','{}');
insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot) values
 ('77660000-0000-4000-8000-000000000401','77660000-0000-4000-8000-000000000099','GRACE-L1','77660000-0000-4000-8000-000000000301','77660000-0000-4000-8000-000000000201','GRACE-L1','2026-01-01','2026-12-31',100,0,'draft','{}'),
 ('77660000-0000-4000-8000-000000000402','77660000-0000-4000-8000-000000000099','GRACE-L2','77660000-0000-4000-8000-000000000302','77660000-0000-4000-8000-000000000202','GRACE-L2','2026-01-01','2026-12-31',100,0,'draft','{}');
insert into private.aqari_commercial_terms(lease_id,workspace_id,grace_days,sales_percentage,cam_amount,permitted_activity,license_no,compliance_reference)
 values('77660000-0000-4000-8000-000000000401','77660000-0000-4000-8000-000000000099',0,5,0,'Synthetic trade','GRACE-LIC','Synthetic grace source');
do $$declare w uuid:='77660000-0000-4000-8000-000000000099';begin
 if private.aqari_effective_grace_days(w,'77660000-0000-4000-8000-000000000401',5)<>0 then raise exception 'ZERO_GRACE_NOT_PRESERVED';end if;
 if private.aqari_effective_grace_days(w,'77660000-0000-4000-8000-000000000402',5)<>5 then raise exception 'NON_COMMERCIAL_FALLBACK_CHANGED';end if;
 update private.aqari_commercial_terms set grace_days=12 where workspace_id=w and lease_id='77660000-0000-4000-8000-000000000401';
 if private.aqari_effective_grace_days(w,'77660000-0000-4000-8000-000000000401',5)<>12 then raise exception 'CONTRACT_GRACE_NOT_APPLIED';end if;
end $$;
rollback;
