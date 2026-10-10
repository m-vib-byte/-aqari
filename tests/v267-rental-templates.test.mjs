import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {groupRentalContractsByProperty} from '../src/v267/domain/rental-document-cycle.js';
import {documentTemplateBlueprints,mountRentalTemplatePicker,mountRentalTemplateManager,mountTemplateFields,createTemplateDraftSaver,readTemplateEditorText,templateForContract,requireContractIdentity,validTemplate} from '../src/v267/components/rental-templates.js';

class El{
 constructor(tag){this.tag=tag;this.children=[];this.value='';this.disabled=false;this.checked=false;this.hidden=false;this.textContent='';this.className='';this.style={};this.dataset={};this.classList={add:name=>{this.className+=' '+name;},remove:name=>{this.className=this.className.split(' ').filter(x=>x!==name).join(' ');}};}
 append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
 prepend(...children){for(const child of children.reverse()){child.parent=this;this.children.unshift(child);}}
 replaceChildren(...children){this.children=[];this.append(...children);}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
 replaceWith(other){const index=this.parent?.children.indexOf(this);if(index>=0){other.parent=this.parent;this.parent.children[index]=other;}}
 contains(other){return all(this).includes(other);}
 setAttribute(key,value){this[key]=value;}
 hasAttribute(key){return this[key]!==undefined;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 querySelectorAll(selector){const matches=(el,s)=>s.startsWith('.')?el.className.split(' ').includes(s.slice(1)):s==='[contenteditable]'?el.contentEditable!==undefined:el.tag===s;return all(this).slice(1).filter(el=>selector.split(',').some(s=>matches(el,s)));}
 reportValidity(){return true;}
 focus(){globalThis.document.activeElement=this;}
 scrollIntoView(){this.scrolled=true;}
 click(){this.clicked=true;}
}
const all=e=>[e,...e.children.flatMap(all)];
const clone=x=>JSON.parse(JSON.stringify(x));
const template={id:'76610000-0000-4000-8000-000000000011',kind:'apartment',kind_label:'عقد شقة',version:1,title:'قالب اختبار',fields:[],clauses:[{title:'اختبار',text:'نص محفوظ <untrusted>'}],content_sha256:'a'.repeat(64),published_at:'2026-09-13T00:00:00.000000Z'};

test('cached template print invokes the viewer within the click task',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target);
 manager.openEditor({title:'نموذج',clauses:[{title:'بند',text:'نص'}]});
 await button(manager.form,'معاينة النسخة النهائية').onclick();
 let prints=0;const frame=all(manager.form).find(el=>el.tag==='iframe');frame.contentWindow={focus(){},print(){prints++;}};
 const pending=button(manager.form,'طباعة PDF').onclick();
 assert.equal(prints,1,'cached PDF printing must not yield before calling the native viewer');await pending;
 assert.equal(f.state.calls.some(x=>x.p_action==='publish'||x.p_action==='save_draft'),false);manager.current.saver.dispose();
});

test('silent native PDF print retains a visible manual printing path',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target);
 manager.openEditor({title:'نموذج',clauses:[{title:'بند',text:'نص'}]});await button(manager.form,'معاينة النسخة النهائية').onclick();
 const frame=all(manager.form).find(el=>el.tag==='iframe');frame.contentWindow={focus(){},print(){}};
 await button(manager.form,'طباعة PDF').onclick();assert.match(f.d.status.textContent,/فتح جميع صفحات PDF في تبويب مستقل/);
 assert.ok(all(manager.form).some(el=>el.tag==='a'&&el.textContent==='فتح جميع صفحات PDF في تبويب مستقل'));
 manager.current.saver.dispose();
});

function setup({manager=false,items=[template],drafts=[]}={}){
 const created=[];globalThis.document={createElement:tag=>{const el=new El(tag);created.push(el);return el;}};
 globalThis.window={AQARI_SUPABASE:{getSession:async()=>({access_token:'a.b.c'})}};
 globalThis.fetch=async()=>new Response(new Blob(['%PDF-1.7 preview'],{type:'application/pdf'}),{status:200,headers:{'content-type':'application/pdf'}});
 if(!URL.createObjectURL)URL.createObjectURL=()=> 'blob:test';if(!URL.revokeObjectURL)URL.revokeObjectURL=()=>{};
 const state={manager,items:clone(items),drafts:clone(drafts),calls:[],failOnce:false,failReadOnce:false};
 const d={status:new El('p'),onDispose(){},setBeforeClose(fn){this.beforeClose=fn;},run:fn=>Promise.resolve().then(fn),session:{bound:{workspace:'test-workspace',user:'test-user'},check(){},request:async p=>p,operation:async fn=>fn(new AbortController().signal),client:{auth:{getSession:async()=>({data:{session:{access_token:'a.b.c',user:{id:'test-user'}}}})},async rpc(name,args){assert.equal(name,'aqari_rental_templates');state.calls.push(clone(args));const base={workspace_id:'test-workspace',user_id:'test-user'};
  if(args.p_action==='context')return {...base,can_publish:state.manager,items:clone(state.items),drafts:state.manager?clone(state.drafts):[]};
  if(args.p_action==='save_draft'){const p=args.p_data;let row=state.drafts.find(x=>x.id===p.id);const next={...p,revision:(row?.revision||0)+1,status:'draft'};delete next.request_id;if(row)Object.assign(row,next);else state.drafts.push(next);return {...base,record:clone(next)};}
  if(args.p_action==='publish'){const p=args.p_data;let saved=state.items.find(r=>r.id===p.id);if(!saved){saved={id:p.id,family_id:p.family_id,...(p.presentation?{presentation:p.presentation}:{}),kind:p.kind,kind_label:p.kind_label,version:p.expected_version+1,title:p.title,fields:p.fields,clauses:p.clauses,content_sha256:'b'.repeat(64),published_at:'2026-09-20T00:00:00.000000Z'};state.items.push(saved);}if(state.failOnce){state.failOnce=false;throw Error('lost publication reply');}return {...base,record:clone(saved)};}
  if(args.p_action==='get'){if(state.failReadOnce){state.failReadOnce=false;throw Error('lost readback');}return {...base,record:clone(state.items.find(r=>r.id===args.p_data.id))};}
 }}}};return {d,state,created,target:new El('section')};
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
 const f=setup({manager:true,items:[]});await mountRentalTemplateManager(f.d,f.target);assert.ok(all(f.target).some(x=>x.textContent==='إضافة نموذج'));assert.equal(f.state.calls.filter(x=>x.p_action==='publish').length,0);
});

