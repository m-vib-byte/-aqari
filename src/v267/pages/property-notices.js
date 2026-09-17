import {t as translateStatic} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';

const kinds={notice:'إعلان العقار',guidance:'إرشاد للمستأجر',circular:'تعميم إداري'};
const states={draft:'مسودة',published:'منشور',archived:'مؤرشف'};
const actions={save:'حفظ المسودة',publish:'نشر',archive:'أرشفة'};
const date=value=>value?new Date(value).toLocaleString('ar-KW',{timeZone:'Asia/Kuwait'}):'غير محدد';
const text=(tag,value)=>node(tag,String(value??''));

export function openPropertyNotices(){
 const d=createDialog(translateStatic('إعلانات العقارات وإرشادات المستأجرين'));if(!d)return;
 let records=[],properties=[],manager=false,editing=null,requestId=crypto.randomUUID();
 const toolbar=node('div'),reload=node('button',translateStatic('تحديث السجلات')),add=node('button',translateStatic('إعداد مسودة جديدة')),filter=node('select'),list=node('div'),editor=node('form'),history=node('div');
 const property=node('select'),kind=node('select'),title=node('input'),body=node('textarea'),expiry=node('input'),save=node('button',translateStatic('حفظ المسودة والتحقق منها')),cancel=node('button',translateStatic('إغلاق المسودة'));
 title.required=body.required=property.required=true;title.maxLength=200;body.maxLength=10000;body.rows=8;expiry.type='date';save.type='submit';cancel.type=reload.type=add.type='button';editor.hidden=true;
 for(const [value,label]of Object.entries(kinds)){const option=node('option',label);option.value=value;kind.append(option);}
 editor.append(node('h3',translateStatic('مسودة الإعلان أو الإرشاد')),field(translateStatic('العقار'),property),field(translateStatic('نوع المحتوى'),kind),field(translateStatic('العنوان'),title),field(translateStatic('النص'),body),field(translateStatic('تاريخ انتهاء العرض — نهاية اليوم بتوقيت الكويت، اختياري'),expiry),node('p',translateStatic('الحفظ ينشئ مسودة خاصة بالإدارة. النشر إجراء مستقل. النص المنشور محفوظ ولا يُعدّل؛ استخدم نسخة جديدة عند الحاجة.')),save,cancel);
 toolbar.append(add,reload,field(translateStatic('تصفية حسب العقار'),filter));d.body.append(node('p',translateStatic('تُعرض المواد المنشورة في حساب المستأجر المرتبط بعقد فعال في العقار. يثبت الاطلاع بعد إقرار المستأجر بنفسه. يعرض هذا القسم أحدث ١٠٠ سجل متاح لك.')),toolbar,editor,list,history);
 const rpc=(action,data={})=>d.session.request(d.session.client.rpc('aqari_property_notices',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:data}));
 const matches=(record,values)=>Object.entries(values).every(([key,value])=>key==='expires_at'?String(record[key]||'')===String(value||'')||new Date(record[key]).getTime()===new Date(value).getTime():String(record[key]??'')===String(value??''));
 function closeEditor(){editing=null;requestId=crypto.randomUUID();editor.reset();editor.hidden=true;}
 function openEditor(record=null,copy=false){
  if(!manager)return;editing=copy?null:record;requestId=editing?.id||crypto.randomUUID();editor.reset();
  if(record){property.value=record.property_id;kind.value=record.kind;title.value=record.title;body.value=record.body;expiry.value=record.expires_at?new Date(new Date(record.expires_at).getTime()+10800000).toISOString().slice(0,10):'';}
  editor.hidden=false;history.replaceChildren();title.focus();
 }
 function render(){
  list.replaceChildren();const rows=records.filter(record=>!filter.value||record.property_id===filter.value);
  if(!rows.length)list.append(node('p',translateStatic('لا توجد سجلات محفوظة ضمن التصفية الحالية.')));
  for(const record of rows){
   const card=node('article'),content=text('p',record.body);content.style.whiteSpace='pre-wrap';
   card.append(text('h3',record.title),text('p',(properties.find(p=>p.id===record.property_id)?.name||'العقار')+' • '+(kinds[record.kind]||'محتوى العقار')+' • '+(states[record.status]||record.status)+' • النسخة '+record.revision),content,text('p','تاريخ النشر: '+date(record.published_at)+' • نهاية العرض: '+date(record.expires_at)),text('p','إقرارات الاطلاع: '+Number(record.ack_count||0)));
   if(manager&&record.status==='draft'){
    const edit=node('button',translateStatic('تعديل المسودة')),publish=node('button',translateStatic('نشر للمستأجرين'));edit.type=publish.type='button';edit.onclick=()=>openEditor(record);publish.onclick=()=>d.run(async()=>{
     await rpc('publish',{id:record.id,revision:record.revision});await load();const verified=records.find(r=>r.id===record.id);
     if(!verified||verified.status!=='published'||verified.revision<=record.revision||!matches(verified,{title:record.title,body:record.body,property_id:record.property_id,kind:record.kind,expires_at:record.expires_at}))throw Error('لم يتأكد نشر النسخة المطلوبة. حدّث السجلات قبل إعادة المحاولة.');
     closeEditor();d.status.textContent=translateStatic('تم نشر النسخة والتحقق منها. أصبحت متاحة للمستأجرين المخولين في العقار.');
    });card.append(edit,publish);
   }
   if(manager&&record.status!=='draft'){const copy=node('button',translateStatic('إنشاء مسودة جديدة من هذه النسخة'));copy.type='button';copy.onclick=()=>openEditor(record,true);card.append(copy);}
   if(manager&&record.status!=='archived'){
    const archiveForm=node('form'),reason=node('input'),archive=node('button',translateStatic('أرشفة وإيقاف العرض'));reason.required=true;reason.minLength=3;reason.maxLength=500;archive.type='submit';archiveForm.append(field(translateStatic('سبب الأرشفة الموثق'),reason),archive);
    archiveForm.onsubmit=e=>{e.preventDefault();d.run(async()=>{const why=reason.value.trim();if(why.length<3||why.length>500)throw Error('أدخل سبب الأرشفة من ٣ إلى ٥٠٠ حرف.');await rpc('archive',{id:record.id,revision:record.revision,reason:why});await load();if(records.find(r=>r.id===record.id)?.status!=='archived')throw Error('لم تتأكد الأرشفة. حدّث السجلات.');if(editing?.id===record.id)closeEditor();d.status.textContent=translateStatic('تمت الأرشفة والتحقق منها. حُفظ الأصل وسجل الإجراء.');});};card.append(archiveForm);
   }
   const audit=node('button',translateStatic('سجل النسخ وإقرارات الاطلاع'));audit.type='button';audit.onclick=()=>d.run(async()=>{
    const data=await rpc('history',{id:record.id});if(!Array.isArray(data?.versions)||!Array.isArray(data?.acknowledgements))throw Error('تعذر قراءة سجل هذه المادة.');
    history.replaceChildren(text('h3','سجل: '+record.title));
    for(const version of data.versions){const section=node('details'),original=version.after_snapshot||version.before_snapshot||{};section.append(text('summary','النسخة '+version.revision+' • '+(actions[version.action]||version.action)+' • '+date(version.recorded_at)),text('p','المستخدم: '+(version.actor_name||'غير مدون')),text('p',version.reason||''),text('h4',original.title));const saved=text('p',original.body);saved.style.whiteSpace='pre-wrap';section.append(saved);history.append(section);}
    history.append(node('h4',translateStatic('إقرارات الاطلاع المسجلة')));if(!data.acknowledgements.length)history.append(node('p',translateStatic('لا توجد إقرارات اطلاع مسجلة.')));
    for(const acknowledgement of data.acknowledgements)history.append(text('p',(acknowledgement.user_name||'المستأجر')+' • النسخة '+acknowledgement.notice_revision+' • '+date(acknowledgement.acknowledged_at)));
    d.status.textContent=translateStatic('تم استرجاع سجل النسخ والإقرارات من قاعدة البيانات.');
   });card.append(audit);list.append(card);
  }
 }
 async function load(){
  const data=await rpc('list');if(!Array.isArray(data?.properties)||!Array.isArray(data?.notices))throw Error('تعذر قراءة الإعلانات المحفوظة.');
  properties=data.properties;records=data.notices;manager=data.manager===true;add.hidden=!manager;const selected=filter.value,selectedProperty=property.value;
  filter.replaceChildren();const all=node('option',translateStatic('كل العقارات المتاحة'));all.value='';filter.append(all);property.replaceChildren();
  for(const p of properties){const option=node('option',p.name),choice=node('option',p.name);option.value=choice.value=p.id;filter.append(option);property.append(choice);}
  if(properties.some(p=>p.id===selected))filter.value=selected;if(properties.some(p=>p.id===selectedProperty))property.value=selectedProperty;
  if(!manager)closeEditor();render();d.status.textContent=translateStatic('تم استرجاع الإعلانات والإرشادات المحفوظة.');
 }
 filter.onchange=render;add.onclick=()=>openEditor();cancel.onclick=closeEditor;reload.onclick=()=>d.run(load);
 editor.onsubmit=e=>{e.preventDefault();d.run(async()=>{
  const expiresAt=expiry.value?new Date(expiry.value+'T23:59:59+03:00').toISOString():null;
  const values={property_id:property.value,kind:kind.value,title:title.value.trim(),body:body.value.trim(),expires_at:expiresAt};
  if(!properties.some(p=>p.id===values.property_id)||!values.title||!values.body)throw Error('أكمل العقار والعنوان والنص.');
  const expected=editing?.revision||0,id=requestId;await rpc('save',{id,revision:expected,...values});await load();const verified=records.find(r=>r.id===id);
  if(!verified||verified.status!=='draft'||verified.revision<=expected||!matches(verified,values))throw Error('لم تتأكد مطابقة المسودة. حدّث السجلات قبل إعادة الحفظ.');
  closeEditor();d.status.textContent=translateStatic('تم حفظ المسودة والتحقق منها بإعادة القراءة. يمكن نشرها من بطاقة السجل.');
 });};
 d.onDispose(()=>{records=[];properties=[];editing=null;});d.run(load);
}

