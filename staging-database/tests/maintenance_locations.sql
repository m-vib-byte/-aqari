-- Synthetic transactional acceptance; local memory or independently verified test branch only.
-- Run after staff-property-scope.sql and maintenance-locations.sql. All fixture writes roll back.
begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('maintenance-location-manager@example.invalid','مدير اختبار الموقع','general_manager','aqari-v267-staging'),
 ('maintenance-location-staff@example.invalid','صيانة اختبار الموقع','property_manager','aqari-v267-staging'),
 ('maintenance-location-accountant@example.invalid','محاسب اختبار الموقع','accountant','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values
 ('76500000-0000-4000-8000-000000000001','maintenance-location-manager@example.invalid',now()),
 ('76500000-0000-4000-8000-000000000002','maintenance-location-staff@example.invalid',now()),
 ('76500000-0000-4000-8000-000000000003','maintenance-location-accountant@example.invalid',now());
select set_config('aqari.test.location.workspace',(select workspace_id::text from public.aqari_memberships where user_id='76500000-0000-4000-8000-000000000001' and is_active),true);
select set_config('request.jwt.claim.sub','76500000-0000-4000-8000-000000000001',true);
insert into public.aqari_workspaces(id,slug,name) values('76500000-0000-4000-8000-000000000099','maintenance-location-foreign-fixture','Other synthetic workspace');
do $$
declare w uuid;f integer;p uuid;u uuid;t uuid;l uuid;r uuid;
begin
 for f in 1..3 loop
  w:=case when f=3 then '76500000-0000-4000-8000-000000000099'::uuid else current_setting('aqari.test.location.workspace')::uuid end;
  p:=('76500000-0000-4000-8000-00000000010'||f)::uuid;u:=('76500000-0000-4000-8000-00000000020'||f)::uuid;
  t:=('76500000-0000-4000-8000-00000000030'||f)::uuid;l:=('76500000-0000-4000-8000-00000000040'||f)::uuid;r:=('76500000-0000-4000-8000-00000000050'||f)::uuid;
  insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values(p,w,'maintenance-location-property-'||f,'Location property '||f,'{"private":"property owner PII"}');
  insert into public.aqari_units(id,workspace_id,property_id,unit_no) values(u,w,p,'UNIT-'||f);
  insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile) values(t,w,'maintenance-location-tenant-'||f,'PRIVATE TENANT '||f,'76500000000'||f,'7650000'||f,'{"private":"tenant PII"}');
  insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot)
   values(l,w,'maintenance-location-lease-'||f,t,u,'PRIVATE-CONTRACT-'||f,current_date-1,current_date+30,987.654,456.789,'signed','{"private":"lease PII and financial snapshot","property":"stale snapshot location","unit":"stale unit"}');
  insert into public.aqari_maintenance_requests(id,workspace_id,lease_id,tenant_id,description) values(r,w,l,t,'Synthetic location request '||f);
 end loop;
 insert into private.aqari_staff_assignments(workspace_id,user_id,operational_role,property_ids,is_active,updated_by) values
  (current_setting('aqari.test.location.workspace')::uuid,'76500000-0000-4000-8000-000000000002','maintenance',array['76500000-0000-4000-8000-000000000101']::uuid[],true,'76500000-0000-4000-8000-000000000001'),
  (current_setting('aqari.test.location.workspace')::uuid,'76500000-0000-4000-8000-000000000003','accountant',array['76500000-0000-4000-8000-000000000101']::uuid[],true,'76500000-0000-4000-8000-000000000001');
end $$;
set local role authenticated;
-- Manager access also remains scoped to workspace; zero requested IDs returns zero rows.
do $$declare w uuid:=current_setting('aqari.test.location.workspace')::uuid;begin
 if (select count(*) from public.aqari_maintenance_locations(w,array['76500000-0000-4000-8000-000000000501','76500000-0000-4000-8000-000000000502']::uuid[]))<>2 then raise exception 'MANAGER_LOCATION_READ_FAILED';end if;
 if exists(select 1 from public.aqari_maintenance_locations(w,'{}')) then raise exception 'EMPTY_BATCH_RETURNED_ROWS';end if;
