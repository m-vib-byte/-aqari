import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {documentTemplateBlueprints,mountRentalTemplatePicker,mountRentalTemplateManager,mountTemplateFields,templateForContract,requireContractIdentity,validTemplate} from '../src/v267/components/rental-templates.js';

class El{
 constructor(tag){this.tag=tag;this.children=[];this.value='';this.disabled=false;this.checked=false;this.hidden=false;this.textContent='';this.className='';this.style={};}
 append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
 prepend(...children){for(const child of children.reverse()){child.parent=this;this.children.unshift(child);}}
 replaceChildren(...children){this.children=[];this.append(...children);}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
 reportValidity(){return true;}
 click(){this.clicked=true;}
}
const all=e=>[e,...e.children.flatMap(all)];
const clone=x=>JSON.parse(JSON.stringify(x));
const template={id:'76610000-0000-4000-8000-000000000011',kind:'apartment',kind_label:'عقد شقة',version:1,title:'قالب اختبار',fields:[],clauses:[{title:'اختبار',text:'نص محفوظ <untrusted>'}],content_sha256:'a'.repeat(64),published_at:'2026-09-13T00:00:00.000000Z'};

function setup({manager=false,items=[template],drafts=[]}={}){
 globalThis.document={createElement:tag=>new El(tag)};
 globalThis.window={AQARI_SUPABASE:{getSession:async()=>({access_token:'a.b.c'})}};
 globalThis.fetch=async()=>new Response(new Blob(['%PDF-1.7 preview'],{type:'application/pdf'}),{status:200,headers:{'content-type':'application/pdf'}});
 if(!URL.createObjectURL)URL.createObjectURL=()=> 'blob:test';if(!URL.revokeObjectURL)URL.revokeObjectURL=()=>{};
 const state={manager,items:clone(items),drafts:clone(drafts),calls:[],failOnce:false,failReadOnce:false};
 const d={status:new El('p'),onDispose(){},run:fn=>Promise.resolve().then(fn),session:{bound:{workspace:'test-workspace',user:'test-user'},check(){},request:async p=>p,client:{async rpc(name,args){assert.equal(name,'aqari_rental_templates');state.calls.push(clone(args));const base={workspace_id:'test-workspace',user_id:'test-user'};
  if(args.p_action==='context')return {...base,can_publish:state.manager,items:clone(state.items),drafts:state.manager?clone(state.drafts):[]};
  if(args.p_action==='save_draft'){const p=args.p_data;let row=state.drafts.find(x=>x.id===p.id);const next={...p,revision:(row?.revision||0)+1,status:'draft'};delete next.request_id;if(row)Object.assign(row,next);else state.drafts.push(next);return {...base,record:clone(next)};}
  if(args.p_action==='publish'){const p=args.p_data;let saved=state.items.find(r=>r.id===p.id);if(!saved){saved={id:p.id,kind:p.kind,kind_label:p.kind_label,version:p.expected_version+1,title:p.title,fields:p.fields,clauses:p.clauses,content_sha256:'b'.repeat(64),published_at:'2026-09-20T00:00:00.000000Z'};state.items.push(saved);}if(state.failOnce){state.failOnce=false;throw Error('lost publication reply');}return {...base,record:clone(saved)};}
  if(args.p_action==='get'){if(state.failReadOnce){state.failReadOnce=false;throw Error('lost readback');}return {...base,record:clone(state.items.find(r=>r.id===args.p_data.id))};}
 }}}};return {d,state,target:new El('section')};
}

test('published template is an immutable contract snapshot and tenant identity stays mandatory',()=>{
 assert.equal(validTemplate(template),true);const result=templateForContract(template);assert.deepEqual(result.contractTemplate,template);result.clauses[0].text='local edit';assert.equal(template.clauses[0].text,'نص محفوظ <untrusted>');
 const tenant={nameAr:'اختبار',nameEn:'Synthetic',civilId:'123456789012',passportNo:'SYNTHETIC',phone:'55550000',email:'test@example.invalid'};requireContractIdentity(tenant);for(const key of Object.keys(tenant).filter(key=>key!=='email'))assert.throws(()=>requireContractIdentity({...tenant,[key]:''}),/ملف المستأجر/);assert.doesNotThrow(()=>requireContractIdentity({...tenant,email:''}));assert.doesNotThrow(()=>requireContractIdentity({...tenant,email:undefined}));assert.throws(()=>requireContractIdentity({...tenant,email:'invalid-email'}),/البريد الإلكتروني/);assert.throws(()=>templateForContract(null),/قالب/);
});

