import test from 'node:test';
import assert from 'node:assert/strict';
import {randomFillSync} from 'node:crypto';
import {snapshot,transferSnapshot,receiverHandler,digest,MAX_BYTES,readLimited} from '../supabase/functions/_shared/storage-restore-v2.js';
const workspace='11111111-1111-4111-8111-111111111111',sourceProject='ofgmcsmxmdswlovsckqs';
async function item(name,bytes){return {bucket:'aqari-documents',name:workspace+'/'+name,bytes:bytes.length,sha256:await digest(bytes)};}
function fixture({lostWrite=false,lostRecord=false,lostFinalize=false,corrupt=false,denied=false}={}){
 const runs=new Map(),files=new Map();let writes=0;
 const key=(id,o)=>JSON.stringify([id,o.bucket,o.name]);
 const store={
  begin:async p=>{if(!runs.has(p.runId))runs.set(p.runId,{p,verified:new Set()});},
  check:async(id,o)=>{if(!runs.get(id)?.p.objects.some(x=>JSON.stringify(x)===JSON.stringify(o)))throw Error('INVALID_OBJECT');},
  read:async(id,o)=>{const b=files.get(key(id,o));return b?(corrupt?new Uint8Array(b.length):b):null;},
  write:async(id,o,b)=>{assert.equal(files.has(key(id,o)),false);files.set(key(id,o),b.slice());writes++;if(lostWrite){lostWrite=false;throw Error('write response lost');}},
  record:async(id,o)=>{runs.get(id).verified.add(key(id,o));if(lostRecord){lostRecord=false;throw Error('record response lost');}},
  finalize:async id=>{const r=runs.get(id);if(!r||r.verified.size!==r.p.count)throw Error('FINALIZE_INCOMPLETE');if(lostFinalize){lostFinalize=false;throw Error('finalize response lost');}return {runId:id,snapshotHash:r.p.snapshotHash,verified:true,count:r.p.count,bytes:r.p.bytes};}
 };
 const handle=receiverHandler({authenticate:async()=>!denied,store,workspace,sourceProject});
 return {runs,files,handle,writes:()=>writes,fetcher:async(url,init)=>handle(new Request(url,init))};
}
async function restore(f,objects,bytes){const p=await snapshot(workspace,sourceProject,objects);await transferSnapshot(f.fetcher,'https://isolated.invalid','Bearer fixture',p,o=>bytes.get(o.name));return p;}
for(const size of [0,6*1024*1024+7,8*1024*1024+1,32*1024*1024+1,MAX_BYTES])test('binary restore round-trips incompressible '+size+' bytes',async()=>{
 const bytes=randomFillSync(new Uint8Array(size)),o=await item('encrypted.bin',bytes),f=fixture();
 const p=await restore(f,[o],new Map([[o.name,bytes]]));assert.equal(f.writes(),1);assert.equal(f.runs.get(p.runId).verified.size,1);
 const actual=[...f.files.values()][0];assert.equal(await digest(actual),o.sha256);
});
test('64MiB + 1 is rejected before transfer',async()=>{
 await assert.rejects(snapshot(workspace,sourceProject,[{bucket:'aqari-documents',name:workspace+'/x',bytes:MAX_BYTES+1,sha256:'0'.repeat(64)}]),/BACKUP_SIZE_LIMIT/);
});
for(const option of ['lostWrite','lostRecord','lostFinalize'])test(option+' retry preserves the run and does not write twice',async()=>{
 const bytes=new Uint8Array([4,8,9]),o=await item('a',bytes),f=fixture({[option]:true});
 const p=await restore(f,[o],new Map([[o.name,bytes]]));const again=await restore(f,[o],new Map([[o.name,bytes]]));
 assert.equal(p.runId,again.runId);assert.equal(f.writes(),1);assert.equal(f.runs.size,1);
});
test('deleting an object creates a different snapshot; previous successful proof and objects remain',async()=>{
 const a=new Uint8Array([1]),b=new Uint8Array([2]);const oa=await item('a',a),ob=await item('b',b),f=fixture(),data=new Map([[oa.name,a],[ob.name,b]]);
 const first=await restore(f,[oa,ob],data),second=await restore(f,[oa],data);
 assert.notEqual(first.runId,second.runId);assert.equal(f.runs.get(first.runId).verified.size,2);assert.equal(f.runs.get(second.runId).verified.size,1);assert.equal(f.files.size,3);
});
test('replacing bytes at the same name/size changes the snapshot identifier',async()=>{
 const a=await item('x',new Uint8Array([1])),b=await item('x',new Uint8Array([2]));assert.notEqual((await snapshot(workspace,sourceProject,[a])).runId,(await snapshot(workspace,sourceProject,[b])).runId);
});
test('empty snapshot finalizes independently',async()=>{const f=fixture();const p=await restore(f,[],new Map());assert.equal(p.count,0);assert.equal(f.writes(),0);});
test('readback corruption never produces verified result',async()=>{const b=new Uint8Array([5]),o=await item('x',b),f=fixture({corrupt:true});await assert.rejects(restore(f,[o],new Map([[o.name,b]])));assert.equal([...f.runs.values()][0].verified.size,0);});
test('authorization rejection precedes all storage writes',async()=>{const b=new Uint8Array([1]),o=await item('x',b),f=fixture({denied:true});await assert.rejects(restore(f,[o],new Map([[o.name,b]])));assert.equal(f.runs.size,0);assert.equal(f.writes(),0);});
test('stream limit enforced without content-length',async()=>{const request=new Request('https://test.invalid',{method:'POST',body:new Uint8Array(8)});await assert.rejects(readLimited(request,7),/REQUEST_TOO_LARGE/);});
