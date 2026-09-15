const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const source=readFileSync(resolve(__dirname,'../src/v267/pages/security-center.js'),'utf8');

test('security center implements current Supabase TOTP enrollment flow',()=>{
 for(const method of ['enroll','challengeAndVerify','listFactors','getAuthenticatorAssuranceLevel','unenroll'])assert.match(source,new RegExp(`\\.${method}\\(`));
 assert.match(source,/factorType:'totp'/);
 assert.doesNotMatch(source,/auth\(\)\.challenge\(/);
 assert.doesNotMatch(source,/auth\(\)\.verify\(/);
});
test('sensitive verified factor removal requires an aal2 session',()=>{
 assert.match(source,/current\.currentLevel!=='aal2'/);
 assert.match(source,/ترقية الجلسة/);
});
test('stale unverified TOTP enrollment is visible and cleaned when the client exposes it',()=>{
 assert.match(source,/status==='unverified'/);
 assert.match(source,/removePendingTotp/);
 assert.match(source,/await removePendingTotp\(\)/);
 assert.match(source,/auth\(\)\.unenroll\(\{factorId:factor\.id\}\)/);
});
test('fresh TOTP enrollment never reuses the fixed friendly name that can collide with hidden stale factors',()=>{
 assert.match(source,/function newEnrollmentName\(\)/);
 assert.match(source,/randomUUID/);
 assert.match(source,/const enrollmentName=newEnrollmentName\(\)/);
 assert.match(source,/friendlyName:enrollmentName/);
 assert.doesNotMatch(source,/friendlyName:'AQARI V267'/);
 assert.match(source,/factorDisplayName/);
});
test('TOTP verification normalizes Arabic and Persian digits and uses atomic challengeAndVerify',()=>{
 assert.match(source,/function normalizeOtp\(value\)/);
 assert.match(source,/٠١٢٣٤٥٦٧٨٩/);
 assert.match(source,/۰۱۲۳۴۵۶۷۸۹/);
 assert.match(source,/challengeAndVerify\(\{factorId:id,code\}\)/);
 assert.match(source,/ضبط الوقت في الجهاز تلقائي/);
});
test('verified factor re-authentication runs through the dialog session guard',()=>{
 assert.match(source,/verify\.onclick=\(\)=>d\.run\(\(\)=>challenge\(factor\.id\)\)/);
});
test('TOTP input is bounded and enrollment secrets are cleared on disposal',()=>{
 assert.match(source,/input\.maxLength=12/);
 assert.match(source,/secret=null/);
 assert.match(source,/d\.onDispose/);
 assert.doesNotMatch(source,/localStorage|sessionStorage/);
});

test('workspace exposes the security center to authorized account roles',()=>{
 const workspace=readFileSync(resolve(__dirname,'../src/v267/workspace.js'),'utf8');
 assert.match(workspace,/openSecurityCenter/);
 assert.match(workspace,/aq267-security-center/);
});
