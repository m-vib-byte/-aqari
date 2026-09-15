import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const registry=read('staging-database/supabase/migrations/20260915115500_v267_qa_account_registry.sql');
const manager=read('staging-database/supabase/migrations/20260915115600_v267_qa_account_manager_rpc.sql');
const binding=read('staging-database/supabase/migrations/20260915115700_v267_qa_account_auth_binding.sql');
const worker=read('lib/qa_accounts.py'),api=read('api/qa-account.py'),expiry=read('api/qa-expire.py');

test('temporary QA registry is private audited expiring and excludes temporary general-manager',()=>{
 assert.match(registry,/private\.aqari_qa_accounts/);assert.match(registry,/private\.aqari_qa_account_events/);assert.match(registry,/expires_at/);assert.match(registry,/aqari_qa_events_immutable/);
 assert.doesNotMatch(registry,/qa_role in\([^\n]*general_manager/);assert.doesNotMatch(registry,/when 'general_manager'/);
 assert.match(registry,/revoke all on private\.aqari_qa_accounts from public,anon,authenticated,service_role/);
});

test('manager preparation is staging-only MFA guarded and limited to named QA properties',()=>{
 assert.match(manager,/private\.aqari_require_sensitive_aal2/);assert.match(manager,/aqari-v267-staging/);assert.match(manager,/QA_STAGING_ONLY/);assert.match(manager,/QA_TEST_PROPERTY_REQUIRED/);
 assert.match(manager,/p\.name like 'اختبار %'/);assert.match(manager,/target_role not in\('collector','accountant','maintenance','property_manager','viewer','partner','tenant'\)/);
 assert.match(manager,/QA_AUTH_EMAIL_ALREADY_EXISTS/);assert.match(manager,/QA_TENANT_IDENTITY_MISMATCH/);assert.doesNotMatch(manager,/insert into auth\.users/i);
});

test('Auth binding reuses existing staff partner and tenant identity paths then revokes app access before ban',()=>{
 assert.match(binding,/zzz_aqari_qa_auth_bound/);assert.match(binding,/QA_MEMBERSHIP_BIND_FAILED/);assert.match(binding,/QA_PARTNER_BIND_FAILED/);assert.match(binding,/QA_TENANT_BIND_FAILED/);
 assert.match(binding,/current_setting\('role',true\) is distinct from 'service_role'/);assert.match(binding,/aqari_qa_expire_accounts/);assert.match(binding,/status='expired'/);assert.doesNotMatch(binding,/insert into auth\.users/i);
});

test('server worker uses official Auth Admin create and ban with exact preview/staging fail-closed guards',()=>{
 for(const marker of ["EXPECTED_URL='https://ofgmcsmxmdswlovsckqs.supabase.co'","VERCEL_ENV')!='preview'","EXPECTED_BRANCH='support/v267-knet-range-reconcile-20260915'","/auth/v1/admin/users","email_confirm':True","ban_duration':'876000h'","secrets.token_urlsafe"]){assert.match(worker,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));}
 assert.doesNotMatch(worker,/print\(/);assert.doesNotMatch(worker,/password.*service_call/);
 assert.match(api,/Authorization/);assert.match(api,/Cache-Control/);assert.match(api,/provision_automation_account/);assert.match(expiry,/CRON_SECRET/);assert.match(expiry,/hmac\.compare_digest/);
});