test('five independent document blueprints contain only empty field definitions',()=>{
 assert.deepEqual(documentTemplateBlueprints.map(x=>x.label),['نموذج عقد إيجار','نموذج استلام الوحدة / الشقة','نموذج وصل إيجار','تعهد / قرار الإخلاء من المستأجر','براءة ذمة ومخالصة نهائية من مالك العقار']);
 assert.equal(new Set(documentTemplateBlueprints.map(x=>x.kind)).size,5);
 for(const blueprint of documentTemplateBlueprints){assert.ok(blueprint.fields.length>0);assert.equal(new Set(blueprint.fields.map(x=>x.key)).size,blueprint.fields.length);for(const spec of blueprint.fields){assert.equal(typeof spec.required,'boolean');assert.equal(typeof spec.label,'string');assert.ok(['text','date','number','money'].includes(spec.type));assert.equal('value' in spec,false);assert.match(spec.key,/^[a-z][a-z0-9_]{1,49}$/);}}
});

test('non-contract document templates never appear in new-contract picker',async()=>{
 const receipt={...template,id:'76610000-0000-4000-8000-000000000012',kind:'rent_receipt',kind_label:'نموذج وصل إيجار'};const release={...receipt,id:'tenant-release-id',kind:'tenant_final_release',kind_label:'إقرار المستأجر'};const f=setup({items:[template,receipt,release]});await mountRentalTemplatePicker(f.d,f.target);const options=all(f.target).filter(x=>x.tag==='option');assert.ok(options.some(x=>x.value==='apartment'));assert.equal(options.some(x=>x.value==='rent_receipt'),false);assert.equal(options.some(x=>x.value==='tenant_final_release'),false);
});

test('template studio inputs keep explicit high-contrast text, placeholders and focus colors',()=>{
 const css=readFileSync(new URL('../src/v267/styles/contract-template-studio.css',import.meta.url),'utf8');assert.match(css,/\.aq267-template-studio :is\(input,textarea,select\)\{[^}]*color:#2b2119!important[^}]*background:#fff!important/);assert.match(css,/::placeholder\{color:#746252!important;opacity:1!important\}/);assert.match(css,/:focus\{border-color:#7a5426!important/);
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


const button=(root,label)=>all(root).find(el=>el.tag==='button'&&el.textContent===label);
const namedInput=root=>all(root).find(el=>el.tag==='input'&&el.maxLength===200);

test('opening a legacy shop draft preserves all 36 clauses in its original single block and never saves',async()=>{
 const original={id:'shop-original',revision:4,kind:'custom-shop-old',kind_label:'  عقد محل  ',title:'  الأصل  ',fields:[{key:'field_name',label:'بيانات',type:'text',required:true}],clauses:[{title:' العقد الأصلي ',text:Array.from({length:36},(_,i)=>`البند ${i+1}: نص أصلي طويل للمراجعة والحفظ دون تغيير الصياغة {{field_name}} \n`).join('')}]};
 const f=setup({manager:true,items:[],drafts:[original]}),manager=await mountRentalTemplateManager(f.d,f.target);manager.openEditor(original);await manager.current.saver.flush();const active=manager.current.data();assert.deepEqual(active.clauses,original.clauses);assert.deepEqual(active.fields,original.fields);assert.equal(active.kind,original.kind);assert.equal(active.kind_label,original.kind_label);assert.equal(active.title,original.title);assert.equal('presentation' in active,false);assert.equal(f.state.calls.some(x=>x.p_action!=='context'),false);
 assert.ok(all(manager.form).some(x=>x.className.includes('aq267-template-chip')&&x.textContent==='حقل يحتاج تحديد'));assert.equal(all(manager.form).some(x=>x.textContent.includes('{{field_name}}')),false);assert.ok(all(manager.form).filter(x=>x.className==='aq267-a4-sheet').length>1);manager.current.saver.dispose();
});

test('draft autosave starts only on a genuine edit and permits incomplete legacy fields',async()=>{
 const original={id:'legacy',revision:4,kind:'custom-old',kind_label:'عقد',title:'',fields:[{key:'field_name',label:'بيانات',type:'text',required:true}],clauses:[{title:'بند',text:'نص {{field_name}}'}]};const f=setup({manager:true,items:[],drafts:[original]}),manager=await mountRentalTemplateManager(f.d,f.target);manager.openEditor(original);await manager.current.saver.flush();assert.equal(f.state.calls.length,1);const name=namedInput(manager.form);name.value='عنوان محدث';name.oninput();await manager.current.saver.flush();const writes=f.state.calls.filter(x=>x.p_action==='save_draft');assert.equal(writes.length,1);assert.equal(writes[0].p_data.revision,4);assert.deepEqual(writes[0].p_data.clauses,original.clauses);assert.equal(writes[0].p_data.title,'عنوان محدث');await assert.rejects(button(manager.form,'معاينة النسخة النهائية').onclick());assert.equal(f.state.calls.some(x=>x.p_action==='publish'),false);manager.current.saver.dispose();
});

test('a selected legacy chip is replaced with a human field without changing surrounding wording',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target);manager.openEditor({clauses:[{title:'بند',text:' قبل {{field_name}} بعد '}]});const chip=all(manager.form).find(x=>x._templateToken==='{{field_name}}');chip.onclick();const picker=all(manager.form).find(x=>x.tag==='select'&&x.children.some(o=>o.textContent==='اختر المعلومة'));picker.value='tenant_civil_id';picker.onchange();button(manager.form,'إدراج في النص').onclick();assert.equal(manager.current.data().clauses[0].text,' قبل {{tenant_civil_id}} بعد ');assert.equal(all(manager.form).some(x=>x.textContent.includes('tenant_civil_id')),false);manager.current.saver.dispose();
});

test('field placement, language, logo and signer changes are additive and preserve original wording',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target);manager.openEditor({clauses:[{title:'أصل',text:'نص ثابت لا يتغير'}]});const before=clone(manager.current.data().clauses),picker=all(manager.form).find(x=>x.tag==='select'&&x.children.some(o=>o.textContent==='اختر المعلومة'));picker.value='tenant_name';picker.onchange();button(manager.form,'وضع الحقل على الصفحة').onclick();const state=manager.current.data();assert.equal(state.presentation.placements.length,1);assert.equal(state.presentation.placements[0].field_key,'tenant_name');assert.deepEqual(state.clauses,before);assert.equal(state.presentation.signers.owner.fingerprint,true);assert.equal(state.presentation.signers.tenant.fingerprint,true);manager.current.saver.dispose();
});

