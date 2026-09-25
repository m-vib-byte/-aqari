-- GENERATED ROLLBACK-ONLY HOSTED PREVIEW ACCEPTANCE. No schema/permission changes.
-- Source: staging-database/tests/maintenance_attachments.sql
-- Primary workspace: 76f10000-0000-4000-8000-000000000002 / hosted-completion-maintenance-attachments
-- Run this entire file as one query; never extract setup statements.
-- Positive synthetic MFA fixture: include a current supported second-factor event.
-- Negative AAL1/expired-MFA cases and all production guards remain unchanged.
-- Synthetic acceptance against PostgreSQL RLS/RPC. Every fixture write rolls back.
begin;
select set_config('hosted.test.workspace','76f10000-0000-4000-8000-000000000002',true);
insert into public.aqari_workspaces(id,slug,name) values('76f10000-0000-4000-8000-000000000002','hosted-completion-maintenance-attachments','Synthetic rollback acceptance: maintenance_attachments');
insert into public.aqari_app_state(workspace_id,payload) values('76f10000-0000-4000-8000-000000000002','{}');

insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('attachment-manager@example.invalid','Attachment manager','general_manager','hosted-completion-maintenance-attachments'),
 ('attachment-staff@example.invalid','Attachment staff','property_manager','hosted-completion-maintenance-attachments'),
 ('attachment-accountant@example.invalid','Attachment accountant','accountant','hosted-completion-maintenance-attachments');
insert into auth.users(id,email,email_confirmed_at) values
 ('76900000-0000-4000-8000-000000000001','attachment-manager@example.invalid',now()),
 ('76900000-0000-4000-8000-000000000002','attachment-staff@example.invalid',now()),
 ('76900000-0000-4000-8000-000000000003','attachment-accountant@example.invalid',now());
select set_config('aqari.test.attachment.workspace',(select workspace_id::text from public.aqari_memberships where user_id='76900000-0000-4000-8000-000000000001' and is_active),true);
select set_config('request.jwt.claim.sub','76900000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
do $$declare w uuid:=current_setting('aqari.test.attachment.workspace')::uuid;i integer;p uuid;t uuid;u uuid;l uuid;begin
 for i in 1..2 loop insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values(('76900000-0000-4000-8000-00000000010'||i)::uuid,w,'attachment-prop-'||i,'Synthetic property '||i,'{}');end loop;
 for i in 1..3 loop
  p:=case when i=3 then '76900000-0000-4000-8000-000000000102'::uuid else '76900000-0000-4000-8000-000000000101'::uuid end;
  t:=('76900000-0000-4000-8000-00000000030'||i)::uuid;u:=('76900000-0000-4000-8000-00000000020'||i)::uuid;l:=('76900000-0000-4000-8000-00000000040'||i)::uuid;
  insert into public.aqari_units(id,workspace_id,property_id,unit_no) values(u,w,p,'ATTACH-'||i);
  -- Use the audited readiness RPC before the signed lease; never bypass its
  -- trigger or insert directly into the immutable readiness history.
  perform public.aqari_unit_readiness_register(w,'record',jsonb_build_object(
   'id',('76900000-0000-4000-8000-00000000070'||i)::uuid,'property_id',p,'unit_no','ATTACH-'||i,
   'expected_revision',0,'state','ready','inspected_on',current_date,
   'source_ref','Synthetic attachment fixture inspection','reason','Synthetic unit inspected before the lease'));
  insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,email,civil_id,phone,profile) values(t,w,'attachment-tenant-'||i,'Synthetic tenant '||i,'attachment-tenant-'||i||'@example.invalid','76900000000'||i,'7690000'||i,'{}');
  insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot) values(l,w,'attachment-lease-'||i,t,u,'ATTACH-C-'||i,current_date-1,current_date+30,100,50,'signed','{}');
 end loop;
 insert into private.aqari_staff_assignments(workspace_id,user_id,operational_role,property_ids,is_active,updated_by) values
  (w,'76900000-0000-4000-8000-000000000002','maintenance',array['76900000-0000-4000-8000-000000000101']::uuid[],true,'76900000-0000-4000-8000-000000000001'),
  (w,'76900000-0000-4000-8000-000000000003','accountant',array['76900000-0000-4000-8000-000000000101']::uuid[],true,'76900000-0000-4000-8000-000000000001');
