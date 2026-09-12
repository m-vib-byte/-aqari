-- GENERATED ROLLBACK-ONLY HOSTED PREVIEW ACCEPTANCE. No schema/permission changes.
-- Source: staging-database/tests/work_order_request_link.sql
-- Primary workspace: 76f10000-0000-4000-8000-000000000005 / hosted-completion-work-order-request-link
-- Run this entire file as one query; never extract setup statements.
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
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
insert into public.aqari_workspaces(id,slug,name) values('76910000-0000-4000-8000-000000000099','order-link-other','Other isolated workspace');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('order-link-other-manager@example.invalid','مدير مساحة اختبار مستقلة','general_manager','order-link-other');
insert into auth.users(id,email,email_confirmed_at) values
 ('76910000-0000-4000-8000-000000000003','order-link-other-manager@example.invalid',now());
do $$declare w uuid:=current_setting('order.test.workspace')::uuid;s uuid;n integer;begin
 for n in 1..3 loop
  s:=case when n=3 then '76910000-0000-4000-8000-000000000099'::uuid else w end;
  perform set_config('request.jwt.claim.sub',case when n=3 then '76910000-0000-4000-8000-000000000003' else '76910000-0000-4000-8000-000000000001' end,true);
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
  insert into public.aqari_maintenance_requests(id,workspace_id,lease_id,tenant_id,description)values
   (('76910000-0000-4000-8000-00000000050'||n)::uuid,s,('76910000-0000-4000-8000-00000000040'||n)::uuid,('76910000-0000-4000-8000-00000000030'||n)::uuid,'بلاغ اصطناعي لأمر الشغل '||n);
 end loop;
 perform set_config('request.jwt.claim.sub','76910000-0000-4000-8000-000000000001',true);
 insert into public.aqari_maintenance_requests(id,workspace_id,lease_id,tenant_id,description,status)values
 ('76910000-0000-4000-8000-000000000504',w,'76910000-0000-4000-8000-000000000401','76910000-0000-4000-8000-000000000301','بلاغ مكتمل اصطناعي','completed'),
 ('76910000-0000-4000-8000-000000000505',w,'76910000-0000-4000-8000-000000000401','76910000-0000-4000-8000-000000000301','بلاغ آخر اصطناعي','received');
 insert into private.aqari_vendors(id,workspace_id,name,civil_or_license_no,status,created_by)values
 ('76910000-0000-4000-8000-000000000601',w,'مورد فعال','ORDER-V-1','active',auth.uid()),
 ('76910000-0000-4000-8000-000000000602',w,'مورد موقوف','ORDER-V-2','suspended',auth.uid()),
 ('76910000-0000-4000-8000-000000000603','76910000-0000-4000-8000-000000000099','مورد مساحة أخرى','ORDER-V-3','active',auth.uid());
 insert into private.aqari_vendor_contracts(id,workspace_id,vendor_id,property_id,contract_no,starts_on,ends_on,service_kind,amount,status,approved_by,approved_at)values
 ('76910000-0000-4000-8000-000000000701',w,'76910000-0000-4000-8000-000000000601','76910000-0000-4000-8000-000000000102','ORDER-OTHER-PROPERTY','2026-01-01','2099-01-01','plumbing',100,'active',auth.uid(),now());
end $$;

