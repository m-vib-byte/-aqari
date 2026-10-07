import test from 'node:test';
import assert from 'node:assert/strict';
import * as page from '../src/v267/pages/maintenance-evidence.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const task={id:'task1',status:'completed',policyVersion:1};
const evidence=[{taskId:'task1',stage:'before',documentId:'before1'},{taskId:'task1',stage:'after',documentId:'after1'}];
const documents=[{id:'before1',mimeType:'image/jpeg'},{id:'after1',mimeType:'image/png'}];
const classify=(t=task,e=evidence,d=documents)=>page.maintenancePhotoDocumentation(t,e,d);

test('completed status alone is not photo documentation',()=>{
 assert.deepEqual(classify(task,[],[]),{documented:false,missing:['before','after']});
});
test('both stages must reference images in the verified document response',()=>{
 assert.deepEqual(classify(),{documented:true,missing:[]});
 assert.deepEqual(classify(task,evidence,documents.slice(0,1)),{documented:false,missing:['after']});
});
test('foreign task evidence cannot document the current task',()=>{
 assert.deepEqual(classify(task,evidence.map(e=>({...e,taskId:'foreign'}))),{documented:false,missing:['before','after']});
});
test('duplicate before images do not substitute for after images',()=>{
 assert.deepEqual(classify(task,[evidence[0],evidence[0]]),{documented:false,missing:['after']});
});
test('an invoice or unknown MIME type is not a verified photo',()=>{
 for(const mimeType of ['application/pdf','text/html',undefined])assert.deepEqual(classify(task,evidence,documents.map(d=>({...d,mimeType}))),{documented:false,missing:['before','after']});
});
test('legacy policy does not invent missing before evidence',()=>{
 assert.deepEqual(classify({...task,policyVersion:0},[evidence[1]]),{documented:false,missing:['before']});
});
test('missing identifiers and malformed collections fail closed',()=>{
 for(const args of [[null,null,null],[{},[{}],[{}]],[task,{},documents],[task,evidence,{}]])assert.deepEqual(classify(...args),{documented:false,missing:['before','after']});
});
test('photo availability does not change operational status or mutate source records',()=>{
 const t={...task,status:'in_progress'},snapshot=JSON.stringify([t,evidence,documents]);
 assert.deepEqual(classify(t),{documented:true,missing:[]});
 assert.equal(JSON.stringify([t,evidence,documents]),snapshot);
 assert.equal(t.status,'in_progress');
});

async function renderFixture(overrides={}){
 class Element{
  constructor(tag,value=''){this.tag=tag;this.value=value;this.children=[];}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  get textContent(){return String(this.value)+this.children.map(x=>x.textContent).join('\n');}
  set textContent(value){this.value=value;}
 }
 const node=(tag,value)=>new Element(tag,value),calls=[];
 const ctx={workspace_id:'w',propertyId:'p',user_id:'u',canWrite:false,tasks:[{...task,taskNo:'MT1'}],evidence,imageDocuments:documents,...overrides};
 const d={body:node('div'),status:node('p'),session:{bound:{workspace:'w',user:'u'},check(){},async request(p){return p;},client:{async rpc(name,args){
  calls.push({name,args});assert.equal(args.p_action,'context');
  return name==='aqari_maintenance_evidence'?ctx:{workspace_id:'w',propertyId:'p',user_id:'u',canWrite:false,tasks:[],escalations:[]};
 }}},run(fn){return this.last=Promise.resolve().then(fn).catch(error=>{this.status.textContent=error.message;});}};
 const scope={createDialog:()=>d,node,field:()=>{},translateStatic:x=>x,visibleDateLocale:()=> 'ar-KW',visibleMessage:(s,v)=>s.replace(/\{(\w+)\}/g,(_,k)=>String(v[k]))};
 vm.createContext(scope);
 vm.runInContext(readFileSync(new URL('../src/v267/pages/maintenance-evidence.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,''),scope);
 scope.openMaintenanceEvidence('p');await d.last;return {d,calls};
}

test('actual evidence screen distinguishes a completed task with missing photos',async()=>{
 const {d,calls}=await renderFixture({evidence:[]});
 assert.match(d.body.textContent,/MT1 · مكتملة/);
 assert.match(d.body.textContent,/توثيق الصور: غير موثّق/);
 assert.match(d.body.textContent,/صورة قبل التنفيذ غير متاحة/);
 assert.match(d.body.textContent,/صورة بعد التنفيذ غير متاحة/);
 assert.equal(calls.length,2);
});
test('actual evidence screen shows both photos without claiming repair acceptance',async()=>{
 const {d}=await renderFixture();
 assert.match(d.body.textContent,/توثيق الصور: صور قبل وبعد متاحة/);
 assert.match(d.body.textContent,/لا يثبتان وحدهما اعتماد نتيجة الإصلاح/);
 assert.doesNotMatch(d.body.textContent,/توثيق الصور: غير موثّق/);
});
test('foreign property response cannot render documentation labels',async()=>{
 const {d,calls}=await renderFixture({propertyId:'foreign'});
 assert.match(d.status.textContent,/تعذر تأكيد نطاق أدلة الصيانة/);
 assert.doesNotMatch(d.body.textContent,/MT1|توثيق الصور/);
 assert.equal(calls.length,1);
});
