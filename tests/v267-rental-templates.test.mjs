import test from 'node:test';
import assert from 'node:assert/strict';
import {mountRentalTemplatePicker,mountRentalTemplateManager,templateForContract,requireContractIdentity} from '../src/v267/components/rental-templates.js';
import {setLocale,t,hasTranslation} from '../src/v267/components/locale.js';
class El{
 constructor(tag){this.tag=tag;this.children=[];this.value='';this.disabled=false;this.checked=false;this.textContent='';}
 append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
 replaceChildren(...children){this.children=[];this.append(...children);}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
}
const all=e=>[e,...e.children.flatMap(all)];
const clone=x=>JSON.parse(JSON.stringify(x));
const template={id:'76610000-0000-4000-8000-000000000011',kind:'apartment',version:1,title:'قالب اختبار',clauses:[{title:'اختبار','text':'نص محفوظ <untrusted>'}],content_sha256:'a'.repeat(64),published_at:'2026-09-13T00:00:00.000000Z'};
function setup({manager=false,items=[template],drafts=[]}={}){
 globalThis.document={createElement:tag=>new El(tag)};
 const state={manager,items:clone(items),drafts:clone(drafts),calls:[],failOnce:false,closed:false};
 const d={status:new El('p'),run(fn){d.pending=Promise.resolve().then(fn);return d.pending;},session:{bound:{workspace:'test-workspace',user:'test-user'},check(){if(state.closed)throw Error('closed');},request:async p=>p,client:{async rpc(name,args){assert.equal(name,'aqari_rental_templates');state.calls.push(clone(args));const base={workspace_id:'test-workspace',user_id:'test-user'};
  if(args.p_action==='context')return {...base,can_publish:state.manager,items:clone(state.items),drafts:state.manager?clone(state.drafts):[]};
  if(args.p_action==='publish'){
   const p=args.p_data;let saved=state.items.find(r=>r.id===p.id);if(!saved){saved={id:p.id,kind:p.kind,version:p.expected_version+1,title:p.title,clauses:p.clauses,content_sha256:'b'.repeat(64),published_at:'2026-09-13T00:00:00.000000Z'};state.items.push(saved);}
   if(state.failOnce){state.failOnce=false;throw Error('lost publication reply');}return {...base,record:clone(saved)};
  }
  if(args.p_action==='get'){if(state.failReadOnce){state.failReadOnce=false;throw Error('lost readback');}return {...base,record:clone(state.items.find(r=>r.id===args.p_data.id))};}
 }}}};return {d,state,target:new El('section')};
}
test('a contract receives an independent immutable template snapshot; identity is mandatory for new issuance',()=>{
 const result=templateForContract(template);assert.deepEqual(result.contractTemplate,template);result.clauses[0].text='local edit';assert.equal(template.clauses[0].text,'نص محفوظ <untrusted>');
 const tenant={nameAr:'اختبار',nameEn:'Synthetic',civilId:'123456789012',passportNo:'SYNTHETIC',phone:'55550000',email:'test@example.invalid'};
 requireContractIdentity(tenant);for(const key of Object.keys(tenant))assert.throws(()=>requireContractIdentity({...tenant,[key]:''}),/ملف المستأجر/);
 assert.throws(()=>templateForContract(null),/قالب/);
});
test('staff selects a published type and version and sees clauses as text without editing or approval actions',async()=>{
 const f=setup();let selected='initial';const picker=await mountRentalTemplatePicker(f.d,f.target,{onChange:r=>selected=r,onManage:()=>assert.fail('staff manager action')});
 const selects=all(f.target).filter(x=>x.tag==='select');assert.equal(selects.length,2);assert.equal(picker.selected(),null);assert.equal(all(f.target).filter(x=>x.tag==='textarea').length,0);assert.equal(all(f.target).filter(x=>x.tag==='button').length,0);
 selects[0].value='apartment';selects[0].onchange();assert.equal(selected,null);selects[1].value=template.id;selects[1].onchange();assert.deepEqual(picker.selected(),template);assert.ok(all(f.target).some(x=>x.textContent==='نص محفوظ <untrusted>'));
 selects[0].value='house';selects[0].onchange();assert.equal(picker.selected(),null);assert.equal(selects[1].disabled,true);
});
test('no published versions blocks selection and gives the manager an explicit route to publish',async()=>{
 const f=setup({manager:true,items:[]});let selected='unset',managed=0;await mountRentalTemplatePicker(f.d,f.target,{onChange:r=>selected=r,onManage:()=>{managed++;}});
 assert.equal(selected,null);assert.ok(all(f.target).some(x=>x.textContent.includes('لا توجد قوالب منشورة')));await all(f.target).find(x=>x.tag==='button').onclick();assert.equal(managed,1);
});
test('manager drafts and prior versions are proposals and publication requires explicit confirmation',async()=>{
 const f=setup({manager:true,items:[],drafts:[{id:'draft-1',kind:'apartment',revision:1,title:'مسودة مصدر',body:'نص مسودة غير معتمد'}]});const manager=await mountRentalTemplateManager(f.d,f.target,{suggestion:[{title:'اقتراح',text:'نص مراجعة فقط'}]});
 assert.equal(f.state.calls.filter(x=>x.p_action==='publish').length,0);const selects=all(manager.form).filter(x=>x.tag==='select');selects[1].value='draft-1';selects[1].onchange();assert.ok(all(manager.form).some(x=>x.value==='نص مسودة غير معتمد'));
 await assert.rejects(manager.form.onsubmit({preventDefault(){}}),/أكد مراجعة/);assert.equal(f.state.calls.filter(x=>x.p_action==='publish').length,0);
});
test('a lost publication reply retains the request and retries the same version before verified success',async()=>{
 const f=setup({manager:true,items:[]});const manager=await mountRentalTemplateManager(f.d,f.target,{suggestion:[{title:'اقتراح',text:'نص اختبار'}]});const fields=all(manager.form);
 fields.find(x=>x.tag==='input'&&x.maxLength===200).value='قالب اختبار جديد';fields.find(x=>x.tag==='textarea'&&x.maxLength===500).value='سبب اعتماد اصطناعي';fields.find(x=>x.textContent===t('معاينة نص النسخة قبل الاعتماد')).onclick();fields.find(x=>x.type==='checkbox').checked=true;f.state.failOnce=true;
 await assert.rejects(manager.form.onsubmit({preventDefault(){}}),/lost publication/);assert.equal(f.state.items.length,1);const retry=all(manager.form).find(x=>x.tag==='button');assert.match(retry.textContent,/بنفس الطلب/);await retry.onclick();
 const writes=f.state.calls.filter(x=>x.p_action==='publish');assert.equal(writes.length,2);assert.deepEqual(writes[0].p_data,writes[1].p_data);assert.equal(f.state.items.length,1);assert.ok(f.state.calls.some(x=>x.p_action==='get'));assert.match(f.d.status.textContent,/تأكدت إعادة قراءتها/);
});
test('scope loss during a template response prevents rendering any saved clauses',async()=>{
 const f=setup();const rpc=f.d.session.client.rpc;f.d.session.client.rpc=async(...args)=>{const r=await rpc(...args);f.state.closed=true;return r;};
 await assert.rejects(mountRentalTemplatePicker(f.d,f.target),/closed/);assert.equal(f.target.children.length,0);
});

