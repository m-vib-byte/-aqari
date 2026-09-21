import test from 'node:test';
import assert from 'node:assert/strict';
import {createTemplateDraftSaver,templateDraftErrorMessage} from '../src/v267/domain/template-draft-saver.js';

const clone=value=>JSON.parse(JSON.stringify(value));

test('correcting server-rejected clause content replaces the failed snapshot and preserves the current revision',async()=>{
 let revision=7,title='x'.repeat(201);const requests=[],stored=[];
 const saver=createTemplateDraftSaver({delay:10000,read:()=>({revision,clauses:[{title,text:'نص العقد الأصلي'}]}),write:async payload=>{requests.push(clone(payload));if(payload.clauses[0].title.length>200)throw Error('INVALID_TEMPLATE_CLAUSE');stored.push(clone(payload));return {revision:payload.revision+1};},onSaved:row=>revision=row.revision});
 try{
  saver.changed();await assert.rejects(saver.flush(),/INVALID_TEMPLATE_CLAUSE/);assert.equal(saver.dirty,true);assert.equal(stored.length,0);
  title='عنوان صحيح';saver.changed();await saver.flush();
  assert.equal(requests.length,2);assert.notEqual(requests[0].request_id,requests[1].request_id);assert.equal(requests[1].revision,7);assert.equal(requests[1].clauses[0].title,title);assert.equal(stored.length,1);assert.equal(revision,8);assert.equal(saver.dirty,false);
 }finally{saver.dispose();}
});

test('edits made while a rejected validation request is running remain available for the next save',async()=>{
 let value='invalid',release;const requests=[];
 const saver=createTemplateDraftSaver({delay:10000,read:()=>({revision:3,value}),write:async payload=>{requests.push(clone(payload));if(requests.length===1){await new Promise(resolve=>release=resolve);throw Error('INVALID_TEMPLATE_FIELD');}return {revision:4};}});
 try{
  saver.changed();const saving=saver.flush();await Promise.resolve();value='corrected';saver.changed();release();await assert.rejects(saving,/INVALID_TEMPLATE_FIELD/);assert.equal(saver.dirty,true);
  await saver.flush();assert.deepEqual(requests.map(row=>row.value),['invalid','corrected']);assert.equal(saver.dirty,false);
 }finally{saver.dispose();}
});

test('a committed write with a lost response retries the same idempotency key before sending newer edits',async()=>{
 let revision=1,value='first',lost=true;const requests=[],database=new Map();
 const saver=createTemplateDraftSaver({delay:10000,read:()=>({revision,value}),write:async payload=>{requests.push(clone(payload));if(!database.has(payload.request_id))database.set(payload.request_id,{revision:payload.revision+1,value:payload.value});if(lost){lost=false;throw Error('Failed to fetch');}return database.get(payload.request_id);},onSaved:row=>revision=row.revision});
 try{
  saver.changed();await assert.rejects(saver.flush(),/fetch/);value='newer';saver.changed();await saver.flush();
  assert.deepEqual(requests[0],requests[1]);assert.notEqual(requests[1].request_id,requests[2].request_id);assert.equal(requests[2].revision,2);assert.equal(requests[2].value,'newer');assert.equal(database.size,2);assert.equal(revision,3);
 }finally{saver.dispose();}
});

test('revision conflict retains the original request without attempting to overwrite a newer revision',async()=>{
 let value='old';const requests=[];
 const saver=createTemplateDraftSaver({delay:10000,read:()=>({revision:3,value}),write:async payload=>{requests.push(clone(payload));throw Error('DRAFT_REVISION_CONFLICT');}});
 try{
  saver.changed();await assert.rejects(saver.flush(),/CONFLICT/);value='latest local edit';saver.changed();await assert.rejects(saver.flush(),/CONFLICT/);
  assert.deepEqual(requests[0],requests[1]);assert.equal(saver.dirty,true);
 }finally{saver.dispose();}
});

test('post-write verification failure never discards a possibly committed request',async()=>{
 const requests=[];let fail=true;
 const saver=createTemplateDraftSaver({delay:10000,read:()=>({revision:0,value:'preserved'}),write:async payload=>{requests.push(clone(payload));return {revision:1};},onSaved:()=>{if(fail){fail=false;throw Error('INVALID_TEMPLATE_CONTENT');}}});
 try{saver.changed();await assert.rejects(saver.flush());await saver.flush();assert.deepEqual(requests[0],requests[1]);assert.equal(saver.dirty,false);}finally{saver.dispose();}
});

test('opening without edits never writes and unknown errors keep their exact payload',async()=>{
 const requests=[];let value='first',fail=true;
 const saver=createTemplateDraftSaver({delay:10000,read:()=>({revision:0,value}),write:async payload=>{requests.push(clone(payload));if(fail){fail=false;throw Error('unexpected upstream failure');}return {revision:1};}});
 try{
  await saver.flush();assert.equal(requests.length,0);saver.changed();await assert.rejects(saver.flush());value='not committed';await saver.flush();assert.deepEqual(requests[0],requests[1]);assert.equal(requests.length,2);
 }finally{saver.dispose();}
});

test('known failure explanations are actionable and avoid technical error codes',()=>{
 for(const code of ['INVALID_TEMPLATE_CONTENT','INVALID_TEMPLATE_CLAUSE','INVALID_TEMPLATE_FIELD','DUPLICATE_TEMPLATE_FIELD','INVALID_TEMPLATE_PRESENTATION','INVALID_DRAFT_REQUEST']){const message=templateDraftErrorMessage(Error(code));assert.ok(message);assert.doesNotMatch(message,/[A-Z_]{4,}/);assert.match(message,/حفظ الآن/);}
 assert.match(templateDraftErrorMessage(Error('DRAFT_REVISION_CONFLICT')),/نسخة مستقلة/);
 assert.match(templateDraftErrorMessage(Error('انتهت مهلة الاتصال. حدّث السجلات للتحقق.')),/لم يتأكد الحفظ/);
 assert.equal(templateDraftErrorMessage(Error('custom application explanation')),null);
});
