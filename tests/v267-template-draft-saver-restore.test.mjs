import test from 'node:test';
import assert from 'node:assert/strict';
import {createTemplateDraftSaver} from '../src/v267/domain/template-draft-saver.js';

const tick=()=>new Promise(resolve=>setTimeout(resolve,25));

test('discarding a queued local edit and replacing the saver sends no write',async()=>{
 let local={revision:7,text:'النص الأصلي'},writes=0;
 const make=()=>createTemplateDraftSaver({delay:10,read:()=>local,write:async()=>{writes++;return {revision:8};}});
 let saver=make();local={revision:7,text:'تعديل محلي'};saver.changed();
 assert.equal(saver.dirty,true);assert.equal(saver.saving,false);assert.equal(saver.uncertain,false);assert.equal(saver.canDiscard,true);
 saver.dispose();local={revision:7,text:'النص الأصلي'};saver=make();
 try{await tick();await saver.flush();assert.equal(writes,0);assert.equal(saver.dirty,false);assert.equal(local.revision,7);}finally{saver.dispose();}
});

test('in-flight and ambiguously failed writes cannot be discarded until the exact request is confirmed',async()=>{
 let rejectWrite,attempt=0;const requests=[];
 const saver=createTemplateDraftSaver({delay:10000,read:()=>({revision:3,text:'محفوظ'}),write:payload=>{requests.push(payload);if(++attempt===1)return new Promise((_,reject)=>{rejectWrite=reject;});return Promise.resolve({revision:4});}});
 try{
  saver.changed();const saving=saver.flush();await Promise.resolve();
  assert.equal(saver.saving,true);assert.equal(saver.uncertain,true);assert.equal(saver.canDiscard,false);
  rejectWrite(Error('Failed to fetch'));await assert.rejects(saving,/fetch/);
  assert.equal(saver.saving,false);assert.equal(saver.uncertain,true);assert.equal(saver.canDiscard,false);
  await saver.flush();assert.deepEqual(requests[0],requests[1]);assert.equal(saver.saving,false);assert.equal(saver.uncertain,false);assert.equal(saver.canDiscard,true);assert.equal(saver.dirty,false);
 }finally{saver.dispose();}
});

test('a confirmed validation rejection can discard local edits without an additional write',async()=>{
 let writes=0;const saver=createTemplateDraftSaver({delay:10000,read:()=>({revision:2,text:'invalid'}),write:async()=>{writes++;throw Error('INVALID_TEMPLATE_PRESENTATION');}});
 saver.changed();await assert.rejects(saver.flush(),/INVALID_TEMPLATE_PRESENTATION/);
 assert.equal(saver.saving,false);assert.equal(saver.uncertain,false);assert.equal(saver.canDiscard,true);assert.equal(saver.dirty,true);
 saver.dispose();await saver.flush();await tick();assert.equal(writes,1);
});

test('post-write read-back failure remains uncertain even when it resembles validation rejection',async()=>{
 const saver=createTemplateDraftSaver({delay:10000,read:()=>({revision:2}),write:async()=>({revision:3}),onSaved:()=>{throw Error('INVALID_TEMPLATE_PRESENTATION');}});
 try{saver.changed();await assert.rejects(saver.flush());assert.equal(saver.saving,false);assert.equal(saver.uncertain,true);assert.equal(saver.canDiscard,false);}finally{saver.dispose();}
});

test('after a successful save, restoring locally retains the latest revision for the next genuine edit',async()=>{
 let local={revision:5,text:'original'},confirmed={...local};const requests=[];
 const make=()=>createTemplateDraftSaver({delay:10000,read:()=>local,write:async payload=>{requests.push(payload);return {revision:payload.revision+1,text:payload.text};},onSaved:row=>{local.revision=row.revision;confirmed={...row};}});
 let saver=make();local.text='first';saver.changed();await saver.flush();assert.equal(local.revision,6);
 local.text='discard me';saver.changed();assert.equal(saver.canDiscard,true);saver.dispose();local={...confirmed};saver=make();await saver.flush();assert.equal(requests.length,1);
 try{local.text='next';saver.changed();await saver.flush();assert.equal(requests[1].revision,6);assert.equal(local.revision,7);assert.equal(requests[1].text,'next');}finally{saver.dispose();}
});
