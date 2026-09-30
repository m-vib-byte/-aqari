import {t as visibleText,message as visibleMessage} from '../components/locale.js';
import {t as translateStatic} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
import {mountRentalTemplateManager} from '../components/rental-templates.js';
import {serviceReadinessError} from '../components/service-readiness.js';

// Localized form hints keep their original persisted default until the user edits them.
const formDefaults=new WeakMap();
function setFormDefault(control,source,suffix=''){const display=visibleText(source)+suffix;control.value=display;formDefaults.set(control,{display,canonical:source+suffix});return control;}
function formValue(control){const initial=formDefaults.get(control);return initial&&control.value===initial.display?initial.canonical:control.value;}

const input=(type='text',value='')=>{const x=node('input');x.type=type;x.value=value??'';return x;};
const clean=value=>String(value??'').normalize('NFKC').trim();
const button=(label,fn)=>{const b=node('button',label);b.type='button';b.onclick=fn;return b;};
const section=title=>{const x=node('section');x.append(node('h3',title));return x;};
const builtinFeatures=[['maintenance',visibleText('الصيانة')],['technicians',visibleText('الفنيون')],['parking',visibleText('المواقف')],['meters',visibleText('العدادات')]];
const typeLabels={get boolean(){return visibleText('نعم / لا');},get percentage(){return visibleText('نسبة %');},get money(){return visibleText('مبلغ');},get text(){return visibleText('نص');},get document(){return visibleText('مرفق مؤرشف');}};
const visibilityLabels={get internal(){return visibleText('داخلي فقط');},get owner(){return visibleText('ظاهر للمالك');},get both(){return visibleText('داخلي وظاهر للمالك');}};
function select(rows,value=''){const x=node('select');for(const [v,label]of rows){const o=node('option',label);o.value=v;x.append(o);}x.value=value??'';return x;}
function check(label,value=false){const c=input('checkbox');c.checked=Boolean(value);return {c,el:field(label,c)};}
function reasonField(source='تحديث إعدادات العقار',suffix=''){const r=node('textarea');r.required=true;r.minLength=3;r.maxLength=1000;return setFormDefault(r,source,suffix);}

