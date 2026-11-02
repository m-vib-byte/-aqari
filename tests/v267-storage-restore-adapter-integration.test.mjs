// Local synthetic integration: real shared protocol + unchanged TypeScript adapter.
// Storage/RPC/auth are in-memory boundary fakes. No SQL, SDK import or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {randomFillSync} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {snapshot,transferSnapshot,receiverHandler,digest,MAX_BYTES} from '../supabase/functions/_shared/storage-restore-v2.js';
const source=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/aqari-storage-restore-v2/index.ts',import.meta.url),'utf8').replace(/^import .*;$/gm,''));
const workspace='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222';
const sourceProject='ofgmcsmxmdswlovsckqs',sourceUrl=`https://${sourceProject}.supabase.co`,target='https://nlqynpmilcdqztwrrvyu.supabase.co',endpoint='https://receiver.invalid';
const bucket='synthetic-private-target',MiB=1024*1024;
const authorization='Bearer header.'+Buffer.from(JSON.stringify({sub:user,aal:'aal2'})).toString('base64url')+'.synthetic-signature';
globalThis.fetch=async()=>{throw Error('NETWORK_FORBIDDEN');};
const key=o=>JSON.stringify([o.bucket,o.name]);
const objectPath=(runId,o)=>`${runId}/storage/${o.bucket}/${o.name}`;
async function input(sizes){
 const bytes=new Map(),objects=[];
 for(const [i,size] of sizes.entries()){
  const b=randomFillSync(new Uint8Array(size));const o={bucket:'aqari-documents',name:`${workspace}/object-${i}.bin`,bytes:size,sha256:await digest(b)};
  bytes.set(o.name,b);objects.push(o);
 }
 return {bytes,plan:await snapshot(workspace,sourceProject,objects)};
}
function app({lostUpload=false,lostReply=false,corrupt=false,revokeAfterFirst=false}={}){
 let handler,revoked=false,uploadAttempts=0,successfulUploads=0,finalizes=0,authChecks=0,binaryRequests=0;
 const files=new Map(),runs=new Map(),responses=[],events=[];
 const env={AQARI_RESTORE_SOURCE_URL:sourceUrl,AQARI_RESTORE_SOURCE_PUBLIC_KEY:'synthetic-public',AQARI_RESTORE_WORKSPACE:workspace,AQARI_RESTORE_BUCKET:bucket,SUPABASE_URL:target,SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',AQARI_STORAGE_RESTORE_V2_ENABLED:'true'};
 const storage={
  getBucket:async b=>{assert.equal(b,bucket);return {data:{public:false,file_size_limit:25*MiB},error:null};},
  from:b=>{assert.equal(b,bucket);return {
   download:async path=>{
    assert.match(path,/^[a-f0-9-]+\/storage\/aqari-documents\//);
    events.push(['download',path]);const bytes=files.get(path);
    if(!bytes)return {data:null,error:{statusCode:'404'}};
    const copy=bytes.slice();if(corrupt)copy[0]^=255;
    return {data:new Blob([copy]),error:null};
   },
   upload:async(path,bytes,options)=>{
    uploadAttempts++;assert.equal(options.upsert,false);assert.equal(options.contentType,'application/octet-stream');assert.ok(bytes.length<=25*MiB);
    if(files.has(path))return {data:null,error:{statusCode:'409'}};
    files.set(path,new Uint8Array(bytes));successfulUploads++;events.push(['upload',path]);
    if(lostUpload){lostUpload=false;return {data:null,error:{message:'synthetic response lost after commit'}};}
    return {data:{path},error:null};
   }
  };}
 };
 const rpc=async(name,{p_action:action,p_data:d})=>{
  assert.equal(name,'aqari_storage_restore_v2');assert.equal(d.workspace,workspace);assert.equal(d.sourceProject,sourceProject);events.push([action,d.runId]);
  // Boundary fake models reviewed SQL manifest/check/record/finalize rules; SQL is not executed.
  if(action==='begin'){
   const old=runs.get(d.runId);if(old)assert.equal(old.plan.snapshotHash,d.snapshotHash);
   else runs.set(d.runId,{plan:structuredClone(d),verified:new Set(),status:'pending'});
   return {data:{runId:d.runId},error:null};
  }
  const r=runs.get(d.runId);assert.ok(r,'known run');
  if(action==='check'||action==='record'){
   assert.ok(r.plan.objects.some(o=>key(o)===key(d.object)&&o.bytes===d.object.bytes&&o.sha256===d.object.sha256),'exact manifest member');
   if(action==='record'){r.verified.add(key(d.object));if(revokeAfterFirst)revoked=true;}
   return {data:{ok:true},error:null};
  }
  assert.equal(action,'finalize');finalizes++;
  if(r.verified.size!==r.plan.objects.length)return {data:null,error:{message:'RESTORE_INCOMPLETE'}};
  r.status='verified';return {data:{runId:d.runId,snapshotHash:r.plan.snapshotHash,count:r.plan.objects.length,bytes:r.plan.objects.reduce((n,o)=>n+o.bytes,0),verified:true,scope:'storage_only'},error:null};
 };
 const ctx={Request,Response,URL,AbortSignal,atob,receiverHandler,Deno:{env:{get:n=>env[n]},serve:h=>{handler=h}},createClient:(url,credential,options)=>{
  assert.equal(url,target);assert.equal(credential,'synthetic-service');assert.equal(options.auth.persistSession,false);assert.equal(options.auth.autoRefreshToken,false);return {storage,rpc};
 },fetch:async(url,init)=>{
  assert.equal(init.redirect,'error');assert.ok(init.signal instanceof AbortSignal);assert.equal(init.headers.authorization,authorization);assert.equal(init.headers.apikey,'synthetic-public');
  if(url===sourceUrl+'/auth/v1/user'){authChecks++;return Response.json({id:user});}
  if(url===sourceUrl+'/rest/v1/rpc/aqari_workspace_access'){
   assert.equal(init.method,'POST');assert.deepEqual(JSON.parse(init.body),{p_workspace_id:workspace});
   return Response.json({workspace_id:workspace,user_id:user,role:revoked?'employee':'general_manager'});
  }
  throw Error('UNKNOWN_NETWORK_FORBIDDEN');
 }};
 vm.runInNewContext(source,ctx);
 const fetcher=async(url,init)=>{
  assert.equal(url,endpoint);assert.equal(init.redirect,'error');assert.ok(init.signal instanceof AbortSignal);
  const binary=init.headers['content-type']==='application/octet-stream';if(binary)binaryRequests++;
  const response=await handler(new Request(url,init));const body=await response.clone().json();responses.push({status:response.status,error:body.error});
  if(binary&&response.status===200&&lostReply){lostReply=false;throw Error('synthetic transport response lost after verified upload');}
  return response;
 };
 return {files,runs,responses,events,fetcher,stats:()=>({uploadAttempts,successfulUploads,finalizes,authChecks,binaryRequests}),transfer:({plan,bytes})=>transferSnapshot(fetcher,endpoint,authorization,plan,o=>bytes.get(o.name))};
}
test('adapter transfers actual incompressible 25+25+14 MiB, reads hashes and finalizes 64 MiB',async t=>{
 const data=await input([25*MiB,25*MiB,14*MiB]),a=app();
 for(const bytes of data.bytes.values())assert.ok(deflateRawSync(bytes,{level:1}).length>=bytes.length*.99);
 const done=await a.transfer(data);assert.equal(done.bytes,MAX_BYTES);assert.equal(done.count,3);assert.equal(done.snapshotHash,data.plan.snapshotHash);assert.equal(done.verified,true);
 for(const o of data.plan.objects){const stored=a.files.get(objectPath(data.plan.runId,o));assert.equal(stored.length,o.bytes);assert.equal(await digest(stored),o.sha256);}
 assert.equal(a.runs.get(data.plan.runId).verified.size,3);assert.equal(a.runs.get(data.plan.runId).status,'verified');assert.equal(a.stats().successfulUploads,3);assert.equal(a.stats().authChecks,5);
 t.diagnostic(JSON.stringify({bytes:done.bytes,count:done.count,...a.stats()}));
});
for(const option of ['lostUpload','lostReply'])test(`adapter ${option} after commit recovers without duplicate successful upload`,async t=>{
 const data=await input([MiB+17]),a=app({[option]:true});const done=await a.transfer(data);
 assert.equal(done.verified,true);assert.equal(a.files.size,1);assert.equal(a.runs.size,1);assert.equal(a.stats().successfulUploads,1);assert.equal(a.stats().uploadAttempts,1);
 assert.equal(a.stats().binaryRequests,option==='lostReply'?2:1);
 assert.equal(await digest([...a.files.values()][0]),data.plan.objects[0].sha256);t.diagnostic(JSON.stringify(a.stats()));
});
test('same-length corrupt adapter download prevents record and finalization',async t=>{
 const data=await input([MiB+31]),a=app({corrupt:true});await assert.rejects(a.transfer(data),/RESTORE_REJECTED/);
 assert.equal(a.stats().successfulUploads,1);assert.equal(a.runs.get(data.plan.runId).verified.size,0);assert.equal(a.runs.get(data.plan.runId).status,'pending');assert.equal(a.stats().finalizes,0);
 assert.deepEqual(a.responses.at(-1),{status:409,error:'READBACK_HASH_MISMATCH'});assert.equal(a.events.filter(e=>e[0]==='record').length,0);t.diagnostic(JSON.stringify(a.stats()));
});
test('authorization revoked between objects stops subsequent adapter storage writes',async t=>{
 const data=await input([MiB+1,MiB+2,MiB+3]),a=app({revokeAfterFirst:true});await assert.rejects(a.transfer(data),/RESTORE_REJECTED/);
 assert.equal(a.stats().successfulUploads,1);assert.equal(a.stats().uploadAttempts,1);assert.equal(a.files.size,1);assert.equal(a.runs.get(data.plan.runId).verified.size,1);assert.equal(a.stats().finalizes,0);
 assert.deepEqual(a.responses.at(-1),{status:403,error:'ACCESS_DENIED'});assert.equal(a.events.filter(e=>e[0]==='check').length,1);t.diagnostic(JSON.stringify(a.stats()));
});
test('changed same-name same-size bytes create a new adapter run and preserve verified prior bytes',async t=>{
 const first=await input([MiB+7]),a=app();await a.transfer(first);const prior=structuredClone(a.runs.get(first.plan.runId));
 const old=first.plan.objects[0],bytes=first.bytes.get(old.name).slice();bytes[0]^=255;
 const second={bytes:new Map([[old.name,bytes]]),plan:await snapshot(workspace,sourceProject,[{...old,sha256:await digest(bytes)}])};
 assert.notEqual(first.plan.runId,second.plan.runId);await a.transfer(second);
 assert.equal(a.files.size,2);assert.equal(a.runs.size,2);assert.equal(a.stats().successfulUploads,2);assert.deepEqual(a.runs.get(first.plan.runId),prior);
 for(const d of [first,second]){const o=d.plan.objects[0];assert.equal(await digest(a.files.get(objectPath(d.plan.runId,o))),o.sha256);assert.equal(a.runs.get(d.plan.runId).status,'verified');}
 t.diagnostic(JSON.stringify({...a.stats(),preservedPreviousRun:true}));
});
