-- Synthetic fixtures only. Source rows, account fixtures and Storage metadata roll back.
begin;
create temporary table handover_before as select
 (select count(*) from auth.users) users,(select count(*) from public.aqari_documents) documents,
 (select count(*) from storage.objects) objects,(select count(*) from private.aqari_document_handovers) handovers,
 (select count(*) from private.aqari_document_handover_voids) voids;
savepoint handover_fixtures;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('handover-manager@example.invalid','مسجل تجريبي','general_manager','aqari-v267-staging'),
 ('handover-viewer@example.invalid','قارئ تجريبي','viewer','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values
 ('f267ad00-0000-4000-8000-000000000001','handover-manager@example.invalid',now()),
 ('f267ad00-0000-4000-8000-000000000002','handover-viewer@example.invalid',now());
select set_config('request.jwt.claim.sub','f267ad00-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f267ad00-0000-4000-8000-000000000001","aal":"aal2"}',true);
select set_config('handover.workspace',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active),true);
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values
 ('f267ad10-0000-4000-8000-000000000001',current_setting('handover.workspace')::uuid,'handover-a','عقار تسليم اصطناعي أ','{}'),
 ('f267ad10-0000-4000-8000-000000000002',current_setting('handover.workspace')::uuid,'handover-b','عقار تسليم اصطناعي ب','{}');
insert into private.aqari_staff_assignments(workspace_id,user_id,operational_role,property_ids,is_active,updated_by) values
 (current_setting('handover.workspace')::uuid,'f267ad00-0000-4000-8000-000000000002','viewer',array['f267ad10-0000-4000-8000-000000000001'::uuid],true,auth.uid());
do $$declare x record;ref text;key text;begin
 for i in 1..4 loop
  ref:=case when i=3 then 'handover-b' else 'handover-a' end;key:='handover.doc'||i;
  select * into x from public.aqari_reserve_document(current_setting('handover.workspace')::uuid,'supporting_document','property',ref,'مستند تسليم تجريبي '||i,'fixture.pdf','application/pdf','{"category":"title_deed","original_bytes":true}');
  perform set_config(key,x.document_id::text,true);
  if i<>4 then
   insert into storage.objects(bucket_id,name,metadata) values('aqari-documents',x.storage_path,'{"size":100,"mimetype":"application/pdf"}');
   perform public.aqari_finalize_document(x.document_id,100,'application/pdf',repeat(i::text,64));
  end if;
 end loop;
end $$;
create function pg_temp.handover_reject(q text,expected text) returns void language plpgsql as $$begin
 begin execute q;exception when others then if sqlerrm like expected then return;else raise;end if;end;
 raise exception 'ACCEPTED_FORBIDDEN_OPERATION: %',expected;