end $$;
select set_config('request.jwt.claim.sub','76500000-0000-4000-8000-000000000002',true);
do $$
declare w uuid:=current_setting('aqari.test.location.workspace')::uuid;payload jsonb;denied_id uuid;v bigint;
begin
 if exists(select 1 from public.aqari_leases where workspace_id=w) or exists(select 1 from public.aqari_tenants where workspace_id=w) then raise exception 'MAINTENANCE_PRIVATE_TABLES_EXPOSED';end if;
 select to_jsonb(x) into strict payload from public.aqari_maintenance_locations(w,array['76500000-0000-4000-8000-000000000501']::uuid[])x;
 if payload is distinct from '{"request_id":"76500000-0000-4000-8000-000000000501","property_name":"Location property 1","unit_no":"UNIT-1"}'::jsonb then raise exception 'LOCATION_OR_MINIMAL_COLUMNS_FAILED';end if;
 if payload::text ~ 'PRIVATE|987.654|456.789|snapshot' then raise exception 'PRIVATE_LOCATION_DATA_LEAK';end if;
 foreach denied_id in array array['76500000-0000-4000-8000-000000000502','76500000-0000-4000-8000-000000000503','76500000-0000-4000-8000-000000000599']::uuid[] loop
  begin perform public.aqari_maintenance_locations(w,array[denied_id]);raise exception 'UNAUTHORIZED_ID_ACCEPTED';exception when insufficient_privilege then if sqlerrm<>'ACCESS_DENIED' then raise;end if;end;
  begin perform public.aqari_maintenance_locations(w,array['76500000-0000-4000-8000-000000000501'::uuid,denied_id]);raise exception 'PARTIAL_BATCH_ACCEPTED';exception when insufficient_privilege then if sqlerrm<>'ACCESS_DENIED' then raise;end if;end;
 end loop;
 begin perform public.aqari_maintenance_locations('76500000-0000-4000-8000-000000000099',array['76500000-0000-4000-8000-000000000503']::uuid[]);raise exception 'FOREIGN_WORKSPACE_ACCEPTED';exception when insufficient_privilege then if sqlerrm<>'ACCESS_DENIED' then raise;end if;end;
 begin perform public.aqari_maintenance_locations(w,null);raise exception 'NULL_BATCH_ACCEPTED';exception when invalid_parameter_value then null;end;
 begin perform public.aqari_maintenance_locations(w,array[null]::uuid[]);raise exception 'NULL_ID_ACCEPTED';exception when invalid_parameter_value then null;end;
 begin perform public.aqari_maintenance_locations(w,array_fill('76500000-0000-4000-8000-000000000501'::uuid,array[51]));raise exception 'OVERSIZED_BATCH_ACCEPTED';exception when invalid_parameter_value then null;end;
 begin perform public.aqari_maintenance_locations(w,array_fill('76500000-0000-4000-8000-000000000501'::uuid,array[2]));raise exception 'DUPLICATE_ID_ACCEPTED';exception when invalid_parameter_value then null;end;
 update public.aqari_maintenance_requests set status='assigned',cost=7.125 where workspace_id=w and id='76500000-0000-4000-8000-000000000501' and revision=1 returning revision into v;
 if v<>2 or not exists(select 1 from public.aqari_maintenance_requests where id='76500000-0000-4000-8000-000000000501' and revision=2 and status='assigned' and cost=7.125) then raise exception 'MAINTENANCE_UPDATE_READBACK_FAILED';end if;
 if exists(select 1 from public.aqari_leases where workspace_id=w) then raise exception 'UPDATE_GRANTED_LEASE_ACCESS';end if;
end $$;
select set_config('request.jwt.claim.sub','76500000-0000-4000-8000-000000000003',true);
do $$begin
 begin perform public.aqari_maintenance_locations(current_setting('aqari.test.location.workspace')::uuid,array['76500000-0000-4000-8000-000000000501']::uuid[]);raise exception 'ACCOUNTANT_CEILING_ESCAPED';exception when insufficient_privilege then if sqlerrm<>'ACCESS_DENIED' then raise;end if;end;
end $$;
reset role;
-- Reassignment takes effect immediately, without changing the user's membership.
update private.aqari_staff_assignments set property_ids=array['76500000-0000-4000-8000-000000000102']::uuid[] where user_id='76500000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub','76500000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.location.workspace')::uuid;begin
 begin perform public.aqari_maintenance_locations(w,array['76500000-0000-4000-8000-000000000501']::uuid[]);raise exception 'OLD_ASSIGNMENT_RETAINED';exception when insufficient_privilege then if sqlerrm<>'ACCESS_DENIED' then raise;end if;end;
 if not exists(select 1 from public.aqari_maintenance_locations(w,array['76500000-0000-4000-8000-000000000502']::uuid[]) where property_name='Location property 2' and unit_no='UNIT-2') then raise exception 'NEW_ASSIGNMENT_MISSING';end if;
end $$;
reset role;
update private.aqari_staff_assignments set is_active=false where user_id='76500000-0000-4000-8000-000000000002';
set local role authenticated;
do $$begin
 begin perform public.aqari_maintenance_locations(current_setting('aqari.test.location.workspace')::uuid,array['76500000-0000-4000-8000-000000000502']::uuid[]);raise exception 'REVOKED_ACCESS_RETAINED';exception when insufficient_privilege then if sqlerrm<>'ACCESS_DENIED' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$begin
 begin perform public.aqari_maintenance_locations(current_setting('aqari.test.location.workspace')::uuid,'{}');raise exception 'MISSING_AUTH_ACCEPTED';exception when insufficient_privilege then if sqlerrm<>'ACCESS_DENIED' then raise;end if;end;
end $$;
reset role;
do $$begin
 if has_function_privilege('anon','public.aqari_maintenance_locations(uuid,uuid[])','execute') or has_function_privilege('anon','private.aqari_maintenance_locations(uuid,uuid[])','execute') then raise exception 'ANON_FUNCTION_ACCESS';end if;
 if (select prosecdef from pg_proc where oid='public.aqari_maintenance_locations(uuid,uuid[])'::regprocedure) then raise exception 'PUBLIC_RPC_IS_PRIVILEGED';end if;
 if not (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='private.aqari_maintenance_locations(uuid,uuid[])'::regprocedure) then raise exception 'PRIVATE_HELPER_HARDENING_MISSING';end if;
end $$;
rollback;
select 'PASS: minimal current location with contracts and tenants denied; workspace and assignment fences; uniform mixed/unknown request rejection; bounded batches; maintenance CAS update/readback unchanged; reassignment, revocation and missing-auth denial; invoker API and private helper ACL. Synthetic fixtures rolled back.' as result;
