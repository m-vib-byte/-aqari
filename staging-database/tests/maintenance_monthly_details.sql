-- Positive synthetic MFA fixture: include a current supported second-factor event.
-- Negative AAL1/expired-MFA cases and all production guards remain unchanged.
-- Isolated synthetic acceptance only; no real paper, signature, provider or hosted storage claim.
-- Run after maintenance-workflow.sql. Every fixture write rolls back.
begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('monthly-report-manager@example.invalid','مدير اختبار الصيانة','general_manager','aqari-v267-staging'),
 ('monthly-report-staff@example.invalid','مسؤول صيانة اختبار','property_manager','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values
 ('76590000-0000-4000-8000-000000000001','monthly-report-manager@example.invalid',now()),
 ('76590000-0000-4000-8000-000000000002','monthly-report-staff@example.invalid',now());
select set_config('maintenance.test.workspace',(select workspace_id::text from public.aqari_memberships where user_id='76590000-0000-4000-8000-000000000001' and is_active),true);
select set_config('request.jwt.claim.sub','76590000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
insert into public.aqari_workspaces(id,slug,name) values('76590000-0000-4000-8000-000000000099','monthly-report-other','Other isolated workspace');
do $$declare w uuid:=current_setting('maintenance.test.workspace')::uuid;n integer;begin
 for n in 1..3 loop
  insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values(('76590000-0000-4000-8000-00000000010'||n)::uuid,case when n=3 then '76590000-0000-4000-8000-000000000099'::uuid else w end,'MAINT-P-'||n,'عقار اختبار الصيانة '||n,'{}');
  insert into private.aqari_vendors(id,workspace_id,name,civil_or_license_no,status,created_by)values(('76590000-0000-4000-8000-00000000020'||n)::uuid,w,'مورد اصطناعي '||n,'MAINT-VENDOR-'||n,case when n=3 then 'suspended' else 'active' end,auth.uid());
 end loop;
 insert into private.aqari_staff_assignments(workspace_id,user_id,operational_role,property_ids,is_active,updated_by) values(w,'76590000-0000-4000-8000-000000000002','maintenance',array['76590000-0000-4000-8000-000000000101']::uuid[],true,auth.uid());
 insert into private.aqari_vendor_contracts(id,workspace_id,vendor_id,property_id,contract_no,starts_on,ends_on,service_kind,amount,status,approved_by,approved_at) values
 ('76590000-0000-4000-8000-000000000301',w,'76590000-0000-4000-8000-000000000201','76590000-0000-4000-8000-000000000101','MAINT-CONTRACT-1','2026-01-01','2027-01-01','elevator',100,'active',auth.uid(),now()),
 ('76590000-0000-4000-8000-000000000302',w,'76590000-0000-4000-8000-000000000202','76590000-0000-4000-8000-000000000102','PRIVATE-OTHER-PROPERTY-CONTRACT','2026-01-01','2027-01-01','elevator',100,'active',auth.uid(),now());
end $$;
-- Only metadata fixtures for the existing verified-document guard.
create function pg_temp.maintenance_doc(p_ref text,p_mime text default 'image/jpeg') returns uuid language plpgsql security definer set search_path='' as $$
declare r record;begin
 select * into r from public.aqari_reserve_document(current_setting('maintenance.test.workspace')::uuid,'property_document','property',p_ref,'دليل إنجاز اصطناعي','fixture-document',p_mime,'{}');
 insert into storage.objects(bucket_id,name,metadata)values(r.storage_bucket,r.storage_path,jsonb_build_object('size',100,'mimetype',p_mime));
 perform public.aqari_finalize_document(r.document_id,100,p_mime,repeat('a',64));return r.document_id;
end $$;
select set_config('maintenance.test.gooddoc',pg_temp.maintenance_doc('MAINT-P-1')::text,true);
select set_config('maintenance.test.baddoc',pg_temp.maintenance_doc('MAINT-P-2')::text,true);
select set_config('maintenance.test.notphoto',pg_temp.maintenance_doc('MAINT-P-1','application/pdf')::text,true);

select set_config('maintenance.test.afterdoc',pg_temp.maintenance_doc('MAINT-P-1')::text,true);
do $$declare w uuid:=current_setting('maintenance.test.workspace')::uuid;begin
 insert into private.aqari_maintenance_plans(id,workspace_id,property_id,vendor_contract_id,asset_kind,title,frequency_days,next_due_on,created_by)
 values('76590000-0000-4000-8000-000000000401',w,'76590000-0000-4000-8000-000000000101','76590000-0000-4000-8000-000000000301','elevator','صيانة اختبارية',30,'2026-10-01',auth.uid());
 insert into private.aqari_property_maintenance_tasks(id,workspace_id,plan_id,property_id,due_on,task_no,status,assigned_vendor_id,assigned_by,description,cost,assigned_at)
 values('76590000-0000-4000-8000-000000000501',w,'76590000-0000-4000-8000-000000000401','76590000-0000-4000-8000-000000000101','2026-10-01','MONTHLY-TEST-1','assigned','76590000-0000-4000-8000-000000000201',auth.uid(),'اختبار سجل التفاصيل',7.125,now()-interval '3 days');
 insert into private.aqari_maintenance_evidence(workspace_id,property_id,task_id,document_id,stage,note,captured_by)
 values(w,'76590000-0000-4000-8000-000000000101','76590000-0000-4000-8000-000000000501',current_setting('maintenance.test.gooddoc')::uuid,'before','قبل الاختبار',auth.uid()),
 (w,'76590000-0000-4000-8000-000000000101','76590000-0000-4000-8000-000000000501',current_setting('maintenance.test.afterdoc')::uuid,'after','بعد الاختبار',auth.uid());
 update private.aqari_property_maintenance_tasks set status='in_progress',started_at=now()-interval '2 days' where id='76590000-0000-4000-8000-000000000501';
 update private.aqari_property_maintenance_tasks set status='completed',photo_document_ids=jsonb_build_array(current_setting('maintenance.test.afterdoc')),completion_document_id=current_setting('maintenance.test.notphoto')::uuid,completed_by=auth.uid(),completed_at=now()-interval '1 day' where id='76590000-0000-4000-8000-000000000501';
end $$;
create function pg_temp.monthly_values() returns jsonb language sql as $$
 select jsonb_build_object('task_id','76590000-0000-4000-8000-000000000501','task_revision',1,'revision',0,
 'inspection_kind','elevator','technician_name','فني اصطناعي','inspected_on','2026-09-12',
 'invoice_number','INV-TEST-1','invoice_document_id',current_setting('maintenance.test.notphoto'),
 'result_details','تم فحص التشغيل وتوثيق النتيجة الاختبارية','responsible_user_id','76590000-0000-4000-8000-000000000002',
 'planned_close_on','2026-09-15','urgent',true,'verify_result',false,'reason','تفاصيل قبول اصطناعية')
$$;
set local role authenticated;
do $$declare w uuid:=current_setting('maintenance.test.workspace')::uuid;p uuid:='76590000-0000-4000-8000-000000000101';r jsonb;v jsonb:=pg_temp.monthly_values();begin
 r:=public.aqari_maintenance_report_details(w,p,'save',v);
 if r#>>'{record,revision}'<>'1' or r#>>'{record,technician_name}'<>'فني اصطناعي' or r#>>'{record,verified_by}' is not null then raise exception 'SAVE_READBACK_FAILED';end if;
 r:=public.aqari_maintenance_report_details(w,p,'context','{}');
 if r#>>'{details,0,invoice_number}'<>'INV-TEST-1' or r#>>'{details,0,planned_close_on}'<>'2026-09-15' or r#>>'{details,0,urgent}'<>'true' then raise exception 'CONTEXT_READBACK_FAILED';end if;
 begin perform public.aqari_maintenance_report_details(w,p,'save',v);raise exception 'STALE_REVISION_ACCEPTED';exception when serialization_failure then null;end;
 v:=v||'{"revision":1}';
 begin perform public.aqari_maintenance_report_details(w,p,'save',v||'{"task_revision":0}');raise exception 'STALE_TASK_ACCEPTED';exception when serialization_failure then null;end;
 begin perform public.aqari_maintenance_report_details(w,p,'save',v||'{"responsible_user_id":"76590000-0000-4000-8000-000000000099"}');raise exception 'FOREIGN_RESPONSIBLE_ACCEPTED';exception when check_violation then null;end;
 begin perform public.aqari_maintenance_report_details(w,p,'save',v||jsonb_build_object('invoice_document_id',current_setting('maintenance.test.baddoc')));raise exception 'FOREIGN_INVOICE_ACCEPTED';exception when check_violation then null;end;
 begin perform public.aqari_maintenance_report_details(w,p,'save',v||'{"verify_result":true,"technician_name":""}');raise exception 'INCOMPLETE_VERIFICATION_ACCEPTED';exception when check_violation then null;end;
 begin perform public.aqari_maintenance_report_details(w,p,'save',v||jsonb_build_object('inspected_on',current_date+2));raise exception 'FUTURE_INSPECTION_ACCEPTED';exception when invalid_parameter_value then null;end;
 begin perform public.aqari_maintenance_report_details(w,'76590000-0000-4000-8000-000000000102','save',v);raise exception 'FOREIGN_TASK_ACCEPTED';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
 begin perform public.aqari_maintenance_report_details(w,p,'save',v);raise exception 'MFA_BYPASSED';exception when insufficient_privilege then if sqlerrm<>'MFA_REQUIRED' then raise;end if;end;
 perform set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()-interval '1 hour'))::bigint)))::text,true);
 begin perform public.aqari_maintenance_report_details(w,p,'save',v);raise exception 'EXPIRED_MFA_ACCEPTED';exception when insufficient_privilege then if sqlerrm<>'MFA_RECENT_REAUTH_REQUIRED' then raise;end if;end;
 perform set_config('request.jwt.claim.sub','76590000-0000-4000-8000-000000000002',true);
 begin perform public.aqari_maintenance_report_details(w,p,'save',v||'{"verify_result":true}');raise exception 'STAFF_VERIFICATION_ACCEPTED';exception when insufficient_privilege then if sqlerrm<>'MONTHLY_RESULT_MANAGER_REQUIRED' then raise;end if;end;
 begin perform public.aqari_maintenance_report_details(w,'76590000-0000-4000-8000-000000000102','context','{}');raise exception 'FOREIGN_PROPERTY_READ';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','76590000-0000-4000-8000-000000000001',true);
 perform set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
 r:=public.aqari_maintenance_report_details(w,p,'save',v||'{"verify_result":true}');
 if r#>>'{record,revision}'<>'2' or r#>>'{record,verified_by}' is null then raise exception 'VERIFIED_RESULT_NOT_SAVED';end if;
 begin execute 'delete from private.aqari_maintenance_report_details';raise exception 'DIRECT_DELETE_ALLOWED';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.aqari_maintenance_report_details(w,p,'context','{}');raise exception 'ANONYMOUS_READ';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$declare w uuid:=current_setting('maintenance.test.workspace')::uuid;n integer;begin
 select count(*) into n from private.aqari_maintenance_report_details where workspace_id=w and task_id='76590000-0000-4000-8000-000000000501';
 if n<>2 then raise exception 'DETAIL_HISTORY_OR_DUPLICATE_FAILED';end if;
 if not exists(select 1 from private.aqari_property_maintenance_tasks where id='76590000-0000-4000-8000-000000000501' and revision=1 and cost=7.125 and status='completed') then raise exception 'ORIGINAL_TASK_MUTATED';end if;
 begin update private.aqari_maintenance_report_details set technician_name='changed' where workspace_id=w;raise exception 'HISTORY_MUTABLE';exception when sqlstate '55000' then null;when check_violation then null;end;
