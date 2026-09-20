const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const text=fs.readFileSync('v202-property-os.js','utf8');
const source=text.slice(text.indexOf('  let receiptDownloadJob=null;'),text.indexOf('  function topLayer()'));
const tick=()=>new Promise(r=>setTimeout(r,2));
function fixture(){
 const state={fast:false,scope:{userId:'user-a',workspaceId:'workspace-a'},auth:{user:{id:'user-a'},access_token:'synthetic'},requests:[],clicks:[],created:[],revoked:[],getSession:async()=>state.auth,fetch:async()=>({ok:true,headers:{get:()=> 'application/pdf'},blob:async()=>new Blob(['%PDF-test'])})};
 state.shares=[];state.shareError=null;state.canShare=true;
 const button={disabled:false},body={querySelector:()=>({dataset:{receiptNo:'R-101'}})};
 const context={window:{AQARI_SUPABASE:{getSession:()=>state.getSession()}},document:{getElementById:()=>body,querySelector:()=>button,createElement:()=>({click(){state.clicks.push(this.href)},remove(){}}),body:{appendChild(){}}},protectedAccessReady:()=>!!state.scope,activeAccessScope:()=>state.scope,sameAccessScope:(a,b)=>JSON.stringify(a)===JSON.stringify(b),fetch:(url,options)=>{state.requests.push(options);return state.fetch(url,options)},AbortController,Blob,File:require('node:buffer').File,navigator:{canShare:()=>state.canShare,share:async data=>{state.shares.push(data);if(state.shareError)throw state.shareError;}},URL:{createObjectURL:()=>{const url='blob:'+state.created.length;state.created.push(url);return url},revokeObjectURL:url=>state.revoked.push(url)},setTimeout:(fn,ms)=>{const timer=setTimeout(fn,state.fast&&ms===30000?20:ms);timer.unref();return timer},clearTimeout};
 vm.createContext(context);vm.runInContext(source+'\nglobalThis.api={downloadDocument,cancelReceiptDownload,shareDocument};',context);
 return {state,button,body,...context.api};
}
test('receipt download rechecks identity after body read and scopes the request',async()=>{
 const f=fixture();assert.equal(await f.downloadDocument(),true);assert.equal(f.state.clicks.length,1);assert.deepEqual(JSON.parse(f.state.requests[0].body),{workspaceId:'workspace-a',receiptNo:'R-101'});assert.equal(f.state.requests[0].redirect,'error');
 f.cancelReceiptDownload();assert.deepEqual(f.state.revoked,f.state.created);
 const second=fixture();second.state.fetch=async()=>({ok:true,headers:{get:()=> 'application/pdf'},blob:async()=>{second.state.auth={user:{id:'other'},access_token:'other'};return new Blob(['%PDF-test']);}});
 assert.equal(await second.downloadDocument(),false);assert.equal(second.state.created.length,0);
});
test('protected Preview PDF download retains same-origin protection while requiring the user JWT',async()=>{
 const f=fixture(),pdf=f.state.fetch;
 f.state.fetch=async(url,options)=>{
  assert.equal(url,'/api/rent-receipt');
  if(options.credentials!=='same-origin')throw Error('Preview protection would redirect this request');
  assert.equal(options.headers.Authorization,'Bearer synthetic');
  assert.equal(options.redirect,'error');
  return pdf();
 };
 assert.equal(await f.downloadDocument(),true);assert.equal(f.state.clicks.length,1);f.cancelReceiptDownload();
});
test('closing and reopening the same receipt discards old work and cannot unlock the new download',async()=>{
 const f=fixture();let resolveFirst,resolveSecond;
 f.state.fetch=()=>new Promise(r=>{resolveFirst=r;});const first=f.downloadDocument();await tick();f.cancelReceiptDownload();assert.equal(f.state.requests[0].signal.aborted,true);
 f.state.fetch=()=>new Promise(r=>{resolveSecond=r;});const second=f.downloadDocument();assert.equal(await first,false);assert.equal(f.button.disabled,true);await tick();
 resolveFirst({ok:true,headers:{get:()=> 'application/pdf'},blob:async()=>new Blob(['%PDF-old'])});await tick();assert.equal(f.state.clicks.length,0);assert.equal(f.button.disabled,true);
 resolveSecond({ok:true,headers:{get:()=> 'application/pdf'},blob:async()=>new Blob(['%PDF-new'])});assert.equal(await second,true);assert.equal(f.button.disabled,false);assert.equal(f.state.clicks.length,1);f.cancelReceiptDownload();
});
for(const phase of ['session','body'])test('deadline releases the download button even when '+phase+' ignores cancellation',async()=>{
 const f=fixture();let resolve;
 if(phase==='session')f.state.getSession=()=>new Promise(r=>{resolve=r});
 else f.state.fetch=async()=>({ok:true,headers:{get:()=> 'application/pdf'},blob:()=>new Promise(r=>{resolve=r})});
 f.state.fast=true;const pending=f.downloadDocument();const keepAlive=setTimeout(()=>{},100);
 await assert.rejects(pending,/PDF_TIMEOUT/);clearTimeout(keepAlive);assert.equal(f.button.disabled,false);
 if(phase==='session')resolve(f.state.auth);else resolve(new Blob(['%PDF-late']));await tick();assert.equal(f.state.clicks.length,0);
});
test('account boundary aborts pending body and prevents a late private download',async()=>{
 const f=fixture();let resolve;f.state.fetch=async()=>({ok:true,headers:{get:()=> 'application/pdf'},blob:()=>new Promise(r=>{resolve=r})});
 const pending=f.downloadDocument();await tick();f.state.scope=null;f.cancelReceiptDownload();assert.equal(await pending,false);resolve(new Blob(['%PDF-private']));await tick();assert.equal(f.state.created.length,0);assert.equal(f.button.disabled,false);
});

