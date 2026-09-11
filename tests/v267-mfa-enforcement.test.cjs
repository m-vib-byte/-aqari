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
test('MFA helper is private and not executable by browser roles',()=>{
 assert.match(source,/revoke all on function private\.aqari_sensitive_actor[\s\S]*from public,anon,authenticated/);
});
