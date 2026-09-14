import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {domainTrialPatch,PREVIEW_PROJECT,PRODUCTION_PROJECT,DOMAIN_TRIAL_REDIRECT} from '../scripts/prepare-v267-production.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const target=JSON.parse(read('config/domain-trial-target.json'));

test('single-domain trial keeps isolated staging data and only moves auth return to myaqari',()=>{
 const patch=domainTrialPatch(read,target);
 assert.ok(patch.has('public-config.js'));
 assert.ok(patch.has('supabase-adapter.js'));
 assert.ok(patch.has('v267-partner-portal.js'));
 assert.ok(patch.has('FILE_INVENTORY.json'));
 const context={window:{}};runInNewContext(patch.get('public-config.js'),context);
 const cfg=context.window.AQARI_PUBLIC_CONFIG;
 assert.equal(cfg.releaseStage,'preview');
 assert.equal(cfg.supabaseUrl,`https://${PREVIEW_PROJECT}.supabase.co`);
 assert.equal(cfg.supabaseAuthStorageKey,`sb-${PREVIEW_PROJECT}-auth-token`);
 assert.equal(cfg.supabaseAuthRedirectUrl,DOMAIN_TRIAL_REDIRECT);
 assert.doesNotMatch(patch.get('public-config.js'),new RegExp(PRODUCTION_PROJECT));
 assert.match(patch.get('supabase-adapter.js'),/target\.hostname !== 'myaqari\.com'/);
 assert.match(patch.get('v267-partner-portal.js'),/https:\/\/myaqari\.com\/login\.html\?release=V267/);
});

test('trial target fails closed if production data project is supplied',()=>{
 assert.throws(()=>domainTrialPatch(read,{...target,projectRef:PRODUCTION_PROJECT}),/ISOLATED_TRIAL_PROJECT_REQUIRED/);
 assert.throws(()=>domainTrialPatch(read,{...target,enabled:false}),/DOMAIN_TRIAL_TARGET_REQUIRED/);
});
