-- Preview/isolated database only. Real authorization functions, synthetic users,
-- and a rollback keep contracts, payments and existing identities unchanged.
begin;
select set_config('aqari.pdf_staff_test',jsonb_build_object('workspace',d.workspace_id,'property',p.id,'document',d.id,'manager',m.user_id,'staff',gen_random_uuid(),'viewer',gen_random_uuid(),'collector',gen_random_uuid(),'draft',gen_random_uuid(),'manager_draft',gen_random_uuid(),'request',gen_random_uuid(),'manager2',gen_random_uuid(),'next_document',gen_random_uuid(),'competing_document',gen_random_uuid(),'copy_document',gen_random_uuid())::text,true)
from public.aqari_documents d join public.aqari_properties p on p.workspace_id=d.workspace_id and p.external_ref=d.entity_ref and p.id::text=d.metadata->>'property_id'
join public.aqari_memberships m on m.workspace_id=d.workspace_id and m.role='general_manager' and m.is_active
where d.status='uploaded' and d.mime_type='application/pdf' and d.entity_type='property' and d.document_type='property_document' and d.metadata @> '{"category":"property_other","asset_role":"property_contract","pdf_field_template":true}' order by d.id,m.user_id limit 1;
do $$declare c jsonb:=current_setting('aqari.pdf_staff_test')::jsonb; k text;u uuid;begin
 foreach k in array array['staff','viewer','collector'] loop
  u:=(c->>k)::uuid;
  insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) select 'pdf-staff-acceptance-'||u::text||'@example.invalid','Synthetic PDF acceptance',(case k when 'staff' then 'property_manager' when 'viewer' then 'viewer' else 'accountant' end)::public.aqari_role,slug from public.aqari_workspaces where id=(c->>'workspace')::uuid;
  insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values(u,'pdf-staff-acceptance-'||u::text||'@example.invalid','{}','{}');
  insert into private.aqari_staff_assignments(workspace_id,user_id,operational_role,property_ids,is_active,updated_by) values((c->>'workspace')::uuid,u,case k when 'staff' then 'property_manager' else k end,array[(c->>'property')::uuid],true,(c->>'manager')::uuid);
 end loop;
end $$;
do $$declare c jsonb:=current_setting('aqari.pdf_staff_test')::jsonb;source public.aqari_documents;d public.aqari_documents;k text;target public.aqari_properties;begin
 select * into source from public.aqari_documents where id=(c->>'document')::uuid;
 select * into target from public.aqari_properties where workspace_id=source.workspace_id and id<>(c->>'property')::uuid order by id limit 1;
 if target.id is null then raise exception 'SECOND_TEST_PROPERTY_REQUIRED';end if;
 c:=c||jsonb_build_object('target_property',target.id);perform set_config('aqari.pdf_staff_test',c::text,true);
 insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) select 'pdf-staff-acceptance-'||(c->>'manager2')||'@example.invalid','Synthetic second manager','general_manager',slug from public.aqari_workspaces where id=source.workspace_id;
 insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values((c->>'manager2')::uuid,'pdf-staff-acceptance-'||(c->>'manager2')||'@example.invalid','{}','{}');
 perform set_config('request.jwt.claim.sub',c->>'manager',true);
 foreach k in array array['next_document','competing_document','copy_document'] loop
  d:=source;d.id:=(c->>k)::uuid;d.document_no:='TEST-'||d.id::text;d.storage_path:=source.workspace_id::text||'/'||d.id::text||'.pdf';d.title:='Synthetic version fixture';d.status:='draft';d.size_bytes:=null;d.uploaded_at:=null;d.checksum_sha256:=null;d.created_by:=(c->>'manager')::uuid;
  if k='copy_document' then d.entity_ref:=target.external_ref;d.metadata:=d.metadata||jsonb_build_object('property_id',target.id::text);end if;
  insert into public.aqari_documents select d.*;
  -- Synthetic object metadata exists only within this rollback transaction.
  -- Real PDF bytes/checksums are tested by the Python API suite, not this SQL fixture.
  insert into storage.objects(id,bucket_id,name,metadata) values(gen_random_uuid(),d.storage_bucket,d.storage_path,jsonb_build_object('size',512,'mimetype','application/pdf'));
  update public.aqari_documents set status='uploaded',size_bytes=512,checksum_sha256=repeat('a',64) where id=d.id;
 end loop;
