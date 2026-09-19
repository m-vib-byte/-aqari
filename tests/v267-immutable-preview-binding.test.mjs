import test from 'node:test';
import assert from 'node:assert/strict';
import {validateExactPreviewBinding} from '../scripts/v267-owner-production-approval.mjs';

const DEPLOYMENT='dpl_AqariImmutablePreview123';
const IMMUTABLE='https://aqari-flwzeaglw-m-vib-5421.vercel.app';
const MUTABLE_GIT_ALIAS='https://aqari-git-support-v267-knet-range-reconcile-20260915-m-vib-5421.vercel.app';
const PROJECT_ALIAS='https://aqari-m-vib-5421.vercel.app';

function manifest(url=IMMUTABLE,deploymentId=DEPLOYMENT){
  return {
    hostedPreview:{url:`${url}/app?release=V267`,deploymentId},
    stageCBundle:{preview:{url,deployment_id:deploymentId}},
  };
}

test('accepts the exact immutable AQARI deployment hostname and matching deployment id',()=>{
  const result=validateExactPreviewBinding(manifest());
  assert.equal(result.ok,true,JSON.stringify(result.errors));
});

test('rejects mutable Vercel Git branch aliases even when the deployment id matches',()=>{
  const result=validateExactPreviewBinding(manifest(MUTABLE_GIT_ALIAS));
  assert.equal(result.ok,false);
  assert.match(result.errors.join('\n'),/AQARI Vercel project|Preview|hostname/);
});

test('rejects the mutable AQARI project alias even when the deployment id matches',()=>{
  const result=validateExactPreviewBinding(manifest(PROJECT_ALIAS));
  assert.equal(result.ok,false);
  assert.match(result.errors.join('\n'),/AQARI Vercel project|Preview|hostname/);
});

test('rejects hosted and Stage-C evidence that point to different immutable deployments',()=>{
  const value=manifest();
  value.stageCBundle.preview.url='https://aqari-otherimmutable-m-vib-5421.vercel.app';
  const result=validateExactPreviewBinding(value);
  assert.equal(result.ok,false);
  assert.match(result.errors.join('\n'),/exact same immutable Vercel hostname/);
});
