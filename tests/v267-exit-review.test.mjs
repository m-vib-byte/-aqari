import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {EXIT_CHECKS,emptyExitChecks,exitValues,createExitWriter,exitReviewHTML} from '../src/v267/domain/exit-review.js';
import {EXIT_MESSAGES} from '../src/v267/components/exit-translations.js';
const lease='f267d400-0000-4000-8000-000000000001',id='f267e500-0000-4000-8000-000000000001';
const scope={workspace:'70000000-0000-4000-8000-000000000001',user:'f267d000-0000-4000-8000-000000000001'};
const input=()=>({lease_id:lease,revision:0,vacate_on:'2026-09-30',reason:'طلب اختبار',document_id:null,checks:emptyExitChecks()});
const hash=async value=>createHash('sha256').update(value).digest('hex');
function backend(){
 const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 let entry=null,writes=0,failBefore=false,failAfter=false,denied=false;
 const rpc=async(action,data)=>{
  if(denied)throw Object.assign(Error('ACCESS_DENIED'),{code:'42501'});
  if(action==='get')return {entry};writes++;
  if(failBefore)throw Error('transport timeout');
  const v=exitValues(data);entry={id,request_id:data.request_id,workspace_id:scope.workspace,actor_id:scope.user,...v,revision:v.revision+1,document_no:'EX-00000001',actor_name:'مدير الاختبار',created_at:'2026-09-09T22:00:00Z',snapshot:{lease_id:lease,clearance_issued:false,tenant_name:'الاسم',deposit_balance:'0.000',rent_payments_total:'0.000'}};
  if(failAfter)throw Error('reply lost');return {entry};
 };
 const writer=()=>createExitWriter({rpc,scope,storage,hash,makeId:()=>id});
 return {storage,values,writer,rpc,get writes(){return writes;},get entry(){return entry;},set entry(v){entry=v;},set failBefore(v){failBefore=v;},set failAfter(v){failAfter=v;},set denied(v){denied=v;}};
}
test('all six settlement categories start pending, with independent drafts',()=>{
 const a=emptyExitChecks(),b=emptyExitChecks();assert.equal(Object.keys(a).length,6);assert.ok(Object.values(a).every(x=>x.status==='pending'));a.rent.note='private';assert.equal(b.rent.note,'');
});
test('exit form rejects impossible dates, invalid revisions and incomplete reviewed items',()=>{
 assert.throws(()=>exitValues({...input(),vacate_on:'2026-02-30'}),/DATE/);
 for(const revision of [-1,0.5,NaN,1e9])assert.throws(()=>exitValues({...input(),revision}),/DATA/);
 const v=input();v.checks.keys.status='reviewed';assert.throws(()=>exitValues(v),/CHECKS/);v.checks.keys.note='مرجع استلام';assert.equal(exitValues(v).checks.keys.status,'reviewed');
 delete v.checks.other;assert.throws(()=>exitValues(v),/CHECKS/);
});
test('client validation refuses unsupported paid or cleared states and foreign fields',()=>{
 for(const status of ['paid','cleared','waived',null]){const v=input();v.checks.rent.status=status;assert.throws(()=>exitValues(v),/CHECKS/);}
 const v=input();v.checks.rent.paid=true;assert.throws(()=>exitValues(v),/CHECKS/);
});
test('save is reread and pending storage contains no tenant or financial form fields',async()=>{
 const b=backend(),w=b.writer();b.failBefore=true;const v=input();v.reason='private reason';v.checks.rent.note='confidential debt';await assert.rejects(w.submit(v));
 const stored=[...b.values.values()].join();assert.ok(stored.includes(id));assert.ok(!stored.includes('private reason'));assert.ok(!stored.includes('confidential'));assert.ok(!stored.includes('vacate_on'));
 b.failBefore=false;assert.equal((await w.retry(v)).state,'saved');assert.equal(w.pending,null);assert.equal(b.values.size,0);
});
test('lost successful save response recovers from the immutable server version',async()=>{
 const b=backend();b.failAfter=true;const w=b.writer();const r=await w.submit(input());assert.equal(r.state,'saved');assert.equal(b.writes,1);assert.equal(w.pending,null);
});
test('reload preserves operation identity and original revision; identical input retries only',async()=>{
 const b=backend();b.failBefore=true;const v={...input(),revision:7};await assert.rejects(b.writer().submit(v));const w=b.writer();assert.equal(w.pending.revision,7);assert.equal(w.retained,null);
 await assert.rejects(w.retry({...v,reason:'different'}),/CONFLICT/);assert.equal(b.writes,1);
 b.failBefore=false;await w.retry(v);assert.equal(b.writes,2);assert.equal(b.entry.request_id,id);assert.equal(b.entry.revision,8);
});
test('an uncertain operation cannot be replaced with a second save',async()=>{
 const b=backend();b.failBefore=true;const w=b.writer();await assert.rejects(w.submit(input()));await assert.rejects(w.submit(input()),/UNCERTAIN/);assert.equal(b.writes,1);
});
test('definite stale-revision rejection plus absent readback frees the form',async()=>{
 const b=backend();const w=createExitWriter({scope,storage:b.storage,hash,makeId:()=>id,rpc:async(action)=>{if(action==='save')throw Object.assign(Error('EXIT_STALE_REVISION'),{code:'22023'});return {entry:null};}});
 await assert.rejects(w.submit(input()),/STALE_REVISION/);assert.equal(w.pending,null);
});
test('readback rejects mismatched actor, workspace and request contents',async()=>{
 for(const mutation of [{actor_id:'other'},{workspace_id:'other'},{reason:'changed'}]){
  const b=backend();b.failBefore=true;const w=b.writer();await assert.rejects(w.submit(input()));b.failBefore=false;await b.rpc('save',{request_id:id,...input()});b.entry={...b.entry,...mutation};await assert.rejects(w.reconcile(),/CONFLICT/);assert.ok(w.pending);
 }
});
test('permission loss prevents recovery and leaves only opaque pending metadata',async()=>{
 const b=backend();b.failBefore=true;const w=b.writer();await assert.rejects(w.submit(input()));b.denied=true;await assert.rejects(w.reconcile(),/ACCESS_DENIED/);assert.ok(w.pending);assert.equal(b.writes,1);
});
test('storage failure blocks writes before transmission',async()=>{
 let calls=0;const w=createExitWriter({scope,storage:{getItem:()=>null,setItem(){throw Error('full');}},hash,makeId:()=>id,rpc:async()=>{calls++;}});
 await assert.rejects(w.submit(input()),/RECOVERY_UNAVAILABLE/);assert.equal(calls,0);
});
test('print uses saved snapshot, escapes supplied text and explicitly excludes clearance',async()=>{
 const b=backend();await b.writer().submit(input());b.entry.snapshot.tenant_name='<img src=x onerror=alert(1)>';b.entry.checks.keys.note='<script>unsafe</script>';
 const html=exitReviewHTML(b.entry);assert.ok(html.includes('&lt;img'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('ولا يصدر براءة ذمة'));assert.ok(html.includes('EX-00000001'));
 assert.throws(()=>exitReviewHTML({...b.entry,snapshot:{...b.entry.snapshot,clearance_issued:true}}),/UNSAVED_PRINT/);
});
test('review UI and printable labels have all four requested additional languages',()=>{
 for(const [source,entry]of Object.entries(EXIT_MESSAGES))for(const code of ['en','hi','ur','ml'])assert.ok(entry[code]?.length>0,source+' '+code);
 for(const label of Object.values(EXIT_CHECKS))assert.ok(EXIT_MESSAGES[label]);
});
test('server access denial reaches the shared dialog disposal boundary',()=>{
 const source=readFileSync('src/v267/pages/exit-review.js','utf8');assert.match(source,/if\(isDepositDenied\(e\)\)\{forget\(\);throw e;\}/);assert.match(source,/d\.onDispose/);
});