end $$;

select set_config('request.jwt.claim.sub','76590000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
set local role authenticated;
do $$declare w uuid:=current_setting('maintenance.test.workspace')::uuid;r jsonb;begin
 r:=public.aqari_maintenance_monthly_archive(w,'76590000-0000-4000-8000-000000000101','context','{}');
 if r#>>'{schedule,enabled}'<>'false' or r->>'schedulerReady'<>'false' then raise exception 'SCHEDULER_FALSE_READY';end if;
 perform public.aqari_maintenance_monthly_archive(w,'76590000-0000-4000-8000-000000000101','save_schedule','{"revision":0,"enabled":true}');
 perform public.aqari_maintenance_monthly_archive(w,'76590000-0000-4000-8000-000000000102','save_schedule','{"revision":0,"enabled":true}');
 begin perform public.aqari_maintenance_monthly_archive(w,'76590000-0000-4000-8000-000000000101','save_schedule','{"revision":0,"enabled":false}');raise exception 'STALE_SCHEDULE_ACCEPTED';exception when serialization_failure then null;end;
 begin perform private.aqari_prepare_monthly_maintenance('2026-10-25T05:00:00Z');raise exception 'CLIENT_RAN_PRIVILEGED_SCHEDULER';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$declare r jsonb;begin
 r:=private.aqari_prepare_monthly_maintenance('2026-10-24T20:59:59Z');if r->>'created'<>'0' then raise exception 'EARLY_DAY_ISSUE';end if;
 r:=private.aqari_prepare_monthly_maintenance('2026-10-25T04:59:59Z');if r->>'created'<>'0' then raise exception 'EARLY_HOUR_ISSUE';end if;
 r:=private.aqari_prepare_monthly_maintenance('2026-10-25T05:00:00Z');if r->>'created'<>'2' or r->>'failed'<>'0' then raise exception 'SCHEDULE_ISSUE_FAILED: %',r;end if;
 r:=private.aqari_prepare_monthly_maintenance('2026-10-25T05:01:00Z');if r->>'created'<>'0' then raise exception 'DUPLICATE_MONTHLY_ISSUE';end if;
 r:=private.aqari_prepare_monthly_maintenance('2026-10-26T05:00:00Z');if r->>'created'<>'0' then raise exception 'WRONG_DAY_ISSUE';end if;
end $$;
set local role authenticated;
do $$declare w uuid:=current_setting('maintenance.test.workspace')::uuid;r jsonb;begin
 r:=public.aqari_maintenance_monthly_archive(w,'76590000-0000-4000-8000-000000000101','snapshot','{"month":"2026-10"}');
 if r#>>'{payload,data,tasks,0,cost}'<>'7.125' or r#>>'{payload,context,reportDetails,details,0,invoice_number}'<>'INV-TEST-1' then raise exception 'SNAPSHOT_SOURCE_MISMATCH';end if;
 r:=public.aqari_maintenance_monthly_archive(w,'76590000-0000-4000-8000-000000000102','snapshot','{"month":"2026-10"}');
 if jsonb_array_length(r#>'{payload,data,tasks}')<>0 then raise exception 'PROPERTY_SNAPSHOT_LEAK';end if;
 perform set_config('request.jwt.claim.sub','76590000-0000-4000-8000-000000000002',true);
 begin perform public.aqari_maintenance_monthly_archive(w,'76590000-0000-4000-8000-000000000101','snapshot','{"month":"2026-10"}');raise exception 'STAFF_ARCHIVE_ACCESS';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','76590000-0000-4000-8000-000000000001',true);
 perform public.aqari_maintenance_monthly_archive(w,'76590000-0000-4000-8000-000000000102','save_schedule','{"revision":1,"enabled":false}');
end $$;
reset role;
do $$declare w uuid:=current_setting('maintenance.test.workspace')::uuid;r jsonb;begin
 update private.aqari_property_maintenance_tasks set description='تغيير لاحق للاختبار' where id='76590000-0000-4000-8000-000000000501';
 if not exists(select 1 from private.aqari_maintenance_monthly_snapshots where workspace_id=w and due_month='2026-10-01' and property_id='76590000-0000-4000-8000-000000000101' and payload#>>'{data,tasks,0,description}'='اختبار سجل التفاصيل') then raise exception 'SNAPSHOT_NOT_FROZEN';end if;
 begin delete from private.aqari_maintenance_monthly_snapshots where workspace_id=w;raise exception 'SNAPSHOT_DELETE_ALLOWED';exception when sqlstate '55000' then null;when check_violation then null;end;
 r:=private.aqari_prepare_monthly_maintenance('2026-11-25T05:00:00Z');if r->>'created'<>'1' then raise exception 'DISABLED_SCHEDULE_ISSUED: %',r;end if;
end $$;
rollback;
