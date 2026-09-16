import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const registry=read('staging-database/supabase/migrations/20260915115500_v267_qa_account_registry.sql');
const manager=read('staging-database/supabase/migrations/20260915115600_v267_qa_account_manager_rpc.sql');
const binding=read('staging-database/supabase/migrations/20260915115700_v267_qa_account_auth_binding.sql');
const dbExpiry=read('staging-database/supabase/migrations/20260915115800_v267_qa_account_db_expiry.sql');
const worker=read('lib/qa_accounts.py'),api=read('api/qa-account.py'),evidence=read('api/qa-evidence.py'),edge=read('staging-database/supabase/functions/qa-account-admin/index.ts'),expiry=read('api/qa-expire.py'),vercel=JSON.parse(read('vercel.json'));

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

test('Auth binding reuses existing staff partner and tenant identity paths without direct auth inserts',()=>{
 assert.match(binding,/zzz_aqari_qa_auth_bound/);assert.match(binding,/QA_MEMBERSHIP_BIND_FAILED/);assert.match(binding,/QA_PARTNER_BIND_FAILED/);assert.match(binding,/QA_TENANT_BIND_FAILED/);
 assert.match(binding,/current_setting\('role',true\) is distinct from 'service_role'/);assert.match(binding,/aqari_qa_expire_accounts/);assert.doesNotMatch(binding,/insert into auth\.users/i);
});

test('expired QA application access is revoked by Staging pg_cron, never by a Vercel production cron',()=>{
 assert.match(dbExpiry,/private\.aqari_qa_revoke_expired/);assert.match(dbExpiry,/cron\.schedule\('aqari-v267-qa-expiry','\*\/5 \* \* \* \*'/);assert.match(dbExpiry,/update public\.aqari_memberships set is_active=false/);assert.match(dbExpiry,/update public\.aqari_portal_accounts set is_active=false/);
 assert.equal(vercel.crons.some(row=>row.path==='/api/qa-expire'),false);assert.equal(vercel.crons.some(row=>row.path==='/api/integration-dispatch'),true);
});

test('Auth Admin is confined to Staging Edge Function while Vercel is a manager-JWT proxy',()=>{
 for(const marker of ["EXPECTED_URL='https://ofgmcsmxmdswlovsckqs.supabase.co'","VERCEL_ENV')!='preview'","EXPECTED_BRANCH='support/v267-knet-range-reconcile-20260915'","/auth/v1/admin/users","email_confirm':True","ban_duration':'876000h'","secrets.token_urlsafe"]){assert.match(worker,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));}
 assert.doesNotMatch(worker,/print\(/);assert.doesNotMatch(worker,/password.*service_call/);
 assert.match(api,/Authorization/);assert.match(api,/Cache-Control/);assert.match(api,/functions\/v1\/qa-account-admin/);assert.doesNotMatch(api,/AQARI_SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(edge,/SUPABASE_SECRET_KEYS/);assert.match(edge,/SUPABASE_PUBLISHABLE_KEYS/);assert.match(edge,/SUPABASE_SERVICE_ROLE_KEY/);assert.match(edge,/SUPABASE_ANON_KEY/);
 assert.match(edge,/secret\.startsWith\('sb_secret_'\)/);assert.match(edge,/headers\.Authorization='Bearer '\+secret/);assert.match(edge,/if\(!secret\.startsWith\('sb_secret_'\)\)/);
 assert.match(edge,/serverRequest\(url,secret,'\/auth\/v1\/admin\/users','POST'/);assert.match(edge,/serverRequest\(url,secret,'\/auth\/v1\/admin\/users\/'\+userId,'PUT'/);assert.match(edge,/serverRequest\(url,secret,'\/auth\/v1\/admin\/users\/'\+createdUserId,'DELETE'/);
 assert.match(edge,/serverRpc\(url,secret,'aqari_qa_account_server_result'/);assert.doesNotMatch(edge,/admin\.auth\.admin\./);assert.doesNotMatch(edge,/createClient\(url,secret/);assert.doesNotMatch(edge,/insert into auth\.users/i);
 assert.match(expiry,/CRON_SECRET/);assert.match(expiry,/hmac\.compare_digest/);
});

test('QA mutation and evidence APIs reject stale branch-alias pages by exact candidate SHA',()=>{
 for(const source of [api,evidence]){
  assert.match(source,/X-AQARI-Candidate-Sha/);
  assert.match(source,/VERCEL_GIT_COMMIT_SHA/);
  assert.match(source,/QA_CANDIDATE_SHA_MISMATCH/);
  assert.match(source,/\^\[0-9a-f\]\{40\}\$/);
 }
 assert.match(evidence,/p_candidate_sha/);
 assert.match(evidence,/candidate_sha/);
});

test('opaque Supabase secret keys are never sent as bearer JWTs',()=>{
 const guard=edge.indexOf("if(!secret.startsWith('sb_secret_'))headers.Authorization='Bearer '+secret");
 assert.ok(guard>=0);
 assert.equal(edge.includes("headers.Authorization='Bearer '+secret\n  return headers"),true);
 assert.doesNotMatch(edge,/Authorization['"]?\s*:\s*['"]Bearer ['"]\s*\+\s*secret/);
});