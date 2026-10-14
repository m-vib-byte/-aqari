import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const edge=fs.readFileSync('staging-database/reconciliation/acceptance-20261014/hosted-export-candidate.ts','utf8');
const runId='33333333-3333-4333-8333-333333333333';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
function storageHandler(catalogPage,options={}) {
  let zipCalls=0;
  let zipFiles;
  const source=stripTypeScriptTypes(edge.replace(/^import .*;$/gm,'').replace('export default ','globalThis.edgeModule='));
  const workspace='11111111-1111-4111-8111-111111111111';
  const caller='22222222-2222-4222-8222-222222222222';
  let schemaCalls=0;
  const query={select(){return this},in(){return this},like(){return this},order(){return this},range:async()=>({error:{code:'PGRST106',message:'Invalid schema: storage'}})};
  const ctx={userClaims:{id:caller},jwtClaims:{aal:'aal2'},supabase:{rpc:async()=>({data:{workspace_id:workspace,user_id:caller,role:'general_manager'}})},supabaseAdmin:{schema:()=>{schemaCalls++;return {from:()=>query}},storage:{from:bucket=>({list:(prefix,params)=>catalogPage({bucket,prefix,...params}),download:options.download|| (async()=>({data:new Blob(['x'])}))})}}};
  options.configureContext?.(ctx);
  const sandbox={URL,Request,Response,Headers,TextEncoder,Blob,Uint8Array,crypto,btoa,AbortSignal,fetch:options.fetch||(()=>{throw new Error('Unexpected outbound fetch')}),Deno:{env:{get:name=>name==='AQARI_RESTORE_RUN_ID'?(options.runId===undefined?runId:options.runId):'https://synthetic.supabase.co'}},withSupabase:(_,handler)=>req=>handler(req,ctx),strToU8:s=>new TextEncoder().encode(s),zipSync:files=>{zipCalls++;zipFiles=files;return new Uint8Array([1])}};
  vm.runInNewContext(source,sandbox);
  return {run:(body={},headers={})=>sandbox.edgeModule.fetch(new Request('https://synthetic.test',{method:'POST',headers,body:JSON.stringify({workspaceId:workspace,restoreRunId:runId,...body})})),zipCalls:()=>zipCalls,zipFiles:()=>zipFiles,schemaCalls:()=>schemaCalls,workspace};
}

const workspace='11111111-1111-4111-8111-111111111111';
const file=(name,metadata={})=>({id:'fixture-'+name,name,metadata:{size:1,...metadata}});
const documents=rows=>async({bucket,prefix,offset,limit})=>({data:bucket==='aqari-documents'&&prefix===workspace?rows.slice(offset,offset+limit):[]});


