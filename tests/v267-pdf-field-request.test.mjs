import test from 'node:test';
import assert from 'node:assert/strict';
import {requestPdfField} from '../src/v267/api/pdf-field-request.js';
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){
 const cleanups=new Set();let closed=false,user='manager';
 const dialog={session:{bound:{user},check(){if(closed)throw Error('closed');},client:{auth:{getSession:async()=>({data:{session:{access_token:'synthetic-only',user:{id:user}}}})}}},onDispose(fn){cleanups.add(fn);if(closed)fn();return()=>cleanups.delete(fn);},get closed(){return closed;}};
 return {dialog,cleanups,close(){closed=true;for(const fn of cleanups)fn();},setUser(value){user=value;}};
}
const body={workspaceId:'workspace',propertyId:'property',documentId:'document',action:'fill',values:{name:'test'}};
const response=(action='fill')=>new Response(['inspect','text','publish'].includes(action)?'{}':'synthetic',{headers:{'Content-Type':['inspect','text','publish'].includes(action)?'application/json':['page','filled_page'].includes(action)?'image/png':'application/pdf'}});
for(const action of ['inspect','text','publish','page','filled_page','save','fill'])test(`${action} preserves scope, expected content type and complete read`,async()=>{
 const f=fixture();let calls=0;const result=await requestPdfField(f.dialog,{body:{...body,action},fetcher:async(url,options)=>{calls++;assert.equal(url,'/api/pdf-field-template');assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');assert.deepEqual(JSON.parse(options.body),{...body,action});return response(action);}});
 assert.equal(calls,1);assert.equal(f.cleanups.size,0);assert.ok(result);
});
for(const phase of ['auth','fetch','body','final-auth'])test(`deadline releases a stalled ${phase}, including providers ignoring abort`,async()=>{
 const f=fixture();let calls=0,reads=0,signal;
 const get=f.dialog.session.client.auth.getSession;
 f.dialog.session.client.auth.getSession=()=>{reads++;return phase==='auth'||phase==='final-auth'&&reads===2?new Promise(()=>{}):get();};
 await assert.rejects(requestPdfField(f.dialog,{body,fetcher:async(_url,opts)=>{calls++;signal=opts.signal;if(phase==='fetch')return new Promise(()=>{});if(phase==='body')return {ok:true,headers:new Headers({'Content-Type':'application/pdf'}),blob:()=>new Promise(()=>{})};return response();}},10),e=>e.name==='TimeoutError');
 assert.equal(calls,phase==='auth'?0:1);if(signal)assert.equal(signal.aborted,true);assert.equal(f.cleanups.size,0);
});
test('close during authentication rejects immediately and prevents a late fetch',async()=>{
 const f=fixture();let resolve,calls=0;f.dialog.session.client.auth.getSession=()=>new Promise(r=>resolve=r);
 const p=requestPdfField(f.dialog,{body,fetcher:()=>{calls++;return response();}});const rejected=assert.rejects(p);f.close();await rejected;resolve({data:{session:{access_token:'synthetic',user:{id:'manager'}}}});await tick();assert.equal(calls,0);
});
test('external cancellation aborts the fetch and discards a late body',async()=>{
 const f=fixture(),controller=new AbortController();let resolve,signal;
 const p=requestPdfField(f.dialog,{body,signal:controller.signal,fetcher:async(_url,opts)=>{signal=opts.signal;return {ok:true,headers:new Headers({'Content-Type':'application/pdf'}),blob:()=>new Promise(r=>resolve=r)};}});const rejected=assert.rejects(p,e=>e.name==='AbortError');await tick();controller.abort();await rejected;assert.equal(signal.aborted,true);resolve(new Blob());await tick();assert.equal(f.cleanups.size,0);
});
test('authentication is checked after the complete response body',async()=>{
 const f=fixture();await assert.rejects(requestPdfField(f.dialog,{body,fetcher:async()=>({ok:true,headers:new Headers({'Content-Type':'application/pdf'}),blob:async()=>{f.setUser('other-user');return new Blob();}})}),/جلسة/);
});
for(const status of [401,403,503])test(`HTTP ${status} remains available to the dialog boundary`,async()=>{
 const f=fixture();await assert.rejects(requestPdfField(f.dialog,{body,fetcher:async()=>new Response('{}',{status})}),e=>e.status===status);
});
test('HTML is rejected and an explicit retry after timeout performs one new request',async()=>{
 const f=fixture();await assert.rejects(requestPdfField(f.dialog,{body,fetcher:async()=>new Response('login',{headers:{'Content-Type':'text/html'}})}));
 await assert.rejects(requestPdfField(f.dialog,{body,fetcher:()=>new Promise(()=>{})},10));let calls=0;
 const result=await requestPdfField(f.dialog,{body,fetcher:async()=>{calls++;return response();}});assert.equal(calls,1);assert.equal(result.type,'application/pdf');
});
