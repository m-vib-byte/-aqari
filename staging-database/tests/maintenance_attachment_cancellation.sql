-- Positive synthetic MFA fixture: include a current supported second-factor event.
-- Negative AAL1/expired-MFA cases and all production guards remain unchanged.
-- Synthetic acceptance against PostgreSQL RLS/RPC. Every fixture write rolls back.
begin;
insert into public.aqari_workspaces(id,slug,name) values('77ca0000-0000-4000-8000-000000000090','maintenance-cancellation-rollback-test','Synthetic maintenance cancellation acceptance');
insert into public.aqari_app_state(workspace_id,payload) values('77ca0000-0000-4000-8000-000000000090','{}');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('cancel-attachment-manager@example.invalid','Attachment manager','general_manager','maintenance-cancellation-rollback-test'),
 ('cancel-attachment-staff@example.invalid','Attachment staff','property_manager','maintenance-cancellation-rollback-test'),
 ('cancel-attachment-accountant@example.invalid','Attachment accountant','accountant','maintenance-cancellation-rollback-test');
insert into auth.users(id,email,email_confirmed_at) values
 ('77ca0000-0000-4000-8000-000000000001','cancel-attachment-manager@example.invalid',now()),
 ('77ca0000-0000-4000-8000-000000000002','cancel-attachment-staff@example.invalid',now()),
 ('77ca0000-0000-4000-8000-000000000003','cancel-attachment-accountant@example.invalid',now());
select set_config('aqari.test.cancel.workspace',(select workspace_id::text from public.aqari_memberships where user_id='77ca0000-0000-4000-8000-000000000001' and is_active),true);
select set_config('request.jwt.claim.sub','77ca0000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
do $$declare w uuid:=current_setting('aqari.test.cancel.workspace')::uuid;i integer;p uuid;t uuid;u uuid;l uuid;begin
 for i in 1..2 loop insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values(('77ca0000-0000-4000-8000-00000000010'||i)::uuid,w,'cancel-attachment-prop-'||i,'Synthetic property '||i,'{}');end loop;
 for i in 1..3 loop
  p:=case when i=3 then '77ca0000-0000-4000-8000-000000000102'::uuid else '77ca0000-0000-4000-8000-000000000101'::uuid end;
  t:=('77ca0000-0000-4000-8000-00000000030'||i)::uuid;u:=('77ca0000-0000-4000-8000-00000000020'||i)::uuid;l:=('77ca0000-0000-4000-8000-00000000040'||i)::uuid;
  insert into public.aqari_units(id,workspace_id,property_id,unit_no) values(u,w,p,'ATTACH-'||i);
  -- Use the audited readiness RPC before the signed lease; never bypass its
  -- trigger or insert directly into the immutable readiness history.
  perform public.aqari_unit_readiness_register(w,'record',jsonb_build_object(
   'id',('77ca0000-0000-4000-8000-00000000070'||i)::uuid,'property_id',p,'unit_no','ATTACH-'||i,
   'expected_revision',0,'state','ready','inspected_on',current_date,
   'source_ref','Synthetic attachment fixture inspection','reason','Synthetic unit inspected before the lease'));
  insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,email,civil_id,phone,profile) values(t,w,'cancel-attachment-tenant-'||i,'Synthetic tenant '||i,'cancel-attachment-tenant-'||i||'@example.invalid','77900000000'||i,'7690000'||i,'{}');
  insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot) values(l,w,'cancel-attachment-lease-'||i,t,u,'ATTACH-C-'||i,current_date-1,current_date+30,100,50,'signed','{}');
 end loop;
 insert into private.aqari_staff_assignments(workspace_id,user_id,operational_role,property_ids,is_active,updated_by) values
  (w,'77ca0000-0000-4000-8000-000000000002','maintenance',array['77ca0000-0000-4000-8000-000000000101']::uuid[],true,'77ca0000-0000-4000-8000-000000000001'),
  (w,'77ca0000-0000-4000-8000-000000000003','accountant',array['77ca0000-0000-4000-8000-000000000101']::uuid[],true,'77ca0000-0000-4000-8000-000000000001');
