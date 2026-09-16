import test from 'node:test';
import assert from 'node:assert/strict';
import {exactPreviewTarget} from '../scripts/install-v267-exact-preview-target.mjs';

const BRANCH='aqari-git-support-v267-knet-range-reconcile-20260915-m-vib-5421.vercel.app';
const SHA='a'.repeat(40);
function fixture(){
 return new Map([
  ['public-config.js','window.AQARI_PUBLIC_CONFIG={"supabaseAuthRedirectUrl": "https://old-branch.vercel.app/login.html?release=V267","supabaseUrl":"https://example.supabase.co"};\n'],
  ['supabase-adapter.js',"if(target.hostname !== 'old-branch.vercel.app')throw Error('AQARI_STAGING_REDIRECT_INVALID');\n"],
  ['qa-b.html',"const BRANCH_HOST='old-branch.vercel.app';\n"],
  ['qa-b-reauth.html',"const BRANCH_HOST='old-branch.vercel.app';\n"]
 ]);
}

test('Preview build preserves one branch auth origin and records exact immutable candidate identity',()=>{
 const immutable='aqari-abc123-m-vib-5421.vercel.app';
 const out=exactPreviewTarget({vercelEnv:'preview',vercelUrl:immutable,vercelBranchUrl:BRANCH,candidateSha:SHA},fixture());
 assert.match(out.get('public-config.js'),new RegExp(`https://${BRANCH.replaceAll('.','\\.')}/login\\.html\\?release=V267`));
 assert.match(out.get('public-config.js'),new RegExp(`"previewBranchHost": "${BRANCH.replaceAll('.','\\.')}"`));
 assert.match(out.get('public-config.js'),new RegExp(`"previewImmutableHost": "${immutable.replaceAll('.','\\.')}"`));
 assert.match(out.get('public-config.js'),new RegExp(`"previewCandidateSha": "${SHA}"`));
 assert.match(out.get('supabase-adapter.js'),new RegExp(`target\\.hostname !== '${BRANCH.replaceAll('.','\\.')}'`));
 assert.match(out.get('qa-b.html'),new RegExp(`BRANCH_HOST='${BRANCH.replaceAll('.','\\.')}'`));
 assert.match(out.get('qa-b-reauth.html'),new RegExp(`BRANCH_HOST='${BRANCH.replaceAll('.','\\.')}'`));
 assert.doesNotMatch(out.get('qa-b.html'),new RegExp(`BRANCH_HOST='${immutable.replaceAll('.','\\.')}'`));
});

test('Production and local builds are never rewritten by the Preview pin',()=>{
 assert.equal(exactPreviewTarget({vercelEnv:'production',vercelUrl:'aqari-prod.vercel.app',vercelBranchUrl:BRANCH,candidateSha:SHA},fixture()).size,0);
 assert.equal(exactPreviewTarget({vercelEnv:'',vercelUrl:'',vercelBranchUrl:'',candidateSha:''},fixture()).size,0);
});

test('Preview pin rejects missing or malformed immutable host, branch host and candidate SHA',()=>{
 for(const host of ['', 'myaqari.com', 'https://aqari-test.vercel.app', 'aqari_test.vercel.app']){
  assert.throws(()=>exactPreviewTarget({vercelEnv:'preview',vercelUrl:host,vercelBranchUrl:BRANCH,candidateSha:SHA},fixture()),/EXACT_PREVIEW_HOST_REQUIRED/);
 }
 for(const branch of ['myaqari.com','https://branch.vercel.app','branch_test.vercel.app']){
  assert.throws(()=>exactPreviewTarget({vercelEnv:'preview',vercelUrl:'aqari-test.vercel.app',vercelBranchUrl:branch,candidateSha:SHA},fixture()),/PREVIEW_SESSION_HOST_REQUIRED/);
 }
 for(const candidateSha of ['', 'abc', 'g'.repeat(40)]){
  assert.throws(()=>exactPreviewTarget({vercelEnv:'preview',vercelUrl:'aqari-test.vercel.app',vercelBranchUrl:BRANCH,candidateSha},fixture()),/PREVIEW_CANDIDATE_SHA_REQUIRED/);
 }
});

test('Preview pin fails closed when protected source anchors change',()=>{
 const missingConfig=fixture();missingConfig.set('public-config.js','window.AQARI_PUBLIC_CONFIG={};');
 assert.throws(()=>exactPreviewTarget({vercelEnv:'preview',vercelUrl:'aqari-test.vercel.app',vercelBranchUrl:BRANCH,candidateSha:SHA},missingConfig),/PREVIEW_PUBLIC_REDIRECT_LAYOUT_CHANGED/);
 const missingAdapter=fixture();missingAdapter.set('supabase-adapter.js','const untouched=true;');
 assert.throws(()=>exactPreviewTarget({vercelEnv:'preview',vercelUrl:'aqari-test.vercel.app',vercelBranchUrl:BRANCH,candidateSha:SHA},missingAdapter),/PREVIEW_ADAPTER_REDIRECT_LAYOUT_CHANGED/);
});