test('final preview embeds the same PDF blob used for download and edit invalidates approval',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target);manager.openEditor({title:'نموذج',clauses:[{title:'بند',text:'النص الأصلي'}]});let requests=0;globalThis.fetch=async()=>{requests++;return new Response(new Blob(['%PDF-1.7 exact'],{type:'application/pdf'}),{headers:{'content-type':'application/pdf'}});};await button(manager.form,'معاينة النسخة النهائية').onclick();const frame=all(manager.form).find(x=>x.tag==='iframe');assert.ok(frame.src.startsWith('blob:'));await button(manager.form,'تحميل PDF').onclick();const downloaded=f.created.find(x=>x.tag==='a'&&x.download?.endsWith('.pdf'));assert.equal(downloaded.href,frame.src);assert.equal(requests,1);assert.ok(button(manager.form,'اعتماد هذا النموذج نهائيًا'));const name=namedInput(manager.form);name.value='تعديل';name.oninput();assert.equal(all(manager.form).find(x=>x.className==='aq267-template-approval').hidden,true);assert.equal(button(manager.form,'تحميل PDF').disabled,false);assert.equal(f.state.calls.some(x=>x.p_action==='publish'),false);manager.current.saver.dispose();
});

test('independent copies get a new identity and family without rewriting original clauses',async()=>{
 const row={...template,family_id:'original-family'},f=setup({manager:true,items:[row]}),manager=await mountRentalTemplateManager(f.d,f.target);button(f.target,'نسخ كنموذج مستقل').onclick();const active=manager.current.data();assert.notEqual(active.id,row.id);assert.equal(active.family_id,active.id);assert.deepEqual(active.clauses,row.clauses);assert.equal(f.state.calls.some(x=>x.p_action!=='context'),false);manager.current.saver.dispose();
});

test('serialized autosave keeps typing during an in-flight request and uses returned revision',async()=>{
 let revision=1,value='first',release;const requests=[];const saver=createTemplateDraftSaver({delay:10000,read:()=>({id:'one',revision,value}),write:async payload=>{requests.push(clone(payload));if(requests.length===1)await new Promise(resolve=>release=resolve);return {revision:payload.revision+1};},onSaved:row=>revision=row.revision});saver.changed();const running=saver.flush();await Promise.resolve();value='second';saver.changed();release();await running;assert.deepEqual(requests.map(row=>[row.revision,row.value]),[[1,'first'],[2,'second']]);assert.equal(saver.dirty,false);saver.dispose();
});

test('retry uses the exact failed request then saves newer edits rather than discarding them',async()=>{
 let revision=1,value='first',fail=true;const requests=[];const saver=createTemplateDraftSaver({delay:10000,read:()=>({id:'one',revision,value}),write:async payload=>{requests.push(clone(payload));if(fail){fail=false;throw Error('lost reply');}return {revision:payload.revision+1};},onSaved:row=>revision=row.revision});saver.changed();await assert.rejects(saver.flush(),/lost reply/);value='newer';saver.changed();await saver.flush();assert.deepEqual(requests[0],requests[1]);assert.equal(requests[2].value,'newer');assert.equal(requests[2].revision,2);saver.dispose();
});

test('conflict leaves edits dirty and page close guard retains unsaved work',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target);manager.openEditor();namedInput(manager.form).value='عمل غير محفوظ';namedInput(manager.form).oninput();const original=f.d.session.client.rpc;f.d.session.client.rpc=async(name,args)=>{if(args.p_action==='save_draft')throw Error('revision conflict');return original(name,args);};await assert.rejects(f.d.beforeClose(),/revision conflict/);assert.equal(manager.current.data().title,'عمل غير محفوظ');assert.equal(manager.current.saver.dirty,true);manager.current.saver.dispose();
});