set local role authenticated;
do $$declare w uuid:=current_setting('order.test.workspace')::uuid;r jsonb;s jsonb;bad jsonb;begin
 s:=public.aqari_operations_register(w,'work_orders','list');
 if jsonb_array_length(s->'requests')<>3 or exists(select 1 from jsonb_array_elements(s->'requests')x where x->>'id' in('76910000-0000-4000-8000-000000000503','76910000-0000-4000-8000-000000000504')) then raise exception 'REQUEST_LIST_SCOPE_OR_CLOSED_LEAK';end if;
 foreach bad in array array[
  (jsonb_build_object('id',('76910000-0000-4000-8000-00000000080'||(2))::uuid,'property_id','76910000-0000-4000-8000-000000000101','unit_id','76910000-0000-4000-8000-000000000201',
  'maintenance_request_id',('76910000-0000-4000-8000-00000000050'||(2))::uuid,'request_revision',1,'vendor_id','76910000-0000-4000-8000-000000000601','order_no','ORDER-LINK-'||(2),'description','إصلاح اصطناعي مرتبط بالبلاغ','approved_amount','25.125')),(jsonb_build_object('id',('76910000-0000-4000-8000-00000000080'||(2))::uuid,'property_id','76910000-0000-4000-8000-000000000101','unit_id','76910000-0000-4000-8000-000000000201',
  'maintenance_request_id',('76910000-0000-4000-8000-00000000050'||(3))::uuid,'request_revision',1,'vendor_id','76910000-0000-4000-8000-000000000601','order_no','ORDER-LINK-'||(2),'description','إصلاح اصطناعي مرتبط بالبلاغ','approved_amount','25.125')),(jsonb_build_object('id',('76910000-0000-4000-8000-00000000080'||(2))::uuid,'property_id','76910000-0000-4000-8000-000000000101','unit_id','76910000-0000-4000-8000-000000000201',
  'maintenance_request_id',('76910000-0000-4000-8000-00000000050'||(1))::uuid,'request_revision',1,'vendor_id','76910000-0000-4000-8000-000000000601','order_no','ORDER-LINK-'||(2),'description','إصلاح اصطناعي مرتبط بالبلاغ','approved_amount','25.125'))||'{"unit_id":"76910000-0000-4000-8000-000000000202"}',
  (jsonb_build_object('id',('76910000-0000-4000-8000-00000000080'||(2))::uuid,'property_id','76910000-0000-4000-8000-000000000101','unit_id','76910000-0000-4000-8000-000000000201',
  'maintenance_request_id',('76910000-0000-4000-8000-00000000050'||(1))::uuid,'request_revision',1,'vendor_id','76910000-0000-4000-8000-000000000601','order_no','ORDER-LINK-'||(2),'description','إصلاح اصطناعي مرتبط بالبلاغ','approved_amount','25.125'))||'{"vendor_contract_id":"76910000-0000-4000-8000-000000000701"}',(jsonb_build_object('id',('76910000-0000-4000-8000-00000000080'||(2))::uuid,'property_id','76910000-0000-4000-8000-000000000101','unit_id','76910000-0000-4000-8000-000000000201',
  'maintenance_request_id',('76910000-0000-4000-8000-00000000050'||(4))::uuid,'request_revision',1,'vendor_id','76910000-0000-4000-8000-000000000601','order_no','ORDER-LINK-'||(2),'description','إصلاح اصطناعي مرتبط بالبلاغ','approved_amount','25.125'))
 ] loop
  begin perform public.aqari_operations_register(w,'work_orders','create',bad);raise exception 'MISMATCH_OR_CLOSED_REQUEST_ACCEPTED';exception when check_violation then null;end;
 end loop;
 foreach bad in array array[(jsonb_build_object('id',('76910000-0000-4000-8000-00000000080'||(2))::uuid,'property_id','76910000-0000-4000-8000-000000000101','unit_id','76910000-0000-4000-8000-000000000201',
  'maintenance_request_id',('76910000-0000-4000-8000-00000000050'||(1))::uuid,'request_revision',1,'vendor_id','76910000-0000-4000-8000-000000000601','order_no','ORDER-LINK-'||(2),'description','إصلاح اصطناعي مرتبط بالبلاغ','approved_amount','25.125'))||'{"vendor_id":"76910000-0000-4000-8000-000000000602"}',(jsonb_build_object('id',('76910000-0000-4000-8000-00000000080'||(2))::uuid,'property_id','76910000-0000-4000-8000-000000000101','unit_id','76910000-0000-4000-8000-000000000201',
  'maintenance_request_id',('76910000-0000-4000-8000-00000000050'||(1))::uuid,'request_revision',1,'vendor_id','76910000-0000-4000-8000-000000000601','order_no','ORDER-LINK-'||(2),'description','إصلاح اصطناعي مرتبط بالبلاغ','approved_amount','25.125'))||'{"vendor_id":"76910000-0000-4000-8000-000000000603"}'] loop
  begin perform public.aqari_operations_register(w,'work_orders','create',bad);raise exception 'INVALID_VENDOR_ACCEPTED';exception when insufficient_privilege then null;end;
 end loop;
 begin perform public.aqari_operations_register(w,'work_orders','create',(jsonb_build_object('id',('76910000-0000-4000-8000-00000000080'||(2))::uuid,'property_id','76910000-0000-4000-8000-000000000101','unit_id','76910000-0000-4000-8000-000000000201',
  'maintenance_request_id',('76910000-0000-4000-8000-00000000050'||(1))::uuid,'request_revision',1,'vendor_id','76910000-0000-4000-8000-000000000601','order_no','ORDER-LINK-'||(2),'description','إصلاح اصطناعي مرتبط بالبلاغ','approved_amount','25.125'))||'{"request_revision":0}');raise exception 'STALE_REQUEST_ACCEPTED';exception when serialization_failure then null;end;
 r:=public.aqari_operations_register(w,'work_orders','create',(jsonb_build_object('id',('76910000-0000-4000-8000-00000000080'||(1))::uuid,'property_id','76910000-0000-4000-8000-000000000101','unit_id','76910000-0000-4000-8000-000000000201',
  'maintenance_request_id',('76910000-0000-4000-8000-00000000050'||(1))::uuid,'request_revision',1,'vendor_id','76910000-0000-4000-8000-000000000601','order_no','ORDER-LINK-'||(1),'description','إصلاح اصطناعي مرتبط بالبلاغ','approved_amount','25.125')));
 if r->>'maintenance_request_id'<>'76910000-0000-4000-8000-000000000501' or r->>'unit_id'<>'76910000-0000-4000-8000-000000000201' or r->'request_snapshot'->>'unit_no'<>'101' or r->>'vendor_id'<>'76910000-0000-4000-8000-000000000601' then raise exception 'REQUEST_LINK_NOT_SAVED';end if;
 s:=public.aqari_operations_register(w,'work_orders','list');
 if not exists(select 1 from jsonb_array_elements(s->'items')x where x->>'id'=r->>'id' and x->'request_snapshot'=r->'request_snapshot') or not exists(select 1 from jsonb_array_elements(s->'requests')x where x->>'id'='76910000-0000-4000-8000-000000000501' and x->>'work_order_id'=r->>'id') then raise exception 'REQUEST_LINK_NOT_READ_BACK';end if;
 begin perform public.aqari_operations_register(w,'work_orders','create',(jsonb_build_object('id',('76910000-0000-4000-8000-00000000080'||(2))::uuid,'property_id','76910000-0000-4000-8000-000000000101','unit_id','76910000-0000-4000-8000-000000000201',
  'maintenance_request_id',('76910000-0000-4000-8000-00000000050'||(1))::uuid,'request_revision',1,'vendor_id','76910000-0000-4000-8000-000000000601','order_no','ORDER-LINK-'||(2),'description','إصلاح اصطناعي مرتبط بالبلاغ','approved_amount','25.125')));raise exception 'DUPLICATE_ORDER_ACCEPTED';exception when unique_violation then if sqlerrm<>'REQUEST_ALREADY_HAS_WORK_ORDER' then raise;end if;end;
 r:=public.aqari_operations_register(w,'work_orders','status','{"id":"76910000-0000-4000-8000-000000000801","revision":1,"state":"approved","reason":"اعتماد اختبار"}');
 if r->>'status'<>'approved' or r->'request_snapshot'->>'unit_no'<>'101' then raise exception 'APPROVAL_LOST_REQUEST_LINK';end if;
 begin perform 1 from private.aqari_work_orders;raise exception 'DIRECT_PRIVATE_READ_ALLOWED';exception when insufficient_privilege then null;end;
 begin perform private.aqari_operations_register_base(w,'work_orders','create',(jsonb_build_object('id',('76910000-0000-4000-8000-00000000080'||(2))::uuid,'property_id','76910000-0000-4000-8000-000000000101','unit_id','76910000-0000-4000-8000-000000000201',
  'maintenance_request_id',('76910000-0000-4000-8000-00000000050'||(1))::uuid,'request_revision',1,'vendor_id','76910000-0000-4000-8000-000000000601','order_no','ORDER-LINK-'||(2),'description','إصلاح اصطناعي مرتبط بالبلاغ','approved_amount','25.125')));raise exception 'BASE_RPC_BYPASS';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 if not exists(select 1 from private.aqari_operations_audit a where a.entity_id='76910000-0000-4000-8000-000000000801' and a.domain='work_orders' and a.action='create'
  and a.after_value->>'maintenance_request_id'='76910000-0000-4000-8000-000000000501' and a.after_value->'request_snapshot'->>'unit_no'='101') then raise exception 'AUDIT_MISSING_REQUEST_LINK';end if;
 begin update private.aqari_work_orders set maintenance_request_id='76910000-0000-4000-8000-000000000505' where id='76910000-0000-4000-8000-000000000801' and workspace_id=current_setting('hosted.test.workspace')::uuid;raise exception 'LINK_REWRITTEN';exception when check_violation then null;end;
 if (select status from public.aqari_maintenance_requests where id='76910000-0000-4000-8000-000000000501')<>'received' then raise exception 'REQUEST_STATE_CHANGED_WITHOUT_WORKFLOW';end if;
 if has_function_privilege('anon','public.aqari_operations_register(uuid,text,text,jsonb)','execute') or has_function_privilege('authenticated','private.aqari_operations_register_base(uuid,text,text,jsonb)','execute') then raise exception 'UNSAFE_RPC_GRANTS';end if;
 if (select prosecdef from pg_proc where oid='public.aqari_operations_register(uuid,text,text,jsonb)'::regprocedure) then raise exception 'PUBLIC_DEFINER_WRAPPER';end if;