end $$;
insert into auth.users(id,email,email_confirmed_at) values
 ('77ca0000-0000-4000-8000-000000000011','cancel-attachment-tenant-1@example.invalid',now()),
 ('77ca0000-0000-4000-8000-000000000012','cancel-attachment-tenant-2@example.invalid',now()),
 ('77ca0000-0000-4000-8000-000000000013','cancel-attachment-tenant-3@example.invalid',now());
do $$begin if exists(select 1 from public.aqari_memberships where user_id in('77ca0000-0000-4000-8000-000000000011','77ca0000-0000-4000-8000-000000000012','77ca0000-0000-4000-8000-000000000013')) then raise exception 'TENANT_GAINED_STAFF_MEMBERSHIP';end if;end $$;
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.cancel.workspace')::uuid;i integer;begin
 for i in 1..3 loop
  perform set_config('request.jwt.claim.sub','77ca0000-0000-4000-8000-00000000001'||i,true);
  insert into public.aqari_maintenance_requests(id,workspace_id,lease_id,tenant_id,description) values(('77ca0000-0000-4000-8000-00000000050'||i)::uuid,w,('77ca0000-0000-4000-8000-00000000040'||i)::uuid,('77ca0000-0000-4000-8000-00000000030'||i)::uuid,'Synthetic leaking tap '||i);
 end loop;
