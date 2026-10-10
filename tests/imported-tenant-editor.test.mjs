import {t as translateStatic} from '../src/v267/components/locale.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/v267/pages/imported-tenant.js',import.meta.url),'utf8');
let serial=0;
async function fixture({saveError=null,readError=null,scopeError=null}={}){
 globalThis.window={confirm:()=>true};
 const nodes=[],fields={},calls=[];let state={profile:{id:'imported',nameEn:'Source name',passportNo:'SOURCE-PASS',preferredContact:'both',sourceValues:{untouched:true}},revision:1,history:[]},failRead=false,failSave=false;
 const node=(tag,text)=>{const n={tag,textContent:text||'',value:'',children:[],append(...items){this.children.push(...items)},replaceChildren(...items){this.children=items}};nodes.push(n);return n;};
 const d={body:node('div'),status:node('p'),closed:false,setBeforeUnload(fn){this.unload=fn;},setBeforeClose(fn){this.canLeave=fn;},session:{bound:{workspace:'fixture-workspace'},check(){if(scopeError)throw scopeError;},client:{rpc:(name,args)=>({name,args})},async request(call){calls.push(call);if(call.name==='aqari_tenant_portfolio_context')return {tenantId:'tenant-1',properties:[{id:'property-1',name:'عقار',leaseCount:1,receiptCount:0}]};if(call.name.endsWith('_save')){if(saveError)throw saveError;if(failSave)throw Error('connection lost');assert.equal(call.args.p_expected_revision,state.revision);state={...state,profile:{...state.profile,...call.args.p_patch},revision:state.revision+1};return structuredClone(state);}if(failRead)throw (readError||Error('read failed'));return structuredClone(state);}},async run(fn){try{await fn();}catch(e){d.status.textContent=e.message;}}};
 globalThis.__importEditorTest={translateStatic,createDialog:()=>d,node,field:(label,input)=>{fields[label]=input;return input;}};
 const module=await import('data:text/javascript;base64,'+Buffer.from("const {createDialog,node,field,translateStatic}=globalThis.__importEditorTest;\n// fixture "+(++serial)+"\n"+source.replace(/^import .*;$/gm,'')).toString('base64'));
 delete globalThis.__importEditorTest;
 let refreshed=0;
 await module.openImportedTenant({ref:'imported',onDraft:async()=>{state.revision++;},onSaved:async()=>{refreshed++;}});
 return {d,fields,calls,nodes,refreshed:()=>refreshed,allowSave:()=>{saveError=null;},failRead:()=>{failRead=true;},failSave:()=>{failSave=true;},button:label=>nodes.find(n=>n.tag==='button'&&n.textContent===label)};
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

test('unsaved tenant changes guard exit and cancelled reload preserves the form',async()=>{
 const f=await fixture();assert.equal(f.d.unload(),false);
 f.fields['الاسم بالعربية'].value='تعديل غير محفوظ';assert.equal(f.d.unload(),true);
 window.confirm=()=>false;assert.equal(f.d.canLeave(),false);
 const count=f.calls.length;await f.button('تحديث الملف من السحابة').onclick();
 assert.equal(f.calls.length,count);assert.equal(f.fields['الاسم بالعربية'].value,'تعديل غير محفوظ');
 window.confirm=()=>true;await f.button('تحديث الملف من السحابة').onclick();assert.equal(f.d.unload(),false);
});
test('confirmed save clears exit warning but lost response retains it',async()=>{
 const f=await fixture();f.fields['الاسم بالعربية'].value='اسم';
 await f.button('حفظ التعديل والتحقق').onclick();assert.equal(f.d.unload(),false);
 f.failSave();await f.button('حفظ التعديل والتحقق').onclick();assert.equal(f.d.unload(),true);
 window.confirm=()=>false;assert.equal(f.d.canLeave(),false);
});
test('saved draft clears profile warning but does not discard an unsaved reason',async()=>{
 const f=await fixture();f.fields['الاسم بالعربية'].value='مسودة';
 await f.button('حفظ مسودة واستكمال لاحقاً').onclick();assert.equal(f.d.unload(),false);
 f.fields['سبب التعديل أو مرجع التصحيح (اختياري)'].value='سبب لم يدخل في المسودة';
 await f.button('حفظ مسودة واستكمال لاحقاً').onclick();assert.equal(f.d.unload(),true);
});

test('cancelled portfolio navigation leaves tenant edits open',async()=>{
 const f=await fixture();f.fields['الاسم بالعربية'].value='مسودة';window.confirm=()=>false;
 await f.button('عرض الملف الكامل — عقار').onclick();
 await f.button('مسح/تصوير مستند').onclick();await f.button('رفع ملف').onclick();
 assert.equal(f.d.closed,false);assert.equal(f.d.unload(),true);
});

for(const message of ['MFA_REQUIRED','MFA_RECENT_REAUTH_REQUIRED'])test('explicit save rejection preserves inputs and permits manual retry: '+message,async()=>{
 const f=await fixture({saveError:{status:403,code:'42501',message}});
 f.fields['الاسم بالعربية'].value='اسم محفوظ في النموذج';f.fields['سبب التعديل أو مرجع التصحيح (اختياري)'].value='سبب التصحيح';
 await f.button('حفظ التعديل والتحقق').onclick();
 assert.equal(f.button('حفظ التعديل والتحقق').disabled,false);assert.equal(f.refreshed(),0);
 assert.equal(f.calls.filter(c=>c.name.endsWith('_save')).length,1);assert.equal(f.d.unload(),true);
 assert.equal(f.fields['الاسم بالعربية'].value,'اسم محفوظ في النموذج');assert.equal(f.fields['سبب التعديل أو مرجع التصحيح (اختياري)'].value,'سبب التصحيح');
 f.allowSave();await f.button('حفظ التعديل والتحقق').onclick();
 assert.deepEqual(f.calls.filter(c=>c.name.endsWith('_save')).map(c=>c.args.p_expected_revision),[1,1]);assert.equal(f.refreshed(),1);
});
test('MFA readback failure after acknowledged save keeps submission locked',async()=>{
 const f=await fixture({readError:{status:403,code:'42501',message:'MFA_REQUIRED'}});f.failRead();
 await f.button('حفظ التعديل والتحقق').onclick();assert.equal(f.button('حفظ التعديل والتحقق').disabled,true);
 await f.button('حفظ التعديل والتحقق').onclick();assert.equal(f.calls.filter(c=>c.name.endsWith('_save')).length,1);
});
for(const error of [{status:403,code:'42501',message:'ACCESS_DENIED'},{status:500,code:'42501',message:'MFA_REQUIRED'},{status:403,code:'other',message:'MFA_REQUIRED'}])test('unrecognized save denial remains uncertain '+JSON.stringify(error),async()=>{
 const f=await fixture({saveError:error});await f.button('حفظ التعديل والتحقق').onclick();assert.equal(f.button('حفظ التعديل والتحقق').disabled,true);
});
test('changed account during explicit rejection cannot unlock save',async()=>{
 const f=await fixture({saveError:{status:403,code:'42501',message:'MFA_REQUIRED'},scopeError:Error('scope changed')});
 await f.button('حفظ التعديل والتحقق').onclick();assert.equal(f.button('حفظ التعديل والتحقق').disabled,true);assert.equal(f.refreshed(),0);
});

for(const constraint of ['aqari_tenants_workspace_id_phone_key','aqari_tenants_workspace_id_civil_id_key'])test('rejected duplicate can be corrected without losing tenant edits: '+constraint,async()=>{
 const error={status:409,code:'23505',message:'duplicate key value violates unique constraint "'+constraint+'"'};
 const f=await fixture({saveError:error});f.fields['الاسم بالعربية'].value='اسم مصحح';f.fields['الهاتف'].value='55550000';
 await f.button('حفظ التعديل والتحقق').onclick();
 assert.equal(f.button('حفظ التعديل والتحقق').disabled,false);assert.equal(f.fields['الاسم بالعربية'].value,'اسم مصحح');assert.equal(f.d.unload(),true);
 assert.equal(f.calls.filter(c=>c.name.endsWith('_save')).length,1);
 f.fields['الهاتف'].value='55550001';f.allowSave();await f.button('حفظ التعديل والتحقق').onclick();
 assert.equal(f.refreshed(),1);assert.deepEqual(f.calls.filter(c=>c.name.endsWith('_save')).map(c=>c.args.p_expected_revision),[1,1]);
 assert.equal(f.calls.filter(c=>c.name.endsWith('_save'))[1].args.p_patch.phone,'55550001');
});
test('duplicate readback failure after accepted write must not unlock another save',async()=>{
 const f=await fixture({readError:{status:409,code:'23505',message:'duplicate'}});f.failRead();
 await f.button('حفظ التعديل والتحقق').onclick();assert.equal(f.button('حفظ التعديل والتحقق').disabled,true);
 await f.button('حفظ التعديل والتحقق').onclick();assert.equal(f.calls.filter(c=>c.name.endsWith('_save')).length,1);
});
for(const error of [{status:500,code:'23505'},{status:409,code:'other'}])test('generic conflict does not permit replay '+JSON.stringify(error),async()=>{
 const f=await fixture({saveError:error});await f.button('حفظ التعديل والتحقق').onclick();assert.equal(f.button('حفظ التعديل والتحقق').disabled,true);
});
test('scope change during duplicate rejection keeps save locked',async()=>{
 const f=await fixture({saveError:{status:409,code:'23505'},scopeError:Error('scope changed')});
 await f.button('حفظ التعديل والتحقق').onclick();assert.equal(f.button('حفظ التعديل والتحقق').disabled,true);
});