end $$;
insert into auth.users(id,email,email_confirmed_at) values
 ('76900000-0000-4000-8000-000000000011','attachment-tenant-1@example.invalid',now()),
 ('76900000-0000-4000-8000-000000000012','attachment-tenant-2@example.invalid',now()),
 ('76900000-0000-4000-8000-000000000013','attachment-tenant-3@example.invalid',now());
do $$begin if exists(select 1 from public.aqari_memberships where user_id in('76900000-0000-4000-8000-000000000011','76900000-0000-4000-8000-000000000012','76900000-0000-4000-8000-000000000013')) then raise exception 'TENANT_GAINED_STAFF_MEMBERSHIP';end if;end $$;
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.attachment.workspace')::uuid;i integer;begin
 for i in 1..3 loop
  perform set_config('request.jwt.claim.sub','76900000-0000-4000-8000-00000000001'||i,true);
  insert into public.aqari_maintenance_requests(id,workspace_id,lease_id,tenant_id,description) values(('76900000-0000-4000-8000-00000000050'||i)::uuid,w,('76900000-0000-4000-8000-00000000040'||i)::uuid,('76900000-0000-4000-8000-00000000030'||i)::uuid,'Synthetic leaking tap '||i);
 end loop;
end $$;
select set_config('request.jwt.claim.sub','76900000-0000-4000-8000-000000000011',true);
do $$declare w uuid:=current_setting('aqari.test.attachment.workspace')::uuid;r uuid:='76900000-0000-4000-8000-000000000501';d jsonb;reply jsonb;ident uuid:='76900000-0000-4000-8000-000000000601';hash text:=repeat('a',64);path text;begin
 if exists(select 1 from public.aqari_maintenance_requests where id='76900000-0000-4000-8000-000000000502') then raise exception 'OTHER_TENANT_REQUEST_EXPOSED';end if;
 begin perform public.aqari_maintenance_attachments(w,'76900000-0000-4000-8000-000000000502','list');raise exception 'OTHER_TENANT_LIST_ALLOWED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_maintenance_attachments('76900000-0000-4000-8000-000000000099',r,'list');raise exception 'OTHER_WORKSPACE_ALLOWED';exception when insufficient_privilege then null;end;
 d:=jsonb_build_object('id',ident,'filename','leak.jpg','mime_type','image/jpeg','size_bytes',123,'checksum_sha256',hash);
 reply:=public.aqari_maintenance_attachments(w,r,'reserve',d);path:=reply->>'storage_path';
 if reply->>'status'<>'reserved' or (reply->>'created_by')::uuid<>auth.uid() or (reply->>'request_id')::uuid<>r then raise exception 'RESERVATION_BINDING_FAILED';end if;
 if public.aqari_maintenance_attachments(w,r,'reserve',d)-'reservation_reused' is distinct from reply-'reservation_reused' then raise exception 'RESERVATION_RETRY_NOT_IDEMPOTENT';end if;
 reply:=public.aqari_maintenance_attachments(w,r,'reserve',d||jsonb_build_object('id',gen_random_uuid()));
 if (reply->>'id')::uuid<>ident or reply->'reservation_reused'<>'true'::jsonb then raise exception 'RESELECTED_FILE_DRAFT_NOT_RECOVERED';end if;
 begin perform public.aqari_maintenance_attachments(w,r,'reserve',d||'{"filename":"changed.jpg"}');raise exception 'RESERVATION_OVERWRITTEN';exception when invalid_parameter_value then null;end;
 begin perform public.aqari_maintenance_attachments(w,r,'finalize',jsonb_build_object('id',ident,'checksum_sha256',hash));raise exception 'UNSTORED_OBJECT_FINALIZED';exception when invalid_parameter_value then null;end;
 begin insert into storage.objects(bucket_id,name,metadata) values('aqari-maintenance-private',w::text||'/'||r::text||'/forged','{"size":123,"mimetype":"image/jpeg"}');raise exception 'UNRESERVED_UPLOAD_ALLOWED';exception when insufficient_privilege then null;end;
 insert into storage.objects(bucket_id,name,metadata) values('aqari-maintenance-private',path,'{"size":123,"mimetype":"image/jpeg"}');
 if not exists(select 1 from storage.objects where name=path and bucket_id='aqari-maintenance-private') then raise exception 'UPLOADER_READBACK_DENIED';end if;
 begin perform public.aqari_maintenance_attachments(w,r,'finalize',jsonb_build_object('id',ident,'checksum_sha256',repeat('b',64)));raise exception 'WRONG_HASH_ALLOWED';exception when invalid_parameter_value then null;end;
 reply:=public.aqari_maintenance_attachments(w,r,'finalize',jsonb_build_object('id',ident,'checksum_sha256',hash));
 if reply->>'status'<>'uploaded' or jsonb_array_length(public.aqari_maintenance_attachments(w,r,'list')->'attachments')<>1 then raise exception 'FINALIZED_READBACK_FAILED';end if;
 if public.aqari_maintenance_attachments(w,r,'finalize',jsonb_build_object('id',ident,'checksum_sha256',hash)) is distinct from reply then raise exception 'FINALIZE_RETRY_CHANGED_ORIGINAL';end if;
 reply:=public.aqari_maintenance_attachments(w,r,'reserve',d||jsonb_build_object('id',gen_random_uuid()));
 if (reply->>'id')::uuid<>ident or reply->>'status'<>'uploaded' or reply->'reservation_reused'<>'true'::jsonb then raise exception 'RESELECTED_UPLOADED_FILE_NOT_RECOVERED';end if;
 update storage.objects set metadata='{"size":1}' where bucket_id='aqari-maintenance-private' and name=path and name like current_setting('hosted.test.workspace')||'/%';if found then raise exception 'STORAGE_OVERWRITE_ALLOWED';end if;
 -- Storage may reject direct deletion with 42501, or RLS may affect zero rows.
 begin
  delete from storage.objects where bucket_id='aqari-maintenance-private' and name=path and name like current_setting('hosted.test.workspace')||'/%';
  if found then raise exception 'STORAGE_DELETE_ALLOWED';end if;
 exception when insufficient_privilege then null;
 end;
 if not exists(select 1 from storage.objects where bucket_id='aqari-maintenance-private' and name=path and metadata='{"size":123,"mimetype":"image/jpeg"}'::jsonb) then raise exception 'STORAGE_ORIGINAL_NOT_PRESERVED';end if;
 begin perform * from private.aqari_maintenance_attachments;raise exception 'DIRECT_PRIVATE_TABLE_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