test('manual sharing prepares saved PDF first and shares only on next click',async()=>{
 const f=fixture();assert.equal(await f.shareDocument(),true);assert.equal(f.state.shares.length,0);assert.equal(f.state.clicks.length,0);
 assert.equal(await f.shareDocument(),true);assert.equal(f.state.shares.length,1);
 const data=f.state.shares[0];assert.deepEqual(Object.keys(data),['files']);assert.equal(data.files[0].type,'application/pdf');assert.equal(await data.files[0].text(),'%PDF-test');
 assert.match(f.button.textContent,/غير مؤكّد/);f.cancelReceiptDownload();
});
test('closing a prepared receipt clears the private share file',async()=>{
 const f=fixture();await f.shareDocument();f.cancelReceiptDownload();await f.shareDocument();assert.equal(f.state.shares.length,0);assert.equal(f.state.requests.length,2);f.cancelReceiptDownload();
});
test('account change blocks sharing a previously prepared file',async()=>{
 const f=fixture();await f.shareDocument();f.state.scope={userId:'user-b',workspaceId:'workspace-b'};assert.equal(await f.shareDocument(),false);assert.equal(f.state.shares.length,0);f.cancelReceiptDownload();
});
test('share cancellation does not claim sent or write a delivery result',async()=>{
 const f=fixture();await f.shareDocument();f.state.shareError={name:'AbortError'};assert.equal(await f.shareDocument(),false);assert.match(f.button.textContent,/دون تأكيد/);assert.equal(f.button.disabled,false);assert.equal(f.state.requests.length,1);f.cancelReceiptDownload();
});
test('unsupported file sharing explains the PDF download fallback',async()=>{
 const f=fixture();f.state.canShare=false;assert.equal(await f.shareDocument(),false);assert.equal(f.state.shares.length,0);assert.match(f.button.textContent,/حمّل وصل PDF/);f.cancelReceiptDownload();
});
test('a different receipt cannot reuse the previous receipt file',async()=>{
 const f=fixture();await f.shareDocument();f.body.querySelector=()=>({dataset:{receiptNo:'R-202'}});await f.shareDocument();assert.equal(f.state.shares.length,0);assert.equal(JSON.parse(f.state.requests[1].body).receiptNo,'R-202');f.cancelReceiptDownload();
});
