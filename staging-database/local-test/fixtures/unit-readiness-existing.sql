-- Local isolated runner only. Existing signed lease predates the new readiness guard.
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('readiness-manager@example.invalid','مدير اختبار الجاهزية','general_manager','aqari-v267-staging'),
 ('readiness-maintenance@example.invalid','صيانة اختبار الجاهزية','property_manager','aqari-v267-staging'),
 ('readiness-viewer@example.invalid','عرض اختبار الجاهزية','viewer','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values
 ('76620000-0000-4000-8000-000000000001','readiness-manager@example.invalid',now()),
 ('76620000-0000-4000-8000-000000000002','readiness-maintenance@example.invalid',now()),
 ('76620000-0000-4000-8000-000000000003','readiness-viewer@example.invalid',now());
select set_config('aqari.test.readiness.workspace',(select workspace_id::text from public.aqari_memberships where user_id='76620000-0000-4000-8000-000000000001' and is_active),false);
select set_config('request.jwt.claim.sub','76620000-0000-4000-8000-000000000001',false);
select set_config('request.jwt.claims','{"aal":"aal2"}',false);
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata)
 select ('76620000-0000-4000-8000-00000000010'||n)::uuid,current_setting('aqari.test.readiness.workspace')::uuid,'readiness-property-'||n,'عقار اختبار الجاهزية '||n,'{}' from generate_series(1,2)n;
insert into public.aqari_units(id,workspace_id,property_id,unit_no)
 values('76620000-0000-4000-8000-000000000201',current_setting('aqari.test.readiness.workspace')::uuid,'76620000-0000-4000-8000-000000000101','101');
insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile)
 values('76620000-0000-4000-8000-000000000301',current_setting('aqari.test.readiness.workspace')::uuid,'readiness-tenant','مستأجر اختبار الجاهزية','766200000001','76620001','{}');
insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot)
 values('76620000-0000-4000-8000-000000000401',current_setting('aqari.test.readiness.workspace')::uuid,'readiness-existing','76620000-0000-4000-8000-000000000301','76620000-0000-4000-8000-000000000201','READINESS-EXISTING','2025-01-01','2025-12-31',100,50,'signed','{"source":"preserved"}');
insert into private.aqari_staff_assignments(workspace_id,user_id,operational_role,property_ids,is_active,updated_by) values
 (current_setting('aqari.test.readiness.workspace')::uuid,'76620000-0000-4000-8000-000000000002','maintenance',array['76620000-0000-4000-8000-000000000101']::uuid[],true,'76620000-0000-4000-8000-000000000001'),
 (current_setting('aqari.test.readiness.workspace')::uuid,'76620000-0000-4000-8000-000000000003','viewer',array['76620000-0000-4000-8000-000000000101']::uuid[],true,'76620000-0000-4000-8000-000000000001');

-- A second workspace exercises the actual state RPC and receipt projection.
insert into public.aqari_workspaces(id,slug,name) values('76620000-0000-4000-8000-000000000900','readiness-legacy-save','Local readiness projection fixture');
insert into public.aqari_app_state(workspace_id,payload) values('76620000-0000-4000-8000-000000000900','{}');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values('readiness-projection@example.invalid','مدير حفظ اصطناعي','general_manager','readiness-legacy-save');
insert into auth.users(id,email,email_confirmed_at) values('76620000-0000-4000-8000-000000000004','readiness-projection@example.invalid',now());
select set_config('request.jwt.claim.sub','76620000-0000-4000-8000-000000000004',false);
set role authenticated;
do $$declare t jsonb;c jsonb;d jsonb;begin
 t:='{"id":"readiness-projection-t","nameAr":"مستأجر حفظ اصطناعي","nameEn":"Readiness Projection Tenant","civilId":"766200000004","passportNo":"READINESS-4","phone":"76620004","nationality":"اختبار","email":"readiness-tenant@example.invalid","attachments":[]}';
 c:=jsonb_build_object('id','readiness-projection-c','source','v267-cloud','detailsVersion',2,'tenantId',t->>'id','tenant',t->>'nameAr','tenantProfile',t,'property','عقار حفظ اصطناعي','unit','1','floor','الأول','contract_no','READINESS-PROJECTION','start_date',to_char(current_date-interval '1 month','YYYY-MM-DD'),'end_date',to_char(current_date+interval '1 year','YYYY-MM-DD'),'writtenOn',to_char(now() at time zone 'Asia/Kuwait','YYYY-MM-DD'),'receivedAt',to_char((now()-interval '1 hour') at time zone 'Asia/Kuwait','YYYY-MM-DD"T"HH24:MI:SS')||'+03:00','contractReceived','مستلم','evictionNotice','لم يُبلّغ','accountant','محاسب اختبار','contractRent',100,'discount',0,'rent',100,'deposit',0,'advance',0,'cleaningFee',0,'status','signed');
 d:=jsonb_build_object('properties',jsonb_build_array(jsonb_build_array(c->>'property')),'tenants',jsonb_build_array(jsonb_build_array(t->>'nameAr',c->>'property',t->>'phone','اختبار',t->>'id')),'tenantProfilesV267',jsonb_build_array(t),'contractsV202',jsonb_build_array(c),'leases',jsonb_build_array(jsonb_build_array(c->>'tenant',c->>'unit',100,c->>'end_date',c->>'id')),'tenantDirectoryV202',jsonb_build_array(jsonb_build_object('property',c->>'property','unit',c->>'unit','tenant',c->>'tenant','contractNo',c->>'contract_no','phone',t->>'phone','civilId',t->>'civilId','tenantProfileId',t->>'id')));
 perform public.aqari_save_state_v267('76620000-0000-4000-8000-000000000900',d,1);
end$$;
reset role;
select set_config('request.jwt.claim.sub','76620000-0000-4000-8000-000000000001',false);
