import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {domainTrialPatch,PREVIEW_PROJECT,PRODUCTION_PROJECT,DOMAIN_TRIAL_REDIRECT} from '../scripts/prepare-v267-production.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const target=JSON.parse(read('config/domain-trial-target.json'));
const build=read('scripts/build-vercel.mjs');

function patchedLegacyTrial(){
 const patch=domainTrialPatch(read,{...target,enabled:true});
 const context={window:{}};runInNewContext(patch.get('public-config.js'),context);
 return {patch,browser:context.window.AQARI_PUBLIC_CONFIG};
}

test('legacy myaqari domain trial is retained only as disabled metadata',()=>{
 assert.equal(target.enabled,false);
 assert.equal(target.hostname,'myaqari.com');
 assert.equal(target.projectRef,PREVIEW_PROJECT);
 assert.match(target.publishableKey,/^sb_publishable_/);
});

test('production Vercel build fails closed on an exact candidate and owner approval before production patching',()=>{
 const gate="execFileSync(process.execPath,['scripts/v267-owner-production-approval.mjs'";
 const patch='const changes=productionPatch';
 assert.ok(build.includes("if(process.env.VERCEL_ENV==='production')"));
 assert.ok(build.includes('VERCEL_GIT_COMMIT_SHA'));
 assert.ok(build.includes("if(!/^[0-9a-f]{40}$/.test(candidate))throw Error('EXACT_PRODUCTION_CANDIDATE_SHA_REQUIRED')"));
 assert.ok(build.includes("'--candidate-sha',candidate"));
 assert.ok(build.includes('V267_CANDIDATE_SHA:candidate'));
 assert.ok(build.indexOf(gate)>=0);
 assert.ok(build.indexOf(patch)>build.indexOf(gate));
 assert.ok(build.includes("if(trial?.enabled===true)throw Error('DOMAIN_TRIAL_DISABLED_BY_OWNER_GOVERNANCE')"));
 assert.equal(build.includes('domainTrialPatch('),false);
});

test('disabled trial metadata cannot be used by the legacy patch helper',()=>{
 assert.throws(()=>domainTrialPatch(read,target),/DOMAIN_TRIAL_TARGET_REQUIRED/);
 assert.throws(()=>domainTrialPatch(read,{...target,enabled:true,projectRef:PRODUCTION_PROJECT}),/ISOLATED_TRIAL_PROJECT_REQUIRED/);
});

test('legacy helper remains bounded to isolated preview data if explicitly exercised outside the production build',()=>{
 const {patch,browser:cfg}=patchedLegacyTrial();
 assert.equal(cfg.releaseStage,'preview');
 assert.equal(cfg.supabaseUrl,`https://${PREVIEW_PROJECT}.supabase.co`);
 assert.equal(cfg.supabaseAuthStorageKey,`sb-${PREVIEW_PROJECT}-auth-token`);
 assert.equal(cfg.supabaseAuthRedirectUrl,DOMAIN_TRIAL_REDIRECT);
 assert.doesNotMatch(patch.get('public-config.js'),new RegExp(PRODUCTION_PROJECT));
});
