-- Isolated database acceptance/rejection test. All synthetic rows roll back.
begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('official-doc-manager@example.invalid','مدير اختبار النماذج','general_manager','aqari-v267-staging'),
 ('official-doc-accountant@example.invalid','محاسب اختبار النماذج','accountant','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values
 ('7f670000-0000-4000-8000-000000000001','official-doc-manager@example.invalid',now()),
 ('7f670000-0000-4000-8000-000000000002','official-doc-accountant@example.invalid',now());
select set_config('request.jwt.claim.sub','7f670000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select set_config('aqari.test.official.workspace',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active),true);
set local role authenticated;
do $$ declare w uuid:=current_setting('aqari.test.official.workspace')::uuid;r jsonb;g jsonb;begin
 r:=public.aqari_official_document_register(w,'issue','{"id":"7f670000-0000-4000-8000-000000000010","version_id":"7f670000-0000-4000-8000-000000000011","event_id":"7f670000-0000-4000-8000-000000000012","kind":"rent_receipt","document_no":"TEST-OFFICIAL-001","entity_type":"lease","entity_id":"7f670000-0000-4000-8000-000000000020","title":"وصل اختبار","body":"نص رسمي اصطناعي محفوظ للاختبار فقط","payload":{"documentNo":"TEST-OFFICIAL-001","amount":"10.000"},"template_version":1,"content_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","reason":"اختبار الإصدار الأول"}');
 if r#>>'{series,document_no}'<>'TEST-OFFICIAL-001' or r#>>'{version,version}'<>'1' then raise exception 'ISSUE_FAILED';end if;
 if not exists(select 1 from jsonb_array_elements(public.aqari_official_document_register(w,'list')->'items')x where x->>'id'='7f670000-0000-4000-8000-000000000010' and x#>>'{version,content_sha256}'=repeat('a',64)) then raise exception 'LIST_READBACK_FAILED';end if;
 r:=public.aqari_official_document_register(w,'supersede','{"id":"7f670000-0000-4000-8000-000000000010","version_id":"7f670000-0000-4000-8000-000000000013","event_id":"7f670000-0000-4000-8000-000000000014","expected_version":1,"title":"وصل اختبار مصحح","body":"إصدار تصحيح جديد مع إبقاء النسخة السابقة","payload":{"documentNo":"TEST-OFFICIAL-001","amount":"11.000"},"template_version":1,"content_sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","reason":"تصحيح قيمة الاختبار"}');
 g:=public.aqari_official_document_register(w,'get','{"id":"7f670000-0000-4000-8000-000000000010"}');
 if r#>>'{series,current_version}'<>'2' or jsonb_array_length(g->'versions')<>2 or g#>>'{versions,0,content_sha256}'<>repeat('a',64) then raise exception 'VERSION_HISTORY_FAILED';end if;
 begin perform public.aqari_official_document_register(w,'supersede','{"id":"7f670000-0000-4000-8000-000000000010","expected_version":1,"reason":"نسخة قديمة"}');raise exception 'STALE_VERSION_ACCEPTED';exception when serialization_failure then null;end;
 begin perform public.aqari_official_document_register(w,'void','{"id":"7f670000-0000-4000-8000-000000000010","event_id":"7f670000-0000-4000-8000-000000000015","reason":""}');raise exception 'EMPTY_VOID_REASON_ACCEPTED';exception when check_violation then null;end;
 r:=public.aqari_official_document_register(w,'void','{"id":"7f670000-0000-4000-8000-000000000010","event_id":"7f670000-0000-4000-8000-000000000015","reason":"إلغاء موثق للاختبار"}');
 if r#>>'{series,status}'<>'void' then raise exception 'VOID_FAILED';end if;
 begin perform 1 from private.aqari_official_document_versions;raise exception 'PRIVATE_ARCHIVE_EXPOSED';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','7f670000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
do $$ begin
 begin perform public.aqari_official_document_register(current_setting('aqari.test.official.workspace')::uuid,'issue','{}');raise exception 'ACCOUNTANT_ISSUE_ALLOWED';exception when insufficient_privilege then null;end;
 if jsonb_array_length(public.aqari_official_document_register(current_setting('aqari.test.official.workspace')::uuid,'list')->'items')<>1 then raise exception 'ACCOUNTANT_READ_FAILED';end if;
end $$;
reset role;
do $$begin update private.aqari_official_document_versions set title='tampered' where id='7f670000-0000-4000-8000-000000000011';raise exception 'IMMUTABLE_VERSION_CHANGED';exception when check_violation then null;end$$;
rollback;
select 'PASS: issue/readback/supersede/history/void/role/MFA/immutability';
