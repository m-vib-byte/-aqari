-- Execute only in the isolated local runner. The entire behavioral test rolls back.
begin;
do $$begin
 if exists(select 1 from private.aqari_rental_template_drafts_v2 d join template_legacy_baseline b using(id) where to_jsonb(d)-'family_id'-'presentation'-'source_version_id'<>b.row) then raise exception 'LEGACY_DRAFT_REWRITTEN';end if;
 if exists(select 1 from private.aqari_rental_template_versions v join template_published_baseline b using(id) where private.aqari_rental_template_snapshot(v)<>b.snapshot) then raise exception 'LEGACY_SNAPSHOT_REWRITTEN';end if;
 if exists(select 1 from private.aqari_rental_template_draft_history) then raise exception 'MIGRATION_CREATED_DRAFT_HISTORY';end if;
 if has_table_privilege('authenticated','private.aqari_rental_document_archive','select') or has_table_privilege('service_role','private.aqari_rental_document_archive','insert') then raise exception 'ARCHIVE_DIRECT_ACCESS_GRANTED';end if;
 if has_function_privilege('anon','public.aqari_rental_document_source(uuid,uuid,uuid,uuid)','execute') or has_function_privilege('authenticated','public.aqari_rental_document_issue(uuid,uuid,jsonb,uuid,uuid,uuid,uuid,text,jsonb,text,text,text,boolean,text)','execute') then raise exception 'RPC_PRIVILEGE_LEAK';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