end $$;
select set_config('request.jwt.claim.sub','77ca0000-0000-4000-8000-000000000011',true);
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
do $$declare w uuid:=current_setting('aqari.test.cancel.workspace')::uuid;r uuid:='77ca0000-0000-4000-8000-000000000501';d jsonb;a jsonb;saved jsonb;i integer;begin
 for i in 1..8 loop
  d:=jsonb_build_object('id',('77ca0000-0000-4000-8000-00000000060'||i)::uuid,'filename','pending-'||i||'.jpg','mime_type','image/jpeg','size_bytes',123,'checksum_sha256',md5(i::text)||md5(i::text));
  a:=public.aqari_maintenance_attachments(w,r,'reserve',d);
 end loop;
 a:=public.aqari_maintenance_attachments(w,r,'list');
 if jsonb_array_length(a->'attachments')<>0 or jsonb_array_length(a->'pending')<>8 or jsonb_array_length(a->'cancelled')<>0 then raise exception 'OWN_PENDING_READBACK_FAILED';end if;
 begin perform public.aqari_maintenance_attachments(w,r,'reserve',d||jsonb_build_object('id','77ca0000-0000-4000-8000-000000000610','filename','extra.jpg'));raise exception 'ACTIVE_LIMIT_BYPASSED';exception when invalid_parameter_value then if sqlerrm<>'ATTACHMENT_LIMIT_REACHED' then raise;end if;end;
 begin perform public.aqari_maintenance_attachments(w,r,'cancel','{"id":"77ca0000-0000-4000-8000-000000000601","reason":"ab"}');raise exception 'EMPTY_REASON_ACCEPTED';exception when invalid_parameter_value then if sqlerrm<>'INVALID_CANCELLATION_REASON' then raise;end if;end;
 -- Represents an interrupted upload whose bytes already reached Storage. No
 -- object or metadata row is deleted when this reservation is cancelled.
 insert into storage.objects(bucket_id,name,metadata) values('aqari-maintenance-private',w::text||'/'||r::text||'/77ca0000-0000-4000-8000-000000000601','{"size":123,"mimetype":"image/jpeg","fixture":"preserve-original"}');
 saved:=public.aqari_maintenance_attachments(w,r,'cancel','{"id":"77ca0000-0000-4000-8000-000000000601","reason":"الملف الأصلي غير متاح بعد انقطاع الرفع"}');
 if saved->>'status'<>'cancelled' or saved->>'cancelled_by'<>auth.uid()::text or saved->>'cancelled_at' is null or saved->>'cancel_reason'<>'الملف الأصلي غير متاح بعد انقطاع الرفع' then raise exception 'CANCELLATION_AUDIT_MISSING';end if;
 if public.aqari_maintenance_attachments(w,r,'inspect','{"id":"77ca0000-0000-4000-8000-000000000601"}') is distinct from saved then raise exception 'CANCELLATION_INDEPENDENT_READBACK_MISMATCH';end if;
 if public.aqari_maintenance_attachments(w,r,'cancel','{"id":"77ca0000-0000-4000-8000-000000000601","reason":"الملف الأصلي غير متاح بعد انقطاع الرفع"}') is distinct from saved then raise exception 'LOST_REPLY_RETRY_CHANGED_AUDIT';end if;
 begin perform public.aqari_maintenance_attachments(w,r,'cancel','{"id":"77ca0000-0000-4000-8000-000000000601","reason":"سبب مختلف"}');raise exception 'CANCEL_REASON_OVERWRITTEN';exception when invalid_parameter_value then if sqlerrm<>'CANCELLATION_CONFLICT' then raise;end if;end;
 begin perform public.aqari_maintenance_attachments(w,r,'reserve',saved);raise exception 'CANCELLED_UUID_REUSED';exception when invalid_parameter_value then if sqlerrm<>'ATTACHMENT_CANCELLED' then raise;end if;end;
 begin perform public.aqari_maintenance_attachments(w,r,'finalize',jsonb_build_object('id',saved->>'id','checksum_sha256',saved->>'checksum_sha256'));raise exception 'CANCELLED_OBJECT_FINALIZED';exception when invalid_parameter_value then if sqlerrm<>'ATTACHMENT_CANCELLED' then raise;end if;end;
 begin insert into storage.objects(bucket_id,name,metadata) values('aqari-maintenance-private',saved->>'storage_path','{"size":123,"mimetype":"image/jpeg"}');raise exception 'CANCELLED_STORAGE_POST_ALLOWED';exception when insufficient_privilege then null;end;
 if exists(select 1 from storage.objects where bucket_id='aqari-maintenance-private' and name=saved->>'storage_path') then raise exception 'CANCELLED_OBJECT_STILL_READABLE';end if;
 -- Fresh selection may create a NEW path; the archived UUID remains unusable.
 a:=public.aqari_maintenance_attachments(w,r,'reserve',saved||jsonb_build_object('id','77ca0000-0000-4000-8000-000000000609'));
 if a->>'id'<>'77ca0000-0000-4000-8000-000000000609' or a->'reservation_reused'<>'false'::jsonb then raise exception 'CANCELLED_SLOT_NOT_RELEASED';end if;
 a:=public.aqari_maintenance_attachments(w,r,'list');if jsonb_array_length(a->'pending')<>8 or jsonb_array_length(a->'cancelled')<>1 then raise exception 'ACTIVE_HISTORY_COUNTS_WRONG';end if;
 begin perform public.aqari_maintenance_attachments(w,r,'reserve',d||jsonb_build_object('id','77ca0000-0000-4000-8000-000000000610','filename','extra.jpg'));raise exception 'LIMIT_EXCLUDES_ACTIVE_PENDING';exception when invalid_parameter_value then if sqlerrm<>'ATTACHMENT_LIMIT_REACHED' then raise;end if;end;
