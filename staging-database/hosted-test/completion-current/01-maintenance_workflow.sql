-- CURRENT SCHEMA FIXTURES: metadata-only synthetic acceptance; rollback-only.
-- GENERATED ROLLBACK-ONLY HOSTED PREVIEW ACCEPTANCE. No schema/permission changes.
-- Source: staging-database/tests/maintenance_workflow.sql
-- Primary workspace: 76f10000-0000-4000-8000-000000000001 / hosted-completion-maintenance-workflow
-- Run this entire file as one query; never extract setup statements.
-- Positive synthetic MFA fixture: include a current supported second-factor event.
-- Negative AAL1/expired-MFA cases and all production guards remain unchanged.
-- Isolated synthetic acceptance only; no real paper, signature, provider or hosted storage claim.
-- Run after maintenance-workflow.sql. Every fixture write rolls back.
begin;
select set_config('hosted.test.workspace','76f10000-0000-4000-8000-000000000001',true);
insert into public.aqari_workspaces(id,slug,name) values('76f10000-0000-4000-8000-000000000001','hosted-completion-maintenance-workflow','Synthetic rollback acceptance: maintenance_workflow');
insert into public.aqari_app_state(workspace_id,payload) values('76f10000-0000-4000-8000-000000000001','{}');

insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('maintenance-flow-manager@example.invalid','مدير اختبار الصيانة','general_manager','hosted-completion-maintenance-workflow'),
 ('maintenance-flow-staff@example.invalid','مسؤول صيانة اختبار','property_manager','hosted-completion-maintenance-workflow');
insert into auth.users(id,email,email_confirmed_at) values
 ('76580000-0000-4000-8000-000000000001','maintenance-flow-manager@example.invalid',now()),
 ('76580000-0000-4000-8000-000000000002','maintenance-flow-staff@example.invalid',now());
