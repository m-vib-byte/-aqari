-- Isolated PostgreSQL acceptance only. No hosted or production target.
begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('feature-manager@example.invalid','مدير اختبار جاهزية الخدمات','general_manager','aqari-v267-staging'),
 ('feature-accountant@example.invalid','محاسب اختبار جاهزية الخدمات','accountant','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values
 ('f267f000-0000-4000-8000-000000000001','feature-manager@example.invalid',now()),
 ('f267f000-0000-4000-8000-000000000002','feature-accountant@example.invalid',now());
select set_config('request.jwt.claim.sub','f267f000-0000-4000-8000-000000000001',true);
select set_config('feature.test.workspace',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active),true);
set local role authenticated;
do $$
declare a jsonb; k text; w uuid:=current_setting('feature.test.workspace')::uuid;
begin
 a:=public.aqari_workspace_access(w);
 if a->>'workspace_id'<>w::text or a->>'user_id'<>auth.uid()::text then raise exception 'ACCESS_SCOPE_MISMATCH';end if;
 foreach k in array array['final_gap_register','official_documents','external_integrations','financial_archive','compliance_register','kpi_dashboard','maintenance_plans','operations_register','unit_meter_readings'] loop
  if a->'features'->k is distinct from 'true'::jsonb then raise exception 'AVAILABLE_SERVICE_NOT_DISCOVERED: %',k;end if;
 end loop;
 begin
  perform public.aqari_workspace_access('f267f999-0000-4000-8000-000000000099');
  raise exception 'OTHER_WORKSPACE_ACCEPTED';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Simulate an older service set without dropping the function or its data.
alter function public.aqari_financial_archive(uuid,text) rename to aqari_financial_archive_test_unavailable;
set local role authenticated;
do $$begin
 if public.aqari_workspace_access(current_setting('feature.test.workspace')::uuid)->'features'->'financial_archive' is distinct from 'false'::jsonb then raise exception 'MISSING_SERVICE_ADVERTISED';end if;
end $$;
reset role;
alter function public.aqari_financial_archive_test_unavailable(uuid,text) rename to aqari_financial_archive;
select set_config('request.jwt.claim.sub','f267f000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$declare a jsonb;k text;begin
 a:=public.aqari_workspace_access(current_setting('feature.test.workspace')::uuid);
 foreach k in array array['final_gap_register','official_documents','external_integrations','compliance_register','kpi_dashboard','operations_register'] loop
  if a->'features'->k is distinct from 'false'::jsonb then raise exception 'MANAGER_SERVICE_EXPOSED_TO_ACCOUNTANT: %',k;end if;
 end loop;
end $$;
reset role;
update public.aqari_memberships set is_active=false where user_id='f267f000-0000-4000-8000-000000000002';
set local role authenticated;
do $$begin
 begin
  perform public.aqari_workspace_access(current_setting('feature.test.workspace')::uuid);
  raise exception 'REVOKED_MEMBERSHIP_ACCEPTED';
 exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'PASS: discover installed RPCs, hide unavailable service, deny other workspace/manager-only access/revoked membership. Fixtures and function rename rolled back.' result;
