-- Positive local fixture carries current MFA evidence; production guards remain enabled.
-- Synthetic pre-upgrade data; immutable contradictory history must not be rewritten.
begin;
insert into public.aqari_workspaces(id,slug,name)values('7f6b2000-0000-4000-8000-000000000099','opening-legacy-conflict','Synthetic opening conflict');
insert into public.aqari_app_state(workspace_id,payload)values('7f6b2000-0000-4000-8000-000000000099','{}');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug)values
 ('opening-legacy-manager@example.invalid','مدير اختبار تعارض قديم','general_manager','opening-legacy-conflict');
insert into auth.users(id,email,email_confirmed_at)values('7f6b2000-0000-4000-8000-000000000001','opening-legacy-manager@example.invalid',now());
select set_config('request.jwt.claim.sub','7f6b2000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile)values
 ('7f6b2000-0000-4000-8000-000000000012','7f6b2000-0000-4000-8000-000000000099','opening-legacy-tenant','مستأجر اصطناعي للتعارض','761000000090','76100090','{}');
set local role authenticated;
select public.aqari_final_gap_register('7f6b2000-0000-4000-8000-000000000099','tenant_entry',
 '{"id":"7f6b2000-0000-4000-8000-000000000020","tenant_id":"7f6b2000-0000-4000-8000-000000000012","direction":"credit","kind":"opening_debit","amount":"999.125","occurred_on":"2026-01-01","reason":"تعارض اصطناعي محفوظ قبل الترقية","source_type":"legacy_import","source_id":"opening-legacy-conflict"}');
reset role;
commit;
