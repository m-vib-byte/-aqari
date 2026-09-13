const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const source=readFileSync(resolve(__dirname,'../staging-database/sql/mfa-enforcement.sql'),'utf8');

test('MFA guard covers owner, general manager and accountant identities',()=>{
 assert.match(source,/m\.role::text in \('owner','general_manager','accountant'\)/);
 assert.match(source,/s\.operational_role='accountant'/);
});

test('sensitive actors require an aal2 JWT and unauthenticated callers are denied',()=>{
 assert.match(source,/auth\.uid\(\) is null/);
 assert.match(source,/auth\.jwt\(\)->>'aal'/);
 assert.match(source,/MFA_REQUIRED/);
});

test('sensitive actors require a recent supported second-factor AMR event',()=>{
 assert.match(source,/auth\.jwt\(\)->'amr'/);
 assert.match(source,/amr_entry->>'method' in \('totp','otp'\)/);
 assert.match(source,/amr_entry->>'timestamp'/);
 assert.match(source,/interval '15 minutes'/);
 assert.match(source,/MFA_RECENT_REAUTH_REQUIRED/);
});

test('recent-MFA guard fails closed for missing, stale or implausibly future factor timestamps',()=>{
 assert.match(source,/recent_second_factor_at is null/);
 assert.match(source,/recent_second_factor_at < evaluation_time - interval '15 minutes'/);
 assert.match(source,/recent_second_factor_at > evaluation_time \+ interval '1 minute'/);
 assert.match(source,/coalesce\(amr_entry->>'timestamp',''\) ~ '\^\[0-9\]\+\$'/);
});

test('MFA helpers are private and not executable by browser roles',()=>{
 assert.match(source,/revoke all on function private\.aqari_sensitive_actor[\s\S]*private\.aqari_recent_second_factor_at\(\)[\s\S]*private\.aqari_require_sensitive_aal2\(uuid\)[\s\S]*from public,anon,authenticated/);
});