test('final approval needs the same reviewed PDF, explicit checkbox and reason; lost reply retries once',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target);manager.openEditor({title:'نموذج نهائي',clauses:[{title:'بند',text:'نص المالك المحفوظ'}]});assert.equal(button(manager.form,'اعتماد هذا النموذج نهائيًا'),undefined);await button(manager.form,'معاينة النسخة النهائية').onclick();const approval=all(manager.form).find(x=>x.className==='aq267-template-approval'),publish=button(approval,'اعتماد هذا النموذج نهائيًا');await assert.rejects(publish.onclick(),/أكد المراجعة/);all(approval).find(x=>x.type==='checkbox').checked=true;all(approval).find(x=>x.tag==='textarea').value='راجعت النسخة المعروضة';f.state.failOnce=true;await assert.rejects(publish.onclick(),/lost publication/);await publish.onclick();const writes=f.state.calls.filter(x=>x.p_action==='publish');assert.equal(writes.length,2);assert.deepEqual(writes[0].p_data,writes[1].p_data);assert.equal(f.state.items.length,1);assert.ok(f.state.calls.some(x=>x.p_action==='get'));manager.current.saver.dispose();
});

test('revision conflict recovery saves an independent copy and retains the latest edits',async()=>{
 const original={id:'conflicted',revision:3,family_id:'old-family',kind:'rental_agreement',kind_label:'نموذج',title:'الأصل',fields:[],clauses:[{title:'بند',text:'نص محفوظ'}]},f=setup({manager:true,items:[],drafts:[original]}),manager=await mountRentalTemplateManager(f.d,f.target);manager.openEditor(original);const name=namedInput(manager.form);name.value='آخر تعديل';name.oninput();const rpc=f.d.session.client.rpc;f.d.session.client.rpc=async(name,args)=>{if(args.p_action==='save_draft'&&args.p_data.id==='conflicted')throw Error('revision conflict');return rpc(name,args);};await assert.rejects(manager.current.saver.flush());await button(manager.form,'حفظ نسخة مستقلة').onclick();const saved=f.state.drafts.find(x=>x.id!=='conflicted');assert.ok(saved);assert.equal(saved.family_id,saved.id);assert.equal(saved.title,'آخر تعديل');assert.deepEqual(saved.clauses,original.clauses);assert.equal(f.state.drafts.find(x=>x.id==='conflicted').title,'الأصل');manager.current.saver.dispose();
});

test('catalog civil ID insertion reuses legacy alias without duplicate semantic fields',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target);manager.openEditor({title:'قديم',fields:[{key:'civil_id',label:'الرقم المدني',type:'text',required:true}],clauses:[{title:'بند',text:'  نص  '}]});const picker=all(manager.form).find(x=>x.tag==='select'&&x.children.some(o=>o.textContent==='اختر المعلومة'));picker.value='tenant_civil_id';picker.onchange();button(manager.form,'إدراج في النص').onclick();assert.equal(manager.current.data().fields.length,1);assert.equal(manager.current.data().clauses[0].text,'  نص  {{civil_id}}');manager.current.saver.dispose();
});


test('A4 fits the available width with tools collapsed; zoom and focus never edit or save',async()=>{
 const original={id:'a4-preserved',revision:2,kind:'rental_agreement',title:'محفوظ',fields:[],clauses:[{title:'بند أصلي',text:'نص ثابت لا يتغير'}]},f=setup({manager:true,items:[],drafts:[original]}),manager=await mountRentalTemplateManager(f.d,f.target);manager.openEditor(original);const before=clone(manager.current.data()),paper=all(manager.form).find(x=>x.className==='aq267-a4-sheet'),text=all(manager.form).find(x=>x.className==='aq267-a4-clause-text'),zoom=all(f.target).find(x=>x.name==='paper_zoom');assert.equal(zoom.value,'fit');assert.equal(paper.style.transform,'scale(1)');assert.ok(manager.form.className.includes('is-paper-focused'));assert.ok(button(f.target,'إظهار أدوات التحرير'));
 for(const value of ['125','150','fit','actual']){zoom.value=value;zoom.onchange();assert.strictEqual(all(manager.form).find(x=>x.className==='aq267-a4-clause-text'),text);assert.deepEqual(manager.current.data(),before);}
 button(f.target,'إظهار أدوات التحرير').onclick();assert.equal(manager.form.className.includes('is-paper-focused'),false);button(f.target,'تكبير مساحة العقد').onclick();assert.ok(manager.form.className.includes('is-paper-focused'));assert.equal(manager.current.saver.dirty,false);await manager.current.saver.flush();assert.equal(f.state.calls.some(x=>x.p_action!=='context'),false);manager.current.saver.dispose();
});

test('Arabic, English and bilingual custom field names save under stable generated identifiers',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target);manager.openEditor({title:'حقول خاصة',fields:[],clauses:[{title:'النص',text:'وصف: '}]});const labels=['وصف الملحق','Annex description','اسم المرافق / Facility name'];for(const label of labels){const name=all(manager.form).find(x=>x.name==='custom_field_label');name.value=label;button(manager.form,'إضافة معلومة خاصة').onclick();}const initial=clone(manager.current.data().fields);assert.deepEqual(initial.map(x=>x.label),labels);for(const spec of initial){assert.match(spec.key,/^custom_[a-f0-9]{16}$/);assert.deepEqual(Object.keys(spec).sort(),['key','label','required','type']);}
 const lastKey=initial[2].key;button(manager.form,'إدراج في النص').onclick();const clauses=clone(manager.current.data().clauses),row=all(manager.form).filter(x=>x.className.includes('aq267-custom-field'))[2],label=all(row).find(x=>x.name==='saved_field_label'),type=all(row).find(x=>x.name==='saved_field_type'),required=all(row).find(x=>x.type==='checkbox');label.value='الاسم المعدّل / Updated name';label.oninput();type.value='number';type.onchange();required.checked=false;required.onchange();await manager.current.saver.flush();const saved=f.state.drafts[0],custom=saved.fields.find(x=>x.key===lastKey);assert.deepEqual(custom,{key:lastKey,label:'الاسم المعدّل / Updated name',type:'number',required:false});assert.deepEqual(saved.clauses,clauses);assert.ok(saved.clauses[0].text.includes('{{'+lastKey+'}}'));assert.equal(f.state.calls.some(x=>x.p_action==='publish'),false);manager.current.saver.dispose();
});

