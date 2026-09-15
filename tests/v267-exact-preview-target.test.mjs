import test from 'node:test';
import assert from 'node:assert/strict';
import {exactPreviewTarget} from '../scripts/install-v267-exact-preview-target.mjs';

function fixture(){
 return new Map([
  ['public-config.js','window.AQARI_PUBLIC_CONFIG={"supabaseAuthRedirectUrl": "https://old-branch.vercel.app/login.html?release=V267"};\n'],
  ['supabase-adapter.js',"if(target.hostname !== 'old-branch.vercel.app')throw Error('AQARI_STAGING_REDIRECT_INVALID');\n"],
  ['qa-b.html',"const BRANCH_HOST='old-branch.vercel.app';\n"],
  ['qa-b-reauth.html',"const BRANCH_HOST='old-branch.vercel.app';\n"]
 ]);
}

test('Preview build pins auth callback and B pages to one immutable deployment host',()=>{
 const host='aqari-abc123-m-vib-5421.vercel.app';
 const out=exactPreviewTarget({vercelEnv:'preview',vercelUrl:host},fixture());
 assert.match(out.get('public-config.js'),new RegExp(`https://${host.replaceAll('.','\\.')}/login\\.html\\?release=V267`));
 assert.match(out.get('supabase-adapter.js'),new RegExp(`target\\.hostname !== '${host.replaceAll('.','\\.')}'`));
 assert.match(out.get('qa-b.html'),new RegExp(`BRANCH_HOST='${host.replaceAll('.','\\.')}'`));
 assert.match(out.get('qa-b-reauth.html'),new RegExp(`BRANCH_HOST='${host.replaceAll('.','\\.')}'`));
});

test('Production and local builds are never rewritten by the Preview pin',()=>{
 assert.equal(exactPreviewTarget({vercelEnv:'production',vercelUrl:'aqari-prod.vercel.app'},fixture()).size,0);
 assert.equal(exactPreviewTarget({vercelEnv:'',vercelUrl:''},fixture()).size,0);
});

test('Preview pin rejects missing, non-Vercel and malformed deployment hosts',()=>{
 for(const host of ['', 'myaqari.com', 'https://aqari-test.vercel.app', 'aqari_test.vercel.app']){
  assert.throws(()=>exactPreviewTarget({vercelEnv:'preview',vercelUrl:host},fixture()),/EXACT_PREVIEW_HOST_REQUIRED/);
 }
});

test('Preview pin fails closed when any protected source anchor changes',()=>{
 const missingConfig=fixture();missingConfig.set('public-config.js','window.AQARI_PUBLIC_CONFIG={};');
 assert.throws(()=>exactPreviewTarget({vercelEnv:'preview',vercelUrl:'aqari-test.vercel.app'},missingConfig),/PREVIEW_PUBLIC_REDIRECT_LAYOUT_CHANGED/);
 const missingAdapter=fixture();missingAdapter.set('supabase-adapter.js','const untouched=true;');
 assert.throws(()=>exactPreviewTarget({vercelEnv:'preview',vercelUrl:'aqari-test.vercel.app'},missingAdapter),/PREVIEW_ADAPTER_REDIRECT_LAYOUT_CHANGED/);
});