select set_config('maintenance.test.workspace',(select workspace_id::text from public.aqari_memberships where user_id='76580000-0000-4000-8000-000000000001' and is_active),true);
select set_config('request.jwt.claim.sub','76580000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
insert into public.aqari_workspaces(id,slug,name) values('76580000-0000-4000-8000-000000000099','maintenance-flow-other','Other isolated workspace');
do $$declare w uuid:=current_setting('maintenance.test.workspace')::uuid;n integer;begin
 for n in 1..3 loop
  insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values(('76580000-0000-4000-8000-00000000010'||n)::uuid,case when n=3 then '76580000-0000-4000-8000-000000000099'::uuid else w end,'MAINT-P-'||n,'عقار اختبار الصيانة '||n,'{}');
  insert into private.aqari_vendors(id,workspace_id,name,civil_or_license_no,status,created_by)values(('76580000-0000-4000-8000-00000000020'||n)::uuid,w,'مورد اصطناعي '||n,'MAINT-VENDOR-'||n,case when n=3 then 'suspended' else 'active' end,auth.uid());
 end loop;
 insert into private.aqari_staff_assignments(workspace_id,user_id,operational_role,property_ids,is_active,updated_by) values(w,'76580000-0000-4000-8000-000000000002','maintenance',array['76580000-0000-4000-8000-000000000101']::uuid[],true,auth.uid());
 insert into private.aqari_vendor_contracts(id,workspace_id,vendor_id,property_id,contract_no,starts_on,ends_on,service_kind,amount,status,approved_by,approved_at) values
 ('76580000-0000-4000-8000-000000000301',w,'76580000-0000-4000-8000-000000000201','76580000-0000-4000-8000-000000000101','MAINT-CONTRACT-1','2026-01-01','2027-01-01','elevator',100,'active',auth.uid(),now()),
 ('76580000-0000-4000-8000-000000000302',w,'76580000-0000-4000-8000-000000000202','76580000-0000-4000-8000-000000000102','PRIVATE-OTHER-PROPERTY-CONTRACT','2026-01-01','2027-01-01','elevator',100,'active',auth.uid(),now());
end $$;
-- Only metadata fixtures for the existing verified-document guard.

do $hosted_doc$ declare reserved record;begin
select * into reserved from public.aqari_reserve_document(current_setting('maintenance.test.workspace')::uuid,'property_document','property','MAINT-P-1','دليل إنجاز اصطناعي','fixture-document','image/jpeg','{}');
insert into storage.objects(bucket_id,name,metadata)values(reserved.storage_bucket,reserved.storage_path,jsonb_build_object('size',100,'mimetype','image/jpeg'));
perform public.aqari_finalize_document(reserved.document_id,100,'image/jpeg',repeat('a',64));
perform set_config('maintenance.test.gooddoc',reserved.document_id::text,true);
end $hosted_doc$;
do $hosted_doc$ declare reserved record;begin
select * into reserved from public.aqari_reserve_document(current_setting('maintenance.test.workspace')::uuid,'property_document','property','MAINT-P-2','دليل إنجاز اصطناعي','fixture-document','image/jpeg','{}');
insert into storage.objects(bucket_id,name,metadata)values(reserved.storage_bucket,reserved.storage_path,jsonb_build_object('size',100,'mimetype','image/jpeg'));
perform public.aqari_finalize_document(reserved.document_id,100,'image/jpeg',repeat('a',64));
perform set_config('maintenance.test.baddoc',reserved.document_id::text,true);
end $hosted_doc$;
do $hosted_doc$ declare reserved record;begin
select * into reserved from public.aqari_reserve_document(current_setting('maintenance.test.workspace')::uuid,'property_document','property','MAINT-P-1','دليل إنجاز اصطناعي','fixture-document','application/pdf','{}');
insert into storage.objects(bucket_id,name,metadata)values(reserved.storage_bucket,reserved.storage_path,jsonb_build_object('size',100,'mimetype','application/pdf'));
perform public.aqari_finalize_document(reserved.document_id,100,'application/pdf',repeat('a',64));
perform set_config('maintenance.test.notphoto',reserved.document_id::text,true);
end $hosted_doc$;

set local role authenticated;
do $$declare w uuid:=current_setting('maintenance.test.workspace')::uuid;r jsonb;bad jsonb;begin
 r:=public.aqari_maintenance_plans(w,'save',(jsonb_build_object('id',('76580000-0000-4000-8000-00000000040'||(1))::uuid,'revision',0,'property_id',('76580000-0000-4000-8000-00000000010'||(1))::uuid,'asset_kind','elevator','title','صيانة المصعد الاختبارية','frequency_days',30,'next_due_on','2026-09-12','vendor_contract_id',case when (1) is not null then ('76580000-0000-4000-8000-00000000030'||(1))::uuid end,'warning_days',jsonb_build_array(90,60,30),'is_active',true)));
 if r->>'revision'<>'1' or r->>'vendor_contract_id'<>'76580000-0000-4000-8000-000000000301' then raise exception 'PLAN_LINK_FAILED';end if;
 perform public.aqari_maintenance_plans(w,'save',(jsonb_build_object('id',('76580000-0000-4000-8000-00000000040'||(2))::uuid,'revision',0,'property_id',('76580000-0000-4000-8000-00000000010'||(2))::uuid,'asset_kind','elevator','title','صيانة المصعد الاختبارية','frequency_days',30,'next_due_on','2026-09-12','vendor_contract_id',case when (2) is not null then ('76580000-0000-4000-8000-00000000030'||(2))::uuid end,'warning_days',jsonb_build_array(90,60,30),'is_active',true)));
 perform public.aqari_maintenance_plans(w,'save',(jsonb_build_object('id',('76580000-0000-4000-8000-00000000040'||(3))::uuid,'revision',0,'property_id',('76580000-0000-4000-8000-00000000010'||(1))::uuid,'asset_kind','elevator','title','صيانة المصعد الاختبارية','frequency_days',30,'next_due_on','2026-09-12','vendor_contract_id',case when (null) is not null then ('76580000-0000-4000-8000-00000000030'||(null))::uuid end,'warning_days',jsonb_build_array(90,60,30),'is_active',true)));
 foreach bad in array array[(jsonb_build_object('id',('76580000-0000-4000-8000-00000000040'||(4))::uuid,'revision',0,'property_id',('76580000-0000-4000-8000-00000000010'||(1))::uuid,'asset_kind','elevator','title','صيانة المصعد الاختبارية','frequency_days',30,'next_due_on','2026-09-12','vendor_contract_id',case when (2) is not null then ('76580000-0000-4000-8000-00000000030'||(2))::uuid end,'warning_days',jsonb_build_array(90,60,30),'is_active',true)),(jsonb_build_object('id',('76580000-0000-4000-8000-00000000040'||(4))::uuid,'revision',0,'property_id',('76580000-0000-4000-8000-00000000010'||(1))::uuid,'asset_kind','elevator','title','صيانة المصعد الاختبارية','frequency_days',30,'next_due_on','2026-09-12','vendor_contract_id',case when (1) is not null then ('76580000-0000-4000-8000-00000000030'||(1))::uuid end,'warning_days',jsonb_build_array(90,60,30),'is_active',true))||'{"next_due_on":"2028-01-01"}'] loop
  begin perform public.aqari_maintenance_plans(w,'save',bad);raise exception 'INVALID_CONTRACT_ACCEPTED';exception when check_violation then null;end;
 end loop;
 begin perform public.aqari_maintenance_plans(w,'save',(jsonb_build_object('id',('76580000-0000-4000-8000-00000000040'||(1))::uuid,'revision',0,'property_id',('76580000-0000-4000-8000-00000000010'||(2))::uuid,'asset_kind','elevator','title','صيانة المصعد الاختبارية','frequency_days',30,'next_due_on','2026-09-12','vendor_contract_id',case when (2) is not null then ('76580000-0000-4000-8000-00000000030'||(2))::uuid end,'warning_days',jsonb_build_array(90,60,30),'is_active',true))||'{"revision":1}');raise exception 'PLAN_MOVED';exception when check_violation then null;end;
 r:=public.aqari_maintenance_plans(w,'generate_task','{"id":"76580000-0000-4000-8000-000000000401","task_id":"76580000-0000-4000-8000-000000000501","task_no":"MAINT-TASK-1"}');
 if r->>'assigned_vendor_id'<>'76580000-0000-4000-8000-000000000201' or r->>'status'<>'assigned' or r->>'assigned_at' is null or r->>'assigned_by' is null then raise exception 'AUTOMATIC_CONTRACT_ASSIGNMENT_FAILED';end if;
 begin perform public.aqari_maintenance_plans(w,'generate_task','{"id":"76580000-0000-4000-8000-000000000401","task_id":"76580000-0000-4000-8000-000000000599","task_no":"DUPLICATE"}');raise exception 'DUPLICATE_CREATED';exception when unique_violation then null;end;
 begin perform public.aqari_maintenance_plans(w,'save',(jsonb_build_object('id',('76580000-0000-4000-8000-00000000040'||(1))::uuid,'revision',0,'property_id',('76580000-0000-4000-8000-00000000010'||(1))::uuid,'asset_kind','elevator','title','صيانة المصعد الاختبارية','frequency_days',30,'next_due_on','2026-09-12','vendor_contract_id',case when (1) is not null then ('76580000-0000-4000-8000-00000000030'||(1))::uuid end,'warning_days',jsonb_build_array(90,60,30),'is_active',true))||'{"revision":1,"next_due_on":"2026-10-12"}');raise exception 'OPEN_SCHEDULE_CHANGED';exception when check_violation then null;end;
 begin perform public.aqari_maintenance_plans(w,'assign_task','{"id":"76580000-0000-4000-8000-000000000501","revision":1,"vendor_id":"76580000-0000-4000-8000-000000000202","reason":"تكليف مخالف للعقد"}');raise exception 'CONTRACT_VENDOR_MISMATCH_ACCEPTED';exception when check_violation then null;end;
 begin perform public.aqari_maintenance_plans(w,'complete_task','{"id":"76580000-0000-4000-8000-000000000501","revision":1}');raise exception 'UNSTARTED_COMPLETED';exception when check_violation then if sqlerrm<>'TASK_EXECUTION_REQUIRED' then raise;end if;end;
 perform public.aqari_maintenance_evidence(w,'76580000-0000-4000-8000-000000000101','add',jsonb_build_object('taskId','76580000-0000-4000-8000-000000000501','documentId',current_setting('maintenance.test.gooddoc'),'stage','before','reason','Synthetic before evidence'));
 r:=public.aqari_maintenance_plans(w,'start_task','{"id":"76580000-0000-4000-8000-000000000501","revision":1,"reason":"بدء التنفيذ المثبت"}');
 perform public.aqari_maintenance_evidence(w,'76580000-0000-4000-8000-000000000101','add',jsonb_build_object('taskId','76580000-0000-4000-8000-000000000501','documentId',current_setting('maintenance.test.gooddoc'),'stage','after','reason','Synthetic after evidence'));
 if r->>'revision'<>'2' or r->>'status'<>'in_progress' or r->>'started_at' is null then raise exception 'START_FAILED';end if;
 begin perform public.aqari_maintenance_plans(w,'start_task','{"id":"76580000-0000-4000-8000-000000000501","revision":1,"reason":"إعادة متأخرة"}');raise exception 'STALE_REVISION_ACCEPTED';exception when serialization_failure then null;end;
 bad:=jsonb_build_object('id','76580000-0000-4000-8000-000000000501','revision',2,'completion_document_id',current_setting('maintenance.test.gooddoc'),'photo_document_ids',jsonb_build_array(current_setting('maintenance.test.baddoc')),'cost','25.125','reason','إنجاز صيانة اختبارية');
 begin perform public.aqari_maintenance_plans(w,'complete_task',bad);raise exception 'FOREIGN_PROPERTY_PHOTO_ACCEPTED';exception when check_violation then if sqlerrm<>'COMPLETION_PHOTO_NOT_VERIFIED' then raise;end if;end;
 begin perform public.aqari_maintenance_plans(w,'complete_task',bad||jsonb_build_object('photo_document_ids',jsonb_build_array(current_setting('maintenance.test.notphoto'))));raise exception 'PDF_ACCEPTED_AS_PHOTO';exception when check_violation then if sqlerrm<>'COMPLETION_PHOTO_NOT_VERIFIED' then raise;end if;end;
 r:=public.aqari_maintenance_plans(w,'complete_task',bad||jsonb_build_object('photo_document_ids',jsonb_build_array(current_setting('maintenance.test.gooddoc'))));
 if r->>'status'<>'completed' or r->>'cost'<>'25.125' or r->>'next_due_on'<>'2026-10-12' then raise exception 'COMPLETION_OR_NEXT_CYCLE_FAILED';end if;
 if not exists(select 1 from jsonb_array_elements(public.aqari_maintenance_plans(w,'list')->'plans')p where p->>'id'='76580000-0000-4000-8000-000000000401' and p->>'revision'='2' and p->>'next_due_on'='2026-10-12') then raise exception 'NEXT_CYCLE_NOT_READ_BACK';end if;
 begin perform public.aqari_maintenance_plans(w,'complete_task',bad);raise exception 'DUPLICATE_COMPLETION_ACCEPTED';exception when serialization_failure then null;end;
 -- A second occurrence is persistent and independent of the first.
 r:=public.aqari_maintenance_plans(w,'generate_task','{"id":"76580000-0000-4000-8000-000000000401","task_id":"76580000-0000-4000-8000-000000000502","task_no":"MAINT-TASK-2"}');
 if r->>'due_on'<>'2026-10-12' then raise exception 'RECURRENCE_WRONG_DATE';end if;
 r:=public.aqari_maintenance_plans(w,'cancel_task','{"id":"76580000-0000-4000-8000-000000000502","revision":1,"reason":"توقف الأصل للمراجعة"}');
 if r->>'status'<>'cancelled' or r->>'cancellation_reason'<>'توقف الأصل للمراجعة' or r->>'cancelled_by' is null then raise exception 'CANCELLATION_NOT_SAVED';end if;
 r:=public.aqari_maintenance_plans(w,'save',(jsonb_build_object('id',('76580000-0000-4000-8000-00000000040'||(1))::uuid,'revision',0,'property_id',('76580000-0000-4000-8000-00000000010'||(1))::uuid,'asset_kind','elevator','title','صيانة المصعد الاختبارية','frequency_days',30,'next_due_on','2026-09-12','vendor_contract_id',case when (1) is not null then ('76580000-0000-4000-8000-00000000030'||(1))::uuid end,'warning_days',jsonb_build_array(90,60,30),'is_active',true))||'{"revision":2,"next_due_on":"2026-10-12","is_active":false}');
 if r->>'is_active'<>'false' or r->>'revision'<>'3' then raise exception 'PLAN_PAUSE_FAILED';end if;
 begin perform public.aqari_maintenance_plans(w,'generate_task','{"id":"76580000-0000-4000-8000-000000000401","task_id":"76580000-0000-4000-8000-000000000598","task_no":"PAUSED"}');raise exception 'PAUSED_PLAN_GENERATED';exception when insufficient_privilege then null;end;
 perform public.aqari_maintenance_plans(w,'generate_task','{"id":"76580000-0000-4000-8000-000000000403","task_id":"76580000-0000-4000-8000-000000000503","task_no":"MAINT-UNASSIGNED"}');
 begin perform public.aqari_maintenance_plans(w,'start_task','{"id":"76580000-0000-4000-8000-000000000503","revision":1,"reason":"بدون تكليف"}');raise exception 'UNASSIGNED_STARTED';exception when check_violation then null;end;
 begin perform public.aqari_maintenance_plans(w,'assign_task','{"id":"76580000-0000-4000-8000-000000000503","revision":1,"vendor_id":"76580000-0000-4000-8000-000000000203","reason":"مورد موقوف"}');raise exception 'SUSPENDED_VENDOR_ASSIGNED';exception when check_violation then null;end;
 r:=public.aqari_maintenance_plans(w,'assign_task','{"id":"76580000-0000-4000-8000-000000000503","revision":1,"vendor_id":"76580000-0000-4000-8000-000000000202","reason":"تكليف مباشر محفوظ"}');
 if r->>'status'<>'assigned' or r->>'revision'<>'2' then raise exception 'MANUAL_ASSIGNMENT_FAILED';end if;
end $$;
reset role;
-- Make a lease alert and out-of-assignment maintenance alert to detect metadata leakage.
insert into private.aqari_notification_deliveries(id,workspace_id,kind,aggregate_id,recipient_id,channel,scheduled_for,idempotency_key) values
 ('76580000-0000-4000-8000-000000000601',current_setting('maintenance.test.workspace')::uuid,'lease_expiry','PRIVATE-LEASE-ID','76580000-0000-4000-8000-000000000001','email',now(),'maintenance-test-private-lease'),
 ('76580000-0000-4000-8000-000000000602',current_setting('maintenance.test.workspace')::uuid,'maintenance_due','76580000-0000-4000-8000-000000000402','76580000-0000-4000-8000-000000000001','push',now(),'maintenance-test-other-property'),
 ('76580000-0000-4000-8000-000000000603',current_setting('maintenance.test.workspace')::uuid,'maintenance_due','76580000-0000-4000-8000-000000000401','76580000-0000-4000-8000-000000000001','push',now(),'maintenance-test-own-property');
select set_config('request.jwt.claim.sub','76580000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$declare w uuid:=current_setting('maintenance.test.workspace')::uuid;s jsonb;begin
 s:=public.aqari_maintenance_plans(w,'list');
 if s->>'workflow_version'<>'2' or jsonb_array_length(s->'documents')<>0 or jsonb_array_length(s->'plans')<>2 or jsonb_array_length(s->'alerts')<>1 or jsonb_array_length(s->'contracts')<>1 or s::text like '%PRIVATE-LEASE%' or s::text like '%PRIVATE-OTHER-PROPERTY%' then raise exception 'STAFF_SCOPE_LEAK';end if;
 -- Known plan ID from another property cannot be pulled into the staff member's property.
 begin perform public.aqari_maintenance_plans(w,'save',(jsonb_build_object('id',('76580000-0000-4000-8000-00000000040'||(2))::uuid,'revision',0,'property_id',('76580000-0000-4000-8000-00000000010'||(1))::uuid,'asset_kind','elevator','title','صيانة المصعد الاختبارية','frequency_days',30,'next_due_on','2026-09-12','vendor_contract_id',case when (1) is not null then ('76580000-0000-4000-8000-00000000030'||(1))::uuid end,'warning_days',jsonb_build_array(90,60,30),'is_active',true))||'{"revision":1}');raise exception 'OUT_OF_SCOPE_PLAN_HIJACKED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_maintenance_plans(w,'save',(jsonb_build_object('id',('76580000-0000-4000-8000-00000000040'||(4))::uuid,'revision',0,'property_id',('76580000-0000-4000-8000-00000000010'||(3))::uuid,'asset_kind','elevator','title','صيانة المصعد الاختبارية','frequency_days',30,'next_due_on','2026-09-12','vendor_contract_id',case when (null) is not null then ('76580000-0000-4000-8000-00000000030'||(null))::uuid end,'warning_days',jsonb_build_array(90,60,30),'is_active',true)));raise exception 'OTHER_WORKSPACE_ACCEPTED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_maintenance_plans(w,'prepare_alerts');raise exception 'STAFF_MANAGER_ALERTS_ALLOWED';exception when insufficient_privilege then null;end;
 begin perform 1 from private.aqari_property_maintenance_tasks;raise exception 'PRIVATE_TABLE_EXPOSED';exception when insufficient_privilege then null;end;
end $$;
reset role;
update private.aqari_staff_assignments set property_ids=array['76580000-0000-4000-8000-000000000102']::uuid[] where user_id='76580000-0000-4000-8000-000000000002' and workspace_id=current_setting('hosted.test.workspace')::uuid;
set local role authenticated;
do $$declare w uuid:=current_setting('maintenance.test.workspace')::uuid;begin
 if jsonb_array_length(public.aqari_maintenance_plans(w,'list')->'plans')<>1 then raise exception 'REASSIGNMENT_NOT_EFFECTIVE';end if;
 begin perform public.aqari_maintenance_plans(w,'start_task','{"id":"76580000-0000-4000-8000-000000000503","revision":2,"reason":"صلاحية قديمة"}');raise exception 'REVOKED_PROPERTY_WRITABLE';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 if not exists(select 1 from private.aqari_operations_audit where domain='maintenance_plans' and action='assign_task' and after_value->>'assigned_vendor_id'='76580000-0000-4000-8000-000000000202') then raise exception 'ASSIGNMENT_AUDIT_MISSING';end if;
 if (select count(*) from private.aqari_property_maintenance_tasks where plan_id='76580000-0000-4000-8000-000000000401')<>2 then raise exception 'TASK_HISTORY_LOST';end if;
 if (select prosecdef from pg_proc where oid='public.aqari_maintenance_plans(uuid,text,jsonb)'::regprocedure) then raise exception 'PRIVILEGED_PUBLIC_WRAPPER';end if;
 if has_function_privilege('anon','private.aqari_maintenance_workflow(uuid,text,jsonb)','EXECUTE') or has_function_privilege('anon','public.aqari_maintenance_plans(uuid,text,jsonb)','EXECUTE') then raise exception 'ANONYMOUS_ACCESS';end if;
end $$;
select set_config('request.jwt.claim.sub','76580000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
set local role authenticated;
do $$begin
 begin perform public.aqari_maintenance_plans(current_setting('maintenance.test.workspace')::uuid,'save',(jsonb_build_object('id',('76580000-0000-4000-8000-00000000040'||(4))::uuid,'revision',0,'property_id',('76580000-0000-4000-8000-00000000010'||(1))::uuid,'asset_kind','elevator','title','صيانة المصعد الاختبارية','frequency_days',30,'next_due_on','2026-09-12','vendor_contract_id',case when (null) is not null then ('76580000-0000-4000-8000-00000000030'||(null))::uuid end,'warning_days',jsonb_build_array(90,60,30),'is_active',true)));raise exception 'MFA_BYPASSED';exception when insufficient_privilege then if sqlerrm<>'MFA_REQUIRED' then raise;end if;end;
end $$;
reset role;
rollback;
select 'PASS maintenance workflow: contract/property/date/vendor fences; plan edit/pause; recurring task assignment/start/completion/cancellation; exact revision and documented evidence; next due date; no duplicates or history deletion; scoped readback, reassignment, private API/table ACL and MFA.' as result;
