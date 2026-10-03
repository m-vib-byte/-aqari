-- Run only on an isolated restore/test database with an eligible PDF and manager.
-- All synthetic draft writes are rolled back. Do not run acceptance writes on production.
begin;
select set_config('aqari.draft_test',jsonb_build_object('workspace',d.workspace_id,'property',p.id,'document',d.id,'user',m.user_id)::text,true)
from public.aqari_documents d join public.aqari_properties p on p.workspace_id=d.workspace_id and p.external_ref=d.entity_ref and p.id::text=d.metadata->>'property_id'
join public.aqari_memberships m on m.workspace_id=d.workspace_id and m.role='general_manager' and m.is_active
where d.status='uploaded' and d.mime_type='application/pdf' and d.entity_type='property' and d.document_type='property_document' and d.metadata->>'category'='property_other' and d.metadata->>'asset_role'='property_contract' order by d.id,m.user_id limit 1;
select set_config('request.jwt.claim.sub',current_setting('aqari.draft_test')::jsonb->>'user',true);
set local role authenticated;
do $$
declare c jsonb:=current_setting('aqari.draft_test')::jsonb; w uuid:=(c->>'workspace')::uuid; id uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); data jsonb; a jsonb; b jsonb;
begin
 data:=jsonb_build_object('id',id,'property_id',c->>'property','document_id',c->>'document','expected_revision',0,'request_id',req,
 'snapshot',jsonb_build_object('mapping',jsonb_build_object('version',1,'title','اختبار معزول مؤقت','propertyId',c->>'property','fields','[]'::jsonb),'values','{}'::jsonb,'page',1,'selected',null));
 a:=public.aqari_pdf_editor_drafts(w,'save',data);
 if (a->>'revision')::int<>1 then raise exception 'READBACK_FAILED';end if;
 b:=public.aqari_pdf_editor_drafts(w,'save',data);
 if b<>a then raise exception 'IDEMPOTENCY_FAILED';end if;
 b:=public.aqari_pdf_editor_drafts(w,'get',jsonb_build_object('property_id',c->>'property','id',id));
 if b<>a then raise exception 'RESTORE_FAILED';end if;
 begin
 perform public.aqari_pdf_editor_drafts(w,'save',data||jsonb_build_object('request_id',gen_random_uuid()));
 raise exception 'CAS_NOT_ENFORCED';
 exception when serialization_failure then null;end;
 begin
 perform count(*) from private.aqari_pdf_editor_drafts;
 raise exception 'DIRECT_ACCESS_NOT_DENIED';
 exception when insufficient_privilege then null;end;
end$$;
rollback;
select count(*) as drafts_after_rollback from private.aqari_pdf_editor_drafts;