test('a failed independent readback prevents another edit and verifies the original publication on retry',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target,{suggestion:[{title:'اقتراح',text:'نص اختبار'}]});const fields=all(manager.form);
 fields.find(x=>x.tag==='input'&&x.maxLength===200).value='قالب اختبار';fields.find(x=>x.tag==='textarea'&&x.maxLength===500).value='سبب اعتماد اصطناعي';fields.find(x=>x.textContent===t('معاينة نص النسخة قبل الاعتماد')).onclick();fields.find(x=>x.type==='checkbox').checked=true;f.state.failReadOnce=true;
 await assert.rejects(manager.form.onsubmit({preventDefault(){}}),/lost readback/);assert.equal(f.state.items.length,1);assert.equal(all(manager.form).filter(x=>x.tag==='input'||x.tag==='textarea').length,0);
 await all(manager.form).find(x=>x.tag==='button').onclick();assert.equal(f.state.items.length,1);assert.match(f.d.status.textContent,/تأكدت إعادة قراءتها/);
});

test('template picker and manager translate UI in five languages without translating saved legal text',async()=>{
 try{for(const locale of ['ar','en','hi','ur','ml']){
  setLocale(locale,null);
  const f=setup({manager:true});
  f.state.items[0].title='نوع العقد';f.state.items[0].clauses=[{title:'عنوان البند',text:'إضافة بند'}];
  let selected;
  await mountRentalTemplatePicker(f.d,f.target,{onChange:r=>selected=r,onManage:()=>{}});
  assert.ok(all(f.target).some(x=>x.textContent===t('نوع العقد وقالب البنود',locale)));
  const [kind,version]=all(f.target).filter(x=>x.tag==='select');kind.value='apartment';kind.onchange();
  assert.ok(all(kind).some(x=>x.textContent===t('عقد شقة',locale)));
  version.value=template.id;version.onchange();
  assert.equal(selected.title,'نوع العقد');assert.equal(selected.clauses[0].text,'إضافة بند');
  assert.ok(all(f.target).some(x=>x.tag==='h4'&&x.textContent==='عنوان البند'));
  assert.ok(all(f.target).some(x=>x.tag==='p'&&x.textContent==='إضافة بند'));
  await mountRentalTemplateManager(f.d,f.target,{onBack:()=>{}});
  for(const source of ['قوالب العقود — اعتماد المدير العام','العودة للعقود','اعتماد ونشر نسخة جديدة','إضافة بند','عنوان القالب']){
   assert.ok(hasTranslation(source,locale));assert.ok(all(f.target).some(x=>x.textContent===t(source,locale)),locale+': '+source);
  }
  for(const source of ['نقل البند للأعلى','نقل البند للأسفل','{count} بند في هذا القالب'])assert.ok(hasTranslation(source,locale),locale+': '+source);
  assert.equal(f.state.calls.filter(x=>x.p_action==='publish').length,0,'rendering translations must never publish a legal template');
 }}finally{setLocale('ar',null);}
});

