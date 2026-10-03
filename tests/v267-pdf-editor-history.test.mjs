import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPdfEditorHistory} from '../src/v267/domain/pdf-editor-history.js';
const state=(value='',page=1)=>({mapping:{title:'نموذج',fields:[{id:'f',x:.2,color:'#000000'}]},values:{f:value},page,selected:'f'});

test('undo and redo restore isolated field/value/page snapshots',()=>{
 const initial=state(),h=createPdfEditorHistory(initial),changed=state('عربي',2);changed.mapping.fields[0].x=.5;
 h.record(changed);changed.values.f='late mutation';initial.mapping.title='mutated';
 assert.deepEqual(h.undo(),state());const restored=h.redo();assert.equal(restored.values.f,'عربي');assert.equal(restored.page,2);assert.equal(restored.mapping.fields[0].x,.5);
 restored.values.f='external mutation';h.undo();assert.equal(h.redo().values.f,'عربي');
});
test('typing and pointer movement coalesce into one intentional action',()=>{
 const h=createPdfEditorHistory(state());for(let i=1;i<=30;i++)h.record(state('a'.repeat(i)),{group:'typing:f',now:100+i*20});
 assert.equal(h.undo().values.f,'');assert.equal(h.canUndo,false);assert.equal(h.redo().values.f.length,30);
});
test('different controls and pauses remain independently reversible',()=>{
 const h=createPdfEditorHistory(state());h.record(state('a'),{group:'value',now:10});h.record(state('b'),{group:'color',now:11});h.record(state('c'),{group:'color',now:1000});
 assert.equal(h.undo().values.f,'b');assert.equal(h.undo().values.f,'a');assert.equal(h.undo().values.f,'');
});
test('edit after undo discards redo and starts a new action even with same group',()=>{
 const h=createPdfEditorHistory(state());h.record(state('a'),{group:'value',now:10});h.record(state('b'),{group:'value',now:1000});h.undo();h.record(state('c'),{group:'value',now:1001});
 assert.equal(h.canRedo,false);assert.equal(h.redo(),null);assert.equal(h.undo().values.f,'a');
});
test('navigation and selection alone do not consume history',()=>{
 const h=createPdfEditorHistory(state());assert.equal(h.record({...state(),page:2,selected:null}),false);assert.equal(h.canUndo,false);
});
test('deletion restores both the field and its entered value',()=>{
 const before=state('اسم طويل'),h=createPdfEditorHistory(before);h.record({...state(),mapping:{title:'نموذج',fields:[]},values:{},selected:null});assert.deepEqual(h.undo(),before);assert.deepEqual(h.redo().values,{});
});
test('frame count is bounded without losing the current edit',()=>{
 const h=createPdfEditorHistory(state(),{limit:3});for(let i=0;i<20;i++)h.record(state(String(i)));
 assert.equal(h.undo().values.f,'18');assert.equal(h.undo().values.f,'17');assert.equal(h.undo(),null);h.redo();assert.equal(h.redo().values.f,'19');
});
test('memory budget evicts old frames and dispose releases history',()=>{
 const h=createPdfEditorHistory(state(),{maxBytes:1500});for(let i=0;i<20;i++)h.record(state(String(i).repeat(150)));
 let count=0;while(h.undo())count++;assert.ok(count<=1);h.clear();assert.equal(h.canUndo,false);assert.equal(h.canRedo,false);assert.equal(h.undo(),null);assert.equal(h.redo(),null);
});
