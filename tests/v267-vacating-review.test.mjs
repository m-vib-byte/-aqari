import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewValues,reviewSummary,reviewHTML,createReviewWriter} from '../src/v267/domain/vacating-review.js';
const input={vacate_date:'2026-08-31',reason:'Inspection reference 123',keys_returned:false,inspection_complete:false,utilities_verified:false,rent_due:'',utilities_due:'0',damage_due:'1.001',other_due:null};
const context={lease_id:'lease',revision:0,evidence_token:'a'.repeat(32)},scope={workspace:'workspace',user:'manager'};
function row(d){return {id:d.id,workspace_id:scope.workspace,actor_id:scope.user,lease_id:d.lease_id,revision:d.revision+1,request_data:{...d}};}
test('unreviewed amounts stay unknown and do not produce a zero balance',()=>{
 const v=reviewValues(input);assert.equal(v.rent_due,null);assert.equal(v.utilities_due,'0.000');assert.equal(v.other_due,null);assert.equal(v.damage_due,'1.001');
 assert.deepEqual(reviewSummary(v,'10'),{complete:false,missing:['rent_due','other_due'],net:null});
 assert.equal(reviewSummary({...v,rent_due:'9',other_due:'0'},'10').net,'0.001');
 assert.equal(reviewSummary({...v,rent_due:'0',other_due:'0'},'10').net,'-8.999');
});
test('amount, date and checklist validation reject invalid values without rounding',()=>{
 for(const amount of ['-1','1.0001','1e3','abc'])assert.throws(()=>reviewValues({...input,rent_due:amount}));
 for(const date of ['2026-02-30','2026-13-01',''])assert.throws(()=>reviewValues({...input,vacate_date:date}));
 assert.throws(()=>reviewValues({...input,keys_returned:'false'}));assert.throws(()=>reviewValues({...input,reason:' '}));
 assert.equal(reviewValues({...input,rent_due:'١٠٫٠٠١'}).rent_due,'10.001');
});
test('a successful save with lost response is confirmed through the same operation ID',async()=>{
 let saved,calls=0;const writer=createReviewWriter({scope,uuid:()=> 'request',rpc:async(a,d)=>{if(a==='save'){calls++;saved=row(d);throw Error('reply lost');}return {review:saved};}});
 const result=await writer.save(input,context);assert.equal(result.id,'request');assert.equal(calls,1);assert.equal(writer.pending,null);
});
test('uncertain save freezes data and retry never creates a replacement request',async()=>{
 let saved,offline=true;const ids=[];const writer=createReviewWriter({scope,uuid:()=> 'fixed-request',rpc:async(a,d)=>{if(offline)throw Error('offline');if(a==='save'){ids.push(d.id);saved=row(d);}return {review:saved??null};}});
 await assert.rejects(writer.save(input,context));assert.equal(writer.pending.id,'fixed-request');
 await assert.rejects(writer.save({...input,damage_due:'99'},context));
 offline=false;assert.equal((await writer.retry()).id,'fixed-request');assert.deepEqual(ids,['fixed-request']);assert.equal(saved.request_data.damage_due,'1.001');
});
test('confirmed rejection permits correction only after an authoritative missing result',async()=>{
 const failure=Object.assign(Error('VACATING_EVIDENCE_CHANGED'),{code:'22023'});
 const writer=createReviewWriter({scope,rpc:async(a)=>{if(a==='save')throw failure;return {review:null};}});
 await assert.rejects(writer.save(input,context),/VACATING_EVIDENCE_CHANGED/);assert.equal(writer.pending,null);
});
test('forged or mismatched readback cannot confirm a draft',async()=>{
 for(const patch of [{actor_id:'another'},{workspace_id:'another'},{lease_id:'another'},{revision:9},{request_data:{}}]){
  let saved;const writer=createReviewWriter({scope,rpc:async(a,d)=>{if(a==='save')saved={...row(d),...patch};return {review:saved};}});
  await assert.rejects(writer.save(input,context),/لا تطابق/);assert.ok(writer.pending);
 }
});
test('server denial propagates for dialog disposal without rereading private records',async()=>{
 let reads=0;const writer=createReviewWriter({scope,rpc:async(a)=>{if(a==='get')reads++;throw Object.assign(Error('ACCESS_DENIED'),{code:'42501'});}});
 await assert.rejects(writer.save(input,context),/ACCESS_DENIED/);assert.equal(reads,0);writer.dispose();assert.equal(writer.pending,null);
});
test('printed review is visibly a draft and escapes source values without issuing a clearance',()=>{
 const r={...row({id:'request',...context,...reviewValues(input)}),actor_name:'<script>bad()</script>',evidence:{lease:{id:'lease',balance:'10.001',contract_no:'C1',tenant_name:'<img src=x onerror=bad()>',property_name:'A',unit_no:'101'}}};
 const html=reviewHTML(r);assert.match(html,/ليست براءة ذمة/);assert.match(html,/لم يُراجع/);assert.match(html,/غير محسوب/);assert.match(html,/Content-Security-Policy/);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));
 assert.throws(()=>reviewHTML({...r,lease_id:'another'}));
});
