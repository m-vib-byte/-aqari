import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {domainTrialPatch,PREVIEW_PROJECT,PRODUCTION_PROJECT,DOMAIN_TRIAL_REDIRECT} from '../scripts/prepare-v267-production.mjs';
import {deploymentTargetErrors} from '../scripts/verify-deployment-target.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const repositoryTarget=JSON.parse(read('config/domain-trial-target.json'));
const trialTarget={...repositoryTarget,enabled:true};

function patchedTrial(){
 const patch=domainTrialPatch(read,trialTarget);
 const context={window:{}};runInNewContext(patch.get('public-config.js'),context);
 return {patch,browser:context.window.AQARI_PUBLIC_CONFIG,backend:{
  PRODUCT_VERSION:'V267',RELEASE_STAGE:'preview',SUPABASE_PUBLIC_CONFIG:{url:`https://${PREVIEW_PROJECT}.supabase.co`,publishableKey:trialTarget.publishableKey}
 }};
}

test('repository production target disables the temporary single-domain trial',()=>{
 assert.equal(repositoryTarget.enabled,false);
 assert.equal(repositoryTarget.hostname,'myaqari.com');
 assert.equal(repositoryTarget.projectRef,PREVIEW_PROJECT);
});

test('single-domain trial keeps isolated staging data and only moves auth return to myaqari',()=>{
 const {patch,browser:cfg}=patchedTrial();
 assert.ok(patch.has('public-config.js'));
 assert.ok(patch.has('supabase-adapter.js'));
 assert.ok(patch.has('v267-partner-portal.js'));
 assert.ok(patch.has('FILE_INVENTORY.json'));
 assert.equal(cfg.releaseStage,'preview');
 assert.equal(cfg.supabaseUrl,`https://${PREVIEW_PROJECT}.supabase.co`);
 assert.equal(cfg.supabaseAuthStorageKey,`sb-${PREVIEW_PROJECT}-auth-token`);
 assert.equal(cfg.supabaseAuthRedirectUrl,DOMAIN_TRIAL_REDIRECT);
 assert.doesNotMatch(patch.get('public-config.js'),new RegExp(PRODUCTION_PROJECT));
 assert.match(patch.get('supabase-adapter.js'),/target\.hostname !== 'myaqari\.com'/);
 assert.match(patch.get('v267-partner-portal.js'),/https:\/\/myaqari\.com\/login\.html\?release=V267/);
});

test('trial target fails closed if production data project is supplied',()=>{
 assert.throws(()=>domainTrialPatch(read,{...trialTarget,projectRef:PRODUCTION_PROJECT}),/ISOLATED_TRIAL_PROJECT_REQUIRED/);
 assert.throws(()=>domainTrialPatch(read,{...trialTarget,enabled:false}),/DOMAIN_TRIAL_TARGET_REQUIRED/);
});

test('production Vercel target accepts only the reviewed isolated-domain trial when explicitly enabled',()=>{
 const {browser,backend}=patchedTrial();
 assert.deepEqual(deploymentTargetErrors('production',browser,backend,trialTarget),[]);
 assert.match(deploymentTargetErrors('production',browser,backend,{...trialTarget,projectRef:PRODUCTION_PROJECT}).join('\n'),/reviewed isolated myaqari target/);
 assert.match(deploymentTargetErrors('production',{...browser,supabaseUrl:`https://${PRODUCTION_PROJECT}.supabase.co`},backend,trialTarget).join('\n'),/isolated V267 data source/);
 assert.match(deploymentTargetErrors('production',{...browser,supabaseAuthRedirectUrl:'https://example.test/login.html'},backend,trialTarget).join('\n'),/myaqari\.com/);
 assert.match(deploymentTargetErrors('production',browser,backend,{...trialTarget,enabled:false}).join('\n'),/explicit isolated domain-trial target|current domain data source/);
});
