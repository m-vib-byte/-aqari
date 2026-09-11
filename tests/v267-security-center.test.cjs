const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const source=readFileSync(resolve(__dirname,'../src/v267/pages/security-center.js'),'utf8');

test('security center implements current Supabase TOTP enrollment flow',()=>{
 for(const method of ['enroll','challenge','verify','listFactors','getAuthenticatorAssuranceLevel','unenroll'])assert.match(source,new RegExp(`\\.${method}\\(`));
 assert.match(source,/factorType:'totp'/);
});
test('sensitive factor removal requires an aal2 session',()=>{
 assert.match(source,/current\.currentLevel!=='aal2'/);
 assert.match(source,/ترقية الجلسة/);
});
test('TOTP code is constrained and enrollment secrets are cleared on disposal',()=>{
 assert.match(source,/input\.pattern='\\[0-9\\]\\{6\\}'/);
 assert.match(source,/secret=null/);
 assert.match(source,/d\.onDispose/);
 assert.doesNotMatch(source,/localStorage|sessionStorage/);
});

test('workspace exposes the security center to authorized account roles',()=>{
 const workspace=readFileSync(resolve(__dirname,'../src/v267/workspace.js'),'utf8');
 assert.match(workspace,/openSecurityCenter/);
 assert.match(workspace,/aq267-security-center/);
});
