-- Isolated synthetic workspace and accounts. Always run inside a transaction and roll back.
insert into public.aqari_workspaces(id,slug,name) values('a9200000-0000-4000-8000-000000000001','contract-workflow-test','Synthetic contract workflow');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('contract-workflow-manager@example.invalid','Synthetic manager','general_manager','contract-workflow-test'),
 ('contract-workflow-staff@example.invalid','Synthetic staff','property_manager','contract-workflow-test');
insert into auth.users(id,email,email_confirmed_at) values
 ('a9200000-0000-4000-8000-000000000011','contract-workflow-manager@example.invalid',now()),
 ('a9200000-0000-4000-8000-000000000012','contract-workflow-staff@example.invalid',now());
insert into public.aqari_app_state(workspace_id,payload) values('a9200000-0000-4000-8000-000000000001','{}') on conflict do nothing;
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values
 ('a9200000-0000-4000-8000-000000000021','a9200000-0000-4000-8000-000000000001','synthetic-property','Synthetic property','{}');
insert into public.aqari_units(id,workspace_id,property_id,unit_no) values
 ('a9200000-0000-4000-8000-000000000022','a9200000-0000-4000-8000-000000000001','a9200000-0000-4000-8000-000000000021','TEST-1');
insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,email,profile) values
 ('a9200000-0000-4000-8000-000000000023','a9200000-0000-4000-8000-000000000001','synthetic-tenant','Synthetic tenant','123456789019','55559001','test@example.invalid','{}');
insert into private.aqari_unit_readiness(id,workspace_id,unit_id,revision,state,inspected_on,source_ref,reason,recorded_by) values('a9200000-0000-4000-8000-000000000026','a9200000-0000-4000-8000-000000000001','a9200000-0000-4000-8000-000000000022',1,'ready',current_date,'synthetic inspection','synthetic test only','a9200000-0000-4000-8000-000000000011');
insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot) values
 ('a9200000-0000-4000-8000-000000000024','a9200000-0000-4000-8000-000000000001','synthetic-lease','a9200000-0000-4000-8000-000000000023','a9200000-0000-4000-8000-000000000022','TEST-CONTRACT','2026-09-01','2027-08-31',100,0,'draft','{}');
insert into private.aqari_staff_assignments(workspace_id,user_id,operational_role,property_ids,is_active,updated_by) values
 ('a9200000-0000-4000-8000-000000000001','a9200000-0000-4000-8000-000000000012','property_manager',array['a9200000-0000-4000-8000-000000000021'::uuid],true,'a9200000-0000-4000-8000-000000000011');
select set_config('request.jwt.claim.sub','a9200000-0000-4000-8000-000000000011',true);
insert into public.aqari_documents(id,workspace_id,document_no,document_type,entity_type,entity_ref,title,original_filename,mime_type,metadata,storage_bucket,storage_path,status,size_bytes,created_by,checksum_sha256) values
 ('a9200000-0000-4000-8000-000000000025','a9200000-0000-4000-8000-000000000001','TEST-ARCHIVE','supporting_document','tenant','synthetic-tenant','Synthetic archive','test.pdf','application/pdf','{"category":"archived_contract"}','aqari-documents','a9200000-0000-4000-8000-000000000001/a9200000-0000-4000-8000-000000000025.pdf','draft',null,'a9200000-0000-4000-8000-000000000011',null);
