-- Isolated local PostgreSQL tests only. All synthetic records roll back.
begin;
do $$
declare
 p jsonb:='{"version":1,"paper":"A4","language":"bilingual","logo":{"enabled":false,"source":"property"},"signers":{"owner":{"name":true,"signature":true,"fingerprint":true},"tenant":{"name":true,"signature":true,"fingerprint":true}},"placements":[]}';
 t jsonb:='{"font_pt":12,"line_height":1.85,"alignment":"start","margin_mm":18}';
 invalid jsonb;alignment text;k text;
begin
 if not private.aqari_template_presentation_valid(null,'[]') or not private.aqari_template_presentation_valid(p,'[]') then raise exception 'LEGACY_PRESENTATION_REJECTED';end if;
 if exists(select 1 from private.aqari_rental_template_drafts_v2 d join template_legacy_baseline b using(id) where to_jsonb(d)-'family_id'-'presentation'-'source_version_id'<>b.row) then raise exception 'LEGACY36_REWRITTEN';end if;
 if exists(select 1 from private.aqari_rental_template_versions v join template_published_baseline b using(id) where private.aqari_rental_template_snapshot(v)<>b.snapshot) then raise exception 'LEGACY_SNAPSHOT_REWRITTEN';end if;
 if exists(select 1 from private.aqari_rental_template_draft_history) then raise exception 'TYPOGRAPHY_MIGRATION_CREATED_HISTORY';end if;
 if has_function_privilege('authenticated','private.aqari_template_presentation_valid(jsonb,jsonb)','execute') or has_function_privilege('anon','private.aqari_template_presentation_valid_before_typography(jsonb,jsonb)','execute') then raise exception 'TYPOGRAPHY_VALIDATOR_EXPOSED';end if;
 foreach alignment in array array['start','center','end','justify'] loop
  if not private.aqari_template_presentation_valid(p||jsonb_build_object('typography',t||jsonb_build_object('alignment',alignment)),'[]') then raise exception 'TYPOGRAPHY_ALIGNMENT_REJECTED';end if;
 end loop;
 for t in select value from jsonb_array_elements('[{"font_pt":10,"line_height":1.2,"alignment":"start","margin_mm":12},{"font_pt":18,"line_height":2.2,"alignment":"end","margin_mm":25},{"font_pt":12.5,"line_height":1.85,"alignment":"justify","margin_mm":18.5}]') loop
  if not private.aqari_template_presentation_valid(p||jsonb_build_object('typography',t),'[]') then raise exception 'TYPOGRAPHY_BOUNDARY_REJECTED';end if;
 end loop;
 t:='{"font_pt":12,"line_height":1.85,"alignment":"start","margin_mm":18}';
 foreach k in array array['font_pt','line_height','alignment','margin_mm'] loop
  if private.aqari_template_presentation_valid(p||jsonb_build_object('typography',t-k),'[]') then raise exception 'INCOMPLETE_TYPOGRAPHY_ACCEPTED';end if;
 end loop;
 for invalid in select value from jsonb_array_elements('[null,[],{},"12",{"font_pt":9.9},{"font_pt":18.1},{"font_pt":"12"},{"font_pt":false},{"line_height":1.19},{"line_height":2.21},{"margin_mm":11.99},{"margin_mm":25.01},{"alignment":"rtl"},{"css":"color:red"}]') loop
  if jsonb_typeof(invalid)='object' and invalid<>'{}'::jsonb then invalid:=t||invalid;end if;
  if private.aqari_template_presentation_valid(p||jsonb_build_object('typography',invalid),'[]') then raise exception 'INVALID_TYPOGRAPHY_ACCEPTED: %',invalid;end if;
 end loop;
 if private.aqari_template_presentation_valid(p||jsonb_build_object('typography',t,'unexpected',true),'[]') then raise exception 'TYPOGRAPHY_BYPASSED_LEGACY_VALIDATOR';end if;