-- Another tenant in the SAME property has neither metadata nor object access.
select set_config('request.jwt.claim.sub','76900000-0000-4000-8000-000000000012',true);
do $$declare w uuid:=current_setting('aqari.test.attachment.workspace')::uuid;begin
 begin perform public.aqari_maintenance_attachments(w,'76900000-0000-4000-8000-000000000501','list');raise exception 'SAME_PROPERTY_TENANT_LEAK';exception when insufficient_privilege then null;end;
 if exists(select 1 from storage.objects where bucket_id='aqari-maintenance-private') then raise exception 'PRIVATE_OBJECT_LEAK';end if;
 begin perform public.aqari_maintenance_attachments(w,'76900000-0000-4000-8000-000000000502','finalize','{"id":"76900000-0000-4000-8000-000000000601"}');raise exception 'CROSS_REQUEST_FINALIZE_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
do $$declare w uuid:=current_setting('aqari.test.attachment.workspace')::uuid;r uuid:='76900000-0000-4000-8000-000000000502';d jsonb;reply jsonb;i integer;begin
 d:=jsonb_build_object('id',gen_random_uuid(),'filename','test.jpg','mime_type','image/jpeg','size_bytes',123,'checksum_sha256',repeat('b',64));
 begin perform public.aqari_maintenance_attachments(w,r,'reserve',d||'{"mime_type":"text/html"}');raise exception 'ACTIVE_CONTENT_TYPE_ALLOWED';exception when invalid_parameter_value then null;end;
 begin perform public.aqari_maintenance_attachments(w,r,'reserve',d||'{"size_bytes":10485761}');raise exception 'OVERSIZED_ATTACHMENT_ALLOWED';exception when invalid_parameter_value then null;end;
 begin perform public.aqari_maintenance_attachments(w,r,'reserve',d||'{"filename":"../other.jpg"}');raise exception 'PATH_FILENAME_ALLOWED';exception when invalid_parameter_value then null;end;
 begin perform public.aqari_maintenance_attachments(w,r,'reserve',d||'{"checksum_sha256":"invalid"}');raise exception 'INVALID_CHECKSUM_ALLOWED';exception when invalid_parameter_value then null;end;
 begin perform public.aqari_maintenance_attachments(w,r,null,d);raise exception 'NULL_ACTION_ALLOWED';exception when insufficient_privilege then null;end;
 for i in 1..8 loop
  d:=d||jsonb_build_object('id',gen_random_uuid(),'filename',case when i=1 then 'leak.jpg' else 'test-'||i||'.jpg' end,'checksum_sha256',repeat('a',64));reply:=public.aqari_maintenance_attachments(w,r,'reserve',d);
  if i=1 then
   if reply->'reservation_reused'<>'false'::jsonb or reply->>'id'='76900000-0000-4000-8000-000000000601' or reply->>'created_by'<>auth.uid()::text then raise exception 'OTHER_TENANT_RESERVATION_REUSED';end if;
   insert into storage.objects(bucket_id,name,metadata) values('aqari-maintenance-private',reply->>'storage_path','{"size":122,"mimetype":"image/jpeg"}');
   begin perform public.aqari_maintenance_attachments(w,r,'finalize',d);raise exception 'WRONG_STORAGE_SIZE_FINALIZED';exception when invalid_parameter_value then null;end;
  end if;
 end loop;
 reply:=public.aqari_maintenance_attachments(w,r,'reserve',d||jsonb_build_object('id',gen_random_uuid()));
 if reply->>'id'<>d->>'id' or reply->'reservation_reused'<>'true'::jsonb then raise exception 'FULL_QUOTA_PREVENTED_DRAFT_RECOVERY';end if;
 begin perform public.aqari_maintenance_attachments(w,r,'reserve',d||jsonb_build_object('id',gen_random_uuid(),'filename','ninth.jpg'));raise exception 'ATTACHMENT_COUNT_LIMIT_BYPASSED';exception when invalid_parameter_value then if sqlerrm<>'ATTACHMENT_LIMIT_REACHED' then raise;end if;end;
