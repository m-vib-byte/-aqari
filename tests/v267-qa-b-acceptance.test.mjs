import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../qa-b.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);

test('Phase-B runner is pinned to isolated Preview scope',()=>{
 assert.match(html,/ofgmcsmxmdswlovsckqs\.supabase\.co/);
 assert.match(html,/47a4a884-eb5c-4551-8754-2f51dee518f8/);
 assert.match(html,/aqari-git-support-v267-knet-range-reconcile-20260915-m-vib-5421\.vercel\.app/);
 assert.match(html,/releaseStage==='preview'/);
 assert.match(html,/EXACT_BRANCH_PREVIEW_REQUIRED/);
});

test('Phase-B runner uses real Auth sessions and in-memory temporary QA clients',()=>{
 assert.match(html,/getAuthenticatorAssuranceLevel/);
 assert.match(html,/currentLevel==='aal2'/);
 assert.match(html,/signInWithPassword/);
 assert.match(html,/function newClient\(persist=false\)/);
 assert.match(html,/persistSession:persist/);
 assert.match(html,/autoRefreshToken:persist/);
 assert.match(html,/const client=newClient\(false\)/);
 assert.match(html,/delete record\.password/);
 assert.doesNotMatch(html,/console\.(?:log|info|debug)\s*\(/);
});

test('Phase-B runner exercises staff, partner and tenant boundaries then cleanup',()=>{
 for(const token of ['collector','accountant','maintenance','property_manager','viewer','partner','tenant'])assert.match(html,new RegExp(token));
 assert.match(html,/aqari_workspace_access/);
 assert.match(html,/aqari_partner_property_finance/);
 assert.match(html,/aqari_tenant_portal_snapshot/);
 assert.match(html,/NON_MANAGER_ADMIN_NOT_DENIED/);
 assert.match(html,/action:'disable'/);
 assert.match(html,/\/api\/qa-evidence/);
});

test('inline runner JavaScript parses',()=>{
 assert.ok(scripts.length>=1);
 for(const source of scripts)new Function(source);
});
