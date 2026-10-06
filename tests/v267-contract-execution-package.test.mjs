import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {prepareContractExecutionPackage} from '../src/v267/components/contract-execution-package.js';
const body={workspaceId:'workspace',contractRef:'contract',settlementId:'settlement',packageId:'package'};
function fixture(overrides={}){
 const calls=[];const result={...body,expiresAt:new Date(Date.now()+600000).toISOString(),...overrides};
 const session={bound:{workspace:'workspace',user:'user'},check(){},operation:fn=>fn(new AbortController().signal)};
 globalThis.window={AQARI_SUPABASE:{getSession:async()=>({access_token:'token',user:{id:'user'}})}};
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,headers:new Headers({'Content-Type':'application/json'}),text:async()=>JSON.stringify(result)};};
 return {session,calls};
}
test('prepares through scoped authenticated endpoint and confirms exact package',async()=>{
 const f=fixture();assert.equal(await prepareContractExecutionPackage(f.session,body),'package');
 assert.equal(f.calls[0].url,'/api/contract-execution-package');
 assert.equal(f.calls[0].options.headers.Authorization,'Bearer token');
 assert.equal(f.calls[0].options.redirect,'error');
 assert.deepEqual(JSON.parse(f.calls[0].options.body),body);
});
test('workspace and identity changes prevent the request',async()=>{
 const f=fixture();await assert.rejects(prepareContractExecutionPackage(f.session,{...body,workspaceId:'other'}));
 window.AQARI_SUPABASE.getSession=async()=>({access_token:'token',user:{id:'other'}});
 await assert.rejects(prepareContractExecutionPackage(f.session,body));assert.equal(f.calls.length,0);
});
test('mismatched package, scope or settlement and expired responses never authorize finalization',async()=>{
 for(const overrides of [{packageId:'other'},{workspaceId:'other'},{contractRef:'other'},{settlementId:'other'},
 {expiresAt:new Date(Date.now()-1000).toISOString()},{expiresAt:new Date(Date.now()+3600000).toISOString()},{expiresAt:'invalid'}]){
  const f=fixture(overrides);await assert.rejects(prepareContractExecutionPackage(f.session,body));
 }
});
test('HTTP failure, malformed or oversized response remain blocking',async()=>{
 for(const response of [{ok:false},{ok:true,headers:new Headers({'Content-Type':'text/html'})},
 {ok:true,headers:new Headers({'Content-Type':'application/json'}),text:async()=>'{broken'},
 {ok:true,headers:new Headers({'Content-Type':'application/json'}),text:async()=>' '.repeat(16385)}]){
  const f=fixture();globalThis.fetch=async()=>response;await assert.rejects(prepareContractExecutionPackage(f.session,body));
 }
});
test('revoked session after preparation never returns an accepted package',async()=>{
 const f=fixture();let checks=0;f.session.check=()=>{if(++checks===3)throw Error('session revoked');};
 await assert.rejects(prepareContractExecutionPackage(f.session,body),/session revoked/);
});
test('network failure propagates without an automatic duplicate request',async()=>{
 const f=fixture();let requests=0;globalThis.fetch=async()=>{requests++;throw Error('connection lost');};
 await assert.rejects(prepareContractExecutionPackage(f.session,body),/connection lost/);assert.equal(requests,1);
});
function finalization(prepare){
 const source=readFileSync(new URL('../src/v267/pages/contract-execution.js',import.meta.url),'utf8');
 const start=source.indexOf('async function finalize('),end=source.indexOf('async function start(',start);
 let saved=null,n=0;const initial={contractsV202:[{id:'contract',status:'signing',tenantId:'tenant',contract_no:'CT-1'}],tenantProfilesV267:[{id:'tenant'}]};
 const session={bound:{workspace:'workspace',user:'user'},check(){},request:async x=>x,
 client:{from:()=>({select(){return this;},eq(){return this;},single:async()=>({id:'lease',contract_no:'CT-1',status:'signed'})})}};
 const context={scope:()=>({}),d:{session},contractId:'contract',copy:structuredClone,crypto:{randomUUID:()=>String(++n)},
 api:{primary:x=>x,directoryFields:()=>({})},assertContractExecutionService:async()=>{},executionDue:()=>({rent:0}),
 executionManifest:({ids})=>({id:ids.settlement}),prepareContractExecutionPackage:prepare,same:(a,b)=>JSON.stringify(a)===JSON.stringify(b),
 window:{AQARI_SUPABASE:{loadAppState:async()=>({payload:saved||initial,revision:1}),saveAppState:async x=>{saved=x;}}},
 rpc:async name=>name==='aqari_contract_execution_artifacts'?{settlement_id:saved.contractExecutionSettlementsV267[0].id,contract_no:'CT-1',tenant_document_id:'tenant-doc',owner_document_id:'owner-doc'}:{periods:[]}};
 vm.createContext(context);vm.runInContext(source.slice(start,end)+'\nthis.finalize=finalize;',context);
 return {run:()=>context.finalize({}),saved:()=>saved,initial};
}
test('actual finalization performs no business write when package preparation fails',async()=>{
 const f=finalization(async()=>{throw Error('PDF unavailable');});
 await assert.rejects(f.run(),/PDF unavailable/);assert.equal(f.saved(),null);assert.equal(f.initial.contractsV202[0].status,'signing');
});
test('actual finalization persists confirmed package with settlement and verifies readback',async()=>{
 let request;const f=finalization(async(session,body)=>{assert.equal(f.saved(),null);request=body;return body.packageId;});
 const result=await f.run();assert.equal(result.manifest.executionPackageId,request.packageId);
 assert.equal(f.saved().contractsV202[0].status,'signed');assert.equal(request.receiptArtifacts,null);
 assert.equal(f.saved().contractExecutionSettlementsV267.length,1);
});