end $$;
-- Same-property tenant has no access to the first tenant's pending or history.
select set_config('request.jwt.claim.sub','77ca0000-0000-4000-8000-000000000012',true);
do $$declare w uuid:=current_setting('aqari.test.cancel.workspace')::uuid;begin
 begin perform public.aqari_maintenance_attachments(w,'77ca0000-0000-4000-8000-000000000501','list');raise exception 'FOREIGN_TENANT_PENDING_LEAK';exception when insufficient_privilege then null;end;
 begin perform public.aqari_maintenance_attachments(w,'77ca0000-0000-4000-8000-000000000502','inspect','{"id":"77ca0000-0000-4000-8000-000000000601"}');raise exception 'CROSS_REQUEST_HISTORY_LEAK';exception when insufficient_privilege then null;end;
 begin perform public.aqari_maintenance_attachments('77ca0000-0000-4000-8000-000000000099','77ca0000-0000-4000-8000-000000000501','cancel','{"id":"77ca0000-0000-4000-8000-000000000602","reason":"تعدي مساحة أخرى"}');raise exception 'CROSS_WORKSPACE_CANCEL_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
-- Scoped staff may read the request, but cannot discover or cancel another
-- uploader's pending reservations or cancellation history on that same request.
select set_config('request.jwt.claim.sub','77ca0000-0000-4000-8000-000000000002',true);
do $$declare w uuid:=current_setting('aqari.test.cancel.workspace')::uuid;a jsonb;begin
 a:=public.aqari_maintenance_attachments(w,'77ca0000-0000-4000-8000-000000000501','list');
 if jsonb_array_length(a->'pending')<>0 or jsonb_array_length(a->'cancelled')<>0 then raise exception 'STAFF_PENDING_HISTORY_LEAK';end if;
 begin perform public.aqari_maintenance_attachments(w,'77ca0000-0000-4000-8000-000000000501','inspect','{"id":"77ca0000-0000-4000-8000-000000000601"}');raise exception 'STAFF_HISTORY_INSPECT_ALLOWED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_maintenance_attachments(w,'77ca0000-0000-4000-8000-000000000501','cancel','{"id":"77ca0000-0000-4000-8000-000000000602","reason":"محاولة إلغاء حجز شخص آخر"}');raise exception 'STAFF_CANCEL_OTHER_UPLOADER';exception when insufficient_privilege then null;end;
 begin perform public.aqari_maintenance_attachments(w,'77ca0000-0000-4000-8000-000000000503','list');raise exception 'STAFF_OTHER_PROPERTY_LEAK';exception when insufficient_privilege then null;end;
end $$;
-- A sensitive manager needs AAL2 to cancel its own pending upload. Idempotent
-- confirmation and history remain read-only. No tenant receives a staff role.
select set_config('request.jwt.claim.sub','77ca0000-0000-4000-8000-000000000001',true);
do $$declare w uuid:=current_setting('aqari.test.cancel.workspace')::uuid;r uuid:='77ca0000-0000-4000-8000-000000000502';a jsonb;begin
 a:=public.aqari_maintenance_attachments(w,r,'reserve','{"id":"77ca0000-0000-4000-8000-000000000620","filename":"manager-pending.jpg","mime_type":"image/jpeg","size_bytes":123,"checksum_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}');
 begin perform public.aqari_maintenance_attachments(w,r,'cancel','{"id":"77ca0000-0000-4000-8000-000000000620","reason":"رفع مدير متروك"}');raise exception 'MANAGER_AAL1_CANCEL_ALLOWED';exception when insufficient_privilege then if sqlerrm<>'MFA_REQUIRED' then raise;end if;end;
 perform set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
 a:=public.aqari_maintenance_attachments(w,r,'cancel','{"id":"77ca0000-0000-4000-8000-000000000620","reason":"رفع مدير متروك"}');if a->>'cancelled_by'<>auth.uid()::text then raise exception 'MANAGER_CANCEL_ACTOR_WRONG';end if;
