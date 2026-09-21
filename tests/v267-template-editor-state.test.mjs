import test from 'node:test';
import assert from 'node:assert/strict';
import {remapTemplateEditorText,remapTemplateEditorClauses,setTemplateRangeStyle,createTemplateEditorHistory} from '../src/v267/domain/template-editor-state.js';
import {validateTemplateEditor} from '../src/v267/domain/template-editor-metadata.js';

const range=(start,end,style={bold:true},clause=0)=>({clause,part:'text',start,end,style});
const clauses=text=>[{title:'عنوان',text}];

test('insertion before a range shifts it; insertion inside extends it without mutating source metadata',()=>{
 const before='one two three',editor={version:1,style:{direction:'rtl'},ranges:[range(4,7)],page_breaks:[{clause:0,offset:8}]},original=JSON.stringify(editor);
 let result=remapTemplateEditorText(editor,{clause:0,part:'text',before,after:'NEW '+before});assert.deepEqual(result.ranges,[range(8,11)]);assert.deepEqual(result.page_breaks,[{clause:0,offset:12}]);
 result=remapTemplateEditorText(editor,{clause:0,part:'text',before,after:'one tNEWwo three'});assert.deepEqual(result.ranges,[range(4,10)]);assert.deepEqual(result.page_breaks,[{clause:0,offset:11}]);
 assert.equal(JSON.stringify(editor),original);assert.deepEqual(result.style,editor.style);
});

test('replacement drops only fully replaced formatting, clips survivors and keeps other clauses',()=>{
 const before='abcdefghijklm',editor={version:1,ranges:[range(0,4),range(4,6,{underline:true}),range(6,10,{bold:false}),range(0,2,{bold:true},1)],page_breaks:[{clause:0,offset:5},{clause:0,offset:6},{clause:1,offset:2}]};
 const result=remapTemplateEditorText(editor,{clause:0,part:'text',before,after:'abXYijklm'});
 assert.deepEqual(result.ranges,[range(0,2),range(4,6,{bold:false}),range(0,2,{bold:true},1)]);assert.deepEqual(result.page_breaks,[{clause:0,offset:2},{clause:1,offset:2}]);
 assert.equal(remapTemplateEditorText(undefined,{clause:0,before,after:'new'}),undefined);
});

test('field replacement and emoji edits keep surviving offsets on whole token and surrogate boundaries',()=>{
 const before='A😀 {{tenant_name}} tail',start=before.indexOf('tail'),editor={version:1,ranges:[range(1,3),range(start,start+4)],page_breaks:[{clause:0,offset:start}]};
 const after='A😁 {{owner_name}} tail',result=remapTemplateEditorText(editor,{clause:0,part:'text',before,after});
 assert.deepEqual(result.ranges,[range(after.indexOf('tail'),after.length)]);assert.doesNotThrow(()=>validateTemplateEditor(result,[],clauses(after)));
});

test('reordering and removing clauses reindexes metadata without touching any source text',()=>{
 const editor={version:1,ranges:[range(0,2,{bold:true},0),range(3,5,{underline:true},1),range(0,1,{bold:true},2)],page_breaks:[{clause:0,offset:2},{clause:1,offset:3}],trailing_blank_pages:2};
 const original=JSON.stringify(editor),result=remapTemplateEditorClauses(editor,[1,0,null]);
 assert.deepEqual(result.ranges,[range(3,5,{underline:true},0),range(0,2,{bold:true},1)]);assert.deepEqual(result.page_breaks,[{clause:0,offset:3},{clause:1,offset:2}]);assert.equal(result.trailing_blank_pages,2);assert.equal(JSON.stringify(editor),original);
});

test('selected formatting splits existing ranges, combines styles and preserves untouched portions',()=>{
 const source=clauses('0123456789'),editor={version:1,ranges:[range(0,10,{bold:true})]};
 const result=setTemplateRangeStyle(editor,{clause:0,part:'text',start:3,end:7,style:{underline:true}},source);
 assert.deepEqual(result.ranges,[range(0,3,{bold:true}),range(3,7,{bold:true,underline:true}),range(7,10,{bold:true})]);
 const again=setTemplateRangeStyle(result,{clause:0,part:'text',start:0,end:10,style:{underline:true}},source);assert.deepEqual(again.ranges,[range(0,10,{bold:true,underline:true})]);assert.deepEqual(editor.ranges,[range(0,10,{bold:true})]);
 assert.throws(()=>setTemplateRangeStyle(editor,{clause:0,start:0,end:30,style:{bold:true}},source));
});

test('undo and redo preserve all 36 original clauses and formatting without sharing mutable snapshots',()=>{
 const original={title:'عقد أصلي',clauses:Array.from({length:36},(_,i)=>({title:'البند '+i,text:'  النص الأصلي\r\n\t '+i+'  '})),fields:[],presentation:undefined},history=createTemplateEditorHistory(original);
 const changed=structuredClone(original);changed.title='عنوان جديد';changed.clauses[0].text+='تعديل';changed.presentation={editor:{version:1,style:{bold:true}}};
 assert.equal(history.canUndo,false);history.push(changed);assert.equal(history.canUndo,true);changed.clauses[0].text='MUTATED';
 const restored=history.undo();assert.deepEqual(restored,JSON.parse(JSON.stringify(original)));assert.equal(history.canRedo,true);restored.clauses[0].text='OTHER MUTATION';
 const redone=history.redo();assert.ok(redone.clauses[0].text.endsWith('تعديل'));assert.equal(redone.clauses.length,36);assert.equal(history.canRedo,false);
 history.undo();history.push({...original,title:'فرع جديد'});assert.equal(history.canRedo,false);assert.equal(history.redo(),null);
});

test('history skips identical snapshots, honors capacity and reset without exposing internal values',()=>{
 const history=createTemplateEditorHistory({value:0},{limit:3});assert.equal(history.push({value:0}),false);
 for(let i=1;i<=4;i++)history.push({value:i});assert.deepEqual(history.undo(),{value:3});assert.deepEqual(history.undo(),{value:2});assert.equal(history.undo(),null);
 history.reset({value:9});assert.equal(history.canUndo,false);assert.equal(history.canRedo,false);assert.throws(()=>createTemplateEditorHistory({}, {limit:0}),RangeError);
});