set local role authenticated;
do $$
declare w uuid:='79910000-0000-4000-8000-000000000001';req jsonb;r jsonb;again jsonb;d jsonb;ctx jsonb;pub jsonb;kind text;idx int:=100;before_hash text;pres jsonb;
begin
 ctx:=public.aqari_rental_templates(w,'context');if ctx->>'can_publish'<>'true' or jsonb_array_length(ctx->'drafts')<>1 then raise exception 'CONTEXT_FAILED';end if;
 -- Viewing and history read do not initialize or rewrite a draft.
 perform public.aqari_rental_templates(w,'history','{"id":"79910000-0000-4000-8000-000000000020"}');
 -- Legacy generic placeholders remain preservable in drafts and cannot publish.
 req:=ctx#>'{drafts,0}';req:=req||jsonb_build_object('request_id','79910000-0000-4000-8000-000000000022');
 r:=public.aqari_rental_templates(w,'save_draft',req);again:=public.aqari_rental_templates(w,'save_draft',req);
 if r<>again or r#>>'{record,revision}'<>'5' or r#>'{record,clauses}'<>req->'clauses' then raise exception 'AUTOSAVE_NOT_IDEMPOTENT';end if;
 if jsonb_array_length(public.aqari_rental_templates(w,'history',jsonb_build_object('id',req->>'id'))->'revisions')<>2 then raise exception 'PRIOR_REVISION_LOST';end if;
 begin perform public.aqari_rental_templates(w,'save_draft',req||'{"request_id":"79910000-0000-4000-8000-000000000023"}');raise exception 'STALE_DRAFT_ALLOWED';exception when serialization_failure then null;end;
 begin perform public.aqari_rental_templates(w,'publish',(r->'record')||jsonb_build_object('id','79910000-0000-4000-8000-000000000024','source_draft_id',req->>'id','expected_version',0,'reason','Synthetic approval test','approved',true));raise exception 'GENERIC_PUBLISHED';exception when invalid_parameter_value then null;end;
 -- Blank and partial work must survive autosave.
 req:=jsonb_build_object('id','79910000-0000-4000-8000-000000000025','kind','custom_type','kind_label','Custom','title','','clauses','[]'::jsonb,'fields','[]'::jsonb,'revision',0,'request_id','79910000-0000-4000-8000-000000000026');
 r:=public.aqari_rental_templates(w,'save_draft',req);if r#>>'{record,title}'<>'' then raise exception 'BLANK_DRAFT_LOST';end if;
 pres:='{"version":1,"paper":"A4","language":"ar","logo":{"enabled":false,"source":"property"},"signers":{"owner":{"name":true,"signature":true,"fingerprint":true},"tenant":{"name":true,"signature":true,"fingerprint":true}},"placements":[]}';
 -- Five types plus a custom type can publish independently; every family starts at1.
 foreach kind in array array['rental_agreement','apartment_handover','rent_receipt','eviction','owner_final_clearance','custom_type'] loop
  idx:=idx+1;
  req:=jsonb_build_object('id',('79910000-0000-4000-8000-'||lpad(idx::text,12,'0')),'kind',kind,'kind_label','Synthetic','title','Synthetic {{tenant_name}}','fields','[{"key":"tenant_name","label":"Tenant","type":"text","required":true}]'::jsonb,'clauses','[{"title":"One","text":"Literal {{tenant_name}}"}]'::jsonb,'revision',0,'request_id',gen_random_uuid(),'presentation',pres);
  r:=public.aqari_rental_templates(w,'save_draft',req);
  pub:=public.aqari_rental_templates(w,'publish',(r->'record')||jsonb_build_object('id',gen_random_uuid(),'source_draft_id',req->>'id','expected_version',0,'reason','Synthetic approval test','approved',true));
  if pub#>>'{record,version}'<>'1' or pub#>'{record,presentation}'<>pres then raise exception 'FAMILY_VERSION_OR_PRESENTATION_LOST';end if;
 end loop;
 -- Independent copy of same kind has its own family and version1.
 r:=public.aqari_rental_templates(w,'copy_draft',jsonb_build_object('id','79910000-0000-4000-8000-000000000200','source_id',pub#>>'{record,id}','request_id',gen_random_uuid()));
 if r#>>'{record,family_id}'<>'79910000-0000-4000-8000-000000000200' then raise exception 'COPY_SHARED_FAMILY';end if;
 pub:=public.aqari_rental_templates(w,'publish',(r->'record')||jsonb_build_object('id','79910000-0000-4000-8000-000000000201','source_draft_id',r#>>'{record,id}','expected_version',0,'reason','Synthetic approval test','approved',true));
 -- Legacy revision continues at2 and exposes base_version1 without changing old snapshot.
 r:=public.aqari_rental_templates(w,'revise','{"id":"79910000-0000-4000-8000-000000000210","source_id":"79910000-0000-4000-8000-000000000030","request_id":"79910000-0000-4000-8000-000000000211"}');
 if r#>>'{record,base_version}'<>'1' then raise exception 'LEGACY_BASE_VERSION_LOST';end if;
 pub:=public.aqari_rental_templates(w,'publish',(r->'record')||jsonb_build_object('id','79910000-0000-4000-8000-000000000212','source_draft_id',r#>>'{record,id}','expected_version',1,'reason','Synthetic approval test','approved',true));
 if pub#>>'{record,version}'<>'2' or jsonb_array_length(public.aqari_rental_templates(w,'history','{"id":"79910000-0000-4000-8000-000000000212"}')->'revisions')<>2 then raise exception 'LEGACY_FAMILY_HISTORY_FAILED';end if;
 -- Bad layout, unknown tokens, malformed tokens, canonical alias collision all fail publication/save appropriately.
 req:=jsonb_build_object('id','79910000-0000-4000-8000-000000000220','kind','rental_agreement','kind_label','Synthetic','title','Invalid','fields','[]'::jsonb,'clauses','[{"title":"One","text":"Unknown {{ghost}}"}]'::jsonb,'revision',0,'request_id',gen_random_uuid());
 begin perform public.aqari_rental_templates(w,'save_draft',req||'{"presentation":{"version":1,"paper":"A4","language":"ar"}}');raise exception 'PARTIAL_PRESENTATION_ALLOWED';exception when invalid_parameter_value then null;end;
 r:=public.aqari_rental_templates(w,'save_draft',req);
 begin perform public.aqari_rental_templates(w,'publish',(r->'record')||jsonb_build_object('id',gen_random_uuid(),'source_draft_id',r#>>'{record,id}','expected_version',0,'reason','Synthetic approval test','approved',true));raise exception 'UNKNOWN_TOKEN_PUBLISHED';exception when invalid_parameter_value then null;end;
 perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
 begin perform public.aqari_rental_templates(w,'publish',(r->'record')||jsonb_build_object('id',gen_random_uuid(),'source_draft_id',r#>>'{record,id}','expected_version',0,'reason','Synthetic approval test','approved',true));raise exception 'AAL1_PUBLISHED';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- The previously saved original36-line payload is still intact in history.
do $$begin
 if not exists(select 1 from private.aqari_rental_template_draft_history h join template_legacy_baseline b on b.id=h.draft_id where h.revision=4 and h.record->'clauses'=b.row->'clauses') then raise exception 'LEGACY36_NOT_PRESERVED';end if;
 if private.aqari_template_tokens_valid('X','[{"title":"Bad","text":"{{ incomplete }}"}]','[]') then raise exception 'MALFORMED_TOKEN_VALID';end if;
 if private.aqari_template_tokens_valid('X','[{"title":"Fine","text":"Literal"}]','[{"key":"civil_id"},{"key":"tenant_civil_id"}]') then raise exception 'ALIAS_COLLISION_VALID';end if;
end $$;
select set_config('request.jwt.claim.sub','79910000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$begin
 begin perform public.aqari_rental_templates('79910000-0000-4000-8000-000000000001','save_draft','{}');raise exception 'VIEWER_SAVED_TEMPLATE';exception when insufficient_privilege then null;end;
 begin perform public.aqari_rental_document_source('79910000-0000-4000-8000-000000000001','79910000-0000-4000-8000-000000000201','79910000-0000-4000-8000-000000000013');raise exception 'VIEWER_READ_BOUND_SOURCE';exception when insufficient_privilege then null;end;
 begin perform public.aqari_rental_document_issue(null,null,null,null,null,null,null,null,null,null,null,null,true,'denied');raise exception 'BROWSER_COMMITTED_PDF';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','79910000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
create temp table issue_fixture as select public.aqari_rental_document_source('79910000-0000-4000-8000-000000000001','79910000-0000-4000-8000-000000000201','79910000-0000-4000-8000-000000000013') src;
grant select on issue_fixture to service_role,authenticated;
set local role service_role;
do $$declare s jsonb;result jsonb;again jsonb;snap jsonb;claims jsonb;bytes bytea:=convert_to('%PDF-1.4 synthetic exact archive','UTF8');begin
 select src into s from issue_fixture;snap:=jsonb_build_object('source',s->'source','values',jsonb_build_object('tenant_name','Synthetic Tenant'),'rendered','Synthetic reviewed text');claims:=auth.jwt();
 result:=public.aqari_rental_document_issue('79910000-0000-4000-8000-000000000001','79910000-0000-4000-8000-000000000002',claims,'79910000-0000-4000-8000-000000000250','79910000-0000-4000-8000-000000000201','79910000-0000-4000-8000-000000000013',null,s->>'source_sha256',snap,encode(bytes,'base64'),encode(sha256(bytes),'hex'),'synthetic-renderer',true,'Synthetic reviewed issue');
 again:=public.aqari_rental_document_issue('79910000-0000-4000-8000-000000000001','79910000-0000-4000-8000-000000000002',claims,'79910000-0000-4000-8000-000000000250','79910000-0000-4000-8000-000000000201','79910000-0000-4000-8000-000000000013',null,s->>'source_sha256',snap,encode(bytes,'base64'),encode(sha256(bytes),'hex'),'synthetic-renderer',true,'Synthetic reviewed issue');
 if result->>'archived'<>'true' or again->>'replayed'<>'true' or result->'record'<>again->'record' then raise exception 'ISSUE_REPLAY_FAILED';end if;
 begin perform public.aqari_rental_document_issue('79910000-0000-4000-8000-000000000001','79910000-0000-4000-8000-000000000002',claims,'79910000-0000-4000-8000-000000000251','79910000-0000-4000-8000-000000000201','79910000-0000-4000-8000-000000000013',null,repeat('a',64),snap,encode(bytes,'base64'),encode(sha256(bytes),'hex'),'synthetic-renderer',true,'Synthetic reviewed issue');raise exception 'STALE_SOURCE_COMMITTED';exception when serialization_failure then null;end;
 begin perform public.aqari_rental_document_issue('79910000-0000-4000-8000-000000000001','79910000-0000-4000-8000-000000000002',claims,'79910000-0000-4000-8000-000000000251','79910000-0000-4000-8000-000000000201','79910000-0000-4000-8000-000000000013',null,s->>'source_sha256',jsonb_set(snap,'{source,property,id}','"79910000-0000-4000-8000-000000000999"'),encode(bytes,'base64'),encode(sha256(bytes),'hex'),'synthetic-renderer',true,'Synthetic reviewed issue');raise exception 'FORGED_PROPERTY_COMMITTED';exception when serialization_failure then null;end;
 begin perform public.aqari_rental_document_issue('79910000-0000-4000-8000-000000000001','79910000-0000-4000-8000-000000000002','{"aal":"aal1"}','79910000-0000-4000-8000-000000000251','79910000-0000-4000-8000-000000000201','79910000-0000-4000-8000-000000000013',null,s->>'source_sha256',snap,encode(bytes,'base64'),encode(sha256(bytes),'hex'),'synthetic-renderer',true,'Synthetic reviewed issue');raise exception 'ISSUE_WITHOUT_MFA';exception when insufficient_privilege then null;end;
 begin perform public.aqari_rental_document_issue('79910000-0000-4000-8000-000000000001','79910000-0000-4000-8000-000000000003',claims,'79910000-0000-4000-8000-000000000251','79910000-0000-4000-8000-000000000201','79910000-0000-4000-8000-000000000013',null,s->>'source_sha256',snap,encode(bytes,'base64'),encode(sha256(bytes),'hex'),'synthetic-renderer',true,'Synthetic reviewed issue');raise exception 'NONOWNER_ISSUED';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role authenticated;
do $$declare r jsonb;begin
 r:=public.aqari_rental_document_archive('79910000-0000-4000-8000-000000000001','get','{"id":"79910000-0000-4000-8000-000000000250"}');
 if convert_from(decode(r#>>'{record,pdf_base64}','base64'),'UTF8')<>'%PDF-1.4 synthetic exact archive' then raise exception 'ARCHIVE_BYTES_CHANGED';end if;
 begin perform public.aqari_rental_document_archive('70000000-0000-4000-8000-000000000001','get','{"id":"79910000-0000-4000-8000-000000000250"}');raise exception 'CROSS_WORKSPACE_ARCHIVE';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 begin update private.aqari_rental_document_archive set title='mutate';raise exception 'ARCHIVE_MUTATED';exception when check_violation then null;end;
 begin delete from private.aqari_rental_template_draft_history;raise exception 'HISTORY_DELETED';exception when check_violation then null;end;
 insert into private.aqari_receipt_cancellations(id,workspace_id,payment_id,reason,approved_by,approved_by_name,snapshot) values(gen_random_uuid(),'79910000-0000-4000-8000-000000000001','79910000-0000-4000-8000-000000000014','Synthetic cancel','79910000-0000-4000-8000-000000000002','Synthetic Owner','{}');
 begin perform public.aqari_rental_document_source('79910000-0000-4000-8000-000000000001','79910000-0000-4000-8000-000000000201','79910000-0000-4000-8000-000000000013','79910000-0000-4000-8000-000000000014');raise exception 'CANCELLED_RECEIPT_READ';exception when check_violation then if sqlerrm='CANCELLED_RECEIPT_READ' then raise;end if;end;
 insert into private.aqari_property_template_scopes(workspace_id,template_id,kind,scope_kind,property_id,updated_by)
 select '79910000-0000-4000-8000-000000000001',id,'custom_type','property','79910000-0000-4000-8000-000000000010','79910000-0000-4000-8000-000000000002' from private.aqari_rental_template_versions where workspace_id='79910000-0000-4000-8000-000000000001' and kind='custom_type' and id<>'79910000-0000-4000-8000-000000000201' limit 1;
 begin perform public.aqari_rental_document_source('79910000-0000-4000-8000-000000000001','79910000-0000-4000-8000-000000000201','79910000-0000-4000-8000-000000000013');raise exception 'PROPERTY_TEMPLATE_SCOPE_BYPASSED';exception when check_violation then if sqlerrm<>'CONTRACT_TEMPLATE_NOT_ALLOWED_FOR_PROPERTY' then raise;end if;end;
end $$;
select 'PASS: legacy36 preserved; autosave replay/conflicts/history; independent families; six kinds; A4 validation; token validation; GM/AAL2; source binding; trusted immutable exact PDF; cancellation and workspace isolation.' result;
rollback;