test('variable fields are required and substituted into the saved contract copy',()=>{
 const withFields={...template,fields:[{key:'shop_name',label:'اسم المحل',type:'text',required:true},{key:'area',label:'المساحة',type:'number',required:false}],clauses:[{title:'المحل {{shop_name}}',text:'مساحته {{area}} متر'}]};
 assert.throws(()=>templateForContract(withFields,{}),/اسم المحل/);
 const result=templateForContract(withFields,{shop_name:'متجر الاختبار',area:'45'});
 assert.deepEqual(result.templateFieldValues,{shop_name:'متجر الاختبار',area:'45'});
 assert.deepEqual(result.clauses,[{title:'المحل متجر الاختبار',text:'مساحته 45 متر'}]);
 assert.equal(withFields.clauses[0].text,'مساحته {{area}} متر');
});

test('new-contract picker lists only published kinds and never exposes legal text for editing',async()=>{
 const f=setup();let selected=null;const picker=await mountRentalTemplatePicker(f.d,f.target,{onChange:r=>selected=r});const selects=all(f.target).filter(x=>x.tag==='select');assert.equal(selects.length,2);assert.equal(all(f.target).filter(x=>x.tag==='textarea').length,0);
 selects[0].value='apartment';selects[0].onchange();selects[1].value=template.id;selects[1].onchange();assert.deepEqual(picker.selected(),template);assert.deepEqual(selected,template);assert.ok(all(f.target).some(x=>x.textContent==='نص محفوظ <untrusted>'));
});

test('manager sees a clear create action and nothing publishes merely by opening the studio',async()=>{
 const f=setup({manager:true,items:[]});await mountRentalTemplateManager(f.d,f.target);assert.ok(all(f.target).some(x=>x.textContent.includes('إنشاء نموذج عقد جديد')));assert.equal(f.state.calls.filter(x=>x.p_action==='publish').length,0);
});

test('five independent document blueprints contain only empty field definitions',()=>{
 assert.deepEqual(documentTemplateBlueprints.map(x=>x.label),['نموذج عقد إيجار','نموذج استلام الوحدة / الشقة','نموذج وصل إيجار','تعهد / قرار الإخلاء من المستأجر','براءة ذمة ومخالصة نهائية من مالك العقار']);
 assert.equal(new Set(documentTemplateBlueprints.map(x=>x.kind)).size,5);
 for(const blueprint of documentTemplateBlueprints){assert.ok(blueprint.fields.length>0);assert.equal(new Set(blueprint.fields.map(x=>x.key)).size,blueprint.fields.length);for(const spec of blueprint.fields){assert.equal(typeof spec.required,'boolean');assert.equal(typeof spec.label,'string');assert.ok(['text','date','number','money'].includes(spec.type));assert.equal('value' in spec,false);assert.match(spec.key,/^[a-z][a-z0-9_]{1,49}$/);}}
});

test('new template starts with rental fields and switching document type replaces the empty structure only',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target,{suggestion:[{title:'بند',text:'اكتب النص هنا'}]});const form=manager.form,kind=all(form).find(x=>x.tag==='select');
 assert.equal(kind.value,'rental_agreement');assert.ok(all(form).some(x=>x.value==='contract_no'));assert.ok(all(form).some(x=>x.value==='monthly_rent'));
 kind.value='rent_receipt';kind.onchange();assert.ok(all(form).some(x=>x.value==='receipt_no'));assert.ok(all(form).some(x=>x.value==='payment_reference'));assert.equal(all(form).some(x=>x.tag==='input'&&x.value==='monthly_rent'),false);assert.equal(f.state.calls.filter(x=>['save_draft','publish'].includes(x.p_action)).length,0);
});

test('non-contract document templates never appear in new-contract picker',async()=>{
 const receipt={...template,id:'76610000-0000-4000-8000-000000000012',kind:'rent_receipt',kind_label:'نموذج وصل إيجار'};const f=setup({items:[template,receipt]});await mountRentalTemplatePicker(f.d,f.target);const options=all(f.target).filter(x=>x.tag==='option');assert.ok(options.some(x=>x.value==='apartment'));assert.equal(options.some(x=>x.value==='rent_receipt'),false);
});