end $$;
select set_config('request.jwt.claim.sub','77ca0000-0000-4000-8000-000000000012',true);
do $$declare w uuid:=current_setting('aqari.test.cancel.workspace')::uuid;a jsonb;begin
 a:=public.aqari_maintenance_attachments(w,'77ca0000-0000-4000-8000-000000000502','list');
 if jsonb_array_length(a->'cancelled')<>0 then raise exception 'TENANT_SAW_MANAGERS_CANCEL_HISTORY';end if;
end $$;
select set_config('request.jwt.claim.sub','77ca0000-0000-4000-8000-000000000011',true);
do $$declare w uuid:=current_setting('aqari.test.cancel.workspace')::uuid;r uuid:='77ca0000-0000-4000-8000-000000000501';a jsonb;begin
 a:=public.aqari_maintenance_attachments(w,r,'inspect','{"id":"77ca0000-0000-4000-8000-000000000602"}');
 insert into storage.objects(bucket_id,name,metadata) values('aqari-maintenance-private',a->>'storage_path','{"size":123,"mimetype":"image/jpeg"}');
 a:=public.aqari_maintenance_attachments(w,r,'finalize',jsonb_build_object('id',a->>'id','checksum_sha256',a->>'checksum_sha256'));
 begin perform public.aqari_maintenance_attachments(w,r,'cancel','{"id":"77ca0000-0000-4000-8000-000000000602","reason":"محاولة إلغاء مرفق مكتمل"}');raise exception 'UPLOADED_ORIGINAL_CANCELLED';exception when invalid_parameter_value then if sqlerrm<>'UPLOADED_ATTACHMENT_IMMUTABLE' then raise;end if;end;
 if not exists(select 1 from storage.objects where bucket_id='aqari-maintenance-private' and name=a->>'storage_path' and metadata='{"size":123,"mimetype":"image/jpeg"}'::jsonb) then raise exception 'UPLOADED_ORIGINAL_NOT_PRESERVED';end if;
end $$;
select set_config('request.jwt.claim.sub','77ca0000-0000-4000-8000-000000000001',true);
update public.aqari_maintenance_requests set status='in_progress' where workspace_id=current_setting('aqari.test.cancel.workspace')::uuid and id='77ca0000-0000-4000-8000-000000000501';
update public.aqari_maintenance_requests set status='completed' where workspace_id=current_setting('aqari.test.cancel.workspace')::uuid and id='77ca0000-0000-4000-8000-000000000501';
select set_config('request.jwt.claim.sub','77ca0000-0000-4000-8000-000000000011',true);
do $$declare w uuid:=current_setting('aqari.test.cancel.workspace')::uuid;r uuid:='77ca0000-0000-4000-8000-000000000501';a jsonb;saved jsonb;begin
 a:=public.aqari_maintenance_attachments(w,r,'list');if a->'can_upload'<>'false'::jsonb or jsonb_array_length(a->'pending')<>7 then raise exception 'CLOSED_PENDING_READBACK_FAILED';end if;
 begin perform public.aqari_maintenance_attachments(w,r,'cancel','{"id":"77ca0000-0000-4000-8000-000000000603","reason":"إلغاء بعد إغلاق البلاغ"}');raise exception 'CLOSED_PENDING_CANCEL_ALLOWED';exception when insufficient_privilege then null;end;
 saved:=public.aqari_maintenance_attachments(w,r,'inspect','{"id":"77ca0000-0000-4000-8000-000000000601"}');
 if public.aqari_maintenance_attachments(w,r,'cancel','{"id":"77ca0000-0000-4000-8000-000000000601","reason":"الملف الأصلي غير متاح بعد انقطاع الرفع"}') is distinct from saved then raise exception 'CLOSED_LOST_REPLY_CONFIRMATION_CHANGED';end if;
 begin perform * from private.aqari_maintenance_attachments;raise exception 'DIRECT_PRIVATE_READ_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Privileged verification is confined to the synthetic workspace and proves
