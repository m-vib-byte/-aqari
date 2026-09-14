import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {domainTrialPatch,PREVIEW_PROJECT,PRODUCTION_PROJECT,DOMAIN_TRIAL_REDIRECT} from '../scripts/prepare-v267-production.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const target=JSON.parse(read('config/domain-trial-target.json'));

test('single-domain trial is disabled by the current owner governance',()=>{
 assert.equal(target.enabled,false);
 const build=read('scripts/build-vercel.mjs');
 assert.match(build,/v267-owner-production-approval\.mjs/);
 assert.match(build,/VERCEL_GIT_COMMIT_SHA/);
 assert.match(build,/DOMAIN_TRIAL_DISABLED_BY_OWNER_GOVERNANCE/);
 assert.doesNotMatch(build,/domainTrialPatch/);
});

test('legacy trial patch remains fail-closed and isolated when explicitly exercised',()=>{
 const explicit={...target,enabled:true};
 const patch=domainTrialPatch(read,explicit);
 assert.ok(patch.has('public-config.js'));
 const context={window:{}};runInNewContext(patch.get('public-config.js'),context);
 const cfg=context.window.AQARI_PUBLIC_CONFIG;
 assert.equal(cfg.releaseStage,'preview');
 assert.equal(cfg.supabaseUrl,`https://${PREVIEW_PROJECT}.supabase.co`);
 assert.equal(cfg.supabaseAuthStorageKey,`sb-${PREVIEW_PROJECT}-auth-token`);
 assert.equal(cfg.supabaseAuthRedirectUrl,DOMAIN_TRIAL_REDIRECT);
 assert.doesNotMatch(patch.get('public-config.js'),new RegExp(PRODUCTION_PROJECT));
 assert.throws(()=>domainTrialPatch(read,target),/DOMAIN_TRIAL_TARGET_REQUIRED/);
 assert.throws(()=>domainTrialPatch(read,{...explicit,projectRef:PRODUCTION_PROJECT}),/ISOLATED_TRIAL_PROJECT_REQUIRED/);
});