test('existing custom field names containing slashes remain byte-exact on open',async()=>{
 const fields=[{key:'custom_original_name',label:'  الملحق / Existing / Name  ',type:'text',required:false}],original={id:'custom-preserved',revision:7,kind:'rental_agreement',title:'قديم',fields,clauses:[{title:'بند',text:'{{custom_original_name}}'}]},f=setup({manager:true,items:[],drafts:[original]}),manager=await mountRentalTemplateManager(f.d,f.target);manager.openEditor(original);assert.deepEqual(manager.current.data().fields,fields);const label=all(manager.form).find(x=>x.name==='saved_field_label');assert.equal(label.value,fields[0].label);await manager.current.saver.flush();assert.equal(f.state.calls.some(x=>x.p_action!=='context'),false);manager.current.saver.dispose();
});

test('ten starter drafts open independently in memory and only explicit save creates a draft',async()=>{
 const original={id:'existing-owner-draft',revision:4,kind:'custom-original',title:'الأصل',fields:[],clauses:[{title:'محفوظ',text:'النص الأصلي الكامل'}]},f=setup({manager:true,items:[],drafts:[original]}),manager=await mountRentalTemplateManager(f.d,f.target);const cards=all(f.target).filter(x=>x.className==='aq267-template-starter-card');assert.equal(cards.length,10);assert.ok(all(f.target).some(x=>x.textContent==='مسودات جاهزة للبدء'));const ids=new Set();
 for(let index=0;index<cards.length;index++){const card=all(f.target).filter(x=>x.className==='aq267-template-starter-card')[index];button(card,'استخدام النموذج').onclick();const current=manager.current.data();assert.notEqual(current.id,original.id);assert.equal(current.family_id,current.id);assert.equal(ids.has(current.id),false);ids.add(current.id);assert.ok(current.fields.length>0);assert.ok(current.clauses.length>0);assert.equal(manager.current.saver.dirty,false);await button(f.target,'مكتبة النماذج').onclick();}
 assert.equal(f.state.calls.some(x=>x.p_action!=='context'),false);assert.deepEqual(f.state.drafts,[original]);button(all(f.target).find(x=>x.className==='aq267-template-starter-card'),'استخدام النموذج').onclick();const newId=manager.current.data().id;assert.equal(ids.has(newId),false);await button(manager.form,'حفظ الآن').onclick();assert.equal(f.state.drafts.length,2);assert.equal(f.state.drafts[1].id,newId);assert.deepEqual(f.state.drafts[0],original);assert.equal(f.state.calls.some(x=>x.p_action==='publish'),false);manager.current.saver.dispose();
});

test('final preview reveals required editor fields before native validation without saving',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target);manager.openEditor();const before=clone(manager.current.data());assert.ok(manager.form.className.includes('is-paper-focused'));manager.form.checkValidity=()=>false;let checked=false;manager.form.reportValidity=()=>{checked=true;assert.equal(manager.form.className.includes('is-paper-focused'),false);return false;};await assert.rejects(button(manager.form,'معاينة النسخة النهائية').onclick(),/أكمل الحقول/);assert.equal(checked,true);assert.deepEqual(manager.current.data(),before);assert.equal(manager.current.saver.dirty,false);assert.equal(f.state.calls.some(x=>x.p_action!=='context'),false);manager.current.saver.dispose();
});


test('clearing a custom label never queues an invalid draft and valid refill saves under the same key',async()=>{
 const original={id:'label-edit',revision:4,kind:'rental_agreement',title:'نموذج',fields:[{key:'custom_stable_label',label:'الاسم السابق / Old name',type:'text',required:false}],clauses:[{title:'بند',text:'{{custom_stable_label}}'}]},f=setup({manager:true,items:[],drafts:[original]}),manager=await mountRentalTemplateManager(f.d,f.target);manager.openEditor(original);const label=all(manager.form).find(x=>x.name==='saved_field_label');label.setCustomValidity=message=>{label.validationMessage=message;};
 const rpc=f.d.session.client.rpc;f.d.session.client.rpc=async(name,args)=>{if(args.p_action==='save_draft')assert.ok(args.p_data.fields.every(spec=>spec.label.trim()),'No invalid label reaches autosave');return rpc(name,args);};
 for(const invalid of ['','   ']){label.value=invalid;label.oninput();assert.ok(label.validationMessage);assert.equal(manager.current.data().fields[0].label,original.fields[0].label);assert.equal(manager.current.saver.dirty,false);await manager.current.saver.flush();}
 assert.equal(f.state.calls.some(x=>x.p_action==='save_draft'),false);label.value='  الاسم الجديد / New name  ';label.oninput();assert.equal(label.validationMessage,'');await manager.current.saver.flush();const saved=f.state.drafts.find(x=>x.id===original.id);assert.equal(saved.fields[0].key,'custom_stable_label');assert.equal(saved.fields[0].label,'  الاسم الجديد / New name  ');assert.deepEqual(saved.clauses,original.clauses);assert.equal(manager.current.saver.dirty,false);assert.equal(f.state.calls.filter(x=>x.p_action==='save_draft').length,1);manager.current.saver.dispose();
});

