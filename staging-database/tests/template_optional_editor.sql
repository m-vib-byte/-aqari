-- In-memory PostgreSQL only. Synthetic test records roll back in full.
begin;
do $$
declare e jsonb;bad jsonb;p jsonb;token text;offset16 integer;
 source jsonb:='[{"title":"Title","text":"A😀 B {{tenant_name}} Z"}]';
begin
 if exists(select 1 from private.aqari_rental_template_drafts_v2 d join template_legacy_baseline b using(id) where to_jsonb(d)-'family_id'-'presentation'-'source_version_id'<>b.row) then raise exception 'EDITOR_MIGRATION_REWROTE_LEGACY36';end if;
 if exists(select 1 from private.aqari_rental_template_versions v join template_published_baseline b using(id) where private.aqari_rental_template_snapshot(v)<>b.snapshot) or exists(select 1 from private.aqari_rental_template_draft_history) then raise exception 'EDITOR_MIGRATION_REWROTE_SNAPSHOTS';end if;
 if private.aqari_editor_utf16_length('A😀 B {{tenant_name}} Z')<>23 then raise exception 'UTF16_LENGTH_MISMATCH';end if;
 foreach offset16 in array array[0,1,3,4,5,6,21,22,23] loop
  if not private.aqari_editor_source_boundary(source#>>'{0,text}',offset16) then raise exception 'VALID_UTF16_BOUNDARY_REJECTED: %',offset16;end if;
 end loop;
 foreach offset16 in array array[-1,2,7,10,20,24] loop
  if private.aqari_editor_source_boundary(source#>>'{0,text}',offset16) then raise exception 'INVALID_UTF16_BOUNDARY_ACCEPTED: %',offset16;end if;
 end loop;
 foreach token in array array['{{field_name}}','{(field_name}}','{{tenant_name}','{{tenant_name','{tenant_name}}','{{ incomplete }}'] loop
  if private.aqari_editor_source_boundary('A'||token||' Z',2) then raise exception 'MALFORMED_TOKEN_INTERIOR_ACCEPTED: %',token;end if;
 end loop;
 e:='{"version":1,"style":{"font_family":"sans","bold":true,"underline":false,"direction":"rtl","paragraph_gap_mm":12,"clause_before_mm":20,"clause_after_mm":0,"numbering":"decimal"},"ranges":[{"clause":0,"part":"text","start":6,"end":21,"style":{"font_family":"mono","font_pt":8}},{"clause":0,"part":"text","start":0,"end":1,"style":{"bold":true}},{"clause":0,"part":"text","start":1,"end":3,"style":{"underline":true}},{"clause":0,"part":"title","start":0,"end":5,"style":{"font_pt":36}}],"page_breaks":[{"clause":0,"offset":6},{"clause":0,"offset":21}],"trailing_blank_pages":10,"logo":{"x_mm":190,"y_mm":281,"width_mm":12,"height_mm":8,"repeat":"all"},"signers":{"order":["tenant","owner"],"details":{"owner":{"civil_id":true,"nationality":false}}}}';
 if not private.aqari_template_editor_valid(e,source) or not private.aqari_template_editor_valid('{"version":1,"style":{}}',source) then raise exception 'VALID_EDITOR_REJECTED';end if;
 for bad in select value from jsonb_array_elements('[null,[],{}, {"version":2},{"version":1,"html":"<b>"},{"version":1,"style":null},{"version":1,"style":{"font_family":"url"}},{"version":1,"style":{"bold":"true"}},{"version":1,"style":{"paragraph_gap_mm":12.01}},{"version":1,"style":{"clause_before_mm":-1}},{"version":1,"style":{"clause_after_mm":20.1}},{"version":1,"style":{"direction":"sideways"}},{"version":1,"style":{"numbering":"html"}},{"version":1,"style":{"font_pt":12}},{"version":1,"ranges":null},{"version":1,"ranges":[{"clause":0,"part":"text","start":0,"end":1,"style":{}}]},{"version":1,"ranges":[{"clause":0,"part":"text","start":0,"end":1,"style":{"font_pt":"12"}}]},{"version":1,"ranges":[{"clause":0,"part":"text","start":0.5,"end":1,"style":{"bold":true}}]},{"version":1,"ranges":[{"clause":0,"part":"html","start":0,"end":1,"style":{"bold":true}}]},{"version":1,"ranges":[{"clause":50,"part":"text","start":0,"end":1,"style":{"bold":true}}]},{"version":1,"ranges":[{"clause":0,"part":"text","start":1,"end":1,"style":{"bold":true}}]},{"version":1,"ranges":[{"clause":0,"part":"text","start":0,"end":3,"style":{"bold":true}},{"clause":0,"part":"text","start":1,"end":3,"style":{"underline":true}}]},{"version":1,"page_breaks":[{"clause":0,"offset":3},{"clause":0,"offset":1}]},{"version":1,"page_breaks":[{"clause":0,"offset":3},{"clause":0,"offset":3}]},{"version":1,"page_breaks":[{"clause":0,"offset":60001}]},{"version":1,"trailing_blank_pages":11},{"version":1,"trailing_blank_pages":1.2},{"version":1,"logo":{"x_mm":191,"y_mm":8,"width_mm":12,"height_mm":8,"repeat":"first"}},{"version":1,"logo":{"x_mm":190,"y_mm":8,"width_mm":13,"height_mm":8,"repeat":"first"}},{"version":1,"logo":{"x_mm":8,"y_mm":8,"width_mm":12,"height_mm":8,"repeat":"first","url":"https://example.invalid"}},{"version":1,"signers":{"order":["owner","owner"],"details":{}}},{"version":1,"signers":{"order":["unknown"],"details":{}}},{"version":1,"signers":{"order":[],"details":{"owner":{"civil_id":true}}}},{"version":1,"signers":{"order":[],"details":{"owner":{"civil_id":"true","nationality":true}}}}]') loop
  if private.aqari_template_editor_valid(bad) then raise exception 'INVALID_EDITOR_ACCEPTED: %',bad;end if;
 end loop;
 for bad in select value from jsonb_array_elements('[{"version":1,"ranges":[{"clause":0,"part":"text","start":1,"end":2,"style":{"bold":true}}]},{"version":1,"ranges":[{"clause":0,"part":"text","start":7,"end":21,"style":{"bold":true}}]},{"version":1,"ranges":[{"clause":1,"part":"text","start":0,"end":1,"style":{"bold":true}}]},{"version":1,"ranges":[{"clause":0,"part":"title","start":0,"end":6,"style":{"bold":true}}]},{"version":1,"page_breaks":[{"clause":0,"offset":2}]},{"version":1,"page_breaks":[{"clause":0,"offset":7}]},{"version":1,"page_breaks":[{"clause":1,"offset":0}]}]') loop
  if not private.aqari_template_editor_valid(bad) or private.aqari_template_editor_valid(bad,source) then raise exception 'EDITOR_SOURCE_GUARD_FAILED: %',bad;end if;
 end loop;
 if private.aqari_template_editor_valid(jsonb_build_object('version',1,'ranges',(select jsonb_agg(jsonb_build_object('clause',0,'part','text','start',n,'end',n+1,'style',jsonb_build_object('bold',true))) from generate_series(0,300)n))) then raise exception 'TOO_MANY_RANGES';end if;
 if private.aqari_template_editor_valid(jsonb_build_object('version',1,'page_breaks',(select jsonb_agg(jsonb_build_object('clause',0,'offset',n)) from generate_series(0,50)n))) then raise exception 'TOO_MANY_BREAKS';end if;
 p:='{"version":1,"paper":"A4","language":"ar","logo":{"enabled":false,"source":"property"},"signers":{"owner":{"name":true,"signature":true,"fingerprint":true},"tenant":{"name":true,"signature":true,"fingerprint":true}},"placements":[{"id":"civil","field_key":"owner_civil_id","page":1,"x_mm":12,"y_mm":20,"width_mm":50,"height_mm":12,"font_pt":12,"language":"ar"}]}';
 if not private.aqari_template_presentation_valid(p||jsonb_build_object('editor',e),'[]') then raise exception 'ENABLED_SIGNER_DETAIL_REJECTED';end if;
 if private.aqari_template_presentation_valid(p||'{"editor":{"version":1}}','[]') then raise exception 'DISABLED_SIGNER_DETAIL_ACCEPTED';end if;
 if not private.aqari_template_presentation_valid(p||'{"editor":{"version":1}}','[{"key":"owner_civil_id"}]') then raise exception 'DECLARED_SIGNER_DETAIL_REJECTED';end if;
 if private.aqari_template_presentation_valid(p||jsonb_build_object('editor',e,'typography',jsonb_build_object('font_pt',99,'line_height',1.8,'alignment','start','margin_mm',18)),'[]') then raise exception 'TYPOGRAPHY_DELEGATE_BYPASSED';end if;
 if has_function_privilege('authenticated','private.aqari_rental_templates_before_editor(uuid,text,jsonb)','execute') or has_function_privilege('anon','private.aqari_rental_templates(uuid,text,jsonb)','execute') or has_function_privilege('service_role','private.aqari_template_editor_valid(jsonb,jsonb)','execute') or has_function_privilege('authenticated','private.aqari_editor_source_boundary(text,integer)','execute') then raise exception 'EDITOR_PRIVATE_ACL_EXPANDED';end if;
end $$;
select set_config('request.jwt.claim.sub','79910000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
set local role authenticated;
do $$
declare w uuid:='79910000-0000-4000-8000-000000000001';req jsonb;r jsonb;saved jsonb;bad jsonb;published jsonb;context jsonb;legacy jsonb;hist jsonb;
 p jsonb:='{"version":1,"paper":"A4","language":"ar","logo":{"enabled":false,"source":"property"},"signers":{"owner":{"name":true,"signature":true,"fingerprint":true},"tenant":{"name":true,"signature":true,"fingerprint":true}},"placements":[],"editor":{"version":1,"ranges":[{"clause":0,"part":"text","start":1,"end":3,"style":{"bold":true,"font_family":"mono"}}],"page_breaks":[{"clause":0,"offset":6}],"trailing_blank_pages":1,"signers":{"order":["tenant","owner"],"details":{"tenant":{"civil_id":true,"nationality":true}}}}}';
begin
 context:=public.aqari_rental_templates(w,'context');select d into legacy from jsonb_array_elements(context->'drafts')d where d->>'id'='79910000-0000-4000-8000-000000000020';
 req:=jsonb_build_object('id','79910000-0000-4000-8000-000000000501','kind','rental_agreement','kind_label','Synthetic','title',' Synthetic editor ','fields','[{"key":"tenant_name","label":"Tenant","type":"text","required":true}]'::jsonb,'clauses','[{"title":" Title ","text":"A😀 B {{tenant_name}} Z"}]'::jsonb,'revision',0,'request_id',gen_random_uuid(),'presentation',p);
 r:=public.aqari_rental_templates(w,'save_draft',req);saved:=r;
 if r#>'{record,presentation}'<>p or r#>'{record,clauses}'<>req->'clauses' or r#>'{record,fields}'<>req->'fields' then raise exception 'EDITOR_ROUNDTRIP_CHANGED_SOURCE';end if;
 if public.aqari_rental_templates(w,'save_draft',req)<>r then raise exception 'EDITOR_IDEMPOTENCY_CHANGED';end if;
 -- Metadata-valid source-invalid creates and updates must roll back all writes.
 bad:=req||jsonb_build_object('id','79910000-0000-4000-8000-000000000502','request_id',gen_random_uuid(),'presentation',jsonb_set(p,'{editor,ranges,0,end}','2'));
 begin perform public.aqari_rental_templates(w,'save_draft',bad);raise exception 'SURROGATE_SPLIT_SAVED';exception when invalid_parameter_value then if sqlerrm<>'INVALID_TEMPLATE_PRESENTATION' then raise;end if;end;
 bad:=(r->'record')||jsonb_build_object('request_id',gen_random_uuid(),'presentation',jsonb_set(p,'{editor,page_breaks,0,offset}','7'));
 begin perform public.aqari_rental_templates(w,'save_draft',bad);raise exception 'TOKEN_SPLIT_SAVED';exception when invalid_parameter_value then null;end;
 -- Omitting presentation reuses the stored editor; shortening text cannot leave
 -- its old ranges/breaks pointing outside the newly saved source.
 bad:=((r->'record')-'presentation')||jsonb_build_object('request_id',gen_random_uuid(),'clauses','[{"title":" Title ","text":"A"}]'::jsonb);
 begin perform public.aqari_rental_templates(w,'save_draft',bad);raise exception 'OMITTED_PRESENTATION_STALE_RANGES_SAVED';exception when invalid_parameter_value then null;end;
 context:=public.aqari_rental_templates(w,'context');
 if exists(select 1 from jsonb_array_elements(context->'drafts')d where d->>'id'='79910000-0000-4000-8000-000000000502') or not exists(select 1 from jsonb_array_elements(context->'drafts')d where d=saved->'record') then raise exception 'INVALID_SOURCE_LEFT_DRAFT_WRITE';end if;
 hist:=public.aqari_rental_templates(w,'history',jsonb_build_object('id',req->>'id'));if jsonb_array_length(hist->'revisions')<>1 then raise exception 'INVALID_SOURCE_LEFT_HISTORY_WRITE';end if;
 r:=public.aqari_rental_templates(w,'copy_draft',jsonb_build_object('id','79910000-0000-4000-8000-000000000503','source_id',req->>'id','request_id',gen_random_uuid()));
 if r#>'{record,presentation}'<>p or r#>'{record,clauses}'<>req->'clauses' then raise exception 'EDITOR_COPY_CHANGED_SOURCE';end if;
 published:=public.aqari_rental_templates(w,'publish',(saved->'record')||jsonb_build_object('id','79910000-0000-4000-8000-000000000504','source_draft_id',req->>'id','expected_version',0,'reason','Synthetic editor approval test','approved',true));
 if published#>'{record,presentation}'<>p or published#>'{record,clauses}'<>req->'clauses' then raise exception 'EDITOR_PUBLISH_CHANGED_SOURCE';end if;
 r:=public.aqari_rental_templates(w,'revise',jsonb_build_object('id','79910000-0000-4000-8000-000000000505','source_id',published#>>'{record,id}','request_id',gen_random_uuid()));
 if r#>'{record,presentation}'<>p then raise exception 'EDITOR_REVISION_CHANGED_METADATA';end if;
 context:=public.aqari_rental_templates(w,'context');if not exists(select 1 from jsonb_array_elements(context->'drafts')d where d=legacy) then raise exception 'EDITOR_CHANGED_ORIGINAL36';end if;
 -- Stale revision still uses the original conflict guard.
 begin perform public.aqari_rental_templates(w,'save_draft',(r->'record')||jsonb_build_object('revision',0,'request_id',gen_random_uuid()));raise exception 'EDITOR_REVISION_GUARD_BYPASSED';exception when serialization_failure then null;end;
 perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
 begin perform public.aqari_rental_templates(w,'publish',(r->'record')||jsonb_build_object('id',gen_random_uuid(),'source_draft_id',r#>>'{record,id}','expected_version',1,'reason','Synthetic editor AAL guard','approved',true));raise exception 'EDITOR_AAL_GUARD_BYPASSED';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Seed one malformed synthetic historic row to prove publish validates the
-- final returned snapshot and rolls back the publication/status/history writes.
insert into private.aqari_rental_template_drafts_v2(id,workspace_id,kind,kind_label,title,fields,clauses,revision,request_id,created_by,updated_by,presentation)
select '79910000-0000-4000-8000-000000000506',workspace_id,kind,kind_label,title,fields,clauses,1,gen_random_uuid(),created_by,updated_by,jsonb_set(presentation,'{editor,ranges,0,end}','2') from private.aqari_rental_template_drafts_v2 where id='79910000-0000-4000-8000-000000000501';
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
set local role authenticated;
do $$declare w uuid:='79910000-0000-4000-8000-000000000001';r jsonb;begin
 select d into r from jsonb_array_elements(public.aqari_rental_templates(w,'context')->'drafts')d where d->>'id'='79910000-0000-4000-8000-000000000506';
 begin perform public.aqari_rental_templates(w,'publish',r||jsonb_build_object('id','79910000-0000-4000-8000-000000000507','source_draft_id',r->>'id','expected_version',0,'reason','Synthetic invalid-source publish','approved',true));raise exception 'INVALID_EDITOR_SOURCE_PUBLISHED';exception when invalid_parameter_value then null;end;
end $$;
reset role;
do $$begin
 if exists(select 1 from private.aqari_rental_template_versions where id='79910000-0000-4000-8000-000000000507') or not exists(select 1 from private.aqari_rental_template_drafts_v2 where id='79910000-0000-4000-8000-000000000506' and status='draft' and revision=1) then raise exception 'INVALID_EDITOR_PUBLICATION_LEFT_WRITES';end if;
end $$;
select set_config('request.jwt.claim.sub','79910000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$begin
 begin perform public.aqari_rental_templates('79910000-0000-4000-8000-000000000001','save_draft','{}');raise exception 'EDITOR_VIEWER_WRITE_BYPASS';exception when insufficient_privilege then null;end;
 begin perform public.aqari_rental_templates('70000000-0000-4000-8000-000000000001','context');raise exception 'EDITOR_CROSS_WORKSPACE_BYPASS';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: strict editor schema; UTF16/surrogate/complete and malformed token boundaries; immutable legacy36; save/copy/revise/publish roundtrip; atomic invalid-source rollback; ACL/MFA/revision/workspace guards.' result;
rollback;