insert into storage.objects(bucket_id,name,metadata) values('aqari-documents','a9200000-0000-4000-8000-000000000001/a9200000-0000-4000-8000-000000000025.pdf','{"size":10,"mimetype":"application/pdf"}');
update public.aqari_documents set status='uploaded',size_bytes=10,checksum_sha256=repeat('a',64) where id='a9200000-0000-4000-8000-000000000025';
select set_config('request.jwt.claim.sub','a9200000-0000-4000-8000-000000000011',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
set local role authenticated;
do $$
declare w uuid:='a9200000-0000-4000-8000-000000000001'; r jsonb; d jsonb:=jsonb_build_object('id','a9200000-0000-4000-8000-000000000031','tenant_id','a9200000-0000-4000-8000-000000000023','property_id','a9200000-0000-4000-8000-000000000021','unit_id','a9200000-0000-4000-8000-000000000022','document_id','a9200000-0000-4000-8000-000000000025','reference','TEST-OLD-CONTRACT','original_date','2020-02-29');
begin
 r:=public.aqari_contract_administration(w,'archive',d);
 if r#>>'{result,original_date}'<>'2020-02-29' then raise exception 'ARCHIVE_DATE_READBACK';end if;
 begin perform public.aqari_contract_administration(w,'archive',d-'original_date');raise exception 'MISSING_ARCHIVE_DATE_ACCEPTED';exception when invalid_parameter_value then null;end;
 begin perform public.aqari_contract_administration(w,'archive',d||'{"original_date":"2025-02-29"}');raise exception 'IMPOSSIBLE_ARCHIVE_DATE_ACCEPTED';exception when datetime_field_overflow then null;end;
 begin perform public.aqari_contract_administration(w,'archive',d||'{"original_date":"2020-03-01"}');raise exception 'CHANGED_ARCHIVE_DATE_ACCEPTED';exception when invalid_parameter_value then null;end;
 if r#>>'{result,id}'<>d->>'id' then raise exception 'ARCHIVE_READBACK';end if;
 if jsonb_array_length(public.aqari_contract_administration(w,'archives')->'result')<>1 then raise exception 'ARCHIVE_LIST_FAILED';end if;
 if jsonb_array_length(public.aqari_contract_administration(w,'archives',jsonb_build_object('tenant_id',d->>'tenant_id','property_id',d->>'property_id'))->'result')<>1 then raise exception 'ARCHIVE_FILTER_FAILED';end if;
 if public.aqari_contract_administration(w,'archive',d)<>r then raise exception 'ARCHIVE_RETRY_CHANGED';end if;
 begin perform public.aqari_contract_administration(w,'archive',d||'{"unit_id":"a9200000-0000-4000-8000-000000000099"}');raise exception 'BAD_UNIT_ACCEPTED';exception when invalid_parameter_value then null;end;
 r:=public.aqari_contract_administration(w,'review_signatures','{"id":"a9200000-0000-4000-8000-000000000041","document_id":"a9200000-0000-4000-8000-000000000025","required_signers":["tenant","landlord","witness"],"signed_by":["tenant","landlord"]}');
 if r#>>'{result,status}'<>'missing_signature' then raise exception 'MISSING_SIGNATURE_COMPLETED';end if;
 begin perform public.aqari_contract_administration(w,'review_signatures','{"id":"a9200000-0000-4000-8000-000000000042","document_id":"a9200000-0000-4000-8000-000000000025","required_signers":["tenant","landlord"],"signed_by":["tenant","landlord"]}');raise exception 'REMOVED_REQUIRED_WITNESS';exception when invalid_parameter_value then null;end;
 r:=public.aqari_contract_administration(w,'review_signatures','{"id":"a9200000-0000-4000-8000-000000000043","document_id":"a9200000-0000-4000-8000-000000000025","required_signers":["tenant","landlord","witness"],"signed_by":["tenant","landlord","witness"]}');
 if r#>>'{result,status}'<>'complete' then raise exception 'COMPLETE_SIGNATURE_FAILED';end if;
 r:=public.aqari_contract_administration(w,'signature_status',jsonb_build_object('document_id',d->>'document_id'));
 if r#>>'{result,status}'<>'complete' or r#>>'{result,document_status}'<>'uploaded' then raise exception 'SIGNATURE_READBACK_FAILED';end if;
end $$;
select set_config('request.jwt.claim.sub','a9200000-0000-4000-8000-000000000012',true);
do $$
declare w uuid:='a9200000-0000-4000-8000-000000000001';r jsonb;s jsonb;act text;
begin
 foreach act in array array['archives','archive','review_signatures','decide_request'] loop
  begin perform public.aqari_contract_administration(w,act,'{}');raise exception 'STAFF_ADMIN_BYPASS:%',act;exception when insufficient_privilege then null;end;
 end loop;
 r:=public.aqari_contract_administration(w,'request_change','{"id":"a9200000-0000-4000-8000-000000000051","contract_ref":"synthetic-lease","proposed_change":"Synthetic request only"}');
 if r#>>'{result,status}'<>'pending' then raise exception 'REQUEST_NOT_PENDING';end if;
 begin perform public.aqari_contract_administration('a9200000-0000-4000-8000-000000000099','requests');raise exception 'CROSS_WORKSPACE';exception when insufficient_privilege then null;end;
 s:=public.aqari_read_state_v267(w);
 begin perform public.aqari_save_state_v267(w,jsonb_set(s->'payload','{contractsV202}','[{"id":"forbidden-staff-draft","status":"draft"}]'),(s->>'revision')::bigint);raise exception 'STAFF_CREATED_DRAFT';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','a9200000-0000-4000-8000-000000000011',true);
select public.aqari_contract_administration('a9200000-0000-4000-8000-000000000001','decide_request','{"id":"a9200000-0000-4000-8000-000000000051","status":"approved","reason":"Synthetic approval only"}');
reset role;
do $$begin
 if (select count(*) from public.aqari_leases where workspace_id='a9200000-0000-4000-8000-000000000001')<>1 then raise exception 'ARCHIVE_CREATED_LEASE';end if;
 if exists(select 1 from public.aqari_rent_payments where workspace_id='a9200000-0000-4000-8000-000000000001') then raise exception 'ARCHIVE_CREATED_PAYMENT';end if;
 if exists(select 1 from private.aqari_integration_outbox where workspace_id='a9200000-0000-4000-8000-000000000001') then raise exception 'ARCHIVE_QUEUED_SEND';end if;
 if exists(select 1 from public.aqari_notification_outbox where workspace_id='a9200000-0000-4000-8000-000000000001') then raise exception 'ARCHIVE_QUEUED_NOTIFICATION';end if;
 if (select snapshot from public.aqari_leases where id='a9200000-0000-4000-8000-000000000024')<>'{}'::jsonb then raise exception 'APPROVAL_REWROTE_LEASE';end if;
end $$;
-- An operational signed copy cannot be reused after its contract content changes.
insert into public.aqari_documents(id,workspace_id,document_no,document_type,entity_type,entity_ref,title,original_filename,mime_type,metadata,storage_bucket,storage_path,status,created_by) values
 ('a9200000-0000-4000-8000-000000000027','a9200000-0000-4000-8000-000000000001','TEST-SIGNED','signed_contract','lease','synthetic-lease','Synthetic signed copy','signed.pdf','application/pdf','{}','aqari-documents','a9200000-0000-4000-8000-000000000001/a9200000-0000-4000-8000-000000000027.pdf','draft','a9200000-0000-4000-8000-000000000011');
insert into storage.objects(bucket_id,name,metadata) values('aqari-documents','a9200000-0000-4000-8000-000000000001/a9200000-0000-4000-8000-000000000027.pdf','{"size":10,"mimetype":"application/pdf"}');
update public.aqari_documents set status='uploaded',size_bytes=10,checksum_sha256=repeat('b',64) where id='a9200000-0000-4000-8000-000000000027';
set local role authenticated;
select public.aqari_contract_administration('a9200000-0000-4000-8000-000000000001','review_signatures','{"id":"a9200000-0000-4000-8000-000000000061","document_id":"a9200000-0000-4000-8000-000000000027","required_signers":["tenant","landlord"],"signed_by":["tenant","landlord"]}');
reset role;
update public.aqari_leases set snapshot='{"rent":101}' where id='a9200000-0000-4000-8000-000000000024';
set local role authenticated;
do $$declare r jsonb;w uuid:='a9200000-0000-4000-8000-000000000001';begin
 r:=public.aqari_contract_administration(w,'signature_status','{"document_id":"a9200000-0000-4000-8000-000000000027"}');
 if r#>>'{result,status}'<>'outdated_copy' then raise exception 'OLD_SIGNED_COPY_REUSED';end if;
 begin perform public.aqari_contract_administration(w,'review_signatures','{"id":"a9200000-0000-4000-8000-000000000062","document_id":"a9200000-0000-4000-8000-000000000027","required_signers":["tenant","landlord"],"signed_by":["tenant","landlord"]}');raise exception 'OLD_COPY_REAPPROVED';exception when invalid_parameter_value then if sqlerrm<>'SIGNED_COPY_OUTDATED' then raise;end if;end;
end $$;
reset role;