test('contracts home keeps the editable library and separates property PDF archive upload',async()=>{
 const f=setup({manager:true,items:[]});
 globalThis.document.head=new El('head');globalThis.document.getElementById=()=>null;f.d.el=new El('main');f.d.body=f.target;f.d.session.bound.role='general_manager';f.d.close=()=>{};
 let uploadTask,contractTask,closed=false,opened=0,received=null,libraryOpened=false;
 f.d.run=fn=>{uploadTask=Promise.resolve().then(fn);return uploadTask;};
 const contracts={el:new El('main'),body:new El('div'),status:new El('p'),close(){closed=true;},run(fn){contractTask=Promise.resolve().then(fn);return contractTask;},navigate(fn){return this.run(fn);},session:{bound:{...f.d.session.bound},check(){assert.equal(closed,false);},request:async p=>p,client:{rpc(name){assert.equal(name,'aqari_read_state_v267');return {workspace_id:'test-workspace',payload:{contractsV202:[]}};},from(){return {select(){return this;},eq(){return this;},order(){return this;},range(){return Promise.resolve([]);}};}}}};
 const node=(tag,text)=>{const el=globalThis.document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
 const context={crypto,window:{AQARI_RENTAL_RECORDS:{primary:value=>value}},document:globalThis.document,node,translateStatic:value=>value,t:value=>value,groupRentalContractsByProperty,createTemplateLogoContext:()=>({listProperties:async()=>[]}),field:(label,control)=>control,mountRentalTemplateManager:async(_d,_target,options)=>{libraryOpened=true;received=options;return {setSection(){},setProperty(){}};},mountPropertyContractUpload:async(_d,_target,options)=>{received=options;},createPage:()=>++opened===1?contracts:f.d,createPrivateUrls:()=>({clear(){}}),guardPageImport:fn=>fn(),loadTemplates:async()=>({openContractTemplates:context.openContractTemplates})};
 const clean=file=>readFileSync(new URL(file,import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
 vm.runInNewContext(clean('../src/v267/pages/contract-templates.js'),context);
 vm.runInNewContext(clean('../src/v267/pages/rental-contracts.js').replace("import('./contract-templates.js')",'loadTemplates()'),context);
 context.openRentalContracts({});await contractTask;
 const entry=button(contracts.body,'فتح مكتبة النماذج والحقول الخاصة');assert.ok(entry);await entry.onclick();await uploadTask;
 assert.equal(closed,true);assert.equal(libraryOpened,true);assert.equal(received.propertyId,null);assert.equal(typeof received.onBack,'function');assert.ok(button(f.target,'رفع عقد جاهز'));await button(f.target,'رفع عقد جاهز').onclick();await uploadTask;assert.equal(received.propertyId,null);assert.equal(typeof received.onBack,'function');assert.equal(f.state.calls.some(call=>call.p_action!=='context'),false);
});

test('read-only template views do not offer the custom field editing shortcut',async()=>{
 const f=setup({manager:true}),manager=await mountRentalTemplateManager(f.d,f.target);manager.openEditor(template,{readonly:true});assert.equal(button(f.target,'إدراج حقل'),undefined);await manager.current.saver.flush();assert.equal(f.state.calls.some(call=>call.p_action!=='context'),false);manager.current.saver.dispose();
});


test('format controls persist typography and reopen it without rewriting 36 original provisions',async()=>{
 const clauses=[{title:'عقد محفوظ',text:Array.from({length:36},(_,i)=>`${i+1}- البند الأصلي رقم ${i+1}\n`).join('')}],original={id:'format-preserve',revision:7,kind:'rental_agreement',title:'الأصل',fields:[],clauses},f=setup({manager:true,items:[],drafts:[original]}),manager=await mountRentalTemplateManager(f.d,f.target);manager.openEditor(original);
 const initial=clone(manager.current.data());assert.equal(initial.presentation,undefined);assert.equal(manager.current.saver.dirty,false);
 const controls=Object.fromEntries(all(manager.form).filter(x=>x.name?.startsWith('document_')).map(x=>[x.name,x]));
 for(const [key,value]of Object.entries({document_font:'16',document_leading:'2',document_alignment:'justify',document_margins:'25'})){controls[key].value=value;controls[key].onchange();}
 assert.deepEqual(manager.current.data().clauses,clauses);assert.deepEqual(manager.current.data().fields,[]);await manager.current.saver.flush();
 const saved=clone(f.state.drafts[0]);assert.deepEqual(saved.presentation.typography,{font_pt:16,line_height:2,alignment:'justify',margin_mm:25});assert.deepEqual(saved.clauses,clauses);
 manager.openEditor(saved);for(const [key,value]of Object.entries({document_font:'16',document_leading:'2',document_alignment:'justify',document_margins:'25'}))assert.equal(all(manager.form).find(x=>x.name===key).value,value);
 assert.equal(manager.current.saver.dirty,false);assert.equal(f.state.calls.some(x=>x.p_action==='publish'),false);manager.current.saver.dispose();
});

test('editor actions precede the sheets and repagination preserves long text and unresolved fields without saving',async()=>{
 const text=Array.from({length:36},(_,i)=>`${i+1}- نص أصلي {{field_name}} عربي English `.repeat(4)).join('\n'),f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target);manager.openEditor({title:'محل',fields:[],clauses:[{title:'العقد',text}]});
 const form=manager.form,actions=form.children.findIndex(x=>x.className==='aq267-editor-header'),work=form.children.findIndex(x=>x.className==='aq267-template-workbench');assert.ok(actions>=0&&actions<work);assert.ok(all(form.children[actions]).some(x=>x.className==='aq267-template-actions'));assert.ok(all(form).find(x=>x.className==='aq267-template-tools').children.some(x=>x.className==='aq267-template-identity'));assert.ok(all(form).filter(x=>x.className==='aq267-a4-sheet').length>1);
 assert.equal(all(form).filter(x=>x.className==='aq267-a4-clause-text').map(readTemplateEditorText).join(''),text);button(form,'توزيع الصفحات').onclick();assert.equal(manager.current.data().clauses[0].text,text);assert.equal(manager.current.saver.dirty,false);assert.equal(f.state.calls.length,1);manager.current.saver.dispose();
});

test('readonly versions allow display zoom and page arrangement but disable stored typography edits',async()=>{
 const f=setup({manager:true}),manager=await mountRentalTemplateManager(f.d,f.target);manager.openEditor(template,{readonly:true});assert.equal(all(manager.form).find(x=>x.name==='paper_zoom').disabled,false);assert.equal(button(manager.form,'توزيع الصفحات').disabled,false);assert.equal(button(manager.form,'مكتبة النماذج').disabled,false);assert.equal(button(manager.form,'إظهار أدوات التحرير').disabled,false);assert.equal(all(manager.form).find(x=>x.name==='document_font').disabled,true);manager.current.saver.dispose();
});

test('mobile preview activation is deduplicated and offers an inline retry after a failed PDF request',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target);manager.openEditor({title:'نموذج',clauses:[{title:'بند',text:'نص'}]});let requests=0;globalThis.fetch=async()=>{requests++;if(requests===1)return new Response('unavailable',{status:503});return new Response(new Blob(['%PDF-1.7 retry'],{type:'application/pdf'}),{headers:{'content-type':'application/pdf'}});};
 const preview=button(manager.form,'معاينة النسخة النهائية');await assert.rejects(preview.onpointerup({type:'pointerup',pointerType:'touch'}),/تعذر إنشاء PDF/);await preview.onclick({type:'click'});assert.equal(requests,1);const retry=button(manager.form,'إعادة محاولة المعاينة');assert.ok(retry);await retry.onclick();assert.equal(requests,2);assert.ok(all(manager.form).find(el=>el.tag==='iframe'));manager.current.saver.dispose();
});