test('template studio inputs keep explicit high-contrast text, placeholders and focus colors',()=>{
 const css=readFileSync(new URL('../src/v267/styles/contract-template-studio.css',import.meta.url),'utf8');assert.match(css,/\.aq267-template-studio :is\(input,textarea,select\)\{[^}]*color:#2b2119!important[^}]*background:#fff!important/);assert.match(css,/::placeholder\{color:#746252!important;opacity:1!important\}/);assert.match(css,/:focus\{border-color:#7a5426!important/);
});

test('custom contract type saves as a draft and remains absent from new-contract picker',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target,{suggestion:[{title:'بند',text:'نص محفوظ'}]});const form=manager.form,controls=all(form),kind=controls.find(x=>x.tag==='select');kind.value='custom';kind.onchange();const inputs=all(form).filter(x=>x.tag==='input');inputs.find(x=>x.maxLength===80).value='عقد محل خاص';inputs.find(x=>x.maxLength===200).value='نموذج المحل';
 await all(form).find(x=>x.textContent==='حفظ كمسودة').onclick();assert.equal(f.state.calls.filter(x=>x.p_action==='save_draft').length,1);assert.equal(f.state.calls.filter(x=>x.p_action==='publish').length,0);assert.match(f.d.status.textContent,/لم يعتمد أو ينشر/);
 const picker=setup({manager:false,items:f.state.items});await mountRentalTemplatePicker(picker.d,picker.target);assert.ok(all(picker.target).some(x=>x.textContent.includes('لا توجد قوالب منشورة')));
});

async function reachApproval(f,manager){
 const form=manager.form,controls=all(form),title=controls.find(x=>x.tag==='input'&&x.maxLength===200);title.value='نموذج اختبار';
 const pdf=controls.find(x=>x.textContent==='فتح وتحميل PDF');await assert.rejects(pdf.onclick(),/المعاينة النهائية/);
 controls.find(x=>x.textContent==='معاينة نهائية').onclick();await pdf.onclick();
 const fresh=all(form),reason=fresh.find(x=>x.tag==='textarea'&&x.maxLength===500),confirm=fresh.find(x=>x.type==='checkbox'&&x.required);reason.value='اعتماد بعد مراجعة PDF';confirm.checked=true;return fresh.find(x=>x.textContent==='اعتماد ونشر النموذج');
}

test('publish is impossible until final preview, PDF generation and explicit manager confirmation',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target,{suggestion:[{title:'بند',text:'نص اختبار'}]});const publish=await reachApproval(f,manager);assert.equal(f.state.calls.filter(x=>x.p_action==='publish').length,0);await publish.onclick();assert.equal(f.state.calls.filter(x=>x.p_action==='publish').length,1);assert.ok(f.state.calls.some(x=>x.p_action==='get'));assert.match(f.d.status.textContent,/أصبح متاحًا/);
});

test('lost publish reply retries the exact same approval request and cannot create two versions',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target,{suggestion:[{title:'بند',text:'نص اختبار'}]}),publish=await reachApproval(f,manager);f.state.failOnce=true;await assert.rejects(publish.onclick(),/lost publication/);await publish.onclick();const writes=f.state.calls.filter(x=>x.p_action==='publish');assert.equal(writes.length,2);assert.deepEqual(writes[0].p_data,writes[1].p_data);assert.equal(f.state.items.length,1);
});


test('typed linked fields autofill aliases, stay readonly, and clear only supplied source keys',()=>{
 const f=setup(),schema={...template,fields:[{key:'civil_id',label:'الرقم المدني',type:'text',required:true},{key:'tenant_name',label:'اسم المستأجر',type:'text',required:true},{key:'special_note',label:'ملاحظة',type:'text',required:false}]};
 const editor=mountTemplateFields(f.target,schema,{tenant_civil_id:'123456789012',tenant_name:'اسم محفوظ',special_note:'نص يكتبه المدير'},{lockedKeys:['tenant_civil_id','tenant_name']});
 const controls=all(f.target).filter(x=>x.tag==='input');assert.equal(controls.find(x=>x.name==='civil_id').readOnly,true);assert.equal(controls.find(x=>x.name==='special_note').readOnly,false);
 assert.equal(editor.values().civil_id,'123456789012');editor.setValues({tenant_civil_id:'',tenant_name:'اسم آخر'});assert.deepEqual(editor.values(),{civil_id:'',tenant_name:'اسم آخر',special_note:'نص يكتبه المدير'});
});

