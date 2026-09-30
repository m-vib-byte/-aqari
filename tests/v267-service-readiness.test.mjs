import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {serviceReadinessError} from '../src/v267/components/service-readiness.js';
import {safeError} from '../src/v267/api/session.js';
import {contractAdministration} from '../src/v267/components/contract-administration.js';

test('only the exact missing service or known column becomes a setup message',()=>{
 for(const [rpc,error] of [
  ['aqari_contract_administration',{code:'PGRST202',message:'Could not find the function public.aqari_contract_administration(p_action, p_data, p_workspace_id) in the schema cache'}],
  ['aqari_owner_report_targets',{code:'PGRST202',message:'Could not find the function public.aqari_owner_report_targets in the schema cache'}],
  ['aqari_property_cost_allocation',{code:'42703',message:'column m.area_sqm does not exist'}],
  ['aqari_property_controls',{code:'42703',message:'column m.type does not exist'}]
 ])assert.match(safeError(serviceReadinessError(error,rpc)),/استكمال تهيئتها/);
});
test('a changed session takes priority over a missing contract service',async()=>{
 const boundary=Error('changed session');
 const d={session:{bound:{workspace:'one'},client:{rpc:()=>Promise.reject({code:'PGRST202',message:'aqari_contract_administration'})},request:x=>x,check(){throw boundary;}}};
 await assert.rejects(contractAdministration(d,'requests'),error=>error===boundary);
});
test('permission, connectivity, unrelated schema and business failures are never masked',()=>{
 for(const error of [
  {code:'42501',message:'ACCESS_DENIED'}, {status:401,message:'expired session'},
  {code:'PGRST000',message:'connection failure'}, {code:'23514',message:'ALLOCATION_TOTAL_MISMATCH'},
  {code:'42703',message:'column other.area_sqm does not exist'},
  {code:'PGRST202',message:'Could not find the function public.aqari_property_controls_extra'},
  {code:'42703',message:'column m.area_sqm does not exist'}
 ])assert.equal(serviceReadinessError(error,'aqari_property_controls'),error);
});

for(const [page,opener,rpc,result] of [
 ['contract-change-requests','openContractChangeRequests','aqari_contract_administration',[]],
 ['property-cost-allocation','openPropertyCostAllocation','aqari_property_cost_allocation',{properties:[],sources:[],manager:true}],
 ['property-controls','openPropertyControls','aqari_property_controls',{properties:[],manager:true}]
])for(const failConnect of [false,true])test(`${page}: retry recovers ${failConnect?'connection':'read'} failure without writes`,async()=>{
 class Element{
  constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.value='';}
  append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}
 }
 const node=(tag,text)=>new Element(tag,text),all=e=>[e,...e.children.flatMap(all)];
 const reads=[];let failed=false,pending;
 const read=async()=>{reads.push(rpc);if(!failed){failed=true;throw Error('read unavailable');}return {workspace_id:'workspace',user_id:'user',...result};};
 const session={bound:{workspace:'workspace',user:'user',role:'general_manager'},check(){},request:async x=>x,client:{rpc:read,from:()=>({select(){return this;},eq:async()=>[]})}};
 const d={body:node('div'),status:node('p'),session,run(task){pending=Promise.resolve().then(async()=>{try{if(failConnect&&!failed){failed=true;throw Error('connection unavailable');}await task();}catch(e){d.status.textContent=safeError(e);}});return pending;}};
 const context={node,field:(_,control)=>control,t:x=>x,visibleText:x=>x,translateStatic:x=>x,visibleMessage:x=>x,serviceReadinessError,createDialog:()=>d,contractAdministration:async()=>{await read();return result;}};
 const source=readFileSync(new URL(`../src/v267/pages/${page}.js`,import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
 vm.runInNewContext(source,context);assert.equal(context[opener](),true);await pending;
 const retry=all(d.body).find(el=>el.tag==='button'&&el.textContent==='إعادة المحاولة');assert.ok(retry,'retry is available even if connect fails before the page task');
 await retry.onclick();assert.equal(reads.length,failConnect?1:2);
 assert.ok(all(d.body).length>1);assert.ok(!all(d.body).some(el=>el.tag==='button'&&/اعتماد الطلب|حفظ قيمة البند|اعتماد التوزيع/.test(el.textContent)),'empty recovery never invents actionable business records');
});