const auth={authorization:'Bearer synthetic-manager-token'};
function transport(calls){return async(url,init)=>{const b=JSON.parse(init.body);calls.push(b);return Response.json(b.action==='object'?{ok:true,sha256:b.sha256}:{ok:true,summary:{verified:true,count:b.expectedCount,bytes:b.expectedBytes}})}}
test('candidate rejects absent server run configuration before catalog or transfer',async()=>{
 const app=storageHandler(()=>{throw Error('must not list')},{runId:''});
 assert.equal((await (await app.run({restoreToIsolated:true},auth)).json()).error,'RESTORE_RUN_NOT_CONFIGURED');
});
test('candidate rejects a mismatched caller run before catalog or transfer',async()=>{
 const app=storageHandler(()=>{throw Error('must not list')});
 assert.equal((await (await app.run({restoreToIsolated:true,restoreRunId:'44444444-4444-4444-8444-444444444444'},auth)).json()).error,'RESTORE_RUN_NOT_CONFIGURED');
});
for(const size of [5*1024*1024+1,6*1024*1024,32*1024*1024,64*1024*1024])test('candidate rejects unsupported restore object '+size+' before any partial copy',async()=>{
 let downloaded=0;const calls=[];const app=storageHandler(documents([file('small.pdf'),file('large.pdf',{size})]),{download:async()=>{downloaded++;return {data:new Blob(['x'])}},fetch:transport(calls)});
 assert.equal((await (await app.run({restoreToIsolated:true},auth)).json()).error,size+1>64*1024*1024?'BACKUP_SIZE_LIMIT':'RESTORE_TRANSPORT_SIZE_LIMIT');
 assert.equal(downloaded,0);assert.equal(calls.length,0);assert.equal(app.zipCalls(),0);
});
test('candidate catalog drift is rejected before the first target write',async()=>{
 let scans=0;const calls=[];const app=storageHandler(async({bucket,offset})=>({data:bucket==='aqari-documents'&&!offset?(++scans===1?[file('one.pdf')]:[]):[]}),{fetch:transport(calls)});
 assert.equal((await (await app.run({restoreToIsolated:true},auth)).json()).error,'STORAGE_CATALOG_CHANGED');assert.equal(calls.length,0);
});
test('candidate completes only the explicitly configured run after all source reads',async()=>{
 const calls=[];let downloaded=0;const app=storageHandler(documents([file('a.pdf'),file('b.pdf')]),{download:async()=>{downloaded++;return {data:new Blob(['x'])}},fetch:async(url,init)=>{assert.equal(downloaded,2);return transport(calls)(url,init)}});
 const response=await app.run({restoreToIsolated:true},auth);assert.equal(response.status,200);assert.deepEqual(calls.map(x=>x.action),['object','object','finalize']);assert.ok(calls.every(x=>x.runId===runId));
});
const receiver=fs.readFileSync('staging-database/reconciliation/acceptance-20261014/active-receiver-candidate.ts','utf8');
function receiverFixture(run=runId){
 const objects=new Map(),uploads=[],records=[];let handler;
 const manager='22222222-2222-4222-8222-222222222222';
 const workspace='c05fcb74-8315-43aa-86b7-0b420c05d2cd';
 const token='synthetic.'+btoa(JSON.stringify({sub:manager,aal:'aal2'}))+'.synthetic';
 const store={upload:async(path,bytes,options)=>{uploads.push({path,options});if(objects.has(path))return {error:{statusCode:'409'}};objects.set(path,new Uint8Array(bytes));return {}},download:async path=>({data:new Blob([objects.get(path)])})};
 const admin={storage:{getBucket:async()=>({data:{}}),from:()=>store},rpc:async(name,args)=>{records.push({name,args});return {data:{verified:true,count:1,bytes:1}}}};
 const sandbox={Request,Response,TextEncoder,Uint8Array,Blob,crypto,atob,AbortSignal,fetch:async url=>Response.json(url.includes('/auth/')?{id:manager}:{workspace_id:workspace,user_id:manager,role:'general_manager'}),createClient:()=>admin,Deno:{env:{get:name=>name==='AQARI_RESTORE_RUN_ID'?run:'synthetic-test-context'},serve:fn=>{handler=fn}}};
 vm.runInNewContext(stripTypeScriptTypes(receiver.replace(/^import .*;$/gm,'')),sandbox);
 const payload=bytes=>({runId,action:'object',bucket:'aqari-documents',name:workspace+'/fixture.pdf',bytes:bytes.length,base64:Buffer.from(bytes).toString('base64'),sha256:Buffer.from(crypto.createHash?crypto.createHash('sha256').update(bytes).digest():[]).toString('hex')});
 return {objects,uploads,records,async call(bytes,patch={}){const b=payload(bytes);b.sha256=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');return handler(new Request('https://synthetic.test',{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({...b,...patch})}))}};
}
test('candidate receiver requires configured run and rejects another run before writes',async()=>{
 for(const [configured,patch,status] of [['',{},503],[runId,{runId:'44444444-4444-4444-8444-444444444444'},409]]){const f=receiverFixture(configured);assert.equal((await f.call(new Uint8Array([1]),patch)).status,status);assert.equal(f.uploads.length,0)}
});
test('candidate receiver retries identical immutable bytes without overwriting',async()=>{
 const f=receiverFixture();for(let i=0;i<2;i++)assert.equal((await f.call(new Uint8Array([1]))).status,200);assert.equal(f.objects.size,1);assert.equal(f.records.length,2);assert.ok(f.uploads.every(x=>x.options.upsert===false));
});
test('candidate receiver rejects conflicting retry and preserves the first bytes',async()=>{
 const f=receiverFixture();assert.equal((await f.call(new Uint8Array([1]))).status,200);const res=await f.call(new Uint8Array([2]));assert.equal(res.status,409);assert.equal((await res.json()).error,'READBACK_HASH_MISMATCH');assert.equal([...f.objects.values()][0][0],1);assert.equal(f.records.length,1);
});
