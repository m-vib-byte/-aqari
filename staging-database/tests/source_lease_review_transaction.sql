begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.aqari_memberships where role='general_manager' and is_active limit 1),true);
set local role authenticated;
do $$
declare w uuid;l public.aqari_leases%rowtype; doc record; rev bigint;r jsonb; bad boolean;
begin
 select workspace_id into strict w from public.aqari_memberships where user_id=auth.uid() and role='general_manager' and is_active;
 select * into strict l from public.aqari_leases where workspace_id=w and snapshot->>'unit'='101';
 select revision into rev from public.aqari_app_state where workspace_id=w;
 -- The missing-document path must reject and leave the source lease unchanged.
 bad:=false;begin perform public.aqari_review_source_lease(w,l.id,gen_random_uuid(),'approve',50,'اختبار معاملة متراجعة فقط',rev);exception when no_data_found then bad:=true;end;
 if not bad then raise exception 'MISSING_DOCUMENT_ACCEPTED';end if;
 bad:=false;begin perform public.aqari_review_source_lease(w,l.id,gen_random_uuid(),'approve',50,'اختبار معاملة متراجعة فقط',rev-1);exception when serialization_failure then bad:=true;end;
 if not bad then raise exception 'STALE_REVISION_ACCEPTED';end if;
 -- Fixture metadata only, NOT a real document upload or tenant approval; all rolled back.
 select * into doc from public.aqari_reserve_document(w,'signed_contract','lease',l.external_ref,'اختبار معاملة متراجعة','transaction-test.jpg','image/jpeg','{"test":"rollback-only"}');
 insert into storage.objects(bucket_id,name,metadata) values(doc.storage_bucket,doc.storage_path,'{"size":100,"mimetype":"image/jpeg"}');
 perform public.aqari_finalize_document(doc.document_id,100,'image/jpeg',repeat('a',64));
 r:=public.aqari_review_source_lease(w,l.id,doc.document_id,'approve',50,'اختبار معاملة متراجعة فقط',rev);
 if r->>'status'<>'approved' then raise exception 'APPROVAL_FAILED';end if;
 rev:=(r->>'revision')::bigint;
 r:=public.aqari_review_source_lease(w,l.id,doc.document_id,'sign',50,'اختبار تأكيد معاملة متراجعة فقط',rev);
 if r->>'status'<>'signed' or (select count(*) from public.aqari_source_lease_reviews where workspace_id=w and lease_id=l.id)<>2 then raise exception 'SIGN_AUDIT_FAILED';end if;
 if not exists(select 1 from jsonb_array_elements(public.aqari_read_state_v267(w)->'payload'->'contractsV202') x where x->>'id'=l.external_ref and x->>'status'='signed') then raise exception 'STATE_READBACK_FAILED';end if;
 if (select snapshot->'sourceValues' from public.aqari_leases where id=l.id) is distinct from l.snapshot->'sourceValues' then raise exception 'SOURCE_CHANGED';end if;
end $$;
rollback;
select 'PASS: missing-document/stale-revision rejection, approval/signature, audit and state readback; fixtures rolled back. NOT a real signed lease or PDF.' proof;
