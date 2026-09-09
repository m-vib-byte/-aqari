-- Included before ROLLBACK in rental_transaction.sql by the verification runner.
-- Storage rows below are transactional metadata fixtures, NOT uploaded file bytes.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ declare w uuid;doc record;begin
 select workspace_id into w from public.aqari_memberships where user_id=auth.uid();
 begin perform public.aqari_reserve_document(w,'signed_contract','lease','missing','اختبار','scan.jpg','image/jpeg','{}');raise exception 'ORPHAN_DOCUMENT_ACCEPTED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_reserve_document(w,'signed_contract','tenant','t1','اختبار','scan.jpg','image/jpeg','{}');raise exception 'WRONG_TYPE_ACCEPTED';exception when raise_exception then if sqlerrm<>'INVALID_DOCUMENT' then raise;end if;end;
 select * into doc from public.aqari_reserve_document(w,'signed_contract','lease','c1','نسخة موقعة للاختبار','scan.jpg','image/jpeg','{}');
 perform set_config('aqari.test.document_id',doc.document_id::text,true);
 perform set_config('aqari.test.document_path',doc.storage_path,true);
 if not exists(select 1 from public.aqari_documents where id=doc.document_id and entity_type='lease' and entity_ref='c1' and created_by=auth.uid() and status='draft') then raise exception 'DOCUMENT_LINK_READBACK_FAILED';end if;
 begin perform public.aqari_finalize_document(doc.document_id,100,'image/jpeg',repeat('a',64));raise exception 'MISSING_OBJECT_FINALIZED';exception when raise_exception then if sqlerrm<>'STORED_FILE_NOT_CONFIRMED' then raise;end if;end;
 begin update public.aqari_documents set status='uploaded' where id=doc.document_id;raise exception 'DIRECT_FINALIZE_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
reset role;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values('doc-second-manager@example.invalid','اختبار مدير آخر','general_manager','aqari-v267-staging');
insert into auth.users(id,email) values('99999999-9999-4999-8999-999999999999','doc-second-manager@example.invalid');
select set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',true);
set local role authenticated;
do $$ begin
 begin insert into storage.objects(bucket_id,name,metadata) values('aqari-documents',current_setting('aqari.test.document_path'),'{"size":100,"mimetype":"image/jpeg"}');raise exception 'OTHER_AUTHOR_UPLOAD_ALLOWED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_finalize_document(current_setting('aqari.test.document_id')::uuid,100,'image/jpeg',repeat('a',64));raise exception 'OTHER_AUTHOR_FINALIZE_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
insert into storage.objects(bucket_id,name,metadata) values('aqari-documents',current_setting('aqari.test.document_path'),'{"size":100,"mimetype":"image/jpeg"}');
do $$ declare d uuid:=current_setting('aqari.test.document_id')::uuid;n integer;begin
 begin perform public.aqari_finalize_document(d,99,'image/jpeg',repeat('a',64));raise exception 'SIZE_MISMATCH_ACCEPTED';exception when raise_exception then if sqlerrm<>'STORED_FILE_NOT_CONFIRMED' then raise;end if;end;
 perform public.aqari_finalize_document(d,100,'image/jpeg',repeat('a',64));
 if not exists(select 1 from public.aqari_documents where id=d and status='uploaded' and checksum_sha256=repeat('a',64) and uploaded_at is not null) then raise exception 'DOCUMENT_FINAL_READBACK_FAILED';end if;
 select count(*) into n from public.aqari_control_audit where after_value->>'id'=d::text;
 perform public.aqari_finalize_document(d,100,'image/jpeg',repeat('a',64));
 if n<>2 or (select count(*) from public.aqari_control_audit where after_value->>'id'=d::text)<>2 then raise exception 'DOCUMENT_AUDIT_OR_IDEMPOTENCE_FAILED';end if;
 begin perform public.aqari_finalize_document(d,101,'image/jpeg',repeat('a',64));raise exception 'ORIGINAL_MUTATED';exception when raise_exception then if sqlerrm<>'DOCUMENT_IMMUTABLE' then raise;end if;end;
 update storage.objects set metadata='{}' where name=current_setting('aqari.test.document_path');
 if found then raise exception 'ORIGINAL_OBJECT_REPLACED';end if;
 begin
  delete from storage.objects where name=current_setting('aqari.test.document_path');
  if found then raise exception 'ORIGINAL_OBJECT_DELETED';end if;
 exception when insufficient_privilege then null;end;
end $$;
