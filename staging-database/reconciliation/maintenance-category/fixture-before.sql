-- LOCAL MEMORY ONLY. Synthetic fixtures for the captured Production schema.
begin;
do $$begin
 begin perform category_code from public.aqari_maintenance_requests;raise exception 'MISSING_COLUMN_NOT_REPRODUCED';
 exception when undefined_column then null;end;
end $$;
create temporary table category_security_before as select
 (select relacl::text from pg_class where oid='public.aqari_maintenance_requests'::regclass) as acl,
 (select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where schemaname='public' and tablename='aqari_maintenance_requests') as policies;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('category-manager@example.invalid','Synthetic category manager','general_manager','aqari-v267-staging'),
 ('category-viewer@example.invalid','Synthetic category viewer','viewer','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values
 ('77880000-0000-4000-8000-000000000001','category-manager@example.invalid',now()),
 ('77880000-0000-4000-8000-000000000002','category-viewer@example.invalid',now());
select set_config('category.test.workspace',(select workspace_id::text from public.aqari_memberships where user_id='77880000-0000-4000-8000-000000000001'),false);
select set_config('request.jwt.claim.sub','77880000-0000-4000-8000-000000000001',false);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,false);
do $$declare w uuid:=current_setting('category.test.workspace')::uuid;i int;p uuid;u uuid;t uuid;l uuid;begin
 for i in 1..2 loop
  p:=('77880000-0000-4000-8000-00000000010'||i)::uuid;u:=('77880000-0000-4000-8000-00000000020'||i)::uuid;
  t:=('77880000-0000-4000-8000-00000000030'||i)::uuid;l:=('77880000-0000-4000-8000-00000000040'||i)::uuid;
  insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values(p,w,'category-property-'||i,'Synthetic category property '||i,'{}');
  insert into public.aqari_units(id,workspace_id,property_id,unit_no) values(u,w,p,'CATEGORY-'||i);
  perform public.aqari_unit_readiness_register(w,'record',jsonb_build_object('id',gen_random_uuid(),'property_id',p,'unit_no','CATEGORY-'||i,'expected_revision',0,'state','ready','inspected_on',current_date,'source_ref','Synthetic category inspection','reason','Synthetic unit ready for category acceptance'));
  insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,email,civil_id,phone,profile) values(t,w,'category-tenant-'||i,'Synthetic category tenant '||i,'category-tenant-'||i||'@example.invalid','77880000000'||i,'7788000'||i,'{}');
  insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot) values(l,w,'category-lease-'||i,t,u,'CATEGORY-C-'||i,current_date-1,current_date+30,100,0,'signed','{}');
 end loop;
 insert into public.aqari_maintenance_requests(id,workspace_id,lease_id,tenant_id,description) values('77880000-0000-4000-8000-000000000501',w,'77880000-0000-4000-8000-000000000401','77880000-0000-4000-8000-000000000301','Historical synthetic request');
end $$;
insert into auth.users(id,email,email_confirmed_at) values('77880000-0000-4000-8000-000000000011','category-tenant-1@example.invalid',now());
create temporary table category_historical_before as select to_jsonb(r) as payload from public.aqari_maintenance_requests r where id='77880000-0000-4000-8000-000000000501';
commit;
