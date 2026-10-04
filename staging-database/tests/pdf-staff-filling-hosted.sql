-- Preview/isolated database only. Real authorization functions, synthetic users,
-- and a rollback keep contracts, payments and existing identities unchanged.
begin;
select set_config('aqari.pdf_staff_test',jsonb_build_object('workspace',d.workspace_id,'property',p.id,'document',d.id,'manager',m.user_id,'staff',gen_random_uuid(),'viewer',gen_random_uuid(),'collector',gen_random_uuid(),'draft',gen_random_uuid(),'manager_draft',gen_random_uuid(),'request',gen_random_uuid())::text,true)
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
rollback;
select 'PASS real role/property guards, approval, values-only drafts, own-draft isolation, restore, retry identity, request/response, revocation and rollback' as result,
 (select count(*) from private.aqari_pdf_template_approvals) as approvals_after,
 (select count(*) from private.aqari_pdf_template_requests) as requests_after,
 (select count(*) from auth.users where email like 'pdf-staff-acceptance-%@example.invalid') as synthetic_users_after;