end$$;
set local role authenticated;
do $$
declare c jsonb:=current_setting('aqari.pdf_staff_test')::jsonb;w uuid:=(c->>'workspace')::uuid;p jsonb:=jsonb_build_object('property_id',c->>'property');doc jsonb:=p||jsonb_build_object('document_id',c->>'document');m jsonb;data jsonb;a jsonb;b jsonb;k text;
begin
 m:=jsonb_build_object('version',1,'propertyId',c->>'property','title','Synthetic staff acceptance','fields',jsonb_build_array(jsonb_build_object('id','name','label','Name','type','text','page',1,'x',0.1,'y',0.2,'width',0.3,'height',0.03,'fontSize',10,'align','right','color','#000000')));
 data:=doc||jsonb_build_object('id',c->>'draft','expected_revision',0,'request_id',c->>'request','snapshot',jsonb_build_object('mapping',m,'values','{"name":"Synthetic value"}'::jsonb,'page',1,'selected','name'));
 perform set_config('request.jwt.claim.sub',c->>'staff',true);
 begin perform public.aqari_pdf_templates(w,'publish',doc||jsonb_build_object('mapping',m));raise exception 'STAFF_PUBLISH_ALLOWED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_pdf_editor_drafts(w,'save',data);raise exception 'UNAPPROVED_ALLOWED';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',c->>'manager',true);
 perform public.aqari_pdf_templates(w,'publish',doc||jsonb_build_object('mapping',m));
 perform public.aqari_pdf_templates(w,'publish',doc||jsonb_build_object('mapping',m));
 perform public.aqari_pdf_editor_drafts(w,'save',data||jsonb_build_object('id',c->>'manager_draft'));
 perform set_config('request.jwt.claim.sub',c->>'staff',true);
 a:=public.aqari_pdf_templates(w,'context',doc);if a->>'can_publish'<>'false' or a->>'can_fill'<>'true' then raise exception 'STAFF_CONTEXT_FAILED';end if;
 a:=public.aqari_pdf_editor_drafts(w,'save',data);b:=public.aqari_pdf_editor_drafts(w,'save',data);if a<>b or a->>'revision'<>'1' then raise exception 'RETRY_FAILED';end if;
 b:=public.aqari_pdf_editor_drafts(w,'get',p||jsonb_build_object('id',c->>'draft'));if a<>b then raise exception 'RESTORE_FAILED';end if;
 begin perform public.aqari_pdf_editor_drafts(w,'get',p||jsonb_build_object('id',c->>'manager_draft'));raise exception 'OTHER_USER_DRAFT_LEAK';exception when insufficient_privilege then null;end;
 begin perform public.aqari_pdf_editor_drafts(w,'save',jsonb_set(data,'{snapshot,mapping,title}','"Tampered"')||jsonb_build_object('expected_revision',1,'request_id',gen_random_uuid()));raise exception 'MAPPING_CHANGE_ALLOWED';exception when insufficient_privilege then if sqlerrm<>'PDF_TEMPLATE_IMMUTABLE' then raise;end if;end;
 a:=public.aqari_pdf_templates(w,'request',doc||jsonb_build_object('id',c->>'request','reason','Please enlarge the name field'));
 b:=public.aqari_pdf_templates(w,'request',doc||jsonb_build_object('id',c->>'request','reason','Please enlarge the name field'));if a<>b then raise exception 'REQUEST_RETRY_FAILED';end if;
 begin perform public.aqari_pdf_templates(w,'respond',p||jsonb_build_object('id',c->>'request','response','Unauthorized response'));raise exception 'STAFF_RESPONSE_ALLOWED';exception when insufficient_privilege then null;end;
 begin perform count(*) from private.aqari_pdf_template_approvals;raise exception 'DIRECT_TABLE_ACCESS';exception when insufficient_privilege then null;end;
 foreach k in array array['viewer','collector'] loop
  perform set_config('request.jwt.claim.sub',c->>k,true);
  begin perform public.aqari_pdf_templates(w,'context',p);raise exception 'ROLE_CEILING_FAILED';exception when insufficient_privilege then null;end;
 end loop;
 perform set_config('request.jwt.claim.sub',c->>'manager',true);
 perform public.aqari_pdf_templates(w,'respond',p||jsonb_build_object('id',c->>'request','response','Reviewed: create and approve a new version'));
 perform set_config('request.jwt.claim.sub',c->>'staff',true);
 a:=public.aqari_pdf_templates(w,'requests',p);if a#>>'{items,0,response}'<>'Reviewed: create and approve a new version' then raise exception 'RESPONSE_NOT_VISIBLE';end if;