-- preservation; it does not bypass RLS in any acceptance/rejection action above.
do $$declare w uuid:=current_setting('aqari.test.cancel.workspace')::uuid;begin
 if not exists(select 1 from storage.objects where bucket_id='aqari-maintenance-private' and name=w::text||'/77ca0000-0000-4000-8000-000000000501/77ca0000-0000-4000-8000-000000000601' and metadata='{"size":123,"mimetype":"image/jpeg","fixture":"preserve-original"}'::jsonb) then raise exception 'CANCELLED_STORED_ORIGINAL_DELETED';end if;
 if (select count(*) from private.aqari_maintenance_attachments where workspace_id=w and request_id='77ca0000-0000-4000-8000-000000000501')<>9 then raise exception 'CANCELLED_HISTORY_ROW_DELETED';end if;
 begin update private.aqari_maintenance_attachments set cancel_reason='tampered' where workspace_id=w and id='77ca0000-0000-4000-8000-000000000601';raise exception 'AUDIT_REASON_REWRITTEN';exception when check_violation then if sqlerrm<>'ATTACHMENT_HISTORY_IMMUTABLE' then raise;end if;end;
 begin delete from private.aqari_maintenance_attachments where workspace_id=w and id='77ca0000-0000-4000-8000-000000000601';raise exception 'AUDIT_ROW_DELETED';exception when check_violation then if sqlerrm<>'ATTACHMENT_HISTORY_IMMUTABLE' then raise;end if;end;
