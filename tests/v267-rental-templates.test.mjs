import test from 'node:test';
import assert from 'node:assert/strict';
import {mountRentalTemplatePicker,mountRentalTemplateManager,templateForContract,requireContractIdentity,validTemplate} from '../src/v267/components/rental-templates.js';

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
 const tenant={nameAr:'اختبار',nameEn:'Synthetic',civilId:'123456789012',passportNo:'SYNTHETIC',phone:'55550000',email:'test@example.invalid'};requireContractIdentity(tenant);for(const key of Object.keys(tenant))assert.throws(()=>requireContractIdentity({...tenant,[key]:''}),/ملف المستأجر/);assert.throws(()=>templateForContract(null),/قالب/);
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

test('custom contract type saves as a draft and remains absent from new-contract picker',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target,{suggestion:[{title:'بند',text:'نص {{tenant_name}}'}]});const form=manager.form,controls=all(form),kind=controls.find(x=>x.tag==='select');kind.value='custom';kind.onchange();const inputs=all(form).filter(x=>x.tag==='input');inputs.find(x=>x.maxLength===80).value='عقد محل خاص';inputs.find(x=>x.maxLength===200).value='نموذج المحل';
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
