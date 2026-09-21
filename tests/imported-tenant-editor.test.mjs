import {t as translateStatic} from '../src/v267/components/locale.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/v267/pages/imported-tenant.js',import.meta.url),'utf8');
let serial=0;
async function fixture(){
 const nodes=[],fields={},calls=[];let state={profile:{id:'imported',nameEn:'Source name',passportNo:'SOURCE-PASS',preferredContact:'both',sourceValues:{untouched:true}},revision:1,history:[]},failRead=false,failSave=false;
 const node=(tag,text)=>{const n={tag,textContent:text||'',value:'',children:[],append(...items){this.children.push(...items)},replaceChildren(...items){this.children=items}};nodes.push(n);return n;};
 const d={body:node('div'),status:node('p'),closed:false,session:{bound:{workspace:'fixture-workspace'},check(){},client:{rpc:(name,args)=>({name,args})},async request(call){calls.push(call);if(call.name.endsWith('_save')){if(failSave)throw Error('connection lost');assert.equal(call.args.p_expected_revision,state.revision);state={...state,profile:{...state.profile,...call.args.p_patch},revision:state.revision+1};return structuredClone(state);}if(failRead)throw Error('read failed');return structuredClone(state);}},async run(fn){try{await fn();}catch(e){d.status.textContent=e.message;}}};
 globalThis.__importEditorTest={translateStatic,createDialog:()=>d,node,field:(label,input)=>{fields[label]=input;return input;}};
 const module=await import('data:text/javascript;base64,'+Buffer.from("const {createDialog,node,field,translateStatic}=globalThis.__importEditorTest;\n// fixture "+(++serial)+"\n"+source.replace(/^import .*;$/gm,'')).toString('base64'));
 delete globalThis.__importEditorTest;
 let refreshed=0;
 await module.openImportedTenant({ref:'imported',onDraft:async()=>{state.revision++;},onSaved:async()=>{refreshed++;}});
 return {d,fields,calls,nodes,refreshed:()=>refreshed,failRead:()=>{failRead=true;},failSave:()=>{failSave=true;},button:label=>nodes.find(n=>n.tag==='button'&&n.textContent===label)};
}
test('imported editor refreshes revision and saves passport plus preferred contact',async()=>{
 const f=await fixture();f.fields['الاسم بالعربية'].value='اسم مصحح';f.fields['رقم الجواز'].value='NEW-PASSPORT';f.fields['وسيلة التواصل المفضلة'].value='whatsapp';
 await f.button('حفظ مسودة واستكمال لاحقاً').onclick();
 f.fields['سبب التعديل أو مرجع التصحيح (اختياري)'].value='مراجعة المرجع الأصلي';
 await f.button('حفظ التعديل والتحقق').onclick();
 const save=f.calls.find(c=>c.name.endsWith('_save'));
 assert.equal(f.refreshed(),1);assert.equal(save.args.p_expected_revision,2);
 assert.equal(save.args.p_patch.passportNo,'NEW-PASSPORT');assert.equal(save.args.p_patch.preferredContact,'whatsapp');
 assert.equal(f.fields['الاسم بالعربية'].value,'اسم مصحح');assert.equal(f.fields['وسيلة التواصل المفضلة'].value,'whatsapp');assert.match(f.d.status.textContent,/تم حفظ التعديل/);
});
test('failed save locks repeat submission until authoritative reload',async()=>{
 const f=await fixture();f.fields['سبب التعديل أو مرجع التصحيح (اختياري)'].value='سبب موثق';f.failSave();
 await f.button('حفظ التعديل والتحقق').onclick();assert.equal(f.button('حفظ التعديل والتحقق').disabled,true);
 await f.button('حفظ التعديل والتحقق').onclick();assert.equal(f.calls.filter(c=>c.name.endsWith('_save')).length,1);assert.equal(f.refreshed(),0);
});
