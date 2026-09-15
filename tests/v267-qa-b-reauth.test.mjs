import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../qa-b-reauth.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);

test('B reauth is pinned to the isolated Preview and existing signed-in session',()=>{
 assert.match(html,/ofgmcsmxmdswlovsckqs\.supabase\.co/);
 assert.match(html,/aqari-git-support-v267-knet-range-reconcile-20260915-m-vib-5421\.vercel\.app/);
 assert.match(html,/releaseStage!=='preview'/);
 assert.match(html,/client\.auth\.getSession\(\)/);
 assert.match(html,/AUTH_SESSION_REQUIRED/);
});

test('B reauth requires a verified MFA factor and uses atomic current-code verification',()=>{
 assert.match(html,/client\.auth\.mfa\.listFactors\(\)/);
 assert.match(html,/item\.status==='verified'/);
 assert.match(html,/challengeAndVerify\(\{factorId:factor\.id,code:normalized\}\)/);
 assert.doesNotMatch(html,/client\.auth\.mfa\.challenge\(/);
 assert.doesNotMatch(html,/client\.auth\.mfa\.verify\(/);
 assert.match(html,/currentLevel!=='aal2'/);
 assert.match(html,/client\.auth\.refreshSession\(\)/);
 assert.match(html,/MFA_VERIFIED_SESSION_REFRESH_REQUIRED/);
});

test('B reauth normalizes Arabic and Persian digits before sending the OTP',()=>{
 assert.match(html,/function normalizeOtp\(value\)/);
 assert.match(html,/٠١٢٣٤٥٦٧٨٩/);
 assert.match(html,/۰۱۲۳۴۵۶۷۸۹/);
 assert.match(html,/const normalized=normalizeOtp\(code\.value\)/);
 assert.match(html,/ضبط الوقت تلقائي/);
});

test('B reauth distinguishes incomplete enrollment, session-promotion failure and invalid code',()=>{
 assert.match(html,/item\.status==='unverified'/);
 assert.match(html,/MFA_ENROLLMENT_INCOMPLETE/);
 assert.match(html,/عامل المصادقة الحالي غير مكتمل الربط/);
 assert.match(html,/لا تكرر إدخال الرمز الآن/);
 assert.match(html,/MFA_FACTOR_REQUIRED/);
 assert.match(html,/عامل المصادقة موثق، لكن جلسة المتصفح لم تُرقَّ إلى AAL2/);
 assert.match(html,/الرمز لا يطابق العامل الموثق/);
});

test('successful reauth launches the Phase-B runner automatically and exposes no privileged material',()=>{
 assert.match(html,/location\.replace\('\/qa-b\.html\?run=1'\)/);
 const privilegedPattern=new RegExp([['service','role'].join('_'),['supabase','service','role','key'].join('_'),['access','token'].join('_'),'password\\s*='].join('|'),'i');
 assert.doesNotMatch(html,privilegedPattern);
 assert.doesNotMatch(html,/console\.(?:log|info|debug)\s*\(/);
});

test('reauth inline JavaScript parses',()=>{
 assert.ok(scripts.length>=1);
 for(const source of scripts)new Function(source);
});