end $$;
-- Assigned maintenance staff can retrieve photos, without gaining tenant/lease data.
select set_config('request.jwt.claim.sub','76900000-0000-4000-8000-000000000002',true);
do $$declare w uuid:=current_setting('aqari.test.attachment.workspace')::uuid;begin
 if jsonb_array_length(public.aqari_maintenance_attachments(w,'76900000-0000-4000-8000-000000000501','list')->'attachments')<>1 then raise exception 'STAFF_ATTACHMENT_READ_FAILED';end if;
 if (select count(*) from storage.objects where bucket_id='aqari-maintenance-private')<>1 then raise exception 'STAFF_STORAGE_READ_FAILED';end if;
 if exists(select 1 from public.aqari_leases where workspace_id=w) or exists(select 1 from public.aqari_tenants where workspace_id=w) then raise exception 'STAFF_PRIVATE_DETAILS_LEAK';end if;
 begin perform public.aqari_maintenance_attachments(w,'76900000-0000-4000-8000-000000000503','list');raise exception 'OTHER_PROPERTY_ALLOWED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_maintenance_attachments(w,'76900000-0000-4000-8000-000000000501','finalize',jsonb_build_object('id','76900000-0000-4000-8000-000000000601','checksum_sha256',repeat('a',64)));raise exception 'STAFF_FINALIZED_TENANT_ORIGINAL';exception when insufficient_privilege then null;end;
 if public.aqari_maintenance_attachments(w,'76900000-0000-4000-8000-000000000501','reserve',jsonb_build_object('id',gen_random_uuid(),'filename','leak.jpg','mime_type','image/jpeg','size_bytes',123,'checksum_sha256',repeat('a',64)))->'reservation_reused'<>'false'::jsonb then raise exception 'STAFF_REUSED_TENANT_RESERVATION';end if;