end $$;
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
do $$begin
 begin perform public.aqari_operations_register(current_setting('order.test.workspace')::uuid,'work_orders','list');raise exception 'UNAUTHENTICATED_ACCESS_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','76910000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
set local role authenticated;
do $$begin
 begin perform public.aqari_operations_register(current_setting('order.test.workspace')::uuid,'work_orders','create',(jsonb_build_object('id',('76910000-0000-4000-8000-00000000080'||(2))::uuid,'property_id','76910000-0000-4000-8000-000000000101','unit_id','76910000-0000-4000-8000-000000000201',
  'maintenance_request_id',('76910000-0000-4000-8000-00000000050'||(5))::uuid,'request_revision',1,'vendor_id','76910000-0000-4000-8000-000000000601','order_no','ORDER-LINK-'||(2),'description','إصلاح اصطناعي مرتبط بالبلاغ','approved_amount','25.125')));raise exception 'MFA_BYPASSED';exception when insufficient_privilege then if sqlerrm<>'MFA_REQUIRED' then raise;end if;end;
end $$;
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select set_config('request.jwt.claim.sub','76910000-0000-4000-8000-000000000002',true);
do $$begin
 begin perform public.aqari_operations_register(current_setting('order.test.workspace')::uuid,'work_orders','list');raise exception 'ACCOUNTANT_ACCESS_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS: request -> vendor work order, exact unit/property, readback, duplicate/closed/foreign/stale rejection, audit and role/MFA isolation';
