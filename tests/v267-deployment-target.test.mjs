import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {deploymentTargetErrors} from '../scripts/verify-deployment-target.mjs';

function configuration() {
  const browser = {
    productVersion:'V267', releaseStage:'production',
    supabaseUrl:'https://djkpkkgoibruaezdrchb.supabase.co',
    supabasePublishableKey:'sb_publishable_fixture',
    supabaseAuthStorageKey:'sb-djkpkkgoibruaezdrchb-auth-token',
    supabaseAuthRedirectUrl:'https://myaqari.com/login.html?release=V267'
  };
  const backend = {PRODUCT_VERSION:'V267', RELEASE_STAGE:'production',
    SUPABASE_PUBLIC_CONFIG:{url:browser.supabaseUrl,publishableKey:browser.supabasePublishableKey}};
  return {browser,backend};
}

test('raw preview configuration cannot pass production validation before deliberate preparation', () => {
  const result = spawnSync(process.execPath, ['scripts/check.mjs'], {
    cwd:new URL('..',import.meta.url), encoding:'utf8', env:{...process.env,VERCEL_ENV:'production'}
  });
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Production Auth callbacks must return to myaqari.com/);
  // The authorized domain trial does not waive the separate production-data guard.
  const context={window:{}};
  runInNewContext(readFileSync(new URL('../public-config.js',import.meta.url),'utf8'),context);
  const browser=context.window.AQARI_PUBLIC_CONFIG;
  const backend={PRODUCT_VERSION:browser.productVersion,RELEASE_STAGE:browser.releaseStage,
    SUPABASE_PUBLIC_CONFIG:{url:browser.supabaseUrl,publishableKey:browser.supabasePublishableKey}};
  const errors=deploymentTargetErrors('production',browser,backend,{enabled:false}).join('\n');
  assert.match(errors,/Production cannot deploy a V267 preview configuration/);
  assert.match(errors,/preserve the current domain data source/);
  assert.match(errors,/Auth callbacks must return to myaqari.com/);
});

test('the Vercel build prepares its target before invoking the package check', () => {
  const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.deepEqual(config.buildCommand.split(' && '),[
    'node scripts/build-vercel.mjs',
    'node scripts/install-v267-owner-reference-package.mjs',
    'node scripts/install-v267-owner-feedback.mjs',
    'node scripts/install-botid-client.mjs'
  ]);
  assert.equal(config.outputDirectory,'.');
  const build=readFileSync(new URL('../scripts/build-vercel.mjs',import.meta.url),'utf8');
  assert.match(build,/VERCEL_ENV==='production'/);
  assert.match(build,/await import\('\.\/check\.mjs'\)/);
});

test('a consistent production configuration preserves the domain data source', () => {
  const {browser,backend}=configuration();
  assert.deepEqual(deploymentTargetErrors('production',browser,backend),[]);
});

test('production rejects preview stage, isolated data, old sessions and foreign redirects independently', () => {
  const changes=[
    b=>{b.releaseStage='preview';},
    b=>{b.supabaseUrl='https://ofgmcsmxmdswlovsckqs.supabase.co';},
    b=>{b.supabaseAuthStorageKey='sb-ofgmcsmxmdswlovsckqs-auth-token';},
    b=>{b.supabaseAuthRedirectUrl='https://aqari-git-design-v267-premium-workspace-m-vib-5421.vercel.app/login.html?release=V267';},
    b=>{b.supabaseAuthRedirectUrl='https://myaqari.com.evil.invalid/login.html?release=V267';}
  ];
  for(const change of changes){const {browser,backend}=configuration();change(browser);
    assert.ok(deploymentTargetErrors('production',browser,backend).length>0);}
});

test('browser/server disagreement is rejected even in preview', () => {
  for(const key of ['productVersion','releaseStage','supabaseUrl','supabasePublishableKey']){
    const {browser,backend}=configuration();browser[key]='mismatch';
    assert.ok(deploymentTargetErrors('preview',browser,backend).some(x=>x.includes('disagree')));
  }
});

test('the unchanged isolated candidate remains buildable as preview', () => {
  const result=spawnSync(process.execPath,['scripts/check.mjs'],{
    cwd:new URL('..',import.meta.url),encoding:'utf8',env:{...process.env,VERCEL_ENV:'preview'}
  });
  assert.equal(result.status,0,result.stderr);
});