end $$;
select set_config('request.jwt.claim.sub','79910000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
set local role authenticated;
do $$
declare
 w uuid:='79910000-0000-4000-8000-000000000001';
 p jsonb:='{"version":1,"paper":"A4","language":"bilingual","logo":{"enabled":false,"source":"property"},"signers":{"owner":{"name":true,"signature":true,"fingerprint":true},"tenant":{"name":true,"signature":true,"fingerprint":true}},"placements":[]}';
 t jsonb:='{"font_pt":14,"line_height":1.7,"alignment":"justify","margin_mm":20}';
 req jsonb;r jsonb;copied jsonb;published jsonb;history jsonb;context jsonb;legacy jsonb;
begin
 context:=public.aqari_rental_templates(w,'context');
 select d into legacy from jsonb_array_elements(context->'drafts')d where d->>'id'='79910000-0000-4000-8000-000000000020';
 if legacy ? 'presentation' then raise exception 'LEGACY_PRESENTATION_INJECTED';end if;
 req:=jsonb_build_object('id','79910000-0000-4000-8000-000000000401','kind','apartment_handover','kind_label','استلام الوحدة / Handover','title','  Synthetic writing format  ','fields','[]'::jsonb,
  'clauses','[{"title":"  بند محفوظ / Original clause  ","text":"  نص عربي / English text.\n\n  Preserved whitespace.  "}]'::jsonb,'revision',0,'request_id',gen_random_uuid(),'presentation',p);
 r:=public.aqari_rental_templates(w,'save_draft',req);
 if r#>'{record,presentation}'<>p or r#>'{record,clauses}'<>req->'clauses' then raise exception 'LEGACY_FORMAT_SHAPE_CHANGED';end if;
 r:=public.aqari_rental_templates(w,'save_draft',(r->'record')||jsonb_build_object('presentation',p||jsonb_build_object('typography',t),'request_id',gen_random_uuid()));
 if r#>'{record,presentation,typography}'<>t or r#>'{record,clauses}'<>req->'clauses' or r#>>'{record,revision}'<>'2' then raise exception 'TYPOGRAPHY_SAVE_CHANGED_TEXT';end if;
 begin perform public.aqari_rental_templates(w,'save_draft',(r->'record')||jsonb_build_object('presentation',p||jsonb_build_object('typography',t||'{"font_pt":99}'::jsonb),'request_id',gen_random_uuid()));raise exception 'INVALID_FONT_SAVED';exception when invalid_parameter_value then null;end;
 context:=public.aqari_rental_templates(w,'context');
 if not exists(select 1 from jsonb_array_elements(context->'drafts')d where d->>'id'=req->>'id' and d->'presentation'=r#>'{record,presentation}' and d->>'revision'='2') then raise exception 'TYPOGRAPHY_CONTEXT_FAILED';end if;
 history:=public.aqari_rental_templates(w,'history',jsonb_build_object('id',req->>'id'));
 if jsonb_array_length(history->'revisions')<>2 then raise exception 'TYPOGRAPHY_HISTORY_MISSING';end if;
 copied:=public.aqari_rental_templates(w,'copy_draft',jsonb_build_object('id','79910000-0000-4000-8000-000000000402','source_id',r#>>'{record,id}','request_id',gen_random_uuid()));
 if copied#>'{record,presentation}'<>r#>'{record,presentation}' or copied#>'{record,clauses}'<>req->'clauses' then raise exception 'TYPOGRAPHY_COPY_FAILED';end if;
 published:=public.aqari_rental_templates(w,'publish',(r->'record')||jsonb_build_object('id','79910000-0000-4000-8000-000000000403','source_draft_id',r#>>'{record,id}','expected_version',0,'reason','Synthetic isolated writing-format test','approved',true));
 if published#>'{record,presentation}'<>r#>'{record,presentation}' or published#>'{record,clauses}'<>req->'clauses' then raise exception 'TYPOGRAPHY_SNAPSHOT_FAILED';end if;
 copied:=public.aqari_rental_templates(w,'save_draft',(copied->'record')||jsonb_build_object('presentation',p||jsonb_build_object('typography',t||'{"font_pt":16}'::jsonb),'request_id',gen_random_uuid()));
 if public.aqari_rental_templates(w,'get',jsonb_build_object('id',published#>>'{record,id}'))#>'{record,presentation}'<>published#>'{record,presentation}' then raise exception 'TYPOGRAPHY_PUBLISHED_SNAPSHOT_CHANGED';end if;
 context:=public.aqari_rental_templates(w,'context');
 if not exists(select 1 from jsonb_array_elements(context->'drafts')d where d=legacy) then raise exception 'LEGACY36_CHANGED_DURING_FORMATTING';end if;
end $$;
reset role;
select 'PASS: optional typography validation, exact legacy36 and snapshots, save/context/copy/history/publish, immutable published formatting, no ACL expansion.' result;
rollback;
