import test from 'node:test';
import assert from 'node:assert/strict';
import {exactPreviewTarget} from '../scripts/install-v267-exact-preview-target.mjs';

const BRANCH='aqari-git-support-v267-knet-range-reconcile-20260915-m-vib-5421.vercel.app';
const SHA='a'.repeat(40);
function fixture(){
 const authHeader="'Authorization':'Bearer '+token}";
 return new Map([
  ['public-config.js','window.AQARI_PUBLIC_CONFIG={"supabaseAuthRedirectUrl": "https://old-branch.vercel.app/login.html?release=V267","supabaseUrl":"https://example.supabase.co"};\n'],
  ['supabase-adapter.js',"if(target.hostname !== 'old-branch.vercel.app')throw Error('AQARI_STAGING_REDIRECT_INVALID');\n"],
  ['qa-b.html',`const BRANCH_HOST='old-branch.vercel.app';\nconst cfg=window.AQARI_PUBLIC_CONFIG||{};\nconst a={${authHeader};\nconst b={${authHeader};\nassert(cfg.releaseStage==='preview'&&cfg.supabaseUrl===EXPECTED_URL,'PREVIEW_CONFIG_REQUIRED');\nassert(saved?.ok===true&&saved?.id,'EVIDENCE_NOT_CONFIRMED');\n`],
  ['qa-b-reauth.html',`const BRANCH_HOST='old-branch.vercel.app';\nconst cfg=window.AQARI_PUBLIC_CONFIG||{};\nif(location.hostname!==BRANCH_HOST||cfg.releaseStage!=='preview'||cfg.supabaseUrl!==EXPECTED_URL)fail('PREVIEW_REQUIRED');\nlocation.replace('/qa-b.html?run=1');\n`],
  ['qa-b-reauth-v2.html',`const EXPECTED_URL='https://ofgmcsmxmdswlovsckqs.supabase.co';\nconst cfg=window.AQARI_PUBLIC_CONFIG||{};\nasync function preflight(){const sha=String(cfg.previewCandidateSha||'').toLowerCase();if(cfg.releaseStage!=='preview'||cfg.supabaseUrl!==EXPECTED_URL||cfg.previewBranchHost!==location.hostname||!/^[0-9a-f]{40}$/.test(sha))fail('PREVIEW_CANDIDATE_REQUIRED');}\nlocation.replace('/qa-b.html?run=1');\n`]
 ]);
}

test('Preview build preserves one branch auth origin and records exact immutable candidate identity',()=>{
 const immutable='aqari-abc123-m-vib-5421.vercel.app';
 const out=exactPreviewTarget({vercelEnv:'preview',vercelUrl:immutable,vercelBranchUrl:BRANCH,candidateSha:SHA},fixture());
 const config=out.get('public-config.js'),runner=out.get('qa-b.html'),reauth=out.get('qa-b-reauth.html'),reauthV2=out.get('qa-b-reauth-v2.html');
 assert.match(config,new RegExp(`https://${BRANCH.replaceAll('.','\\.')}/login\\.html\\?release=V267`));
 assert.match(config,new RegExp(`"previewBranchHost": "${BRANCH.replaceAll('.','\\.')}"`));
 assert.match(config,new RegExp(`"previewImmutableHost": "${immutable.replaceAll('.','\\.')}"`));
 assert.match(config,new RegExp(`"previewCandidateSha": "${SHA}"`));
 assert.match(out.get('supabase-adapter.js'),new RegExp(`target\\.hostname !== '${BRANCH.replaceAll('.','\\.')}'`));
 assert.match(runner,new RegExp(`BRANCH_HOST='${BRANCH.replaceAll('.','\\.')}'`));
 assert.match(reauth,new RegExp(`BRANCH_HOST='${BRANCH.replaceAll('.','\\.')}'`));
 assert.match(reauthV2,new RegExp(`BRANCH_HOST='${BRANCH.replaceAll('.','\\.')}'`));
 assert.doesNotMatch(runner,new RegExp(`BRANCH_HOST='${immutable.replaceAll('.','\\.')}'`));
 assert.match(runner,new RegExp(`CANDIDATE_SHA='${SHA}'`));
 assert.equal((runner.match(/X-AQARI-Candidate-Sha/g)||[]).length,2);
 assert.match(runner,/requestedCandidate===CANDIDATE_SHA/);
 assert.match(runner,/saved\?\.candidate_sha===CANDIDATE_SHA/);
 assert.match(reauth,new RegExp(`CANDIDATE_SHA='${SHA}'`));
 assert.match(reauth,/previewCandidateSha!==CANDIDATE_SHA/);
 assert.match(reauth,/qa-b\.html\?run=1&candidate=/);
 assert.match(reauthV2,new RegExp(`CANDIDATE_SHA='${SHA}'`));
 assert.match(reauthV2,/sha!==CANDIDATE_SHA/);
 assert.match(reauthV2,/location\.hostname!==BRANCH_HOST/);
 assert.match(reauthV2,/requestedCandidate!==CANDIDATE_SHA/);
 assert.match(reauthV2,/qa-b\.html\?run=1&candidate=/);
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
 const args={vercelEnv:'preview',vercelUrl:'aqari-test.vercel.app',vercelBranchUrl:BRANCH,candidateSha:SHA};
 const missingConfig=fixture();missingConfig.set('public-config.js','window.AQARI_PUBLIC_CONFIG={};');
 assert.throws(()=>exactPreviewTarget(args,missingConfig),/PREVIEW_PUBLIC_REDIRECT_LAYOUT_CHANGED/);
 const missingAdapter=fixture();missingAdapter.set('supabase-adapter.js','const untouched=true;');
 assert.throws(()=>exactPreviewTarget(args,missingAdapter),/PREVIEW_ADAPTER_REDIRECT_LAYOUT_CHANGED/);
 const missingApi=fixture();missingApi.set('qa-b.html',"const BRANCH_HOST='old-branch.vercel.app';");
 assert.throws(()=>exactPreviewTarget(args,missingApi),/PREVIEW_QA_API_HEADER_LAYOUT_CHANGED/);
 const missingV2=fixture();missingV2.set('qa-b-reauth-v2.html','const untouched=true;');
 assert.throws(()=>exactPreviewTarget(args,missingV2),/PREVIEW_REAUTH_V2_HEADER_LAYOUT_CHANGED/);
});
