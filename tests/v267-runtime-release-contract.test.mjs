import assert from 'node:assert/strict';
import test from 'node:test';
import { deploymentIdentityStatus } from '../lib/release-config.js';

const ENV_KEYS = ['VERCEL_ENV','NODE_ENV','VERCEL_GIT_COMMIT_SHA','VERCEL_GIT_COMMIT_REF','VERCEL_URL'];

function withEnvironment(values, fn){
  const before = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
  try{
    for(const key of ENV_KEYS) delete process.env[key];
    for(const [key,value] of Object.entries(values)){
      if(value != null) process.env[key] = value;
    }
    return fn();
  }finally{
    for(const key of ENV_KEYS){
      if(before[key] == null) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
}

test('preview runtime accepts preview release stage with deployment identity',()=>{
  withEnvironment({
    VERCEL_ENV:'preview',
    VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),
    VERCEL_GIT_COMMIT_REF:'support/v267-runtime-contract',
    VERCEL_URL:'candidate.vercel.app'
  },()=>{
    const status=deploymentIdentityStatus();
    assert.equal(status.required,true);
    assert.equal(status.identityReady,true);
    assert.equal(status.releaseStageMatches,true);
    assert.equal(status.expectedReleaseStage,'preview');
    assert.equal(status.actualReleaseStage,'preview');
    assert.equal(status.ready,true);
  });
});

test('production runtime rejects preview-labelled release even with complete deployment identity',()=>{
  withEnvironment({
    VERCEL_ENV:'production',
    VERCEL_GIT_COMMIT_SHA:'b'.repeat(40),
    VERCEL_GIT_COMMIT_REF:'main',
    VERCEL_URL:'myaqari.com'
  },()=>{
    const status=deploymentIdentityStatus();
    assert.equal(status.required,true);
    assert.equal(status.identityReady,true);
    assert.equal(status.releaseStageMatches,false);
    assert.equal(status.expectedReleaseStage,'production');
    assert.equal(status.actualReleaseStage,'preview');
    assert.equal(status.ready,false);
  });
});

test('managed preview runtime still rejects missing immutable deployment identity',()=>{
  withEnvironment({VERCEL_ENV:'preview'},()=>{
    const status=deploymentIdentityStatus();
    assert.equal(status.required,true);
    assert.equal(status.identityReady,false);
    assert.equal(status.releaseStageMatches,true);
    assert.equal(status.ready,false);
  });
});

test('local runtime does not invent a managed release-stage requirement',()=>{
  withEnvironment({NODE_ENV:'test'},()=>{
    const status=deploymentIdentityStatus();
    assert.equal(status.required,false);
    assert.equal(status.identityReady,true);
    assert.equal(status.releaseStageMatches,true);
    assert.equal(status.expectedReleaseStage,null);
    assert.equal(status.ready,true);
  });
});
