const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const source=readFileSync(resolve(__dirname,'../src/v267/pages/security-center.js'),'utf8');

test('security center implements current Supabase TOTP enrollment flow',()=>{
 for(const method of ['enroll','challenge','verify','listFactors','getAuthenticatorAssuranceLevel','unenroll'])assert.match(source,new RegExp(`\\.${method}\\(`));
 assert.match(source,/factorType:'totp'/);
});
test('sensitive verified factor removal requires an aal2 session',()=>{
 assert.match(source,/current\.currentLevel!=='aal2'/);
 assert.match(source,/ترقية الجلسة/);
});
test('stale unverified TOTP enrollment is visible and cleaned before a fresh enroll',()=>{
 assert.match(source,/status==='unverified'/);
 assert.match(source,/removePendingTotp/);
 assert.match(source,/await removePendingTotp\(\)/);
 assert.match(source,/auth\(\)\.unenroll\(\{factorId:factor\.id\}\)/);
 assert.match(source,/تم إلغاء التسجيل غير المكتمل السابق وبدء ربط جديد/);
});
test('verified factor re-authentication runs through the dialog session guard',()=>{
 assert.match(source,/verify\.onclick=\(\)=>d\.run\(\(\)=>challenge\(factor\.id\)\)/);
});
test('TOTP code is constrained and enrollment secrets are cleared on disposal',()=>{
 assert.ok(source.includes("input.pattern='[0-9]{6}'"));
 assert.match(source,/secret=null/);
 assert.match(source,/d\.onDispose/);
 assert.doesNotMatch(source,/localStorage|sessionStorage/);
});

test('workspace exposes the security center to authorized account roles',()=>{
 const workspace=readFileSync(resolve(__dirname,'../src/v267/workspace.js'),'utf8');
 assert.match(workspace,/openSecurityCenter/);
 assert.match(workspace,/aq267-security-center/);
});
