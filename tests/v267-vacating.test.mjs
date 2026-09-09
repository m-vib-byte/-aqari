import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {vacatingValues,createVacatingWriter,clearanceHTML,stableJSON} from '../src/v267/domain/vacating.js';
import {VACATING_MESSAGES} from '../src/v267/components/vacating-translations.js';
const lease='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
const draft=()=>({lease_id:lease,revision:0,vacated_on:'2026-01-31',keys_received:true,inspection:'فحص <literal> {amount}',obligations:[{description:'أضرار اختبار',amount:'١٢٫٣٤٥'}],document_ids:[id],reason:'إنشاء اختبار'});
function fixture(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),data};}
const digest=async x=>createHash('sha256').update(x).digest('hex');
test('vacating values keep exact fils and literal inspection, reject invalid dates and documents',()=>{
 const v=vacatingValues(draft());assert.equal(v.obligations[0].amount,'12.345');assert.equal(v.inspection,draft().inspection);
 for(const patch of [{vacated_on:'2026-02-30'},{revision:-1},{keys_received:'true'},{document_ids:['other']},{reason:''},{obligations:[{description:'damage',amount:'1.0001'}]}])assert.throws(()=>vacatingValues({...draft(),...patch}));
});
test('stable fingerprint is independent of object key ordering',()=>assert.equal(stableJSON({b:2,a:{d:4,c:3}}),stableJSON({a:{c:3,d:4},b:2})));
test('lost successful reply is read back without another write and private content is not stored',async()=>{
 const storage=fixture();let op,writes=0;const rpc=async(a,d)=>{if(a==='operation')return op??null;writes++;op={id:d.id,action:a,request:d,result:{id,workspace_id:lease,lease_id:lease,updated_by:user,state:'draft'}};throw Error('network');};
 const w=createVacatingWriter({rpc,scope:{workspace:lease,user},storage,uuid:()=>id,digest});assert.equal((await w.submit('save',vacatingValues(draft()))).state,'saved');assert.equal(writes,1);assert.equal(w.pending,null);assert.equal(storage.data.size,0);
});
test('uncertain writes survive reload with opaque marker and block new operations',async()=>{
 const storage=fixture();let op,unavailable=true,writes=0;
 const rpc=async(a,d)=>{if(a==='operation'){if(unavailable)throw Error('503');return op;}writes++;op={id:d.id,action:a,request:d,result:{id,workspace_id:lease,lease_id:lease,updated_by:user,state:'draft'}};throw Error('503');};
 const options={rpc,scope:{workspace:lease,user},storage,uuid:()=>id,digest};const w=createVacatingWriter(options);await assert.rejects(w.submit('save',vacatingValues(draft())));
 const marker=[...storage.data.values()].join('');assert.ok(!marker.includes('inspection')&&!marker.includes('12.345')&&!marker.includes('أضرار'));
 await assert.rejects(w.submit('save',vacatingValues(draft())));unavailable=false;const reopened=createVacatingWriter(options);assert.equal((await reopened.reconcile()).state,'saved');assert.equal(writes,1);
});
test('absence after a definite rejection clears retry lock; changed input cannot retry uncertainty',async()=>{
 const storage=fixture(),options={scope:{workspace:lease,user},storage,uuid:()=>id,digest};
 const w=createVacatingWriter({...options,rpc:async(a)=>{if(a==='operation')return null;throw Object.assign(Error('invalid'),{code:'22023'});}});
 await assert.rejects(w.submit('save',vacatingValues(draft())),/invalid/);assert.equal(w.pending,null);
 const uncertain=createVacatingWriter({...options,rpc:async(a)=>{if(a==='operation')return null;throw Error('timeout');}});await assert.rejects(uncertain.submit('save',vacatingValues(draft())));await assert.rejects(uncertain.retry({...vacatingValues(draft()),reason:'changed'}),/نفسها/);assert.ok(uncertain.pending);
});
test('read denial preserves original permission metadata and never confirms',async()=>{
 const error=Object.assign(Error('ACCESS_DENIED'),{status:403,code:'42501'});const w=createVacatingWriter({scope:{workspace:lease,user},storage:fixture(),uuid:()=>id,digest,rpc:async()=>{throw error;}});await assert.rejects(w.submit('save',vacatingValues(draft())),e=>e===error);assert.ok(w.pending);
});
test('mismatched saved operation is not accepted',async()=>{
 let op;const w=createVacatingWriter({scope:{workspace:lease,user},storage:fixture(),uuid:()=>id,digest,rpc:async(a,d)=>a==='operation'?op:(op={id:d.id,action:a,request:{...d,reason:'other'},result:{id,workspace_id:lease,state:'draft',lease_id:lease,updated_by:user}})});await assert.rejects(w.submit('save',vacatingValues(draft())),/مطابقة/);assert.ok(w.pending);
});
test('print requires issued server record, escapes evidence and prominently preserves exceptions',()=>{
 const record={state:'issued',certificate_no:'VC-TEST',issued_by:user,issued_name:'Manager',vacated_on:'2026-01-31',snapshot:{identity:{contract_no:'C-1',tenant_name:'<script>alert(1)</script>'},inspection:'<img src=x>',exception_reason:'open <debt>',rent_remaining:'100.000',deposit_balance:'0.000',periods:[{period:'2026-01',due:'100.000',paid:'0.000',remaining:'100.000'}],additional_obligations:[]}};
 const html=clearanceHTML(record);assert.ok(html.includes('براءة ذمة باستثناء موثق'));assert.ok(html.includes('open &lt;debt&gt;'));assert.ok(html.includes('100.000'));assert.ok(!html.includes('<script>')&&!html.includes('<img'));assert.throws(()=>clearanceHTML({...record,state:'draft'}));
});
test('every vacating translation provides all four non-Arabic interface languages',()=>{
 for(const [source,row]of Object.entries(VACATING_MESSAGES))for(const lang of ['en','hi','ur','ml'])assert.ok(row[lang]?.trim()&&row[lang]!==source,source+' '+lang);
});