end$$;
do $$declare c jsonb:=current_setting('aqari.pdf_staff_test')::jsonb;w uuid:=(c->>'workspace')::uuid;p jsonb:=jsonb_build_object('property_id',c->>'property');a jsonb;m jsonb;origin jsonb;begin
 perform set_config('request.jwt.claim.sub',c->>'manager',true);
 a:=public.aqari_pdf_templates(w,'context',p||jsonb_build_object('document_id',c->>'document'));m:=a->'mapping';
 if a#>>'{template_version,revision}'<>'1' then raise exception 'ROOT_VERSION_FAILED';end if;
 origin:=jsonb_build_object('kind','revision','document_id',c->>'document','revision',1);
 a:=public.aqari_pdf_templates(w,'publish',p||jsonb_build_object('document_id',c->>'next_document','mapping',m,'origin',origin));
 if a->>'revision'<>'2' then raise exception 'REVISION_ADVANCE_FAILED';end if;
 a:=public.aqari_pdf_templates(w,'publish',p||jsonb_build_object('document_id',c->>'next_document','mapping',m,'origin',origin));
 if a->>'revision'<>'2' then raise exception 'REVISION_RETRY_FAILED';end if;
 perform set_config('request.jwt.claim.sub',c->>'manager2',true);
 begin perform public.aqari_pdf_templates(w,'publish',p||jsonb_build_object('document_id',c->>'competing_document','mapping',m,'origin',origin));raise exception 'STALE_MANAGER_ALLOWED';exception when serialization_failure then if sqlerrm<>'PDF_TEMPLATE_REVISION_CONFLICT' then raise;end if;end;
 a:=public.aqari_pdf_templates(w,'history',p||jsonb_build_object('document_id',c->>'document'));
 if jsonb_array_length(a->'items')<>2 or a#>>'{items,0,revision}'<>'2' then raise exception 'HISTORY_FAILED';end if;
 a:=public.aqari_pdf_templates(w,'list',p);
 if jsonb_array_length(a->'items')<>1 or a#>>'{items,0,document_id}'<>c->>'next_document' then raise exception 'HEAD_LIST_FAILED';end if;
 a:=public.aqari_pdf_templates(w,'publish',jsonb_build_object('property_id',c->>'target_property','document_id',c->>'copy_document','mapping',m||jsonb_build_object('propertyId',c->>'target_property'),'origin',jsonb_build_object('kind','copy','document_id',c->>'next_document','property_id',c->>'property')));
 if a->>'revision'<>'1' then raise exception 'COPY_INDEPENDENT_ROOT_FAILED';end if;
 perform set_config('request.jwt.claim.sub',c->>'staff',true);
 a:=public.aqari_pdf_templates(w,'context',p||jsonb_build_object('document_id',c->>'document'));
 if a#>>'{template_version,revision}'<>'1' or a#>>'{template_version,is_latest}'<>'false' then raise exception 'OLD_DRAFT_VERSION_LOST';end if;
 begin perform public.aqari_pdf_templates(w,'history',p||jsonb_build_object('document_id',c->>'document'));raise exception 'STAFF_HISTORY_ALLOWED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_pdf_templates(w,'context',jsonb_build_object('property_id',c->>'target_property','document_id',c->>'copy_document'));raise exception 'CROSS_PROPERTY_LEAK';exception when insufficient_privilege then null;end;
 begin perform private.aqari_pdf_templates_v400(w,'publish',p||jsonb_build_object('document_id',c->>'competing_document','mapping',m));raise exception 'LEGACY_BYPASS_ALLOWED';exception when insufficient_privilege then null;end;
