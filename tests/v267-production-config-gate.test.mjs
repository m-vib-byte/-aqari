import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  PRODUCTION_CONFIG_FORMAT,
  productionRuntimeConfigFingerprint,
  productionTargetFingerprint,
  validateProductionConfigForCli,
} from '../scripts/v267-production-config-gate.mjs';

const SHA='861cfac1fea37f38d878526fea9422b63d216852';
const OTHER_SHA='13a219e7930db89ebf2f9b44d30007499efa6ccf';
const PRODUCTION_PROJECT='abcdefghijklmnopqrst';
const RESTORE_PROJECT='djkpkkgoibruaezdrchb';
const TARGET={projectRef:PRODUCTION_PROJECT,publishableKey:'sb_publishable_0123456789abcdefghijklmnop'};
const sha256=(value)=>createHash('sha256').update(Buffer.from(value,'utf8')).digest('hex');

function validConfig(){
  const config={
    format:PRODUCTION_CONFIG_FORMAT,
    correct:true,
    verified:true,
    candidateSha:SHA,
    targetEnvironment:'production',
    productVersion:'V267',
    releaseStage:'production',
    hostname:'myaqari.com',
    authRedirectUrl:'https://myaqari.com/login.html?release=V267',
    projectRef:PRODUCTION_PROJECT,
    supabaseUrl:`https://${PRODUCTION_PROJECT}.supabase.co`,
    authStorageKey:`sb-${PRODUCTION_PROJECT}-auth-token`,
    publishableKeySha256:sha256(TARGET.publishableKey),
    targetConfigSha256:productionTargetFingerprint(TARGET),
    verifiedAt:'2026-09-17T13:00:00+03:00',
    evidence:['evidence/production-config.json'],
  };
  config.runtimeConfigSha256=productionRuntimeConfigFingerprint(config);
  return config;
}

const STAGE_C={source_project_ref:'ofgmcsmxmdswlovsckqs',restore_project_ref:RESTORE_PROJECT};

test('accepts a same-SHA Production configuration bound to a distinct repository target and exact runtime URL',()=>{
  const result=validateProductionConfigForCli({productionConfig:validConfig(),stageCBundle:STAGE_C,productionTarget:TARGET},SHA);
  assert.equal(result.ok,true,JSON.stringify(result.errors));
});

test('rejects Production target reuse of Preview source or independent restore project',()=>{
  for(const projectRef of [STAGE_C.source_project_ref,STAGE_C.restore_project_ref]){
    const target={...TARGET,projectRef};
    const config={...validConfig(),projectRef,supabaseUrl:`https://${projectRef}.supabase.co`,authStorageKey:`sb-${projectRef}-auth-token`,publishableKeySha256:sha256(target.publishableKey),targetConfigSha256:productionTargetFingerprint(target)};
    config.runtimeConfigSha256=productionRuntimeConfigFingerprint(config);
    const result=validateProductionConfigForCli({productionConfig:config,stageCBundle:STAGE_C,productionTarget:target},SHA);
    assert.equal(result.ok,false,projectRef);
    assert.match(result.errors.join('\n'),/must differ|must not reuse/);
  }
});

test('rejects candidate, environment, domain, redirect, project, runtime URL, target fingerprint and key fingerprint drift',()=>{
  const mutations=[
    (config)=>{config.candidateSha=OTHER_SHA},
    (config)=>{config.targetEnvironment='preview'},
    (config)=>{config.releaseStage='preview'},
    (config)=>{config.hostname='preview.example.com'},
    (config)=>{config.authRedirectUrl='https://myaqari.com/'},
    (config)=>{config.projectRef='wrong'},
    (config)=>{config.supabaseUrl='https://wrong-project.supabase.co'},
    (config)=>{config.authStorageKey='sb-wrong-auth-token'},
    (config)=>{config.publishableKeySha256='a'.repeat(64)},
    (config)=>{config.targetConfigSha256='b'.repeat(64)},
    (config)=>{config.runtimeConfigSha256='c'.repeat(64)},
  ];
  for(const mutate of mutations){
    const config=validConfig();mutate(config);
    assert.equal(validateProductionConfigForCli({productionConfig:config,stageCBundle:STAGE_C,productionTarget:TARGET},SHA).ok,false);
  }
});

test('runtime fingerprint binds project URL, domain, redirect, Auth storage namespace and public-key digest together',()=>{
  const config=validConfig();
  const baseline=productionRuntimeConfigFingerprint(config);
  assert.match(baseline,/^[0-9a-f]{64}$/);
  for(const patch of [
    {supabaseUrl:'https://zzzzzzzzzzzzzzzzzzzz.supabase.co'},
    {hostname:'www.myaqari.com'},
    {authRedirectUrl:'https://myaqari.com/login.html'},
    {authStorageKey:'sb-other-auth-token'},
    {productVersion:'V266'},
    {releaseStage:'preview'},
    {publishableKeySha256:'f'.repeat(64)},
  ]){
    assert.notEqual(productionRuntimeConfigFingerprint({...config,...patch}),baseline,JSON.stringify(patch));
  }
});

test('rejects missing verification evidence and raw secret-like material',()=>{
  for(const mutate of [
    (config)=>{config.verified=false},
    (config)=>{config.evidence=[]},
    (config)=>{config.verifiedAt='bad-date'},
    (config)=>{config.serviceRoleKey='should-never-be-here'},
    (config)=>{config.token='should-never-be-here'},
  ]){
    const config=validConfig();mutate(config);
    assert.equal(validateProductionConfigForCli({productionConfig:config,stageCBundle:STAGE_C,productionTarget:TARGET},SHA).ok,false);
  }
});

test('current documented Stage C restore ref cannot be accepted as the Production target',()=>{
  const target={projectRef:RESTORE_PROJECT,publishableKey:TARGET.publishableKey};
  const config={...validConfig(),projectRef:RESTORE_PROJECT,supabaseUrl:`https://${RESTORE_PROJECT}.supabase.co`,authStorageKey:`sb-${RESTORE_PROJECT}-auth-token`,publishableKeySha256:sha256(target.publishableKey),targetConfigSha256:productionTargetFingerprint(target)};
  config.runtimeConfigSha256=productionRuntimeConfigFingerprint(config);
  const result=validateProductionConfigForCli({productionConfig:config,stageCBundle:STAGE_C,productionTarget:target},SHA);
  assert.equal(result.ok,false);
  assert.match(result.errors.join('\n'),/independent Stage C restore project/);
});
