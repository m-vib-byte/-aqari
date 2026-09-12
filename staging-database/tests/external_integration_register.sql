-- Isolated database acceptance/rejection test. No provider call is made; all rows roll back.
begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('integration-manager@example.invalid','مدير اختبار التكامل','general_manager','aqari-v267-staging'),
 ('integration-accountant@example.invalid','محاسب اختبار التكامل','accountant','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values
 ('7f680000-0000-4000-8000-000000000001','integration-manager@example.invalid',now()),
 ('7f680000-0000-4000-8000-000000000002','integration-accountant@example.invalid',now());
select set_config('request.jwt.claim.sub','7f680000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select set_config('aqari.test.integration.workspace',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active),true);
set local role authenticated;
do $$ declare w uuid:=current_setting('aqari.test.integration.workspace')::uuid;r jsonb;a jsonb;b jsonb;begin
 begin perform public.aqari_external_integrations(w,'save','{"id":"7f680000-0000-4000-8000-000000000010","revision":0,"provider":"knet","purpose":"rent","mode":"live","endpoint_origin":"https://payments.example.invalid","public_metadata":{}}');raise exception 'LIVE_WITHOUT_SECRET_REFERENCE';exception when check_violation then null;end;
 r:=public.aqari_external_integrations(w,'save','{"id":"7f680000-0000-4000-8000-000000000010","revision":0,"provider":"knet","purpose":"rent","mode":"sandbox","endpoint_origin":"https://payments.example.invalid","secret_reference":"vault/knet/sandbox","public_metadata":{"currency":"KWD"}}');
 if r->>'revision'<>'1' or r->>'mode'<>'sandbox' then raise exception 'CONFIG_SAVE_FAILED';end if;
 begin perform public.aqari_external_integrations(w,'save','{"id":"7f680000-0000-4000-8000-000000000010","revision":0,"provider":"knet","purpose":"rent","mode":"sandbox","endpoint_origin":"http://unsafe.example.invalid","secret_reference":"vault/knet/sandbox","public_metadata":{}}');raise exception 'STALE_OR_HTTP_CONFIG_ACCEPTED';exception when check_violation or serialization_failure then null;end;
 a:=public.aqari_external_integrations(w,'enqueue_test','{"id":"7f680000-0000-4000-8000-000000000011","config_id":"7f680000-0000-4000-8000-000000000010","idempotency_key":"probe:integration:001"}');
 b:=public.aqari_external_integrations(w,'enqueue_test','{"id":"7f680000-0000-4000-8000-000000000012","config_id":"7f680000-0000-4000-8000-000000000010","idempotency_key":"probe:integration:001"}');
 if a->>'id'<>b->>'id' or (select count(*) from jsonb_array_elements(public.aqari_external_integrations(w,'list')->'outbox')x where x->>'idempotency_key'='probe:integration:001')<>1 then raise exception 'OUTBOX_IDEMPOTENCY_FAILED';end if;
 begin perform 1 from private.aqari_integration_configs;raise exception 'PRIVATE_CONFIG_EXPOSED';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','7f680000-0000-4000-8000-000000000002',true);
do $$ begin begin perform public.aqari_external_integrations(current_setting('aqari.test.integration.workspace')::uuid,'list');raise exception 'ACCOUNTANT_LIST_ALLOWED';exception when insufficient_privilege then null;end;end $$;
reset role;
rollback;
select 'PASS: config/readback/live guard/HTTPS/revision/outbox idempotency/role isolation';