end$$;
reset role;
update private.aqari_staff_assignments set is_active=false where user_id=(current_setting('aqari.pdf_staff_test')::jsonb->>'staff')::uuid;
set local role authenticated;
do $$declare c jsonb:=current_setting('aqari.pdf_staff_test')::jsonb;begin
 perform set_config('request.jwt.claim.sub',c->>'staff',true);
 begin perform public.aqari_pdf_editor_drafts((c->>'workspace')::uuid,'get',jsonb_build_object('property_id',c->>'property','id',c->>'draft'));raise exception 'REVOKED_STAFF_ALLOWED';exception when insufficient_privilege then null;end;
end$$;
reset role;
update private.aqari_staff_assignments set is_active=true where user_id=(current_setting('aqari.pdf_staff_test')::jsonb->>'staff')::uuid;
set local role authenticated;
do $$declare c jsonb:=current_setting('aqari.pdf_staff_test')::jsonb;w uuid:=(c->>'workspace')::uuid;p jsonb:=jsonb_build_object('property_id',c->>'property');begin
 perform set_config('request.jwt.claim.sub',c->>'manager',true);perform public.aqari_pdf_templates(w,'revoke',p||jsonb_build_object('document_id',c->>'document'));
 perform set_config('request.jwt.claim.sub',c->>'staff',true);
 begin perform public.aqari_pdf_templates(w,'context',p||jsonb_build_object('document_id',c->>'document'));raise exception 'REVOKED_TEMPLATE_ALLOWED';exception when insufficient_privilege then null;end;
 if jsonb_array_length(public.aqari_pdf_editor_drafts(w,'list',p)->'items')<>0 then raise exception 'REVOKED_DRAFT_LIST';end if;
end$$;
reset role;
do $$begin
 if has_function_privilege('anon','public.aqari_pdf_templates(uuid,text,jsonb)','EXECUTE') then raise exception 'ANON_RPC_ACCESS';end if;
 if (select count(*) from private.aqari_pdf_template_requests)<>1 then raise exception 'DUPLICATE_REQUEST';end if;
end$$;

-- Manager-reviewed copy is bound without changing the actual lease.
reset role;
do $$declare c jsonb:=current_setting('aqari.pdf_staff_test')::jsonb;d public.aqari_documents;l public.aqari_leases;v private.aqari_pdf_template_versions;begin
 select * into l from public.aqari_leases lease where lease.workspace_id=(c->>'workspace')::uuid and exists(select 1 from public.aqari_units u where u.id=lease.unit_id and u.property_id=(c->>'property')::uuid) limit 1;
 if l.id is null then raise exception 'TEST_LEASE_REQUIRED';end if;
 select * into v from private.aqari_pdf_template_versions where document_id=(c->>'next_document')::uuid;
 select * into d from public.aqari_documents where id=v.document_id;
 c:=c||jsonb_build_object('bound_artifact',gen_random_uuid(),'lease_ref',l.external_ref,'lease_id',l.id,'source_revision',v.revision,'leases_hash',(select md5(jsonb_agg(to_jsonb(x) order by id)::text) from public.aqari_leases x));
 perform set_config('aqari.pdf_staff_test',c::text,true);perform set_config('request.jwt.claim.sub',c->>'manager',true);
 d.id:=(c->>'bound_artifact')::uuid;d.document_no:='TEST-'||d.id::text;d.storage_path:=d.workspace_id::text||'/'||d.id::text||'.pdf';d.status:='draft';d.size_bytes:=null;d.uploaded_at:=null;d.checksum_sha256:=null;d.created_by:=(c->>'manager')::uuid;
 d.metadata:=(d.metadata-'pdf_field_template')||jsonb_build_object('pdf_source_document_id',v.document_id::text,'pdf_source_revision',v.revision);
 insert into public.aqari_documents select d.*;
 insert into storage.objects(id,bucket_id,name,metadata) values(gen_random_uuid(),d.storage_bucket,d.storage_path,jsonb_build_object('size',512,'mimetype','application/pdf'));
 update public.aqari_documents set status='uploaded',size_bytes=512,checksum_sha256=repeat('b',64) where id=d.id;