test('reference workspace reuses a published template without editing the stored original or inventing saved placeholders',async()=>{
 const f=setup({manager:true}),before=clone(f.state.items),manager=await mountRentalTemplateManager(f.d,f.target,{section:'contracts',referenceLayout:true});
 assert.equal(all(f.target).filter(x=>x.className==='aq267-linked-document-row').length,0);
 assert.equal(all(f.target).filter(x=>x.className==='aq267-state-approved').length,1);
 assert.ok(all(f.target).every(x=>!x.textContent.includes('فعّال')));
 assert.equal(all(f.target).filter(x=>x.className.includes('aq267-template-card-empty')).length,1);
 button(f.target,'استخدام النموذج').onclick();
 assert.notEqual(manager.current.data().id,template.id);assert.deepEqual(manager.current.data().clauses,template.clauses);
 assert.deepEqual(f.state.items,before);assert.ok(f.state.calls.every(call=>call.p_action==='context'));manager.current.saver.dispose();
});


test('reference sections separate document and employee starters and stored models',async()=>{
 const employee={...template,id:'salary-id',kind:'salary_voucher',title:'سند محفوظ'},document={...template,id:'receipt-id',kind:'rent_receipt',title:'وصل محفوظ'};
 const f=setup({manager:true,items:[template,employee,document]}),manager=await mountRentalTemplateManager(f.d,f.target,{section:'contracts',referenceLayout:true});
 const titles=()=>all(f.target).filter(x=>x.tag==='h4'||x.tag==='h5').map(x=>x.textContent);
 assert.ok(titles().includes(template.title));assert.ok(!titles().includes(employee.title));assert.ok(!titles().includes(document.title));
 manager.setSection('documents');assert.equal(all(f.target).filter(x=>x.className==='aq267-linked-document-row').length,5);assert.ok(titles().includes(document.title));assert.ok(!titles().includes(employee.title));assert.ok(!titles().includes('عقد العمل'));
 manager.setSection('employees');assert.equal(all(f.target).filter(x=>x.className==='aq267-linked-document-row').length,2);assert.ok(titles().includes(employee.title));assert.ok(titles().includes('عقد العمل'));assert.ok(!titles().includes(document.title));
 assert.ok(f.state.calls.every(call=>call.p_action==='context'));
});

test('download prepares PDF directly and rebuilds after edits without requiring preview',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target);manager.openEditor({title:'نموذج',clauses:[{title:'بند',text:'نص'}]});let requests=0;
 globalThis.fetch=async()=>{requests++;return new Response(new Blob(['%PDF-1.7 direct '+requests],{type:'application/pdf'}),{headers:{'content-type':'application/pdf'}});};
 assert.equal(button(manager.form,'تحميل PDF').disabled,false);await button(manager.form,'تحميل PDF').onclick();assert.equal(requests,1);const first=f.created.find(x=>x.tag==='a'&&x.clicked&&x.download?.endsWith('.pdf'));assert.ok(first);
 const name=namedInput(manager.form);name.value='تعديل';name.oninput();await button(manager.form,'تحميل PDF').onclick();assert.equal(requests,2);const downloads=f.created.filter(x=>x.tag==='a'&&x.clicked&&x.download?.endsWith('.pdf'));assert.equal(downloads.length,2);assert.notEqual(downloads[0].href,downloads[1].href);assert.equal(f.state.calls.some(x=>x.p_action==='publish'),false);manager.current.saver.dispose();
});

test('direct print reserves a mobile viewer, closes it on failure and permits retry',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target);manager.openEditor({title:'نموذج',clauses:[{title:'بند',text:'نص'}]});const popups=[];window.open=()=>{const popup={document:{body:{}},location:{replace(url){popup.url=url;}},close(){this.closed=true;}};popups.push(popup);return popup;};
 globalThis.fetch=async()=>new Response('unavailable',{status:503});await assert.rejects(button(manager.form,'طباعة PDF').onclick(),/تعذر إنشاء PDF/);assert.equal(popups[0].closed,true);assert.equal(button(manager.form,'طباعة PDF').disabled,false);
 globalThis.fetch=async()=>new Response(new Blob(['%PDF-1.7 print'],{type:'application/pdf'}),{headers:{'content-type':'application/pdf'}});await button(manager.form,'طباعة PDF').onclick();assert.ok(popups[1].url.startsWith('blob:'));assert.equal(popups[1].opener,null);assert.equal(f.state.calls.some(x=>x.p_action==='publish'),false);manager.current.saver.dispose();
});


