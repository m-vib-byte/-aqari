import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {assertContractExecutionService} from '../src/v267/components/contract-execution-readiness.js';
const absent={code:'P0002',message:'CONTRACT_EXECUTION_ARTIFACTS_NOT_FOUND'};
function fixture(error,result=null){
 const calls=[];
 const session={bound:{workspace:'workspace'},check(){},request:async x=>x,client:{rpc(name,args){calls.push({name,args});return error?Promise.reject(error):Promise.resolve(result);}}};
 return {session,calls};
}
test('authorized explicit not-yet-issued response permits signing',async()=>{
 const f=fixture(absent);await assertContractExecutionService(f.session,'contract');
 assert.deepEqual(f.calls,[{name:'aqari_contract_execution_artifacts',args:{p_workspace_id:'workspace',p_contract_ref:'contract'}}]);
});
test('missing service, access denial, network and unrelated not-found remain blocking',async()=>{
 for(const error of [
 {code:'PGRST202',message:'Could not find the function public.aqari_contract_execution_artifacts'},
 {code:'42501',message:'ACCESS_DENIED'}, {status:503,message:'unavailable'},
 {code:'P0002',message:'PROPERTY_NOT_FOUND'}, {code:'42P01',message:'missing artifact table'}
 ])await assert.rejects(assertContractExecutionService(fixture(error).session,'contract'),e=>e===error);
});
test('existing or malformed successful artifact response cannot start another settlement',async()=>{
 for(const result of [null,{}, {settlement_id:'settled'}])
  await assert.rejects(assertContractExecutionService(fixture(null,result).session,'contract'),/سبق إنشاء/);
});
test('changed session overrides an otherwise permissible not-found response',async()=>{
 const f=fixture(absent),boundary=Error('changed session');let checks=0;
 f.session.check=()=>{if(++checks>1)throw boundary;};
 await assert.rejects(assertContractExecutionService(f.session,'contract'),e=>e===boundary);
});
test('the actual finalization path blocks before reservation or business writes',async()=>{
 const source=readFileSync(new URL('../src/v267/pages/contract-execution.js',import.meta.url),'utf8');
 const start=source.indexOf('async function finalize('),end=source.indexOf('async function start(',start);
 for(const error of [{code:'PGRST202',message:'missing execution service'},{code:'42501',message:'ACCESS_DENIED'}]){
 const f=fixture(error),writes=[],reads=[],payload={contractsV202:[{id:'contract',status:'signing',tenantId:'tenant'}],tenantProfilesV267:[{id:'tenant'}]};
 const context={scope:()=>({}),d:{session:f.session},contractId:'contract',copy:x=>structuredClone(x),api:{primary:x=>x},assertContractExecutionService,
 window:{AQARI_SUPABASE:{loadAppState:async()=>{reads.push('read');return {payload,revision:1};},saveAppState:async()=>writes.push('save')}},
 rpc:async()=>writes.push('reserve'),executionDue:()=>{throw Error('must not calculate settlement before readiness');}};
 vm.createContext(context);vm.runInContext(source.slice(start,end)+'\nthis.finalize=finalize;',context);
 await assert.rejects(context.finalize({}),e=>e===error);
 assert.deepEqual(writes,[]);assert.equal(reads.length,1);assert.equal(payload.contractsV202[0].status,'signing');
 }
});
