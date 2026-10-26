-- Full rollback-only atomic execution acceptance.
-- Storage rows below are synthetic metadata only; no files are uploaded.
-- Preview/isolated database only. Synthetic identities, no real sessions or data.
-- All fixture rows and package commits are rolled back. This is SQL acceptance,
-- not authenticated browser/API or production acceptance.
-- Run twice, with SET LOCAL aqari.execution_package_test_rent = '0' or '100'
-- immediately after BEGIN (default: zero). PDF bytes below are SQL-only fixtures.
begin;
set local aqari.execution_package_test_rent='100';
set local statement_timeout='20s';
select set_config('aqari.execution_package_test',jsonb_build_object(
 'workspace',gen_random_uuid(),'manager',gen_random_uuid(),'viewer',gen_random_uuid(),
 'property',gen_random_uuid(),'unit',gen_random_uuid(),'tenant',gen_random_uuid(),
 'lease',gen_random_uuid(),'settlement',gen_random_uuid(),'document',gen_random_uuid(),
 'package',gen_random_uuid(),'prepared',now(),'rent',coalesce(nullif(current_setting('aqari.execution_package_test_rent',true),''),'0')::numeric)::text,true);
do $$
declare t jsonb:=current_setting('aqari.execution_package_test')::jsonb; w uuid:=(t->>'workspace')::uuid; c jsonb; role_name text; u uuid;
begin
 t:=t||jsonb_build_object('tenant',md5(w::text||':tenant:package-tenant')::uuid,'lease',md5(w::text||':lease:package-lease')::uuid,'unit',md5((t->>'property')||':unit:PACKAGE-TEST')::uuid);
 perform set_config('aqari.execution_package_test',t::text,true);
 insert into public.aqari_workspaces(id,slug,name) values(w,'package-test-'||w::text,'Synthetic execution package test');
 foreach role_name in array array['manager','viewer'] loop
  u:=(t->>role_name)::uuid;
  insert into private.aqari_allowed_users(email,display_name,role,workspace_slug)
  values('package-test-'||u::text||'@example.invalid','Synthetic package '||role_name,
   (case role_name when 'manager' then 'general_manager' else 'viewer' end)::public.aqari_role,'package-test-'||w::text);
  insert into auth.users(id,email,email_confirmed_at) values(u,'package-test-'||u::text||'@example.invalid',now());
 end loop;
 perform set_config('request.jwt.claim.sub',t->>'manager',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',t->>'manager','role','authenticated')::text,true);
 insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata)
 values((t->>'property')::uuid,w,'package-property','Synthetic package property','{}');
 insert into public.aqari_units(id,workspace_id,property_id,unit_no)
 values((t->>'unit')::uuid,w,(t->>'property')::uuid,'PACKAGE-TEST');
 insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,email,profile)
 values((t->>'tenant')::uuid,w,'package-tenant','Synthetic package tenant','123456789019','55559002','package-tenant@example.invalid','{}');
 insert into private.aqari_unit_readiness(id,workspace_id,unit_id,revision,state,inspected_on,source_ref,reason,recorded_by)
 values(gen_random_uuid(),w,(t->>'unit')::uuid,1,'ready',current_date,'synthetic','Rollback fixture only',(t->>'manager')::uuid);
 c:=jsonb_build_object('detailsVersion',2,'paymentCycleMonths',1,'floor','1','accountant','Synthetic accountant','writtenOn',current_date::text,'contractReceived','لم يستلم','evictionNotice','غير محدد','id','package-lease','source','v267-cloud','status','signing','contract_no','PACKAGE-TEST',
 'tenant','Synthetic package tenant','property','Synthetic package property','unit','PACKAGE-TEST',
 'tenantId','package-tenant','start_date','2026-10-01','end_date','2027-09-30',
 'rentalTermsVersion',1,'rentAdjustments','[]'::jsonb,'freeMonthApproved',false,'rent',100,'contractRent',100,'discount',0,'deposit',0,'advance',0,'cleaningFee',0,
 'rentEntitlement',jsonb_build_object('version',1,'startDate','2026-10-10','firstPeriodPolicy','manual_first_period','manualFirstPeriodAmount',(t->>'rent')::numeric),
 'clauses',jsonb_build_array(jsonb_build_object('title','Synthetic clause','text','Synthetic contract for rollback acceptance only')));
 c:=c||jsonb_build_object('tenantProfile',jsonb_build_object('id','package-tenant','nameAr','Synthetic package tenant','nameEn','Synthetic package tenant','nationality','Synthetic','civilId','123456789019','passportNo','TEST123','phone','55559002','email','package-tenant@example.invalid'));
 insert into public.aqari_app_state(workspace_id,payload) values(w,jsonb_build_object('contractsV202',jsonb_build_array(c),'tenantProfilesV267',jsonb_build_array(jsonb_build_object('id','package-tenant','nameAr','Synthetic package tenant','nameEn','Synthetic package tenant','nationality','Synthetic','civilId','123456789019','passportNo','TEST123','phone','55559002','email','package-tenant@example.invalid'))));
 insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot)
 values((t->>'lease')::uuid,w,'package-lease',(t->>'tenant')::uuid,(t->>'unit')::uuid,'PACKAGE-TEST','2026-10-01','2027-09-30',100,0,'signing',c);
end $$;
do $$declare t jsonb:=current_setting('aqari.execution_package_test')::jsonb;begin
 if exists(select 1 from private.aqari_rent_due_periods where workspace_id=(t->>'workspace')::uuid) then raise exception 'TEST_SIGNING_MUST_NOT_POST_DUES';end if;
end $$;
do $$ declare t jsonb:=current_setting('aqari.execution_package_test')::jsonb;r jsonb;begin
r:=private.aqari_vacating_balances((t->>'workspace')::uuid,(t->>'lease')::uuid,'2026-10-05');
if (r->>'rent_due_total')::numeric<>0 then raise exception 'ENTITLEMENT_DUE_BEFORE_START';end if;
r:=private.aqari_vacating_balances((t->>'workspace')::uuid,(t->>'lease')::uuid,'2026-10-10');
if (r->>'rent_due_total')::numeric<>(t->>'rent')::numeric then raise exception 'ENTITLEMENT_DUE_ON_START';end if;
end $$;
rollback;
select 'PASS: audited new-contract entitlement is absent before its due date and present on the due date';