test('blank shop draft explains the missing clause before PDF or save calls and directs editing',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target);manager.openEditor({kind:'commercial_lease',kind_label:'عقد محل',title:'عقد محل'});let requests=0;globalThis.fetch=async()=>{requests++;throw Error('empty preview must not reach server');};
 const before=clone(manager.current.data());await assert.rejects(button(manager.form,'تحميل PDF').onclick(),/عنوان البند رقم 1/);assert.equal(requests,0);assert.equal(f.state.calls.some(x=>x.p_action!=='context'),false);assert.deepEqual(manager.current.data(),before);
 button(manager.form,'كتابة عنوان البند').onclick();assert.equal(document.activeElement.name,'quick_clause_title');assert.equal(button(manager.form,'تحميل PDF').disabled,false);manager.current.saver.dispose();
});

test('a missing clause body is identified and API validation errors retain an actionable explanation',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target);manager.openEditor({title:'نموذج',clauses:[{title:'عنوان',text:''}]});await assert.rejects(button(manager.form,'تحميل PDF').onclick(),/نص البند رقم 1/);manager.current.saver.dispose();
 manager.openEditor({title:'نموذج',clauses:[{title:'عنوان',text:'نص تجريبي'}]});globalThis.fetch=async()=>new Response(JSON.stringify({error:'LAYOUT_COLLISION'}),{status:400,headers:{'content-type':'application/json'}});await assert.rejects(button(manager.form,'تحميل PDF').onclick(),/مواضع الحقول/);assert.ok(button(manager.form,'إعادة محاولة المعاينة'));manager.current.saver.dispose();
});



test('plain writing completes a blank employment draft and preserves exact text through save and PDF',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target);manager.openEditor({kind:'employment_contract',title:'عقد العمل'});
 button(manager.form,'كتابة نص النموذج').onclick();assert.ok(f.state.calls.every(call=>call.p_action==='context'));
 const title=all(manager.form).find(el=>el.name==='quick_clause_title'),body=all(manager.form).find(el=>el.name==='quick_clause_text');
 title.value='بيانات العمل';title.oninput();body.value='نص المستخدم الأصلي\nUser supplied text';body.oninput();
 assert.deepEqual(manager.current.data().clauses,[{title:title.value,text:body.value}]);
 await button(manager.form,'حفظ الآن').onclick();assert.deepEqual(f.state.drafts[0].clauses,manager.current.data().clauses);
 let sent;globalThis.fetch=async(_url,options)=>{sent=JSON.parse(options.body);return new Response(new Blob(['%PDF-1.7 completed'],{type:'application/pdf'}),{headers:{'content-type':'application/pdf'}});};
 await button(manager.form,'تحميل PDF').onclick();assert.deepEqual(sent.template.clauses,f.state.drafts[0].clauses);assert.ok(f.created.some(el=>el.tag==='a'&&el.clicked&&el.download?.endsWith('.pdf')));
 assert.equal(all(manager.form).find(el=>el.className==='aq267-template-quick-writer').hidden,true);assert.equal(f.state.calls.some(call=>call.p_action==='publish'),false);manager.current.saver.dispose();
 manager.openEditor(f.state.drafts[0]);button(manager.form,'كتابة نص النموذج').onclick();assert.equal(all(manager.form).find(el=>el.name==='quick_clause_text').value,body.value);manager.current.saver.dispose();
});

test('quick writing keeps tokens in the chip editor and is absent for read-only templates',async()=>{
 const f=setup({manager:true}),manager=await mountRentalTemplateManager(f.d,f.target);manager.openEditor({title:'نموذج',clauses:[{title:'بند',text:'{{tenant_name}}'}]});
 button(manager.form,'كتابة نص النموذج').onclick();assert.equal(all(manager.form).some(el=>el.name==='quick_clause_text'),false);assert.equal(document.activeElement._templateSource.part,'title');assert.equal(manager.current.saver.dirty,false);manager.current.saver.dispose();
 manager.openEditor(template,{readonly:true});assert.equal(button(manager.form,'كتابة نص النموذج'),undefined);manager.current.saver.dispose();
});
test('employee create opens populated employment draft and supports save and direct PDF',async()=>{
 const f=setup({manager:true,items:[]}),manager=await mountRentalTemplateManager(f.d,f.target,{section:'employees',referenceLayout:true});
 button(f.target,'إضافة نموذج').onclick();
 const draft=manager.current.data();
 assert.equal(draft.kind,'employment_contract');assert.ok(draft.clauses.length>=6);
 assert.ok(draft.clauses.every(c=>c.title.trim()&&c.text.trim()));
 assert.ok(draft.fields.some(f=>f.key==='basic_salary'));
 assert.ok(all(manager.form).some(el=>el.textContent==='الطرف الأول / صاحب العمل'));
 assert.ok(!all(manager.form).some(el=>el.textContent==='الطرف الثاني / المستأجر'));
 assert.ok(f.state.calls.every(call=>call.p_action==='context'));
 await button(manager.form,'حفظ الآن').onclick();
 assert.ok(f.state.calls.some(call=>call.p_action==='save_draft'));
 await button(manager.form,'تحميل PDF').onclick();
 assert.ok(f.created.some(el=>el.tag==='a'&&el.clicked&&el.download?.endsWith('.pdf')));
 manager.current.saver.dispose();
});
