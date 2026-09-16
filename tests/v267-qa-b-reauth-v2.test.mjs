import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../qa-b-reauth-v2.html',import.meta.url),'utf8');
const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);

test('fresh B MFA page is exact-candidate and same-origin gated before accepting a code',()=>{
 assert.match(html,/previewCandidateSha/);
 assert.match(html,/previewBranchHost!==location\.hostname/);
 assert.match(html,/SESSION_LOGIN_REDIRECT/);
 assert.match(html,/\/login\.html\?release=V267&manual=1&returnTo=/);
 assert.match(html,/\/qa-b-reauth-v2\.html\?candidate=/);
 assert.match(html,/listFactors\(\)/);
 assert.match(html,/status==='verified'/);
 assert.match(html,/code\.disabled=false;submit\.disabled=false/);
});

test('lost authenticator recovery is owner-session scoped and never deletes AQARI data in the browser',()=>{
 assert.match(html,/owner-mfa-recovery/);
 assert.match(html,/RECENT_PASSWORD_REQUIRED/);
 assert.match(html,/sessionStorage\.setItem\('aqari_mfa_recovery','1'\)/);
 assert.match(html,/signOut\(\{scope:'local'\}\)/);
 assert.match(html,/فقدت رمز Authenticator/);
 assert.doesNotMatch(html,/delete\s*\(|from\(['"](?:aqari_|public\.|private\.)/i);
});

test('fresh B MFA page can enroll a replacement TOTP without exposing privileged server material',()=>{
 assert.match(html,/mfa\.enroll\(\{factorType:'totp',friendlyName:friendly\}\)/);
 assert.match(html,/mfa\.unenroll\(\{factorId:item\.id\}\)/);
 assert.match(html,/totp\?\.qr_code/);
 assert.match(html,/totp\?\.secret/);
 assert.match(html,/qr\.src=e\.data\.totp\.qr_code/);
 assert.match(html,/secret\.textContent=e\.data\.totp\.secret/);
});

test('fresh B MFA page creates a challenge before verify and never uses challengeAndVerify',()=>{
 assert.match(html,/mfa\.challenge\(\{factorId:factor\.id\}\)/);
 assert.match(html,/const challengeId=String\(c\.data\?\.id\|\|''\)/);
 assert.match(html,/mfa\.verify\(\{factorId:factor\.id,challengeId,code:otp\}\)/);
 assert.doesNotMatch(html,/challengeAndVerify/);
 assert.match(html,/where==='VERIFY'/);
 assert.match(html,/where==='CHALLENGE'/);
});

test('fresh B MFA page verifies persisted AAL2 before navigating',()=>{
 assert.match(html,/getAuthenticatorAssuranceLevel/);
 assert.match(html,/AAL2_DIRECT_MISSING/);
 assert.match(html,/AAL2_PERSIST_MISSING/);
 assert.match(html,/location\.replace\('\/qa-b\.html\?run=1'\)/);
});

test('MFA and B browser files are explicitly no-store',()=>{
 const noStoreSources=new Set(vercel.headers.filter(x=>x.headers?.some(h=>h.key==='Cache-Control'&&/no-store/.test(h.value))).map(x=>x.source));
 for(const source of ['/qa-b-reauth-v2.html','/qa-b-reauth.html','/qa-b.html','/public-config.js','/supabase-adapter.js']) assert.equal(noStoreSources.has(source),true,source);
});

test('fresh B MFA inline JavaScript parses and exposes no privileged material',()=>{
 assert.ok(scripts.length>=1);
 for(const source of scripts)new Function(source);
 assert.doesNotMatch(html,/service_role|AQARI_SUPABASE_SERVICE_ROLE_KEY|password\s*=/i);
 assert.doesNotMatch(html,/console\.(?:log|info|debug)\s*\(/);
});
