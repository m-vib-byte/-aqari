import test from 'node:test';
import assert from 'node:assert/strict';
import {readOperationalReport} from '../src/v267/api/operational-report.js';

function fixture(){
 const cleanups=new Set();let valid=true,signal;
 const auth={user:{id:'user'},access_token:'fixture-token'};
 const data={workspaceId:'workspace',propertyId:'property',month:'2026-09',report:'collection'};
 const dialog={closed:false,session:{bound:{user:'user',workspace:'workspace'},check(){if(!valid)throw Error('SESSION_CHANGED');}},onDispose(fn){cleanups.add(fn);return ()=>cleanups.delete(fn);}};
 const options={kind:'collection',format:'json',propertyId:'property',month:'2026-09',getSession:async()=>auth,fetcher:async(_url,init)=>{signal=init.signal;return {ok:true,json:async()=>data,blob:async()=>new Blob(['pdf'],{type:'application/pdf'})};}};
 return {dialog,options,data,auth,cleanups,get signal(){return signal;},revoke(){valid=false;},close(){dialog.closed=true;for(const fn of cleanups)fn();}};
}
const never=()=>new Promise(()=>{});
async function settled(task){let timer;try{return await Promise.race([task.then(()=> 'resolved',()=> 'rejected'),new Promise(resolve=>{timer=setTimeout(()=>resolve('hung'),150);})]);}finally{clearTimeout(timer);}}

test('report deadline bounds auth, fetch and JSON/PDF body even when abort is ignored',async()=>{
 for(const stage of ['auth','finalAuth','fetch','json','pdf']){
  const f=fixture();
  if(stage==='auth')f.options.getSession=never;
  else if(stage==='finalAuth'){let count=0;f.options.getSession=()=>++count===1?Promise.resolve(f.auth):never();}
  else if(stage==='fetch')f.options.fetcher=never;
  else{f.options.format=stage==='pdf'?'pdf':'json';f.options.fetcher=async()=>({ok:true,json:never,blob:never});}
  assert.equal(await settled(readOperationalReport(f.dialog,f.options,10)),'rejected',stage);
  assert.equal(f.cleanups.size,0,stage);
 }
});
test('closing the report dialog immediately ends a stalled operation',async()=>{
 const f=fixture();f.options.getSession=never;
 const task=readOperationalReport(f.dialog,f.options,1000);f.close();
 assert.equal(await settled(task),'rejected');assert.equal(f.cleanups.size,0);
});
test('session revocation during response body cannot return JSON or PDF',async()=>{
 for(const format of ['json','pdf']){
  const f=fixture();f.options.format=format;
  f.options.fetcher=async()=>({ok:true,json:async()=>{f.revoke();return f.data;},blob:async()=>{f.revoke();return new Blob(['pdf'],{type:'application/pdf'});}});
  await assert.rejects(readOperationalReport(f.dialog,f.options),/SESSION_CHANGED/);
 }
});
test('report success retains the scoped response and cleans up cancellation',async()=>{
 const f=fixture();assert.deepEqual(await readOperationalReport(f.dialog,f.options),f.data);
 assert.equal(f.signal.aborted,true);assert.equal(f.cleanups.size,0);
});
test('report authorization denial keeps its status and invalid envelopes fail closed',async()=>{
 for(const status of [401,403,409,500]){const f=fixture();f.options.fetcher=async()=>({ok:false,status});await assert.rejects(readOperationalReport(f.dialog,f.options),error=>error.status===status);}
 const f=fixture();f.data.propertyId='other';await assert.rejects(readOperationalReport(f.dialog,f.options),/لقطة التقرير/);
});

test('a timed-out session lookup cannot start a late export request',async()=>{
 const f=fixture();let release,requests=0;
 f.options.getSession=()=>new Promise(resolve=>{release=resolve;});f.options.fetcher=()=>{requests++;return never();};
 await assert.rejects(readOperationalReport(f.dialog,f.options,10));release(f.auth);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(requests,0);
});
test('identity changes after body download reject the report',async()=>{
 const f=fixture();let count=0;f.options.getSession=async()=>++count===1?f.auth:{user:{id:'other'},access_token:'other'};
 await assert.rejects(readOperationalReport(f.dialog,f.options),/جلسة الدخول/);
});
