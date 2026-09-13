import test from 'node:test';
import assert from 'node:assert/strict';
import {loadLeaseRenewal,renewalSummary,validRenewalSource} from '../src/v267/components/lease-renewal.js';
const source={lease_id:'76840000-0000-4000-8000-000000000010',contract_ref:'original',contract_no:'ORIGINAL <unsafe>',tenant_ref:'tenant',property:'عقار',unit:'1',start_date:'2026-01-01',end_date:'2026-12-31',snapshot_sha256:'a'.repeat(64)};
function setup(overrides={}){const calls=[];const response={workspace_id:'workspace',user_id:'user',can_prepare:true,source:structuredClone(source),suggestedStart:'2027-01-01',...overrides};const session={bound:{workspace:'workspace',user:'user'},check(){},request:async p=>p,client:{rpc:async(name,args)=>{calls.push({name,args});return response;}}};return {d:{session},response,calls};}
test('renewal context is read from scoped RPC and retains the exact immutable source fingerprint',async()=>{
 const f=setup();const result=await loadLeaseRenewal(f.d,'original');assert.deepEqual(f.calls,[{name:'aqari_lease_renewal_context',args:{p_workspace_id:'workspace',p_contract_ref:'original'}}]);assert.deepEqual(result,{source,suggestedStart:'2027-01-01'});
 result.source.contract_no='local change';assert.equal(f.response.source.contract_no,source.contract_no);
});
test('freeze, scope changes, stale session and invalid source cannot open a renewal form',async()=>{
 for(const overrides of [{workspace_id:'other'},{user_id:'other'},{can_prepare:false,reason:'تجميد التجديد قائم'},{source:{...source,contract_ref:'other'}},{source:{...source,snapshot_sha256:'bad'}},{suggestedStart:'2026-12-31'}]){const f=setup(overrides);await assert.rejects(loadLeaseRenewal(f.d,'original'));}
 const f=setup();f.d.session.check=()=>{throw Error('session ended');};await assert.rejects(loadLeaseRenewal(f.d,'original'),/session ended/);
 assert.equal(validRenewalSource({...source,end_date:''}),false);assert.equal(validRenewalSource({...source,start_date:'2027-01-01'}),false);
});
test('renewal summary renders source text safely and explicitly retains balances on original',()=>{
 globalThis.document={createElement(tag){return {tag,children:[],textContent:'',append(...children){this.children.push(...children);}};}};
 const summary=renewalSummary({source});const text=summary.children.map(c=>c.textContent).join(' ');assert.match(text,/ORIGINAL <unsafe>/);assert.match(text,/لا تنقل هذه العملية أي رصيد أو دفعة أو تأمين/);assert.equal(summary.children.some(c=>Object.hasOwn(c,'innerHTML')),false);
});
