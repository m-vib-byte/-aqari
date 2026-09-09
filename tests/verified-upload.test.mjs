import test from 'node:test';
import assert from 'node:assert/strict';
import {createVerifiedUpload} from '../src/v267/components/verified-upload.js';
import {checksum} from '../src/v267/components/scan-image.js';

const failure=status=>Object.assign(Error('storage fixture failure'),{status});
const original=new Blob(['original'],{type:'application/pdf'});
function fixture(){
 const calls=[],state={stored:null,closed:false,postError:null,readError:null,loseReply:false,corrupt:false};
 const session={check(){if(state.closed)throw Error('session closed');},async storage(method,path,blob,bucket){
  calls.push({method,path,bucket});
  if(method==='POST'){
   if(state.postError)throw state.postError;
   if(state.stored)throw failure(400);
   state.stored=state.corrupt?new Blob(['tampered']):blob;
   if(state.loseReply)throw Error('lost response');
   return {};
  }
  if(state.readError)throw state.readError;
  if(!state.stored)throw failure(404);
  return state.stored;
 }};
 const upload=options=>createVerifiedUpload(session,{path:'workspace/document',blob:original,...options});
 return {session,calls,state,upload};
}
test('verified upload reads the original bytes and returns their SHA-256',async()=>{
 const f=fixture(),save=f.upload({bucket:'aqari-hr-private'});
 assert.equal(await save(),await checksum(original));await save();
 assert.deepEqual(f.calls.map(c=>c.method),['POST','GET','GET']);
 assert.ok(f.calls.every(c=>c.path==='workspace/document'&&c.bucket==='aqari-hr-private'));
});
test('an upload that never reached storage resumes only on the next explicit attempt',async()=>{
 const f=fixture(),save=f.upload();f.state.postError=Error('offline');
 await assert.rejects(save(),/offline/);assert.deepEqual(f.calls.map(c=>c.method),['POST','GET']);
 f.state.postError=null;await save();
 assert.deepEqual(f.calls.map(c=>c.method),['POST','GET','GET','POST','GET']);
});
test('a lost successful upload reply is recovered without another POST',async()=>{
 const f=fixture();f.state.loseReply=true;const save=f.upload();await save();await save();
 assert.deepEqual(f.calls.map(c=>c.method),['POST','GET','GET']);
});
test('legacy 400 and current 409 conflicts require matching stored bytes',async()=>{
 for(const status of [400,409]){
  const f=fixture();f.state.stored=original;f.state.postError=failure(status);await f.upload()();
  assert.deepEqual(f.calls.map(c=>c.method),['POST','GET']);
  f.state.stored=new Blob(['tampered']);await assert.rejects(f.upload()(),/لم تتطابق/);
 }
});
test('same-size corruption and different-size data cannot be confirmed or overwritten',async()=>{
 for(const bytes of ['tampered','short']){
  const f=fixture();f.state.stored=new Blob([bytes]);const save=f.upload({readFirst:true});
  await assert.rejects(save(),/لم تتطابق/);await assert.rejects(save(),/لم تتطابق/);
  assert.deepEqual(f.calls.map(c=>c.method),['GET','GET']);assert.equal(await f.state.stored.text(),bytes);
 }
});
test('denied or unavailable rereads never trigger another upload',async()=>{
 for(const status of [401,403,503]){
  const f=fixture(),save=f.upload();await save();f.state.readError=failure(status);
  await assert.rejects(save(),e=>e.status===status);
  assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
 }
});
test('explicit upload authorization denial is not converted to success by an existing object',async()=>{
 for(const status of [401,403]){
  const f=fixture();f.state.stored=original;f.state.postError=failure(status);
  await assert.rejects(f.upload()(),e=>e.status===status);assert.deepEqual(f.calls.map(c=>c.method),['POST']);
 }
});
test('a finalized reservation can verify the file using reads only',async()=>{
 const f=fixture();f.state.stored=original;await f.upload({readFirst:true})();assert.deepEqual(f.calls.map(c=>c.method),['GET']);
});
test('session loss before or after retrieval prevents confirmation',async()=>{
 const f=fixture();f.state.closed=true;await assert.rejects(f.upload()(),/session closed/);assert.equal(f.calls.length,0);
 f.state.closed=false;const storage=f.session.storage.bind(f.session);f.session.storage=async(...args)=>{const result=await storage(...args);if(args[0]==='GET')f.state.closed=true;return result;};
 await assert.rejects(f.upload()(),/session closed/);
});
