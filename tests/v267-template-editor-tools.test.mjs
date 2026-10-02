import test from 'node:test';
import assert from 'node:assert/strict';
import {mountRentalTemplateManager,readTemplateEditorText} from '../src/v267/components/rental-templates.js';
import {defaultTemplatePresentation} from '../src/v267/domain/rental-document-layout.js';

// Minimal DOM, shared in shape with the studio integration tests. Geometry and
// actual pointer rendering are covered by the browser fixture, not this harness.
class El {
 constructor(tag){this.tag=tag;this.children=[];this.value='';this.disabled=false;this.checked=false;this.hidden=false;this.textContent='';this.className='';this.dataset={};this.style={setProperty(key,value){this[key]=value;}};this.classList={add:name=>{if(!this.className.split(' ').includes(name))this.className+=' '+name;},remove:name=>{this.className=this.className.split(' ').filter(x=>x!==name).join(' ');},contains:name=>this.className.split(' ').includes(name)};}
 append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
 prepend(...children){for(const child of children.reverse()){child.parent=this;this.children.unshift(child);}}
 after(other){const index=this.parent?.children.indexOf(this);if(index>=0){other.parent=this.parent;this.parent.children.splice(index+1,0,other);}}
 replaceChildren(...children){this.children=[];this.append(...children);}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
 replaceWith(other){const index=this.parent?.children.indexOf(this);if(index>=0){other.parent=this.parent;this.parent.children[index]=other;}}
 contains(other){return all(this).includes(other);}
 setAttribute(key,value){this[key]=String(value);}
 getAttribute(key){return this[key]??null;}
 hasAttribute(key){return this[key]!==undefined;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 querySelectorAll(selector){const matches=(el,s)=>s.startsWith('.')?el.className.split(' ').includes(s.slice(1)):s==='[contenteditable]'?el.contentEditable!==undefined:el.tag===s;return all(this).slice(1).filter(el=>selector.split(',').some(s=>matches(el,s)));}
 reportValidity(){return true;}
 focus(){globalThis.document.activeElement=this;}
 scrollIntoView(){this.scrolled=true;}
 click(){this.clicked=true;}
}
const all=element=>[element,...element.children.flatMap(all)];
const clone=value=>structuredClone(value);
const button=(root,label)=>all(root).find(el=>el.tag==='button'&&el.textContent===label);
const named=(root,name)=>all(root).find(el=>el.name===name);
const byClass=(root,name)=>all(root).filter(el=>el.className.split(' ').includes(name));
const draft=(extra={})=>({id:'76610000-0000-4000-8000-000000000019',revision:7,kind:'rental_agreement',kind_label:'عقد إيجار',title:'العقد المحفوظ',fields:[],clauses:[{title:'البند الأصلي',text:'نص محفوظ دون تغيير.'}],...extra});
const setValue=(root,name,value)=>{const control=named(root,name);assert.ok(control,name);control.value=value;control.onchange();return control;};
const writes=f=>f.state.calls.filter(call=>call.name==='aqari_rental_templates'&&call.args.p_action==='save_draft');

function fixture(t,{drafts=[],items=[],propertyId=null}={}){
 const previous={document:globalThis.document,window:globalThis.window,fetch:globalThis.fetch,selection:globalThis.getSelection};
 const created=[],dispose=[],state={drafts:clone(drafts),items:clone(items),calls:[],beforeSave:null};
 globalThis.document={createElement:tag=>{const el=new El(tag);created.push(el);return el;}};
 globalThis.window={AQARI_SUPABASE:{getSession:async()=>({access_token:'a.b.c'})}};
 delete globalThis.getSelection;
 globalThis.fetch=async()=>new Response(new Blob(['%PDF-1.7 exact preview'],{type:'application/pdf'}),{headers:{'content-type':'application/pdf'}});
 const envelope={workspace_id:'test-workspace',user_id:'test-user'};
 const d={el:new El('main'),status:new El('p'),onDispose(fn){dispose.push(fn);},setBeforeClose(fn){this.beforeClose=fn;},run:fn=>Promise.resolve().then(fn),session:{bound:{workspace:'test-workspace',user:'test-user',role:'general_manager'},check(){},request:async promise=>promise,operation:async fn=>fn(new AbortController().signal),client:{auth:{getSession:async()=>({data:{session:{access_token:'a.b.c',user:{id:'test-user'}}}})},async rpc(name,args){state.calls.push({name,args:clone(args)});assert.equal(name,'aqari_rental_templates');
   if(args.p_action==='context')return {...envelope,can_publish:true,items:clone(state.items),drafts:clone(state.drafts)};
   assert.equal(args.p_action,'save_draft','tests never approve or publish a template');
   const payload=args.p_data,existing=state.drafts.find(row=>row.id===payload.id);
   assert.equal(payload.revision,existing?.revision||0,'every save uses the latest confirmed revision');
   if(state.beforeSave)await state.beforeSave(payload);
   const saved={...clone(payload),revision:payload.revision+1,status:'draft'};delete saved.request_id;
   if(existing)Object.assign(existing,saved);else state.drafts.push(saved);
   return {...envelope,record:clone(saved)};
  }}}};
 let manager;
 t.after(()=>{manager?.current?.saver.dispose();for(const fn of dispose)fn();globalThis.document=previous.document;globalThis.window=previous.window;globalThis.fetch=previous.fetch;if(previous.selection===undefined)delete globalThis.getSelection;else globalThis.getSelection=previous.selection;});
 const target=new El('section');
 return {d,target,state,created,async open(source,options){manager||=await mountRentalTemplateManager(d,target,{propertyId});manager.openEditor(source,options);return manager;}};
}

async function savedLogo(f,t){
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==','base64'),blob=new Blob([bytes],{type:'image/png'}),hash=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex'),rpc=f.d.session.client.rpc,base={workspace_id:'test-workspace',user_id:'test-user'};
 const priorBitmap=globalThis.createImageBitmap;globalThis.createImageBitmap=async()=>({width:2,height:2,close(){}});t.after(()=>{if(priorBitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=priorBitmap;});
 f.d.session.client.rpc=async(name,args)=>{if(name==='aqari_rental_templates')return rpc(name,args);f.state.calls.push({name,args:clone(args)});if(name==='aqari_workspace_access')return {...base,role:'general_manager',permissions:{properties:{read:true,write:true},documents:{write:true}}};assert.equal(name,'aqari_property_full_file');assert.equal(args.p_property_id,'saved-property');return {...base,property:{id:'saved-property',externalRef:'legacy-saved-property',name:'العقار المحفوظ',revision:2,assets:{logo:'saved-logo'}}};};
 f.d.session.client.from=table=>{const query={filters:{},select(){return this;},eq(key,value){this.filters[key]=value;return this;},order(){return this;},async range(){assert.equal(table,'aqari_properties');assert.equal(this.filters.workspace_id,'test-workspace');return [{id:'saved-property',workspace_id:'test-workspace',external_ref:'legacy-saved-property',name:'العقار المحفوظ'}];},async single(){assert.equal(table,'aqari_documents');assert.deepEqual(this.filters,{workspace_id:'test-workspace',id:'saved-logo'});return {id:'saved-logo',workspace_id:'test-workspace',status:'uploaded',entity_type:'property',entity_ref:'legacy-saved-property',document_type:'supporting_document',metadata:{category:'property_logo'},storage_bucket:'aqari-documents',storage_path:'test-workspace/saved-logo/original',mime_type:'image/png',size_bytes:blob.size,checksum_sha256:hash};}};return query;};
 f.d.session.storage=async(method,path,_body,bucket)=>{assert.equal(method,'GET');assert.equal(path,'test-workspace/saved-logo/original');assert.equal(bucket,'aqari-documents');return blob;};
}

async function until(predicate){for(let count=0;count<100;count++){if(predicate())return;await new Promise(resolve=>setImmediate(resolve));}assert.fail('Expected async editor state was not reached');}

test('new tools leave all 36 original provisions and legacy defaults untouched on open, zoom and pagination',async t=>{
 const original=draft({kind:'custom-shop',kind_label:'  عقد محل  ',title:'  الأصل  ',fields:[{key:'field_name',label:'بيانات',type:'text',required:true}],clauses:[{title:' العقد الأصلي ',text:Array.from({length:36},(_,i)=>`البند ${i+1}: النص الأصلي {{field_name}} \n`).join('')}]}),f=fixture(t,{drafts:[original]}),manager=await f.open(original),initial=clone(manager.current.data());
 assert.deepEqual(initial.clauses,original.clauses);assert.deepEqual(initial.fields,original.fields);assert.equal(initial.presentation,undefined);
 for(const value of ['125','fit','actual'])setValue(manager.form,'paper_zoom',value);
 button(manager.form,'توزيع الصفحات').onclick();button(manager.form,'إظهار أدوات التحرير').onclick();
 assert.deepEqual(manager.current.data(),initial);assert.equal(manager.current.saver.dirty,false);await manager.current.saver.flush();assert.equal(writes(f).length,0);
 assert.ok(button(manager.form,'إضافة لوقو / شعار'));assert.ok(byClass(manager.form,'aq267-editor-advanced-tools').length);assert.ok(byClass(manager.form,'aq267-a4-sheet').length>1);
});

test('undo and redo keep server revisions monotonic across confirmed saves',async t=>{
 const original=draft(),f=fixture(t,{drafts:[original]}),manager=await f.open(original),name=all(manager.form).find(el=>el.maxLength===200);
 assert.equal(button(manager.form,'تراجع').disabled,true);name.value='التعديل الأول';name.oninput();await manager.current.saver.flush();assert.equal(manager.current.data().revision,8);
 button(manager.form,'تراجع').onclick();assert.equal(manager.current.data().title,original.title);assert.equal(manager.current.data().revision,8);await manager.current.saver.flush();
 assert.equal(manager.current.data().revision,9);button(manager.form,'إعادة').onclick();assert.equal(manager.current.data().title,'التعديل الأول');assert.equal(manager.current.data().revision,9);await manager.current.saver.flush();
 assert.deepEqual(writes(f).map(call=>call.args.p_data.revision),[7,8,9]);assert.deepEqual(manager.current.data().clauses,original.clauses);assert.equal(manager.current.data().revision,10);
});

test('restore returns the last confirmed snapshot without creating a save or reverting its revision',async t=>{
 const original=draft(),f=fixture(t,{drafts:[original]}),manager=await f.open(original),name=all(manager.form).find(el=>el.maxLength===200);
 name.value='نسخة مؤكدة';name.oninput();await manager.current.saver.flush();const confirmed=clone(manager.current.data());
 name.value='تعديل لم يحفظ';name.oninput();setValue(manager.form,'document_font','18');assert.equal(manager.current.saver.dirty,true);
 button(manager.form,'استعادة آخر نسخة محفوظة').onclick();assert.deepEqual(manager.current.data(),confirmed);assert.equal(manager.current.saver.dirty,false);await manager.current.saver.flush();
 assert.equal(writes(f).length,1);assert.equal(button(manager.form,'تراجع').disabled,true);assert.equal(button(manager.form,'إعادة').disabled,true);
});

test('restore cannot discard an in-flight save or an unconfirmed failed request',async t=>{
 const original=draft(),f=fixture(t,{drafts:[original]}),manager=await f.open(original),name=all(manager.form).find(el=>el.maxLength===200);let release;
 f.state.beforeSave=()=>new Promise(resolve=>{release=resolve;});name.value='قيد الحفظ';name.oninput();const pending=manager.current.saver.flush();while(!release)await Promise.resolve();
 assert.equal(button(manager.form,'استعادة آخر نسخة محفوظة').disabled,true);button(manager.form,'استعادة آخر نسخة محفوظة').onclick();assert.equal(manager.current.data().title,'قيد الحفظ');release();await pending;
 f.state.beforeSave=async()=>{throw Error('unconfirmed network failure');};name.value='تعديل باقٍ';name.oninput();await assert.rejects(manager.current.saver.flush(),/unconfirmed/);assert.equal(button(manager.form,'استعادة آخر نسخة محفوظة').disabled,true);
 button(manager.form,'استعادة آخر نسخة محفوظة').onclick();assert.equal(manager.current.data().title,'تعديل باقٍ');assert.equal(manager.current.saver.dirty,true);assert.equal(writes(f).length,2);
});

test('font, direction, emphasis and spacing save as optional metadata without rewriting clauses',async t=>{
 const original=draft({clauses:[{title:'بند محفوظ',text:'الفقرة الأولى\n\nالفقرة الثانية'}]}),f=fixture(t,{drafts:[original]}),manager=await f.open(original);
 setValue(manager.form,'document_font_family','mono');setValue(manager.form,'document_direction','ltr');button(manager.form,'عريض').onclick();button(manager.form,'تسطير').onclick();setValue(manager.form,'document_numbering','decimal');
 for(const [key,value]of Object.entries({document_paragraph_gap_mm:'3',document_clause_before_mm:'2',document_clause_after_mm:'4'}))setValue(manager.form,key,value);
 const before=clone(manager.current.data());assert.deepEqual(before.presentation.editor.style,{font_family:'mono',direction:'ltr',bold:true,underline:true,numbering:'decimal',paragraph_gap_mm:3,clause_before_mm:2,clause_after_mm:4});assert.deepEqual(before.clauses,original.clauses);assert.deepEqual(before.fields,original.fields);
 const paper=byClass(manager.form,'aq267-a4-sheet')[0];assert.equal(paper.dataset.editorBold,'true');assert.equal(paper.dataset.editorUnderline,'true');assert.equal(paper.dataset.editorDirection,'ltr');assert.equal(paper.style['--aq-clause-before'],'2mm');assert.equal(readTemplateEditorText(byClass(manager.form,'aq267-a4-clause-text')[0]),original.clauses[0].text);
 await manager.current.saver.flush();const saved=clone(f.state.drafts[0]);await f.open(saved);assert.equal(named(manager.form,'document_font_family').value,'mono');assert.equal(button(manager.form,'عريض').getAttribute('aria-pressed'),'true');assert.equal(named(manager.form,'document_clause_after_mm').value,'4');assert.equal(manager.current.saver.dirty,false);
 assert.deepEqual(manager.current.data().clauses,original.clauses);assert.equal(writes(f).length,1);
});

test('unresolved chip opens the field picker immediately; replace, duplicate and delete preserve surrounding text',async t=>{
 const original=draft({fields:[{key:'field_name',label:'بيانات',type:'text',required:true}],clauses:[{title:'الأصل',text:'قبل {{field_name}} بعد'}]}),f=fixture(t,{drafts:[original]}),manager=await f.open(original);
 all(manager.form).find(el=>el._templateToken==='{{field_name}}').onclick();assert.equal(document.activeElement,named(manager.form,'chip_field_picker'));assert.equal(byClass(manager.form,'aq267-template-field-popover')[0].hidden,false);assert.equal(manager.current.saver.dirty,false);
 setValue(manager.form,'chip_field_picker','tenant_civil_id');assert.equal(manager.current.data().clauses[0].text,'قبل {{tenant_civil_id}} بعد');
 let chip=all(manager.form).find(el=>el._templateToken==='{{tenant_civil_id}}');chip.onclick();button(manager.form,'تكرار الحقل هنا').onclick();assert.equal(manager.current.data().clauses[0].text,'قبل {{tenant_civil_id}}{{tenant_civil_id}} بعد');
 chip=all(manager.form).filter(el=>el._templateToken==='{{tenant_civil_id}}')[1];chip.onclick();button(manager.form,'حذف هذا الحقل من النص').onclick();assert.equal(manager.current.data().clauses[0].text,'قبل {{tenant_civil_id}} بعد');assert.equal(manager.current.data().fields.filter(field=>field.key==='tenant_civil_id').length,1);
});

test('custom bilingual field copy and deletion change only the chosen occurrence',async t=>{
 const original=draft({clauses:[{title:'الأصل',text:'وصف: '}]}),f=fixture(t,{drafts:[original]}),manager=await f.open(original);
 named(manager.form,'custom_field_label').value='وصف الملحق / Annex description';button(manager.form,'إضافة معلومة خاصة').onclick();button(manager.form,'إدراج في النص').onclick();const spec=manager.current.data().fields[0],token='{{'+spec.key+'}}';assert.match(spec.key,/^custom_[a-f0-9]{16}$/);
 let chip=all(manager.form).find(el=>el._templateToken===token);chip.onclick();button(manager.form,'تكرار الحقل هنا').onclick();assert.equal(manager.current.data().clauses[0].text,'وصف: '+token+token);
 chip=all(manager.form).find(el=>el._templateToken===token);chip.onclick();button(manager.form,'حذف هذا الحقل من النص').onclick();assert.equal(manager.current.data().clauses[0].text,'وصف: '+token);await manager.current.saver.flush();assert.deepEqual(f.state.drafts[0].fields,[spec]);
});

test('only explicitly added blank pages expose deletion and their removal preserves all original text',async t=>{
 const original=draft(),f=fixture(t,{drafts:[original]}),manager=await f.open(original),pages=byClass(manager.form,'aq267-a4-sheet').length;
 assert.equal(button(manager.form,'حذف الصفحة الفارغة'),undefined);button(manager.form,'إضافة صفحة فارغة').onclick();button(manager.form,'إضافة صفحة فارغة').onclick();assert.equal(byClass(manager.form,'aq267-a4-sheet').length,pages+2);assert.equal(manager.current.data().presentation.editor.trailing_blank_pages,2);
 button(manager.form,'حذف الصفحة الفارغة').onclick();assert.equal(byClass(manager.form,'aq267-a4-sheet').length,pages+1);button(manager.form,'حذف الصفحة الفارغة').onclick();assert.equal(byClass(manager.form,'aq267-a4-sheet').length,pages);assert.equal(button(manager.form,'حذف الصفحة الفارغة'),undefined);assert.deepEqual(manager.current.data().clauses,original.clauses);
});

test('civil ID and nationality signer elements can be placed and parties reordered without duplicating legal text',async t=>{
 const original=draft(),f=fixture(t,{drafts:[original]}),manager=await f.open(original);
 for(const [part,label]of [['civil_id','الرقم المدني'],['nationality','الجنسية']]){const place=all(manager.form).find(el=>el.tag==='button'&&el.getAttribute('aria-label')==='وضع '+label+' — الطرف الثاني / المستأجر');assert.ok(place);place.onclick();assert.equal(named(manager.form,'signer_tenant_'+part).checked,true);}
 assert.deepEqual(manager.current.data().presentation.editor.signers.details.tenant,{civil_id:true,nationality:true});assert.deepEqual(manager.current.data().presentation.placements.map(item=>item.field_key),['tenant_civil_id','tenant_nationality']);
 const tenantBox=all(manager.form).find(el=>el.tag==='fieldset'&&el.children.some(child=>child.tag==='legend'&&child.textContent==='الطرف الثاني / المستأجر'));button(tenantBox,'تقديم الطرف').onclick();assert.equal(manager.current.data().presentation.editor.signers.order[0],'tenant');assert.deepEqual(manager.current.data().clauses,original.clauses);
 const civil=named(manager.form,'signer_tenant_civil_id');civil.checked=false;civil.onchange();assert.deepEqual(manager.current.data().presentation.placements.map(item=>item.field_key),['tenant_nationality']);
});

test('readonly history opens the latest draft explicitly without writes and copying gets a separate identity',async t=>{
 const original=draft(),latest=draft({revision:9,title:'المسودة الحالية'}),f=fixture(t,{drafts:[latest]}),manager=await f.open(original,{readonly:true});
 assert.equal(button(manager.form,'إدراج حقل'),undefined);assert.equal(button(manager.form,'حفظ الآن').disabled,true);assert.ok(all(manager.form).filter(el=>el.contentEditable!==undefined).every(el=>el.contentEditable==='false'));
 const edit=button(manager.form,'فتح المسودة للتعديل');assert.equal(edit.disabled,false);assert.equal(button(manager.form,'نسخ كنموذج مستقل').disabled,false);await manager.current.saver.flush();assert.equal(writes(f).length,0);
 edit.onclick();assert.equal(manager.current.data().revision,9);assert.equal(manager.current.data().title,'المسودة الحالية');assert.equal(button(manager.form,'حفظ الآن').disabled,false);assert.equal(writes(f).length,0);
 await f.open(original,{readonly:true});button(manager.form,'نسخ كنموذج مستقل').onclick();assert.notEqual(manager.current.data().id,original.id);assert.equal(manager.current.data().family_id,manager.current.data().id);assert.deepEqual(manager.current.data().clauses,original.clauses);assert.equal(writes(f).length,0);
});

test('PDF preview, download and both print paths reuse one immutable artifact; returning to edit does not write',async t=>{
 const original=draft(),f=fixture(t,{drafts:[original]}),manager=await f.open(original);let requests=0;globalThis.fetch=async()=>{requests++;return new Response(new Blob(['%PDF-1.7 one artifact'],{type:'application/pdf'}),{headers:{'content-type':'application/pdf'}});};
 await button(manager.form,'معاينة النسخة النهائية').onclick();const frame=all(manager.form).find(el=>el.tag==='iframe'),url=frame.src;assert.match(url,/^blob:/);assert.ok(manager.form.classList.contains('is-preview'));assert.equal(byClass(manager.form,'aq267-template-workbench')[0].hidden,true);
 await button(manager.form,'تحميل PDF').onclick();assert.equal(f.created.find(el=>el.tag==='a'&&el.download?.endsWith('.pdf')).href,url);await button(manager.form,'طباعة PDF').onclick();assert.equal(f.created.find(el=>el.tag==='a'&&el.textContent==='فتح جميع صفحات PDF في تبويب مستقل').href,url);
 let prints=0;frame.contentWindow={focus(){},print(){prints++;}};await button(manager.form,'طباعة PDF').onclick();assert.equal(prints,1);assert.equal(requests,1);assert.equal(writes(f).length,0);
 frame.contentWindow.print=()=>{throw new DOMException('Blocked PDF viewer','SecurityError');};await button(manager.form,'طباعة PDF').onclick();assert.equal(f.created.filter(el=>el.tag==='a'&&el.textContent==='فتح جميع صفحات PDF في تبويب مستقل').at(-1).href,url);assert.equal(requests,1);assert.match(f.d.status.textContent,/قائمة المشاركة/);
 button(manager.form,'العودة للتحرير').onclick();assert.equal(manager.form.classList.contains('is-preview'),false);assert.equal(byClass(manager.form,'aq267-template-workbench')[0].hidden,false);assert.equal(writes(f).length,0);
 const name=all(manager.form).find(el=>el.maxLength===200);name.value='تعديل بعد المعاينة';name.oninput();assert.equal(button(manager.form,'تحميل PDF').disabled,false);assert.equal(button(manager.form,'طباعة PDF').disabled,false);assert.equal(byClass(manager.form,'aq267-template-approval')[0].hidden,true);
});

test('a delayed logo response from the prior property cannot replace or invalidate the current PDF preview',async t=>{
 const original=draft(),f=fixture(t,{drafts:[original]}),manager=await f.open(original),rpc=f.d.session.client.rpc,base={workspace_id:'test-workspace',user_id:'test-user'};let release;
 f.d.session.client.rpc=async(name,args)=>{
  if(name==='aqari_rental_templates')return rpc(name,args);
  f.state.calls.push({name,args:clone(args)});
  if(name==='aqari_workspace_access')return {...base,role:'general_manager',permissions:{properties:{read:true,write:true},documents:{write:true}}};
  assert.equal(name,'aqari_property_full_file');if(args.p_property_id==='first')await new Promise(resolve=>{release=resolve;});
  return {...base,property:{id:args.p_property_id,externalRef:'legacy-'+args.p_property_id,name:args.p_property_id,revision:2,assets:{logo:null}}};
 };
 f.d.session.client.from=table=>{assert.equal(table,'aqari_properties');const query={select(){return this;},eq(key,value){assert.equal(key,'workspace_id');assert.equal(value,'test-workspace');return this;},order(){return this;},range:async()=>['first','second'].map(id=>({id,workspace_id:'test-workspace',external_ref:'legacy-'+id,name:id}))};return query;};
 await button(manager.form,'إضافة لوقو / شعار').onclick();const property=named(manager.form,'template_logo_property');property.value='first';const stale=property.onchange();while(!release)await Promise.resolve();property.value='second';await property.onchange();
 let body;globalThis.fetch=async(_url,options)=>{body=JSON.parse(options.body);return new Response(new Blob(['%PDF-1.7 second property'],{type:'application/pdf'}),{headers:{'content-type':'application/pdf'}});};
 await button(manager.form,'معاينة النسخة النهائية').onclick();const frame=all(manager.form).find(el=>el.tag==='iframe');assert.equal(body.previewPropertyId,'second');assert.equal(button(manager.form,'تحميل PDF').disabled,false);
 release();await stale;assert.equal(all(manager.form).find(el=>el.tag==='iframe'),frame);assert.equal(button(manager.form,'تحميل PDF').disabled,false);assert.equal(property.value,'second');assert.equal(writes(f).length,0);
});

test('logo drag and resize stay within A4 bounds, commit only on release and cancel without mutations',async t=>{
 const presentation=defaultTemplatePresentation();presentation.logo.enabled=true;presentation.editor={version:1,logo:{x_mm:20,y_mm:12,width_mm:40,height_mm:20,repeat:'first'}};
 const original=draft({presentation}),f=fixture(t,{drafts:[original]}),manager=await f.open(original),before=clone(manager.current.data());
 const pointer=(x,y)=>({clientX:x,clientY:y,pointerId:1,preventDefault(){},stopPropagation(){}}),prepare=()=>{for(const page of byClass(manager.form,'aq267-a4-sheet'))page.getBoundingClientRect=()=>({width:210,height:297});return byClass(manager.form,'aq267-a4-logo-object')[0];};
 let logo=prepare();logo.onpointerdown(pointer(0,0));logo.onpointermove(pointer(15,10));assert.deepEqual(manager.current.data(),before);assert.equal(manager.current.saver.dirty,false);logo.onpointercancel();assert.deepEqual(manager.current.data(),before);
 logo=prepare();logo.onpointerdown(pointer(0,0));logo.onpointermove(pointer(1000,1000));logo.onpointerup();assert.deepEqual(manager.current.data().presentation.editor.logo,{x_mm:162,y_mm:269,width_mm:40,height_mm:20,repeat:'first'});
 logo=prepare();const handle=byClass(logo,'aq267-a4-resize-handle')[0];handle.onpointerdown(pointer(0,0));handle.onpointermove(pointer(-1000,-1000));handle.onpointerup();assert.equal(manager.current.data().presentation.editor.logo.width_mm,12);assert.equal(manager.current.data().presentation.editor.logo.height_mm,8);assert.deepEqual(manager.current.data().clauses,original.clauses);
 button(manager.form,'إضافة صفحة فارغة').onclick();setValue(manager.form,'template_logo_repeat','all');assert.equal(byClass(manager.form,'aq267-a4-logo-object').length,byClass(manager.form,'aq267-a4-sheet').length);
 button(manager.form,'بدون شعار').onclick();assert.equal(byClass(manager.form,'aq267-a4-logo-object').length,0);assert.equal(manager.current.data().presentation.logo.enabled,false);assert.equal(writes(f).length,0);
});

for(const readonly of [false,true])test(`saved enabled property logo loads automatically in ${readonly?'readonly':'editable'} view without draft writes`,async t=>{
 const presentation=defaultTemplatePresentation();presentation.logo.enabled=true;const original=draft({presentation}),f=fixture(t,{drafts:[original],propertyId:'saved-property'});await savedLogo(f,t);const manager=await f.open(original,{readonly}),before=clone(manager.current.data());
 await until(()=>byClass(manager.form,'aq267-a4-logo-object').some(el=>el.children.some(child=>child.tag==='img')));
 assert.deepEqual(manager.current.data(),before);assert.equal(manager.current.saver.dirty,false);await manager.current.saver.flush();assert.equal(writes(f).length,0);assert.equal(f.state.calls.filter(call=>call.name==='aqari_property_full_file').length,1);
});

test('using a loaded saved property logo is explicit and changes only optional presentation metadata',async t=>{
 const original=draft(),f=fixture(t,{drafts:[original],propertyId:'saved-property'});await savedLogo(f,t);const manager=await f.open(original),before=clone(manager.current.data());await button(manager.form,'إضافة لوقو / شعار').onclick();
 assert.ok(byClass(manager.form,'aq267-template-logo-preview')[0].children.some(child=>child.tag==='img'));assert.deepEqual(manager.current.data(),before);assert.equal(manager.current.saver.dirty,false);const use=button(manager.form,'استخدام الشعار في النموذج');assert.ok(use);assert.equal(use.disabled,false);use.onclick();
 const after=manager.current.data();assert.equal(after.presentation.logo.enabled,true);assert.deepEqual({...after,presentation:undefined},{...before,presentation:undefined});assert.equal(manager.current.saver.dirty,true);assert.equal(writes(f).length,0);assert.ok(byClass(manager.form,'aq267-a4-logo-object').length);
});

test('final PDF page count comes from the PDF response header rather than editor sheet estimates',async t=>{
 const original=draft(),f=fixture(t,{drafts:[original]}),manager=await f.open(original);globalThis.fetch=async()=>new Response(new Blob(['%PDF-1.7 seven pages'],{type:'application/pdf'}),{headers:{'content-type':'application/pdf','X-Aqari-PDF-Pages':'7'}});
 assert.notEqual(byClass(manager.form,'aq267-a4-sheet').length,7);await button(manager.form,'معاينة النسخة النهائية').onclick();assert.ok(byClass(manager.form,'aq267-template-preview').some(box=>all(box).some(el=>el.textContent==='عدد صفحات PDF: 7')));assert.equal(writes(f).length,0);
});

test('selection formatting with no selected text does not add metadata, toggle emphasis or queue a save',async t=>{
 const original=draft(),f=fixture(t,{drafts:[original]}),manager=await f.open(original),before=clone(manager.current.data());named(manager.form,'format_scope').value='selection';
 button(manager.form,'عريض').onclick();button(manager.form,'تسطير').onclick();setValue(manager.form,'document_font_family','mono');setValue(manager.form,'document_font','18');assert.deepEqual(manager.current.data(),before);assert.equal(button(manager.form,'عريض').getAttribute('aria-pressed'),'false');assert.equal(button(manager.form,'تسطير').getAttribute('aria-pressed'),'false');assert.equal(manager.current.saver.dirty,false);await manager.current.saver.flush();assert.equal(writes(f).length,0);
});