export function openPropertyControls(initialPropertyId=null){
 const d=createDialog(translateStatic('إدارة خصائص العقارات — المدير العام'));if(!d)return false;
 const rpc=async(action,data={})=>{try{return await d.session.request(d.session.client.rpc('aqari_property_controls',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:data}));}catch(error){d.session.check();throw serviceReadinessError(error,'aqari_property_controls');}};
 let state=null,externalRefs=new Map(),propertyId=initialPropertyId;
 async function load(){
  const result=await rpc('context',{});d.session.check();if(result?.workspace_id!==d.session.bound.workspace||result?.user_id!==d.session.bound.user||result?.manager!==true)throw Error('إدارة خصائص العقارات متاحة للمدير العام فقط.');
  const rows=await d.session.request(d.session.client.from('aqari_properties').select('id,external_ref').eq('workspace_id',d.session.bound.workspace));d.session.check();externalRefs=new Map((rows||[]).map(x=>[x.id,x.external_ref]));state=result;
  if(propertyId&&!state.properties.some(p=>p.id===propertyId))propertyId=null;return result;
 }
 const currentProperty=()=>state?.properties?.find(p=>p.id===propertyId)||null;
 const valueFor=fieldId=>state?.values?.find(v=>v.propertyId===propertyId&&v.fieldId===fieldId)||null;
 const featuresFor=()=>state?.features?.find(v=>v.propertyId===propertyId)||{settings:{},revision:0};
 const techFor=employeeId=>state?.technicians?.find(v=>v.propertyId===propertyId&&v.employeeId===employeeId)||null;

 async function chooseProperty(){await load();d.body.replaceChildren(node('h3',translateStatic('اختر العقار')));const p=select([['',visibleText('اختر العقار')],...state.properties.map(x=>[x.id,`${x.name}${x.type?' · '+x.type:''}`])],propertyId||'');p.onchange=()=>{propertyId=p.value||null;if(propertyId)d.run(home);};d.body.append(field(translateStatic('العقار'),p));if(propertyId)await home();else d.status.textContent=translateStatic('اختر العقار لإدارة بنود المالك والخصائص والفنيين وربط القوالب.');}

 function renderOwnerValue(box,definition){
  const saved=valueFor(definition.id),raw=saved?.value;let control;
  if(definition.type==='boolean'){control=input('checkbox');control.checked=raw===true;}
  else if(definition.type==='text'){control=node('textarea');control.value=typeof raw==='string'?raw:'';control.maxLength=5000;}
  else if(definition.type==='document'){const ref=externalRefs.get(propertyId),docs=(state.documents||[]).filter(x=>x.entityRef===ref);control=select([['',visibleText('اختر مستندًا مؤرشفًا')],...docs.map(x=>[x.id,`${x.documentNo} · ${x.title}`])],typeof raw==='string'?raw:'');}
  else{control=input('text',raw??'');control.inputMode='decimal';}
  const r=reasonField('تحديث بند مالك: ',definition.labelAr),save=button(visibleText('حفظ قيمة البند'),()=>d.run(async()=>{let value;if(definition.type==='boolean')value=control.checked;else value=control.value;const response=await rpc('save_value',{propertyId,fieldId:definition.id,revision:Number(saved?.revision||0),value,reason:formValue(r).trim()});if(!response?.record)throw Error('لم تتأكد إعادة قراءة قيمة بند المالك.');await home();d.status.textContent=translateStatic('تم حفظ بند المالك وإعادة قراءته.');}));box.append(field(`${definition.labelAr}${definition.labelEn?' / '+definition.labelEn:''} — ${typeLabels[definition.type]} — ${visibilityLabels[definition.visibility]}`,control),field(translateStatic('سبب التعديل'),r),save);
 }

 async function editOwnerField(existing=null){
  d.body.replaceChildren(node('h3',existing?visibleText('تعديل بند مخصص للمالك'):visibleText('إضافة بند مخصص للمالك')),button(visibleText('رجوع'),()=>d.run(home)));
  const form=node('form'),key=input('text',existing?.key||''),ar=input('text',existing?.labelAr||''),en=input('text',existing?.labelEn||''),type=select(Object.entries(typeLabels),existing?.type||'boolean'),visibility=select(Object.entries(visibilityLabels),existing?.visibility||'internal'),active=check(visibleText('البند مفعل'),existing?.active!==false),scope=section(visibleText('العقارات المرتبطة')),selected=new Map(),reason=reasonField(existing?'تعديل تعريف بند المالك':'إنشاء بند مالك مخصص');
  key.required=ar.required=true;key.pattern='[a-z][a-z0-9_.-]{0,49}';key.maxLength=50;ar.maxLength=en.maxLength=200;
  for(const p of state.properties){const c=input('checkbox');c.checked=(existing?.propertyIds||[propertyId]).includes(p.id);selected.set(p.id,c);scope.append(field(`${p.name}${p.type?' · '+p.type:''}`,c));}
  const save=node('button',translateStatic('حفظ التعريف وإعادة القراءة'));save.type='submit';form.append(field(translateStatic('المفتاح التقني'),key),field(translateStatic('المسمى بالعربي'),ar),field(translateStatic('المسمى بالإنجليزي'),en),field(translateStatic('نوع البند'),type),field(translateStatic('الظهور'),visibility),active.el,scope,field(translateStatic('سبب الإنشاء/التعديل'),reason),save);d.body.append(form);
  form.onsubmit=e=>{e.preventDefault();d.run(async()=>{const propertyIds=[...selected].filter(([,c])=>c.checked).map(([id])=>id);if(!propertyIds.length)throw Error('اختر عقارًا واحدًا على الأقل.');const response=await rpc('save_field',{id:existing?.id||null,revision:Number(existing?.revision||0),key:key.value.trim(),labelAr:ar.value.trim(),labelEn:en.value.trim(),type:type.value,visibility:visibility.value,propertyIds,active:active.c.checked,reason:formValue(reason).trim()});if(!response?.record)throw Error('لم تتأكد إعادة قراءة تعريف البند.');await home();d.status.textContent=translateStatic('تم حفظ تعريف بند المالك مع سجل تدقيق.');});};
 }

 function renderFeatures(target){
  const saved=featuresFor(),settings={...(saved.settings||{})},controls=new Map(),known=new Set(builtinFeatures.map(x=>x[0]));
  target.append(node('p',translateStatic('كل خاصية تُحفظ على العقار نفسه. يمكنك إضافة مفتاح مخصص بدون برمجة، ونسخ الإعدادات لعقارات أخرى.')));
  for(const [key,label]of builtinFeatures){const c=check(label,settings[key]!==false);controls.set(key,c.c);target.append(c.el);}
  for(const key of Object.keys(settings).filter(k=>!known.has(k)).sort()){const c=check(key,settings[key]===true);controls.set(key,c.c);target.append(c.el);}
  const customKey=input('text'),customDefault=check(visibleText('مفعل عند الإضافة'),true),add=button(visibleText('+ إضافة خاصية مخصصة'),()=>{const key=customKey.value.trim().toLowerCase();if(!/^[a-z][a-z0-9_.-]{0,49}$/.test(key)||controls.has(key))throw Error('اكتب مفتاحًا فريدًا مثل parking.vip أو elevator.');const c=check(key,customDefault.c.checked);controls.set(key,c.c);target.insertBefore(c.el,save);customKey.value='';});customKey.placeholder=translateStatic('مثال: elevator أو parking.vip');
  const r=reasonField('تحديث خصائص العقار'),save=button(visibleText('حفظ خصائص العقار'),()=>d.run(async()=>{const next=Object.fromEntries([...controls].map(([k,c])=>[k,c.checked]));const response=await rpc('save_features',{propertyId,revision:Number(saved.revision||0),settings:next,reason:formValue(r).trim()});if(!response?.record)throw Error('لم تتأكد إعادة قراءة خصائص العقار.');await home();d.status.textContent=translateStatic('تم حفظ خصائص العقار وإعادة قراءتها.');}));
  target.append(field(translateStatic('مفتاح خاصية مخصصة'),customKey),customDefault.el,add,field(translateStatic('سبب التعديل'),r),save);
  const copyBox=section(visibleText('نسخ إعدادات هذا العقار')),targets=[];for(const p of state.properties.filter(x=>x.id!==propertyId)){const c=input('checkbox');targets.push([p.id,c]);copyBox.append(field(p.name,c));}const cr=reasonField('نسخ إعدادات خصائص العقار'),copyButton=button(visibleText('نسخ الإعدادات للعقارات المحددة'),()=>d.run(async()=>{const ids=targets.filter(([,c])=>c.checked).map(([id])=>id);if(!ids.length)throw Error('اختر عقارًا واحدًا على الأقل للنسخ.');const response=await rpc('copy_features',{sourcePropertyId:propertyId,targetPropertyIds:ids,reason:formValue(cr).trim()});if(Number(response?.copied)!==ids.length)throw Error('لم تتأكد نتيجة نسخ الإعدادات.');await home();d.status.textContent=translateStatic('تم نسخ الإعدادات وحفظ Revision مستقل لكل عقار.');}));copyBox.append(field(translateStatic('سبب النسخ'),cr),copyButton);target.append(copyBox);
 }

 function renderTechnicians(target){
  const existing=(state.technicians||[]).filter(x=>x.propertyId===propertyId);for(const t of existing){const p=t.profile||{},card=node('article');card.append(node('strong',[p.name_ar,p.name_en].filter(Boolean).join(' / ')||t.employeeId),node('p',`${t.active?visibleText('مفعل'):visibleText('موقوف')} · ${t.publicToTenant?visibleText('ظاهر للمستأجر'):visibleText('داخلي')} · ${t.phone||'—'} · ${t.whatsapp||'—'}`));target.append(card);}
  const allowed=(state.employees||[]).filter(e=>(e.propertyIds||[]).includes(propertyId)),employee=select([['',visibleText('اختر فنيًا/موظفًا مرتبطًا بالعقار')],...allowed.map(e=>[e.id,[e.profile?.name_ar,e.profile?.name_en].filter(Boolean).join(' / ')||e.id])]),publicFlag=check(visibleText('يظهر للمستأجر'),true),active=check(visibleText('التعيين مفعل'),true),phone=input('tel'),wa=input('tel'),r=reasonField('تعيين فني للعقار'),save=button(visibleText('حفظ تعيين الفني'),()=>d.run(async()=>{if(!employee.value)throw Error('اختر الفني.');const old=techFor(employee.value);const response=await rpc('save_technician',{propertyId,employeeId:employee.value,revision:Number(old?.revision||0),publicToTenant:publicFlag.c.checked,phone:phone.value.trim(),whatsapp:wa.value.trim(),active:active.c.checked,reason:formValue(r).trim()});if(!response?.record)throw Error('لم تتأكد إعادة قراءة تعيين الفني.');await home();d.status.textContent=translateStatic('تم حفظ تعيين الفني وإعادة قراءته.');}));target.append(field(translateStatic('الفني/الموظف'),employee),field(translateStatic('هاتف الخدمة — اختياري؛ يستخدم هاتف الموظف إذا كان الظهور عامًا ولم تدخل رقمًا'),phone),field(translateStatic('واتساب الخدمة — اختياري'),wa),publicFlag.el,active.el,field(translateStatic('سبب التعيين/التعديل'),r),save);
 }

 function renderTemplateScopes(target){
  const p=currentProperty(),current=(state.templateScopes||[]).filter(x=>x.propertyId===propertyId||x.scopeKind==='property_type'&&x.propertyType&&p?.type&&x.propertyType.toLowerCase()===p.type.toLowerCase());
  for(const s of current){const t=(state.templates||[]).find(x=>x.id===s.templateId);target.append(node('p',`${t?.title||s.templateId} · ${s.kind} · ${s.scopeKind==='property'?visibleText('هذا العقار'):visibleText('نوع العقار: ')+s.propertyType} · ${s.active?visibleText('مفعل'):visibleText('موقوف')}`));}
  const template=select([['',visibleText('اختر قالبًا منشورًا')],...(state.templates||[]).map(t=>[t.id,visibleMessage("{v0} · {v1} · الإصدار {v2}",{v0:(t.title),v1:(t.kind),v2:(t.version)})])]),scope=select([['property',visibleText('هذا العقار فقط')],['property_type',visibleText('كل عقار من نفس النوع')]],'property'),r=reasonField('ربط قالب عقد بنطاق العقار'),save=button(visibleText('حفظ نطاق القالب'),()=>d.run(async()=>{const t=(state.templates||[]).find(x=>x.id===template.value);if(!t)throw Error('اختر قالبًا منشورًا.');const response=await rpc('save_template_scope',{templateId:t.id,scopeKind:scope.value,propertyId:scope.value==='property'?propertyId:null,propertyType:scope.value==='property_type'?p.type:null,revision:0,active:true,reason:formValue(r).trim()});if(!response?.record)throw Error('لم تتأكد إعادة قراءة نطاق القالب.');await home();d.status.textContent=translateStatic('تم ربط القالب بنطاق العقار؛ الخادم يمنع قالبًا غير مسموح عند إنشاء عقد جديد.');}));
  const manage=button(visibleText('إنشاء/تعديل نصوص قوالب العقود'),()=>d.run(async()=>{d.body.replaceChildren();await mountRentalTemplateManager(d,d.body,{suggestion:window.AQARI_RENTAL_RECORDS?.defaultClauses?.()||[],onBack:home});}));target.append(field(translateStatic('القالب المنشور'),template),field(translateStatic('نطاق التطبيق'),scope),field(translateStatic('سبب الربط'),r),save,manage);
 }

 async function home(){
  await load();const p=currentProperty();if(!p)return chooseProperty();d.body.replaceChildren();
  const head=section(p.name);const chooser=select(state.properties.map(x=>[x.id,x.name]),propertyId);chooser.onchange=()=>{propertyId=chooser.value;d.run(home);};head.append(field(translateStatic('العقار'),chooser),node('p',visibleMessage("النوع: {v0}",{v0:(p.type||visibleText('غير محدد'))})),button(visibleText('تحديث من الخادم'),()=>d.run(home)));d.body.append(head);
  const owner=section(visibleText('بنود المالك المخصصة'));owner.append(node('p',translateStatic('المدير العام وحده ينشئ ويعدل التعريفات والقيم. لا يوجد حذف؛ إيقاف البند يحفظ تاريخه.')),button(visibleText('+ إنشاء بند مخصص'),()=>d.run(()=>editOwnerField(null))));for(const f of (state.fields||[]).filter(x=>(x.propertyIds||[]).includes(propertyId))){const box=node('article');box.append(node('strong',`${f.labelAr}${f.active?'':visibleText(' — موقوف')}`),button(visibleText('تعديل تعريف البند'),()=>d.run(()=>editOwnerField(f))));renderOwnerValue(box,f);owner.append(box);}d.body.append(owner);
  const features=section(visibleText('خصائص العقار وتشغيل الأقسام'));renderFeatures(features);d.body.append(features);
  const templates=section(visibleText('قوالب العقود ونطاقها'));renderTemplateScopes(templates);d.body.append(templates);
  const technicians=section(visibleText('الفنيون المرتبطون بالعقار'));renderTechnicians(technicians);d.body.append(technicians);
  d.status.textContent=translateStatic('هذه الإعدادات خادمية، لها Revision وسجل تدقيق ولا تُحذف فعليًا.');
 }
 d.body.append(button(visibleText('إعادة المحاولة'),()=>d.run(chooseProperty)));d.run(chooseProperty);return true;
}
