import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateUrls} from '../src/v267/components/private-urls.js';
import {readProtectedPDF} from '../src/v267/api/protected-pdf.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const cleanups=new Set();let closed=false;
 const d={session:{bound:{user:'a'},check(){if(closed)throw Error('closed');}},onDispose(fn){if(closed)fn();else cleanups.add(fn);return ()=>cleanups.delete(fn);},get closed(){return closed;}};
 return {d,close(){closed=true;for(const fn of cleanups)fn();cleanups.clear();}};
}
const auth=()=>Promise.resolve({user:{id:'a'},access_token:'synthetic-only'});
const pdf=()=>Promise.resolve({ok:true,blob:async()=>new Blob(['synthetic PDF'],{type:'application/pdf'})});
test('private URLs revoke on record change and synchronous dialog disposal, exactly once',()=>{
 const f=fixture(),revoked=[];let count=0;const urls=createPrivateUrls(f.d,{createObjectURL:()=>`blob:fixture-${++count}`,revokeObjectURL:url=>revoked.push(url)});
 const first=urls.create(new Blob());urls.clear();assert.deepEqual(revoked,[first]);const second=urls.create(new Blob());f.close();assert.deepEqual(revoked,[first,second]);urls.clear();assert.equal(revoked.length,2);assert.throws(()=>urls.create(new Blob()));assert.equal(count,2);
});
test('replacing a preview releases only its previous URL',()=>{
 const f=fixture(),revoked=[];let n=0;const urls=createPrivateUrls(f.d,{createObjectURL:()=>String(++n),revokeObjectURL:u=>revoked.push(u)});
 const a=urls.create(new Blob()),b=urls.create(new Blob());urls.release(a);urls.release(a);assert.deepEqual(revoked,[a]);f.close();assert.deepEqual(revoked,[a,b]);
});
test('PDF validates both session reads and preserves the requested property and period',async()=>{
 const f=fixture();let reads=0;
 const blob=await readProtectedPDF(f.d,{body:{workspaceId:'w',propertyId:'p',period:'2026-08'},getSession:()=>{reads++;return auth();},fetcher:async(url,options)=>{assert.equal(url,'/api/property-statement');assert.deepEqual(JSON.parse(options.body),{workspaceId:'w',propertyId:'p',period:'2026-08'});assert.equal(options.redirect,'error');return pdf();}});
 assert.equal(blob.type,'application/pdf');assert.equal(reads,2);
});
test('closing during delayed session lookup ends the operation and prevents a late fetch',async()=>{
 const f=fixture();let resolve,calls=0;const request=readProtectedPDF(f.d,{getSession:()=>new Promise(r=>{resolve=r;}),fetcher:()=>{calls++;return pdf();}});const rejected=assert.rejects(request);f.close();await rejected;resolve(await auth());await tick();assert.equal(calls,0);
});
test('closing aborts an in-flight PDF request before a queued DOM close event',async()=>{
 const f=fixture();let signal;const request=readProtectedPDF(f.d,{getSession:auth,fetcher:(_url,options)=>{signal=options.signal;return new Promise(()=>{});}});const rejected=assert.rejects(request);await tick();f.close();assert.equal(signal.aborted,true);await rejected;
});
test('deadline covers hanging SDK and response body even if they ignore abort',async()=>{
 for(const hang of ['session','body']){
  const f=fixture();await assert.rejects(readProtectedPDF(f.d,{getSession:hang==='session'?()=>new Promise(()=>{}):auth,fetcher:()=>Promise.resolve({ok:true,blob:()=>new Promise(()=>{})})},10));
 }
});
test('silent account change after PDF retrieval discards the file',async()=>{
 const f=fixture();let count=0;await assert.rejects(readProtectedPDF(f.d,{getSession:()=>Promise.resolve({user:{id:++count===1?'a':'b'},access_token:'synthetic'}),fetcher:pdf}));
});
test('HTML response and denied response never become a downloadable PDF',async()=>{
 for(const response of [{ok:false},{ok:true,blob:async()=>new Blob(['html'],{type:'text/html'})}]){const f=fixture();await assert.rejects(readProtectedPDF(f.d,{getSession:auth,fetcher:async()=>response}));}
});