test('publication requires a full preview after the latest edit',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target,{suggestion:[{title:'بند',text:'نص للاختبار'}]});
 const fields=all(manager.form),title=fields.find(x=>x.tag==='input'&&x.maxLength===200),approve=fields.find(x=>x.type==='checkbox'),preview=fields.find(x=>x.textContent===t('معاينة نص النسخة قبل الاعتماد'));
 title.value='قالب اختبار';fields.find(x=>x.tag==='textarea'&&x.maxLength===500).value='سبب للاختبار';approve.checked=true;
 await assert.rejects(manager.form.onsubmit({preventDefault(){}}),/المعاينة الكاملة/);
 preview.onclick();title.value='تعديل بعد المعاينة';title.oninput();approve.checked=true;
 await assert.rejects(manager.form.onsubmit({preventDefault(){}}),/المعاينة الكاملة/);
 assert.equal(f.state.calls.filter(x=>x.p_action==='publish').length,0);
 preview.onclick();approve.checked=true;await manager.form.onsubmit({preventDefault(){}});
 assert.equal(f.state.calls.filter(x=>x.p_action==='publish').length,1);
});

test('manager can reorder clauses and the published snapshot keeps the reviewed order',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target,{suggestion:[{title:'الأول',text:'نص أول'},{title:'الثاني',text:'نص ثان'}]});
 const fields=all(manager.form),title=fields.find(x=>x.tag==='input'&&x.maxLength===200),reason=fields.find(x=>x.tag==='textarea'&&x.maxLength===500),approve=fields.find(x=>x.type==='checkbox');
 assert.ok(fields.some(x=>x.textContent==='2 بند في هذا القالب'));
 const down=fields.find(x=>x.tag==='button'&&x.textContent==='↓'&&!x.disabled);down.onclick();
 title.value='قالب مرتب';reason.value='اعتماد ترتيب البنود';fields.find(x=>x.textContent===t('معاينة نص النسخة قبل الاعتماد')).onclick();approve.checked=true;
 await manager.form.onsubmit({preventDefault(){}});
 const published=f.state.calls.find(x=>x.p_action==='publish').p_data;
 assert.deepEqual(published.clauses.map(x=>x.title),['الثاني','الأول']);
});

test('whitespace-only clause text is rejected locally before any publication request',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target,{suggestion:[{title:'بند',text:'   '}]});const fields=all(manager.form);
 fields.find(x=>x.tag==='input'&&x.maxLength===200).value='قالب ناقص';fields.find(x=>x.tag==='textarea'&&x.maxLength===500).value='سبب اعتماد كاف';fields.find(x=>x.type==='checkbox').checked=true;
 await assert.rejects(manager.form.onsubmit({preventDefault(){}}),/أكمل نوع القالب/);
 assert.equal(f.state.calls.filter(x=>x.p_action==='publish').length,0);
});
