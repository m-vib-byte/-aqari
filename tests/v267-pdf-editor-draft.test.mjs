import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPdfEditorDraft} from '../src/v267/domain/pdf-editor-draft.js';
const clone=value=>structuredClone(value);
const reply=data=>({...clone(data),revision:data.expected_revision+1,last_request:data.request_id});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(write,initial=null){
 let state={document_id:'original',snapshot:{mapping:{fields:[]},values:{},page:1,selected:null}};const statuses=[],calls=[];
 const saver=createPdfEditorDraft({propertyId:'property',initial,read:()=>state,write:async data=>{calls.push(clone(data));return write?write(data,calls.length):reply(data);},onStatus:(status,error)=>statuses.push([status,error?.message]),delay:60000});
 return {saver,statuses,calls,edit(value){state.snapshot.values={field:value};saver.changed();},document(id){state.document_id=id;saver.changed();}};
}
test('autosave confirms exact readback and resumes an existing revision',async()=>{
 const f=fixture(null,{id:'existing',revision:7});try{f.edit('اسم عربي');await f.saver.flush();assert.equal(f.saver.revision,8);assert.equal(f.saver.id,'existing');assert.equal(f.saver.dirty,false);assert.equal(f.calls[0].snapshot.values.field,'اسم عربي');assert.deepEqual(f.statuses.at(-1),['saved',undefined]);}finally{f.saver.dispose();}
});
test('typing during a save is serialized and receives the next revision',async()=>{
 const gate=deferred();const f=fixture(async(data,n)=>{if(n===1)await gate.promise;return reply(data);});try{
  f.edit('first');const saving=f.saver.flush();f.edit('latest');const other=f.saver.flush();assert.equal(f.calls.length,1);assert.equal(f.calls[0].snapshot.values.field,'first');gate.resolve();await Promise.all([saving,other]);assert.equal(f.calls.length,2);assert.equal(f.calls[1].expected_revision,1);assert.equal(f.calls[1].snapshot.values.field,'latest');assert.equal(f.saver.revision,2);assert.equal(f.saver.dirty,false);
 }finally{f.saver.dispose();}
});
test('lost response retries identical payload and key before saving newer edits',async()=>{
 const f=fixture((data,n)=>{if(n===1)throw Error('Network timeout');return reply(data);});try{
  f.edit('committed but reply lost');await assert.rejects(f.saver.flush());assert.equal(f.saver.dirty,true);await assert.rejects(f.saver.fork(),/FORK_UNAVAILABLE/);
  f.edit('newer typing');await f.saver.flush();assert.deepEqual(f.calls[0],f.calls[1]);assert.notEqual(f.calls[1].request_id,f.calls[2].request_id);assert.equal(f.calls[2].snapshot.values.field,'newer typing');assert.equal(f.calls[2].expected_revision,1);
 }finally{f.saver.dispose();}
});
test('bad readback never announces saved and retains the idempotent request',async()=>{
 const f=fixture((data,n)=>n===1?{...reply(data),snapshot:{}}:reply(data));try{f.edit('private');await assert.rejects(f.saver.flush(),/READBACK_FAILED/);assert.equal(f.saver.revision,0);assert.equal(f.saver.dirty,true);await f.saver.flush();assert.deepEqual(f.calls[0],f.calls[1]);assert.equal(f.saver.dirty,false);}finally{f.saver.dispose();}
});
test('JSON property order from PostgreSQL does not invalidate readback',async()=>{
 const f=fixture(data=>({...reply(data),snapshot:{selected:null,page:1,values:data.snapshot.values,mapping:data.snapshot.mapping}}));try{f.edit('valid');await f.saver.flush();assert.equal(f.saver.dirty,false);}finally{f.saver.dispose();}
});
test('confirmed stale revision blocks retries and preserves local data in an explicit fork',async()=>{
 const f=fixture((data,n)=>{if(n===1)throw Error('PDF_DRAFT_REVISION_CONFLICT');return reply(data);},{id:'original-draft',revision:1});try{
  f.edit('stale');await assert.rejects(f.saver.flush(),/REVISION_CONFLICT/);f.edit('keep my changes');await assert.rejects(f.saver.flush(),/REVISION_CONFLICT/);assert.equal(f.calls.length,1);assert.equal(f.saver.conflict,true);
  await f.saver.fork();assert.notEqual(f.saver.id,'original-draft');assert.equal(f.calls[1].expected_revision,0);assert.equal(f.calls[1].snapshot.values.field,'keep my changes');assert.equal(f.saver.conflict,false);assert.equal(f.saver.dirty,false);
 }finally{f.saver.dispose();}
});
test('confirmed input rejection permits corrected payload instead of retrying invalid data',async()=>{
 const f=fixture((data,n)=>{if(n===1)throw Error('INVALID_PDF_DRAFT');return reply(data);});try{f.edit('invalid');await assert.rejects(f.saver.flush());f.edit('corrected');await f.saver.flush();assert.notEqual(f.calls[0].request_id,f.calls[1].request_id);assert.equal(f.calls[1].snapshot.values.field,'corrected');}finally{f.saver.dispose();}
});
test('saving an immutable template version updates draft source without resetting values',async()=>{
 const f=fixture();try{f.edit('person');await f.saver.flush();f.document('new-template-version');await f.saver.flush();assert.equal(f.calls[1].document_id,'new-template-version');assert.equal(f.calls[1].snapshot.values.field,'person');assert.equal(f.saver.revision,2);}finally{f.saver.dispose();}
});
test('dispose prevents follow-up writes and status after a late response',async()=>{
 const gate=deferred(),f=fixture(async data=>{await gate.promise;return reply(data);});f.edit('old session');const running=f.saver.flush();f.edit('pending edit');f.saver.dispose();const count=f.statuses.length;gate.resolve();await running;await f.saver.flush();assert.equal(f.calls.length,1);assert.equal(f.statuses.length,count);
});
test('debounce writes without a manual save and repeated flushes do not duplicate',async()=>{
 let calls=0;const done=deferred(),s=createPdfEditorDraft({propertyId:'p',read:()=>({document_id:'d',snapshot:{}}),write:async data=>{calls++;return reply(data);},onStatus:state=>{if(state==='saved')done.resolve();},delay:1});try{s.changed();await done.promise;await Promise.all([s.flush(),s.flush()]);assert.equal(calls,1);}finally{s.dispose();}
});
