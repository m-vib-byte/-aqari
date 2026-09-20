import test from 'node:test';
import assert from 'node:assert/strict';
import {contractAdministration,mountSignatureReview,mountContractChangeRequest} from '../src/v267/components/contract-administration.js';
class El{
 constructor(tag){this.tag=tag;this.children=[];this.value='';this.checked=false;this.textContent='';}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
}
const all=e=>[e,...e.children.flatMap(all)];
function fixture(role='general_manager'){
 globalThis.document={createElement:tag=>new El(tag)};
 const calls=[],state={status:'unverified'},requests=[];
 const d={body:new El('div'),status:new El('p'),run:fn=>fn(),session:{bound:{workspace:'w',user:'u',role},check(){},request:async r=>r,client:{rpc:async(name,args)=>{
  calls.push(args);assert.equal(name,'aqari_contract_administration');let result;
  if(args.p_action==='signature_status')result={...state};
  if(args.p_action==='review_signatures'){Object.assign(state,args.p_data,{status:args.p_data.required_signers.every(s=>args.p_data.signed_by.includes(s))?'complete':'missing_signature'});result={...state};}
  if(args.p_action==='request_change'){result={...args.p_data,status:'pending'};requests.push(result);}
  if(args.p_action==='requests')result=requests;
  return {workspace_id:'w',user_id:'u',result};
 }}}};return {d,calls,state};
}
test('cross-workspace response is rejected before rendering',async()=>{
 const {d}=fixture();d.session.client.rpc=async()=>({workspace_id:'other',user_id:'u',result:[]});
 await assert.rejects(contractAdministration(d,'archives'),/تعذر تأكيد/);
});
test('signature review never treats an uploaded file or unchecked party as signed',async()=>{
 const {d,calls}=fixture();await mountSignatureReview(d,d.body,'doc');
 assert.equal(calls.length,1);const controls=all(d.body).filter(x=>x.tag==='input');assert.equal(controls.length,2);assert.ok(controls.every(x=>!x.checked));
 controls[0].checked=true;await all(d.body).find(x=>x.tag==='form').onsubmit({preventDefault(){}});
 assert.deepEqual(calls.find(x=>x.p_action==='review_signatures').p_data.signed_by,['tenant']);
 assert.ok(all(d.body).some(x=>x.textContent.includes('ناقص توقيع')));
 controls[1].checked=true;controls[1].onchange();await all(d.body).find(x=>x.tag==='form').onsubmit({preventDefault(){}});
 assert.ok(all(d.body).some(x=>x.textContent.includes('مكتمل التواقيع')));
});
test('staff receives signature status without signature review controls',async()=>{
 const {d}=fixture('staff');await mountSignatureReview(d,d.body,'doc');assert.equal(all(d.body).filter(x=>x.tag==='form').length,0);
});
test('staff change request records a pending request and verifies readback without rewriting contract',async()=>{
 const {d,calls}=fixture('staff');mountContractChangeRequest(d,d.body,'contract');all(d.body).find(x=>x.tag==='textarea').value='تصحيح بيانات وفق المستند';
 await all(d.body).find(x=>x.tag==='form').onsubmit({preventDefault(){}});
 assert.deepEqual(calls.map(x=>x.p_action),['request_change','requests']);assert.equal(calls[0].p_data.contract_ref,'contract');assert.match(d.status.textContent,/لم يتغير العقد/);
});
