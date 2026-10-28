import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {snapshot,digest,readLimited,transferSnapshot,MAX_BYTES,PROTOCOL} from '../supabase/functions/_shared/storage-restore-v2.js';

// Synthetic data only. No network, credentials, database, or hosted Storage access.
if(!globalThis.crypto) globalThis.crypto=webcrypto;
const workspace='11111111-1111-4111-8111-111111111111';
const project='isolated-project';
const bytes=new TextEncoder().encode('AQARI synthetic restore regression');
const item=async()=>({bucket:'aqari-documents',name:workspace+'/sample.txt',bytes:bytes.length,sha256:await digest(bytes)});

test('snapshot retries preserve content-addressed run and sort entries',async()=>{
 const a=await item();
 const b={...a,name:workspace+'/another.txt'};
 const first=await snapshot(workspace,project,[a,b]);
 const second=await snapshot(workspace,project,[b,a]);
 assert.equal(first.runId,second.runId);
 assert.equal(first.snapshotHash,second.snapshotHash);
 assert.equal(first.count,2);
 assert.equal(first.bytes,bytes.length*2);
 assert.equal(first.protocol,PROTOCOL);
});

test('reject traversal, cross-workspace, duplicate and invalid digest',async()=>{
 const a=await item();
 for(const invalid of [
  {...a,name:workspace+'/../escape.txt'},
  {...a,name:'33333333-3333-4333-8333-333333333333/sample.txt'},
  {...a,sha256:'0'.repeat(63)},
  {...a,bytes:-1}
 ]) await assert.rejects(snapshot(workspace,project,[invalid]));
 await assert.rejects(snapshot(workspace,project,[a,a]),/DUPLICATE_OBJECT/);
});

test('reject snapshot larger than maximum before any upload',async()=>{
 const a=await item();
 await assert.rejects(snapshot(workspace,project,[{...a,bytes:MAX_BYTES+1}]),/BACKUP_SIZE_LIMIT/);
});

test('reject oversized request stream even if content-length is missing',async()=>{
 const request=new Request('https://isolated.invalid',{method:'POST',body:new Uint8Array(24),duplex:'half'});
 await assert.rejects(readLimited(request,12),/REQUEST_TOO_LARGE/);
});

test('do not upload mismatched source bytes',async()=>{
 const plan=await snapshot(workspace,project,[await item()]);
 let binaryWrites=0;
 const fetcher=async(_url,init)=>{
  const body=JSON.parse(init.body);
  if(body.action!=='begin')throw Error('UNEXPECTED_CONTROL');
  return Response.json({ok:true,protocol:PROTOCOL,runId:plan.runId},{status:200});
 };
 await assert.rejects(
  transferSnapshot(async(url,init)=>{if(init.headers['content-type']==='application/octet-stream')binaryWrites++;return fetcher(url,init)},'https://isolated.invalid','Bearer synthetic',plan,()=>new Uint8Array(bytes.length)),
  /SOURCE_HASH_MISMATCH/
 );
 assert.equal(binaryWrites,0);
});
