import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  PRODUCTION_CONFIG_FORMAT,
  productionRuntimeConfigFingerprint,
  productionSupabaseTopologyFingerprint,
  productionTargetFingerprint,
  validateProductionConfigForCli,
} from '../scripts/v267-production-config-gate.mjs';

const SHA='861cfac1fea37f38d878526fea9422b63d216852';
const PRODUCTION_PROJECT='abcdefghijklmnopqrst';
const RESTORE_PROJECT='djkpkkgoibruaezdrchb';
const TARGET={projectRef:PRODUCTION_PROJECT,publishableKey:'sb_publishable_0123456789abcdefghijklmnop'};
const STAGE_C={source_project_ref:'ofgmcsmxmdswlovsckqs',restore_project_ref:RESTORE_PROJECT};
const sha256=(value)=>createHash('sha256').update(Buffer.from(value,'utf8')).digest('hex');

function validConfig(){
  const supabaseTopology={
    projectRef:PRODUCTION_PROJECT,
    parentProjectRef:PRODUCTION_PROJECT,
    branchName:'main',
    isDefault:true,
  };
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
    supabaseTopology,
    supabaseTopologyEvidence:['evidence/supabase-branch-inventory.json'],
    supabaseTopologySha256:productionSupabaseTopologyFingerprint(supabaseTopology),
    authStorageKey:`sb-${PRODUCTION_PROJECT}-auth-token`,
    publishableKeySha256:sha256(TARGET.publishableKey),
    targetConfigSha256:productionTargetFingerprint(TARGET),
    verifiedAt:'2026-09-17T10:00:00Z',
    evidence:['evidence/production-config.json'],
  };
  config.runtimeConfigSha256=productionRuntimeConfigFingerprint(config);
  return config;
}

test('repository production target is minimal and cannot carry hidden secret or metadata fields',()=>{
  for(const target of [
    {...TARGET,serviceRoleKey:'must-not-be-stored'},
    {...TARGET,metadata:{password:'must-not-be-stored'}},
    {...TARGET,notes:'unexpected extra field'},
  ]){
    const result=validateProductionConfigForCli({
      productionConfig:validConfig(),
      stageCBundle:STAGE_C,
      productionTarget:target,
    },SHA);
    assert.equal(result.ok,false,JSON.stringify(target));
    assert.match(result.errors.join('\n'),/exactly projectRef and publishableKey|raw secret material/);
  }
});
