// Boundary-only run; prior six-case suite is not imported or executed.
// Storage/RPC/auth are in-memory boundary fakes. No SQL, SDK import or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {randomFillSync} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {snapshot,transferSnapshot,receiverHandler,digest,MAX_BYTES,MAX_CONTROL_BYTES} from '../supabase/functions/_shared/storage-restore-v2.js';
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
function app({lostUpload=false,lostReply=false,corrupt=false,revokeAfterFirst=false,bucketLimit=25*MiB}={}){
 let handler,revoked=false,uploadAttempts=0,successfulUploads=0,finalizes=0,authChecks=0,binaryRequests=0;
 const files=new Map(),runs=new Map(),responses=[],events=[];
 const env={AQARI_RESTORE_SOURCE_URL:sourceUrl,AQARI_RESTORE_SOURCE_PUBLIC_KEY:'synthetic-public',AQARI_RESTORE_WORKSPACE:workspace,AQARI_RESTORE_BUCKET:bucket,SUPABASE_URL:target,SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',AQARI_STORAGE_RESTORE_V2_ENABLED:'true'};
 const storage={
  getBucket:async b=>{assert.equal(b,bucket);return {data:{public:false,file_size_limit:bucketLimit},error:null};},
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
async function seeded(options){
 const a=app(options),data=await input([4096]);await a.transfer(data);
 const preserved={runs:structuredClone(a.runs),files:new Map([...a.files].map(([k,v])=>[k,{bytes:v.length,hash:null}])),stats:a.stats()};
 for(const [k,v] of a.files)preserved.files.get(k).hash=await digest(v);
 return {a,preserved};
}
async function unchanged(a,p,{allowPending=false}={}){
 assert.equal(a.stats().uploadAttempts,p.stats.uploadAttempts);assert.equal(a.stats().successfulUploads,p.stats.successfulUploads);assert.equal(a.stats().finalizes,p.stats.finalizes);
 assert.equal(a.files.size,p.files.size);
 for(const [k,v] of p.files){assert.equal(a.files.get(k).length,v.bytes);assert.equal(await digest(a.files.get(k)),v.hash);}
 for(const [k,v] of p.runs)assert.deepEqual(a.runs.get(k),v);
 if(!allowPending)assert.equal(a.runs.size,p.runs.size);
}
async function control(a,body){return a.fetcher(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{authorization,'content-type':'application/json'},body:JSON.stringify(body)});}
function chunked(bytes){
 let offset=0,cancelled=false;
 const body=new ReadableStream({pull(c){if(offset===bytes.length){c.close();return;}const end=Math.min(offset+MiB,bytes.length);c.enqueue(bytes.subarray(offset,end));offset=end;},cancel(){cancelled=true;}},{highWaterMark:0});
 return {body,state:()=>({readBytes:offset,cancelled})};
}
test('configured per-object bucket limit +1 rejects metadata before upload and preserves verified seed',async t=>{
 // 25 MiB is this fake bucket's reported configuration, not a production constant.
 const configuredLimit=25*MiB,{a,preserved}=await seeded({bucketLimit:configuredLimit});
 const data=await input([configuredLimit+1]);const eventsBefore=a.events.length;
 await assert.rejects(a.transfer(data),/RESTORE_REJECTED/);
 assert.deepEqual(a.responses.at(-1),{status:409,error:'BACKUP_SIZE_LIMIT'});
 assert.equal(a.events.length,eventsBefore); // no begin/check/record/finalize or storage operations
 await unchanged(a,preserved);
 t.diagnostic(JSON.stringify({layer:'adapter getBucket metadata preflight',configuredLimit,sourceBytes:configuredLimit+1,objectBodySent:false,priorVerifiedPreserved:true}));
});
test('actual total 64 MiB +1 rejected by source and receiver manifest gates, preserving verified seed',async t=>{
 const {a,preserved}=await seeded(),objects=[];
 for(const [i,size] of [25*MiB,25*MiB,14*MiB+1].entries()){
  const bytes=randomFillSync(new Uint8Array(size));objects.push({bucket:'aqari-documents',name:`${workspace}/oversize-${i}.bin`,bytes:size,sha256:await digest(bytes)});
 }
 const requestsBefore=a.responses.length,eventsBefore=a.events.length;
 await assert.rejects(snapshot(workspace,sourceProject,objects),/BACKUP_SIZE_LIMIT/);
 assert.equal(a.responses.length,requestsBefore);
 // Explicit untrusted begin exercises receiver validation independently of the source gate.
 const response=await control(a,{action:'begin',...preserved.runs.values().next().value.plan,objects});
 assert.equal(response.status,409);assert.equal((await response.json()).error,'BACKUP_SIZE_LIMIT');assert.equal(a.events.length,eventsBefore);
 await unchanged(a,preserved);
 t.diagnostic(JSON.stringify({layer:'source snapshot and actual receiver manifest validation',totalBytes:MAX_BYTES+1,objectBodiesSent:false,priorVerifiedPreserved:true}));
});
test('streamed binary body exceeds declared object size by one, no Content-Length, no upload or record',async t=>{
 const {a,preserved}=await seeded(),data=await input([25*MiB]);
 const begin=await control(a,{action:'begin',...data.plan});assert.equal(begin.status,200);
 const o=data.plan.objects[0],bytes=new Uint8Array(o.bytes+1);bytes.set(data.bytes.get(o.name));bytes[o.bytes]=7;
 const stream=chunked(bytes),eventsBefore=a.events.length;
 const headers={authorization,'content-type':'application/octet-stream','x-aqari-run':data.plan.runId,'x-aqari-object':encodeURIComponent(JSON.stringify(o))};assert.equal(new Headers(headers).has('content-length'),false);
 const response=await a.fetcher(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers,body:stream.body,duplex:'half'});
 assert.equal(response.status,413);assert.equal((await response.json()).error,'REQUEST_TOO_LARGE');assert.deepEqual(stream.state(),{readBytes:o.bytes+1,cancelled:true});
 assert.deepEqual(a.events.slice(eventsBefore).map(e=>e[0]),['check']);assert.equal(a.runs.get(data.plan.runId).verified.size,0);assert.equal(a.runs.get(data.plan.runId).status,'pending');
 await unchanged(a,preserved,{allowPending:true});
 t.diagnostic(JSON.stringify({layer:'actual streamed body readLimited',declaredObjectBytes:o.bytes,streamedBytes:bytes.length,contentLengthAbsent:true,cancelled:true,priorVerifiedPreserved:true}));
});
test('control JSON body exceeds enforced 8 MiB limit by one before RPC, preserving verified seed',async t=>{
 const {a,preserved}=await seeded(),bytes=new Uint8Array(MAX_CONTROL_BYTES+1).fill(32);bytes[0]=123;bytes[bytes.length-1]=125;
 const stream=chunked(bytes),eventsBefore=a.events.length;
 const response=await a.fetcher(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{authorization,'content-type':'application/json'},body:stream.body,duplex:'half'});
 assert.equal(response.status,413);assert.equal((await response.json()).error,'REQUEST_TOO_LARGE');assert.deepEqual(stream.state(),{readBytes:MAX_CONTROL_BYTES+1,cancelled:true});assert.equal(a.events.length,eventsBefore);
 await unchanged(a,preserved);
 t.diagnostic(JSON.stringify({layer:'actual streamed control body readLimited',limit:MAX_CONTROL_BYTES,streamedBytes:bytes.length,priorVerifiedPreserved:true}));
});