test('contract picker refreshes both linked values and rendered wording from the current source form',async()=>{
 const withFields={...template,fields:[{key:'tenant_name',label:'اسم المستأجر',type:'text',required:true}],clauses:[{title:'الطرف',text:'المستأجر {{tenant_name}}'}]},f=setup({items:[withFields]});
 const picker=await mountRentalTemplatePicker(f.d,f.target,{getValues:()=>({tenant_name:'الاسم الأول'})}),selects=all(f.target).filter(x=>x.tag==='select');selects[0].value='apartment';selects[0].onchange();selects[1].value=template.id;selects[1].onchange();
 assert.equal(picker.values().tenant_name,'الاسم الأول');assert.ok(all(f.target).some(x=>x.textContent==='المستأجر الاسم الأول'));
 picker.setValues({tenant_name:'الاسم الثاني'});assert.ok(all(f.target).some(x=>x.textContent==='المستأجر الاسم الثاني'));assert.equal(all(f.target).some(x=>x.textContent==='المستأجر الاسم الأول'),false);
 assert.equal(f.state.calls.some(x=>['save_draft','publish'].includes(x.p_action)),false);
});

test('field selector inserts the specific token at the caret without rewriting original wording',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target),before='  نص أصلي:  ثم نهاية.  ';manager.openEditor({kind:'rental_agreement',clauses:[{title:'عنوان أصلي',text:before}]});
 const clause=all(manager.form).find(x=>x.className==='aq267-template-clause'),body=all(clause).find(x=>x.tag==='textarea'),picker=all(clause).find(x=>x.tag==='select'),button=all(clause).find(x=>x.textContent==='إدراج الحقل');
 body.selectionStart=11;body.selectionEnd=11;body.onfocus();picker.value='tenant_civil_id';picker.onchange();assert.equal(button.disabled,false);button.onclick();assert.equal(body.value,before.slice(0,11)+'{{tenant_civil_id}}'+before.slice(11));
 const title=all(clause).find(x=>x.tag==='input');title.selectionStart=0;title.selectionEnd=0;title.onfocus();picker.value='contract_no';picker.onchange();button.onclick();assert.equal(title.value,'{{contract_no}}عنوان أصلي');
 assert.equal(all(manager.form).some(x=>x.textContent.includes('{{field_name}}')),false);assert.equal(f.state.calls.some(x=>['save_draft','publish'].includes(x.p_action)),false);
});

test('schema preview replaces tokens with named blanks and shows independent signer slots without writing',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target,{suggestion:[{title:'المستأجر {{tenant_name}}',text:'  الرقم {{tenant_civil_id}} / الوحدة {{unit_no}}  '}]});
 all(manager.form).find(x=>x.textContent==='معاينة نهائية').onclick();const preview=all(manager.form).find(x=>x.className==='aq267-template-preview');assert.ok(all(preview).some(x=>x.textContent==='المستأجر «اسم المستأجر»'));assert.equal(all(preview).some(x=>/\{\{/.test(x.textContent)),false);assert.ok(all(preview).some(x=>x.className==='aq267-template-signers'));assert.equal(f.state.calls.some(x=>['save_draft','publish'].includes(x.p_action)),false);
});

test('unknown and generic placeholders block both preview approval and draft writes',async()=>{
 for(const text of ['نص {{field_name}}','نص {{missing_field}}','نص {{tenant_name}']){
  const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target,{suggestion:[{title:'اختبار',text}]});all(manager.form).find(x=>x.textContent==='معاينة نهائية').onclick();
  assert.notEqual(f.d.status.textContent,'هذه معاينة فقط ولم يتم اعتماد النموذج.');assert.equal(all(manager.form).find(x=>x.className==='aq267-template-approval').hidden,true);await assert.rejects(all(manager.form).find(x=>x.textContent==='حفظ كمسودة').onclick());assert.equal(f.state.calls.some(x=>['save_draft','publish'].includes(x.p_action)),false);
 }
});

test('manager can add a distinct saved-data field from catalog without generating wording or a template',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target);manager.openEditor();const controls=all(manager.form),catalog=controls.find(x=>x.tag==='select'&&x.children.some(o=>o.textContent==='اختر معلومة محفوظة'));catalog.value='owner_civil_id';catalog.onchange();controls.find(x=>x.textContent==='إضافة الحقل المحدد').onclick();
 assert.ok(all(manager.form).some(x=>x.tag==='input'&&x.value==='owner_civil_id'));assert.equal(all(manager.form).find(x=>x.tag==='textarea').value,'');assert.equal(f.state.calls.some(x=>['save_draft','publish'].includes(x.p_action)),false);
});
