-- CURRENT SCHEMA FIXTURES: metadata-only synthetic acceptance; rollback-only.
-- GENERATED ROLLBACK-ONLY HOSTED PREVIEW ACCEPTANCE. No schema/permission changes.
-- Source: staging-database/tests/work_order_request_link.sql
-- Primary workspace: 76f10000-0000-4000-8000-000000000005 / hosted-completion-work-order-request-link
-- Run this entire file as one query; never extract setup statements.
-- Positive synthetic MFA fixture: include a current supported second-factor event.
-- Negative AAL1/expired-MFA cases and all production guards remain unchanged.
-- Isolated PostgreSQL acceptance/rejection; all synthetic records roll back.
begin;
select set_config('hosted.test.workspace','76f10000-0000-4000-8000-000000000005',true);
insert into public.aqari_workspaces(id,slug,name) values('76f10000-0000-4000-8000-000000000005','hosted-completion-work-order-request-link','Synthetic rollback acceptance: work_order_request_link');
insert into public.aqari_app_state(workspace_id,payload) values('76f10000-0000-4000-8000-000000000005','{}');

insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('order-link-manager@example.invalid','مدير اختبار أمر الشغل','general_manager','hosted-completion-work-order-request-link'),
 ('order-link-accountant@example.invalid','محاسب اختبار أمر الشغل','accountant','hosted-completion-work-order-request-link');
insert into auth.users(id,email,email_confirmed_at) values
 ('76910000-0000-4000-8000-000000000001','order-link-manager@example.invalid',now()),
 ('76910000-0000-4000-8000-000000000002','order-link-accountant@example.invalid',now());
select set_config('order.test.workspace',(select workspace_id::text from public.aqari_memberships where user_id='76910000-0000-4000-8000-000000000001' and is_active),true);
select set_config('request.jwt.claim.sub','76910000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
insert into public.aqari_workspaces(id,slug,name) values('76910000-0000-4000-8000-000000000099','order-link-other','Other isolated workspace');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('order-link-other-manager@example.invalid','مدير مساحة اختبار مستقلة','general_manager','order-link-other');
insert into auth.users(id,email,email_confirmed_at) values
 ('76910000-0000-4000-8000-000000000003','order-link-other-manager@example.invalid',now());
do $$declare w uuid:=current_setting('order.test.workspace')::uuid;s uuid;n integer;begin
 for n in 1..3 loop
  s:=case when n=3 then '76910000-0000-4000-8000-000000000099'::uuid else w end;
  perform set_config('request.jwt.claim.sub',case when n=3 then '76910000-0000-4000-8000-000000000003' else '76910000-0000-4000-8000-000000000001' end,true);
  insert into public.aqari_app_state(workspace_id,payload) values(s,'{}') on conflict(workspace_id) do nothing;
  insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata)values(('76910000-0000-4000-8000-00000000010'||n)::uuid,s,'ORDER-P-'||n,'عقار أمر شغل '||n,'{}');
  insert into public.aqari_units(id,workspace_id,property_id,unit_no)values(('76910000-0000-4000-8000-00000000020'||n)::uuid,s,('76910000-0000-4000-8000-00000000010'||n)::uuid,'10'||n);
  -- Each workspace's real synthetic manager records readiness through the audited RPC.
  -- Keep the production readiness trigger in place when the completion suite is assembled.
  perform public.aqari_unit_readiness_register(s,'record',jsonb_build_object(
   'id',('76910000-0000-4000-8000-00000000090'||n)::uuid,'property_id',('76910000-0000-4000-8000-00000000010'||n)::uuid,
   'unit_no','10'||n,'expected_revision',0,'state','ready','inspected_on',current_date,
   'source_ref','Synthetic work-order fixture inspection','reason','Synthetic unit inspected before the lease'));
  insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile)values(('76910000-0000-4000-8000-00000000030'||n)::uuid,s,'ORDER-T-'||n,'مستأجر اصطناعي '||n,'90000000000'||n,'5000000'||n,'{}');
  insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot)values
   (('76910000-0000-4000-8000-00000000040'||n)::uuid,s,'ORDER-L-'||n,('76910000-0000-4000-8000-00000000030'||n)::uuid,('76910000-0000-4000-8000-00000000020'||n)::uuid,'ORDER-L-'||n,'2026-01-01','2027-01-01',100,0,'signed','{}');
  insert into public.aqari_maintenance_requests(id,workspace_id,lease_id,tenant_id,description,request_type)values
(('76910000-0000-4000-8000-00000000050'||n)::uuid,s,('76910000-0000-4000-8000-00000000040'||n)::uuid,('76910000-0000-4000-8000-00000000030'||n)::uuid,'بلاغ اصطناعي لأمر الشغل '||n,'plumbing');
 end loop;
 perform set_config('request.jwt.claim.sub','76910000-0000-4000-8000-000000000001',true);
 insert into public.aqari_maintenance_requests(id,workspace_id,lease_id,tenant_id,description,status,request_type)values
('76910000-0000-4000-8000-000000000504',w,'76910000-0000-4000-8000-000000000401','76910000-0000-4000-8000-000000000301','بلاغ مكتمل اصطناعي','completed','plumbing'),
('76910000-0000-4000-8000-000000000505',w,'76910000-0000-4000-8000-000000000401','76910000-0000-4000-8000-000000000301','بلاغ آخر اصطناعي','received','plumbing');
 insert into private.aqari_vendors(id,workspace_id,name,civil_or_license_no,status,created_by)values
 ('76910000-0000-4000-8000-000000000601',w,'مورد فعال','ORDER-V-1','active',auth.uid()),
 ('76910000-0000-4000-8000-000000000602',w,'مورد موقوف','ORDER-V-2','suspended',auth.uid()),
 ('76910000-0000-4000-8000-000000000603','76910000-0000-4000-8000-000000000099','مورد مساحة أخرى','ORDER-V-3','active',auth.uid());
 insert into private.aqari_vendor_contracts(id,workspace_id,vendor_id,property_id,contract_no,starts_on,ends_on,service_kind,amount,status,approved_by,approved_at)values
 ('76910000-0000-4000-8000-000000000701',w,'76910000-0000-4000-8000-000000000601','76910000-0000-4000-8000-000000000102','ORDER-OTHER-PROPERTY','2026-01-01','2099-01-01','plumbing',100,'active',auth.uid(),now());
end $$;


insert into private.aqari_work_orders(id,workspace_id,property_id,maintenance_request_id,vendor_id,order_no,description,approved_amount,created_by)
values('76910000-0000-4000-8000-000000000899',current_setting('order.test.workspace')::uuid,'76910000-0000-4000-8000-000000000101','76910000-0000-4000-8000-000000000501','76910000-0000-4000-8000-000000000601','HISTORICAL-ORDER','Synthetic historical linked work order',25.125,auth.uid());
create temp table maintenance_before as select id,to_jsonb(r) as original from public.aqari_maintenance_requests r;
create temp table work_orders_before as select id,to_jsonb(r) as original from private.aqari_work_orders r;
create temp table operations_before as select pg_get_functiondef('public.aqari_operations_register(uuid,text,text,jsonb)'::regprocedure) as definition;
commit;
