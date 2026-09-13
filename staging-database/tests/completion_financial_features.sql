-- Local-only capability discovery test. The simulated older backend renames an
-- RPC transactionally; do not run this test on a hosted project.
begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('completion-features-manager@example.invalid','اختبار الخدمات المالية','general_manager','aqari-v267-staging'),
 ('completion-features-accountant@example.invalid','اختبار نطاق المحاسب','accountant','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values
 ('f268f000-0000-4000-8000-000000000001','completion-features-manager@example.invalid',now()),
 ('f268f000-0000-4000-8000-000000000002','completion-features-accountant@example.invalid',now());
select set_config('request.jwt.claim.sub','f268f000-0000-4000-8000-000000000001',true);
select set_config('completion.features.workspace',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active),true);
set local role authenticated;
do $$declare access jsonb;feature text;begin
 access:=public.aqari_workspace_access(current_setting('completion.features.workspace')::uuid);
 foreach feature in array array['commercial_collections','opening_balance_reconciliation','partner_distribution_register'] loop
  if access->'features'->feature is distinct from 'true'::jsonb then raise exception 'FINANCIAL_COMPLETION_NOT_DISCOVERED: %',feature;end if;
 end loop;
end$$;
reset role;
alter function public.aqari_opening_balance_reconciliation(uuid,text,jsonb) rename to aqari_opening_balance_reconciliation_test_unavailable;
set local role authenticated;
do $$begin
 if public.aqari_workspace_access(current_setting('completion.features.workspace')::uuid)->'features'->'opening_balance_reconciliation' is distinct from 'false'::jsonb then raise exception 'ABSENT_OPENING_RPC_EXPOSED';end if;
end$$;
reset role;
alter function public.aqari_opening_balance_reconciliation_test_unavailable(uuid,text,jsonb) rename to aqari_opening_balance_reconciliation;
select set_config('request.jwt.claim.sub','f268f000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$declare access jsonb;feature text;begin
 access:=public.aqari_workspace_access(current_setting('completion.features.workspace')::uuid);
 foreach feature in array array['commercial_collections','opening_balance_reconciliation','partner_distribution_register'] loop
  if access->'features'->feature is distinct from 'false'::jsonb then raise exception 'MANAGER_FINANCIAL_COMPLETION_EXPOSED: %',feature;end if;
 end loop;
end$$;
reset role;
rollback;
select 'PASS: manager-only installed financial services discovered; absent RPC and accountant hidden; transactional fixture removed.' result;