end $$;
set local role authenticated;
do $$declare w uuid:=current_setting('handover.workspace')::uuid;d uuid:=current_setting('handover.doc1')::uuid;p jsonb;row jsonb;again jsonb;view jsonb;cancel jsonb;begin
 p:=jsonb_build_object('id','f267ad20-0000-4000-8000-000000000001','evidence_document_id',current_setting('handover.doc2'),
  'sender_name','موظف تجريبي','recipient_name','مستلم تجريبي','handed_at','2026-09-01T12:34:00+03:00','copy_kind','original','copies',2,'method','hand','note','ورقتان للاختبار');
 row:=public.aqari_document_handover_register(w,d,'record',p);
 again:=public.aqari_document_handover_register(w,d,'record',p);
 view:=public.aqari_document_handover_register(w,d,'list','{}');
 if row<>again or jsonb_array_length(view->'entries')<>1 or row->>'actor_id'<>auth.uid()::text or row->>'actor_name'<>'مسجل تجريبي'
  or row#>>'{source_snapshot,checksum_sha256}'<>repeat('1',64) or row#>>'{evidence_snapshot,checksum_sha256}'<>repeat('2',64)
  or (row#>>'{details,handed_at}')::timestamptz<>'2026-09-01T09:34:00Z'::timestamptz then raise exception 'HANDOVER_READBACK_FAILED';end if;
 perform pg_temp.handover_reject(format('select public.aqari_document_handover_register(%L,%L,''record'',%L)',w,d,p||'{"recipient_name":"شخص مختلف"}'),'HANDOVER_IDEMPOTENCY_CONFLICT');
 perform pg_temp.handover_reject(format('select public.aqari_document_handover_register(%L,%L,''record'',%L)',w,d,p||jsonb_build_object('evidence_document_id',current_setting('handover.doc3'))),'HANDOVER_VERIFIED_EVIDENCE_REQUIRED');
 perform pg_temp.handover_reject(format('select public.aqari_document_handover_register(%L,%L,''record'',%L)',w,d,p||jsonb_build_object('evidence_document_id',d)),'INVALID_HANDOVER');
 perform pg_temp.handover_reject(format('select public.aqari_document_handover_register(%L,%L,''record'',%L)',w,d,p||jsonb_build_object('evidence_document_id',current_setting('handover.doc4'))),'HANDOVER_VERIFIED_EVIDENCE_REQUIRED');
 perform pg_temp.handover_reject(format('select public.aqari_document_handover_register(%L,%L,''record'',%L)',w,current_setting('handover.doc4'),p),'HANDOVER_VERIFIED_DOCUMENT_REQUIRED');
 perform pg_temp.handover_reject(format('select public.aqari_document_handover_register(%L,%L,''record'',%L)',w,d,p||'{"handed_at":"2099-09-01T00:00:00Z"}'),'INVALID_HANDOVER');
 perform pg_temp.handover_reject(format('select public.aqari_document_handover_register(%L,%L,''record'',%L)',w,d,p||'{"copies":0}'),'INVALID_HANDOVER');
 perform pg_temp.handover_reject(format('select public.aqari_document_handover_register(%L,%L,''record'',%L)',w,d,p||'{"actor_id":"f267ad00-0000-4000-8000-000000000002"}'),'INVALID_HANDOVER');
 perform pg_temp.handover_reject(format('select public.aqari_document_handover_register(%L,%L,''list'',''{"page":-1}'')',w,d),'INVALID_HANDOVER');
 cancel:='{"id":"f267ad30-0000-4000-8000-000000000001","handover_id":"f267ad20-0000-4000-8000-000000000001","reason":"تصحيح تجريبي موثق"}';
 row:=public.aqari_document_handover_register(w,d,'void',cancel);again:=public.aqari_document_handover_register(w,d,'void',cancel);
 if row<>again or (public.aqari_document_handover_register(w,d,'list','{}')#>>'{entries,0,cancellation,reason}')<>'تصحيح تجريبي موثق' then raise exception 'VOID_READBACK_FAILED';end if;
 perform pg_temp.handover_reject(format('select public.aqari_document_handover_register(%L,%L,''void'',%L)',w,d,cancel||'{"id":"f267ad30-0000-4000-8000-000000000002"}'),'HANDOVER_ALREADY_VOID');
 perform pg_temp.handover_reject('select * from private.aqari_document_handovers','permission denied%');
 perform pg_temp.handover_reject('delete from private.aqari_document_handover_voids','permission denied%');
 perform pg_temp.handover_reject('update private.aqari_document_handovers set actor_name=''spoof''','permission denied%');
end $$;
select set_config('request.jwt.claim.sub','f267ad00-0000-4000-8000-000000000002',true);
do $$declare w uuid:=current_setting('handover.workspace')::uuid;d uuid:=current_setting('handover.doc1')::uuid;v jsonb;begin
 v:=public.aqari_document_handover_register(w,d,'list','{}');
 if (v->>'can_write')::boolean or jsonb_array_length(v->'entries')<>1 or jsonb_array_length(v->'evidence')<>1 then raise exception 'VIEWER_SCOPE_FAILED';end if;
 perform pg_temp.handover_reject(format('select public.aqari_document_handover_register(%L,%L,''record'',''{}'')',w,d),'ACCESS_DENIED');
 perform pg_temp.handover_reject(format('select public.aqari_document_handover_register(%L,%L,''list'',''{}'')',w,current_setting('handover.doc3')),'ACCESS_DENIED');
 perform pg_temp.handover_reject(format('select public.aqari_document_handover_register(%L,%L,''list'',''{}'')','f267ad99-0000-4000-8000-000000000001',d),'ACCESS_DENIED');
end $$;
select set_config('request.jwt.claim.sub','f267ad00-0000-4000-8000-000000000099',true);
select pg_temp.handover_reject(format('select public.aqari_document_handover_register(%L,%L,''list'',''{}'')',current_setting('handover.workspace'),current_setting('handover.doc1')),'ACCESS_DENIED');
reset role;
select pg_temp.handover_reject('update private.aqari_document_handovers set actor_name=''changed'' where id=''f267ad20-0000-4000-8000-000000000001''','HANDOVER_IMMUTABLE');
select pg_temp.handover_reject('delete from private.aqari_document_handover_voids where id=''f267ad30-0000-4000-8000-000000000001''','HANDOVER_IMMUTABLE');
set local role anon;
select pg_temp.handover_reject(format('select public.aqari_document_handover_register(%L,%L,''list'',''{}'')',current_setting('handover.workspace'),current_setting('handover.doc1')),'permission denied%');
reset role;
rollback to savepoint handover_fixtures;
do $$begin
 if (select count(*) from auth.users)<>(select users from handover_before) or (select count(*) from public.aqari_documents)<>(select documents from handover_before)
  or (select count(*) from storage.objects)<>(select objects from handover_before) or (select count(*) from private.aqari_document_handovers)<>(select handovers from handover_before)
  or (select count(*) from private.aqari_document_handover_voids)<>(select voids from handover_before) then raise exception 'HANDOVER_FIXTURES_REMAIN';end if;
end $$;
rollback;
select 'PASS: handover and cancellation readback/retry, immutable original and proof hashes, actor attribution, time, source/evidence checks, property/workspace/role/anonymous isolation, no direct mutations; fixtures rolled back. Storage bytes not uploaded by this SQL test.' result;