end $$;
-- Historical synthetic inputs exercise both deployed spellings. No real
-- cancellation is inferred from these records; existing facts must stay intact.
insert into private.aqari_maintenance_attachments(id,workspace_id,request_id,filename,mime_type,size_bytes,checksum_sha256,storage_path,status,created_by,created_at,cancelled_at)
values('77ca0000-0000-4000-8000-000000000631',current_setting('aqari.test.cancel.workspace')::uuid,'77ca0000-0000-4000-8000-000000000503','legacy-cancelled.jpg','image/jpeg',123,repeat('c',64),current_setting('aqari.test.cancel.workspace')||'/77ca0000-0000-4000-8000-000000000503/77ca0000-0000-4000-8000-000000000631','cancelled','77ca0000-0000-4000-8000-000000000013','2026-09-01T10:00:00Z','2026-09-01T10:05:00Z');
insert into private.aqari_maintenance_attachments(id,workspace_id,request_id,filename,mime_type,size_bytes,checksum_sha256,storage_path,status,created_by,created_at,abandoned_at,abandoned_by,abandon_reason)
values('77ca0000-0000-4000-8000-000000000632',current_setting('aqari.test.cancel.workspace')::uuid,'77ca0000-0000-4000-8000-000000000503','legacy-abandoned.jpg','image/jpeg',123,repeat('d',64),current_setting('aqari.test.cancel.workspace')||'/77ca0000-0000-4000-8000-000000000503/77ca0000-0000-4000-8000-000000000632','abandoned','77ca0000-0000-4000-8000-000000000013','2026-09-01T11:00:00Z','2026-09-01T11:05:00Z','77ca0000-0000-4000-8000-000000000001','Synthetic prior manager abandonment');
insert into private.aqari_maintenance_attachments(id,workspace_id,request_id,filename,mime_type,size_bytes,checksum_sha256,storage_path,status,created_by,created_at,cancelled_at,cancelled_by,cancel_reason)
values('77ca0000-0000-4000-8000-000000000633',current_setting('aqari.test.cancel.workspace')::uuid,'77ca0000-0000-4000-8000-000000000503','legacy-converged.jpg','image/jpeg',123,repeat('e',64),current_setting('aqari.test.cancel.workspace')||'/77ca0000-0000-4000-8000-000000000503/77ca0000-0000-4000-8000-000000000633','cancelled','77ca0000-0000-4000-8000-000000000013','2026-09-01T12:00:00Z','2026-09-01T12:05:00Z','77ca0000-0000-4000-8000-000000000013','Synthetic prior audited cancellation');
set local role authenticated;
select set_config('request.jwt.claim.sub','77ca0000-0000-4000-8000-000000000013',true);
do $$declare w uuid:=current_setting('aqari.test.cancel.workspace')::uuid;r uuid:='77ca0000-0000-4000-8000-000000000503';a jsonb;old_cancel jsonb;old_abandon jsonb;begin
 a:=public.aqari_maintenance_attachments(w,r,'list');
 if jsonb_array_length(a->'cancelled')<>3 or a->'pending' is distinct from a->'pending_reservations' then raise exception 'LEGACY_LIST_COMPATIBILITY_FAILED';end if;
 old_cancel:=public.aqari_maintenance_attachments(w,r,'inspect','{"id":"77ca0000-0000-4000-8000-000000000631"}');
 if old_cancel->>'status'<>'cancelled' or old_cancel->'audit_incomplete'<>'true'::jsonb or old_cancel->>'abandon_reason' is not null or old_cancel->>'abandoned_by' is not null then raise exception 'LEGACY_CANCEL_AUDIT_FABRICATED';end if;
 old_abandon:=public.aqari_maintenance_attachments(w,r,'inspect','{"id":"77ca0000-0000-4000-8000-000000000632"}');
 if old_abandon->>'abandoned_by'<>'77ca0000-0000-4000-8000-000000000001' or old_abandon->>'abandon_reason'<>'Synthetic prior manager abandonment' then raise exception 'LEGACY_ABANDON_ACTOR_REWRITTEN';end if;
 if public.aqari_maintenance_attachments(w,r,'abandon','{"id":"77ca0000-0000-4000-8000-000000000632","reason":"Synthetic prior manager abandonment"}') is distinct from old_abandon then raise exception 'LEGACY_ACTION_ALIAS_CHANGED_HISTORY';end if;
 a:=public.aqari_maintenance_attachments(w,r,'inspect','{"id":"77ca0000-0000-4000-8000-000000000633"}');
 if a->>'status'<>'cancelled' or a->>'cancelled_by'<>'77ca0000-0000-4000-8000-000000000013' or a->>'cancel_reason'<>'Synthetic prior audited cancellation'
  or a->'audit_incomplete'='true'::jsonb or (a->>'cancelled_at')::timestamptz<>'2026-09-01T12:05:00Z'::timestamptz then raise exception 'CONVERGED_CANCELLATION_AUDIT_LOST';end if;
 if public.aqari_maintenance_attachments(w,r,'cancel','{"id":"77ca0000-0000-4000-8000-000000000633","reason":"Synthetic prior audited cancellation"}') is distinct from a then raise exception 'CONVERGED_CANCELLATION_RETRY_CHANGED_HISTORY';end if;
 begin perform public.aqari_maintenance_attachments(w,r,'reserve',old_cancel);raise exception 'LEGACY_CANCEL_UUID_REUSED';exception when invalid_parameter_value then if sqlerrm<>'ATTACHMENT_CANCELLED' then raise;end if;end;
 begin perform public.aqari_maintenance_attachments(w,r,'finalize',old_cancel);raise exception 'LEGACY_CANCEL_FINALIZED';exception when invalid_parameter_value then if sqlerrm<>'ATTACHMENT_CANCELLED' then raise;end if;end;
 begin insert into storage.objects(bucket_id,name,metadata) values('aqari-maintenance-private',old_cancel->>'storage_path','{"size":123,"mimetype":"image/jpeg"}');raise exception 'LEGACY_CANCEL_STORAGE_POST';exception when insufficient_privilege then null;end;
end $$;
set local role anon;
do $$begin begin perform public.aqari_maintenance_attachments('77ca0000-0000-4000-8000-000000000090','77ca0000-0000-4000-8000-000000000501','list');raise exception 'ANONYMOUS_PENDING_READ';exception when insufficient_privilege then null;end;end $$;
rollback;