end$$;
set local role authenticated;
do $$declare c jsonb:=current_setting('aqari.pdf_staff_test')::jsonb;w uuid:=(c->>'workspace')::uuid;d jsonb;a jsonb;b jsonb;k text;begin
 d:=jsonb_build_object('property_id',c->>'property','contract_ref',c->>'lease_ref','artifact_document_id',c->>'bound_artifact','template_document_id',c->>'next_document','template_revision',(c->>'source_revision')::int,'confirmed',true);
 foreach k in array array['staff','viewer','collector'] loop
  perform set_config('request.jwt.claim.sub',c->>k,true);
  begin perform public.aqari_pdf_contract_bindings(w,'bind',d);raise exception 'UNAUTHORIZED_BINDING';exception when insufficient_privilege then null;end;
 end loop;
 perform set_config('request.jwt.claim.sub',c->>'manager',true);
 begin perform public.aqari_pdf_contract_bindings(w,'bind',d||jsonb_build_object('property_id',c->>'target_property'));raise exception 'WRONG_PROPERTY_BINDING';exception when insufficient_privilege then null;end;
 a:=public.aqari_pdf_contract_bindings(w,'bind',d);b:=public.aqari_pdf_contract_bindings(w,'bind',d);if a<>b then raise exception 'RETRY_FAILED';end if;
 b:=public.aqari_pdf_contract_bindings(w,'list',jsonb_build_object('property_id',c->>'property','contract_ref',c->>'lease_ref'));
 if b#>>'{items,0,artifact_document_id}'<>c->>'bound_artifact' or b#>>'{items,0,template_revision}'<>c->>'source_revision' then raise exception 'READBACK_FAILED';end if;
 perform public.aqari_pdf_templates(w,'revoke',jsonb_build_object('property_id',c->>'property','document_id',c->>'next_document'));
 b:=public.aqari_pdf_contract_bindings(w,'bind',d);if a<>b then raise exception 'RETIRED_RETRY_FAILED';end if;
 begin perform count(*) from private.aqari_pdf_contract_bindings;raise exception 'DIRECT_BINDING_READ';exception when insufficient_privilege then null;end;
end$$;
reset role;
do $$declare c jsonb:=current_setting('aqari.pdf_staff_test')::jsonb;begin
 if c->>'leases_hash' is distinct from (select md5(jsonb_agg(to_jsonb(x) order by id)::text) from public.aqari_leases x) then raise exception 'LEASES_CHANGED';end if;
 if has_function_privilege('anon','public.aqari_pdf_contract_bindings(uuid,text,jsonb)','EXECUTE') then raise exception 'ANON_BINDING_ACCESS';end if;
 begin update private.aqari_pdf_contract_bindings set template_revision=99 where artifact_document_id=(c->>'bound_artifact')::uuid;raise exception 'BINDING_MUTABLE';exception when others then if sqlerrm<>'PDF_BINDING_IMMUTABLE' then raise;end if;end;
end$$;
rollback;
select 'PASS hosted contract PDF binding: actual role/property checks, immutable version, idempotent retry, revoked source retained, no lease mutation, rollback' as result,
 (select count(*) from private.aqari_pdf_contract_bindings) as bindings_after,
 (select count(*) from auth.users where email like 'pdf-staff-acceptance-%@example.invalid') as synthetic_users_after;