end $$;
select set_config('request.jwt.claim.sub','76900000-0000-4000-8000-000000000003',true);
do $$begin begin perform public.aqari_maintenance_attachments(current_setting('aqari.test.attachment.workspace')::uuid,'76900000-0000-4000-8000-000000000501','list');raise exception 'ACCOUNTANT_CEILING_BYPASSED';exception when insufficient_privilege then null;end;end $$;
reset role;
update public.aqari_portal_accounts set is_active=false where user_id='76900000-0000-4000-8000-000000000011' and workspace_id=current_setting('hosted.test.workspace')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','76900000-0000-4000-8000-000000000011',true);
do $$begin
 begin perform public.aqari_maintenance_attachments(current_setting('aqari.test.attachment.workspace')::uuid,'76900000-0000-4000-8000-000000000501','list');raise exception 'REVOKED_TENANT_METADATA_ALLOWED';exception when insufficient_privilege then null;end;
 if exists(select 1 from storage.objects where bucket_id='aqari-maintenance-private') then raise exception 'REVOKED_TENANT_STORAGE_ALLOWED';end if;
end $$;
reset role;
update public.aqari_portal_accounts set is_active=true where user_id='76900000-0000-4000-8000-000000000011' and workspace_id=current_setting('hosted.test.workspace')::uuid;
select set_config('request.jwt.claim.sub','76900000-0000-4000-8000-000000000001',true);
update public.aqari_maintenance_requests set status='in_progress' where id='76900000-0000-4000-8000-000000000501' and workspace_id=current_setting('hosted.test.workspace')::uuid;
update public.aqari_maintenance_requests set status='completed' where id='76900000-0000-4000-8000-000000000501' and workspace_id=current_setting('hosted.test.workspace')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','76900000-0000-4000-8000-000000000011',true);
do $$declare w uuid:=current_setting('aqari.test.attachment.workspace')::uuid;r uuid:='76900000-0000-4000-8000-000000000501';begin
 if (public.aqari_maintenance_attachments(w,r,'list')->>'can_upload')::boolean then raise exception 'COMPLETED_REQUEST_MUTABLE';end if;
 if jsonb_array_length(public.aqari_maintenance_attachments(w,r,'list')->'attachments')<>1 then raise exception 'COMPLETED_HISTORY_LOST';end if;
 if public.aqari_maintenance_attachments(w,r,'finalize',jsonb_build_object('id','76900000-0000-4000-8000-000000000601','checksum_sha256',repeat('a',64)))->>'status'<>'uploaded' then raise exception 'COMPLETED_FINALIZE_REPLY_NOT_RECOVERED';end if;
 begin perform public.aqari_maintenance_attachments(w,r,'reserve',jsonb_build_object('id',gen_random_uuid(),'filename','late.jpg','mime_type','image/jpeg','size_bytes',123,'checksum_sha256',repeat('a',64)));raise exception 'COMPLETED_UPLOAD_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin if (select public from storage.buckets where id='aqari-maintenance-private') then raise exception 'PUBLIC_MAINTENANCE_BUCKET';end if;end $$;
set local role anon;
do $$begin begin perform public.aqari_maintenance_attachments(current_setting('aqari.test.attachment.workspace')::uuid,'76900000-0000-4000-8000-000000000501','list');raise exception 'ANON_ATTACHMENT_ACCESS';exception when insufficient_privilege then null;end;end $$;
rollback;
