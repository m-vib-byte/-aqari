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

test('B reauth requires a verified MFA factor and current six-digit challenge',()=>{
 assert.match(html,/pattern="\[0-9\]\{6\}"/);
 assert.match(html,/client\.auth\.mfa\.listFactors\(\)/);
 assert.match(html,/item\.status==='verified'/);
 assert.match(html,/client\.auth\.mfa\.challenge\(/);
 assert.match(html,/client\.auth\.mfa\.verify\(/);
 assert.match(html,/currentLevel!=='aal2'/);
 assert.match(html,/MFA_AAL2_REQUIRED/);
});

test('successful reauth launches the Phase-B runner automatically and exposes no secrets',()=>{
 assert.match(html,/location\.replace\('\/qa-b\.html\?run=1'\)/);
 assert.doesNotMatch(html,/service_role|SUPABASE_SERVICE_ROLE_KEY|password\s*=|access_token\s*=/i);
 assert.doesNotMatch(html,/console\.(?:log|info|debug)\s*\(/);
});

test('reauth inline JavaScript parses',()=>{
 assert.ok(scripts.length>=1);
 for(const source of scripts)new Function(source);
});
