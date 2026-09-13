import {createDialog,node,field} from '../components/dialog.js';

const kinds={notice:'إعلان العقار',guidance:'إرشاد للمستأجر',circular:'تعميم إداري'};
const states={draft:'مسودة',published:'منشور',archived:'مؤرشف'};
const actions={save:'حفظ المسودة',publish:'نشر',archive:'أرشفة'};
const date=value=>value?new Date(value).toLocaleString('ar-KW',{timeZone:'Asia/Kuwait'}):'غير محدد';
const text=(tag,value)=>node(tag,String(value??''));

export function openPropertyNotices(){
 const d=createDialog('إعلانات العقارات وإرشادات المستأجرين');if(!d)return;
 let records=[],properties=[],manager=false,editing=null,requestId=crypto.randomUUID(),pendingWrite=null,baseline='';
 const toolbar=node('div'),reload=node('button','تحديث السجلات'),add=node('button','إعداد مسودة جديدة'),filter=node('select'),list=node('div'),editor=node('form'),history=node('div');
 const property=node('select'),kind=node('select'),title=node('input'),body=node('textarea'),expiry=node('input'),save=node('button','حفظ المسودة والتحقق منها'),cancel=node('button','إغلاق المسودة');
 title.required=body.required=property.required=true;title.maxLength=200;body.maxLength=10000;body.rows=8;expiry.type='date';save.type='submit';cancel.type=reload.type=add.type='button';editor.hidden=true;
 for(const [value,label]of Object.entries(kinds)){const option=node('option',label);option.value=value;kind.append(option);}
 editor.append(node('h3','مسودة الإعلان أو الإرشاد'),field('العقار',property),field('نوع المحتوى',kind),field('العنوان',title),field('النص',body),field('تاريخ انتهاء العرض — نهاية اليوم بتوقيت الكويت، اختياري',expiry),node('p','الحفظ ينشئ مسودة خاصة بالإدارة. النشر إجراء مستقل. النص المنشور محفوظ ولا يُعدّل؛ استخدم نسخة جديدة عند الحاجة.'),save,cancel);
 toolbar.append(add,reload,field('تصفية حسب العقار',filter));d.body.append(node('p','تُعرض المواد المنشورة في حساب المستأجر المرتبط بعقد فعال في العقار. يثبت الاطلاع بعد إقرار المستأجر بنفسه. يعرض هذا القسم أحدث ١٠٠ سجل متاح لك.'),toolbar,editor,list,history);
 const rpc=(action,data={})=>d.session.request(d.session.client.rpc('aqari_property_notices',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:data}));
 const matches=(record,values)=>Object.entries(values).every(([key,value])=>key==='expires_at'?String(record[key]||'')===String(value||'')||new Date(record[key]).getTime()===new Date(value).getTime():String(record[key]??'')===String(value??''));
 const snapshot=()=>JSON.stringify([property.value,kind.value,title.value,body.value,expiry.value]);
 const dirty=()=>!editor.hidden&&snapshot()!==baseline;
 const valuesOf=record=>Object.fromEntries(['property_id','kind','title','body','expires_at'].map(key=>[key,record[key]??null]));
 function pending(){if(!pendingWrite)return false;d.status.textContent='حدّث السجلات للتحقق من العملية السابقة قبل بدء عملية أخرى. احتُفظ بمدخلاتك.';return true;}
 function closeEditor(){editing=null;requestId=crypto.randomUUID();editor.reset();editor.hidden=true;}
 function openEditor(record=null,copy=false){
  if(!manager||pending())return;if(dirty()){d.status.textContent='احفظ المسودة الحالية أو أغلقها قبل فتح مسودة أخرى.';return;}editing=copy?null:record;requestId=editing?.id||crypto.randomUUID();editor.reset();
  if(record){property.value=record.property_id;kind.value=record.kind;title.value=record.title;body.value=record.body;expiry.value=record.expires_at?new Date(new Date(record.expires_at).getTime()+10800000).toISOString().slice(0,10):'';}
  editor.hidden=false;baseline=snapshot();history.replaceChildren();title.focus();
 }
 function render(){
  add.hidden=!manager||Boolean(pendingWrite);save.textContent=pendingWrite?'التحقق من العملية السابقة':'حفظ المسودة والتحقق منها';
  list.replaceChildren();const rows=records.filter(record=>!filter.value||record.property_id===filter.value);
  if(!rows.length)list.append(node('p','لا توجد سجلات محفوظة ضمن التصفية الحالية.'));
  for(const record of rows){
   const card=node('article'),content=text('p',record.body);content.style.whiteSpace='pre-wrap';
   card.append(text('h3',record.title),text('p',(properties.find(p=>p.id===record.property_id)?.name||'العقار')+' • '+(kinds[record.kind]||'محتوى العقار')+' • '+(states[record.status]||record.status)+' • النسخة '+record.revision),content,text('p','تاريخ النشر: '+date(record.published_at)+' • نهاية العرض: '+date(record.expires_at)),text('p','إقرارات الاطلاع: '+Number(record.ack_count||0)));
   if(manager&&!pendingWrite&&record.status==='draft'){
    const edit=node('button','تعديل المسودة'),publish=node('button','نشر للمستأجرين');edit.type=publish.type='button';edit.onclick=()=>openEditor(record);publish.onclick=()=>d.run(async()=>{
     await write('publish',{id:record.id,revision:record.revision},valuesOf(record));
    });card.append(edit,publish);
   }
   if(manager&&!pendingWrite&&record.status!=='draft'){const copy=node('button','إنشاء مسودة جديدة من هذه النسخة');copy.type='button';copy.onclick=()=>openEditor(record,true);card.append(copy);}
   if(manager&&!pendingWrite&&record.status!=='archived'){
    const archiveForm=node('form'),reason=node('input'),archive=node('button','أرشفة وإيقاف العرض');reason.required=true;reason.minLength=3;reason.maxLength=500;archive.type='submit';archiveForm.append(field('سبب الأرشفة الموثق',reason),archive);
    archiveForm.onsubmit=e=>{e.preventDefault();d.run(async()=>{const why=reason.value.trim();if(why.length<3||why.length>500)throw Error('أدخل سبب الأرشفة من ٣ إلى ٥٠٠ حرف.');await write('archive',{id:record.id,revision:record.revision,reason:why},valuesOf(record));});};card.append(archiveForm);
   }
   const audit=node('button','سجل النسخ وإقرارات الاطلاع');audit.type='button';audit.onclick=()=>d.run(async()=>{
    history.replaceChildren();
    const data=await rpc('history',{id:record.id});if(!Array.isArray(data?.versions)||!Array.isArray(data?.acknowledgements))throw Error('تعذر قراءة سجل هذه المادة.');
    history.replaceChildren(text('h3','سجل: '+record.title));
    for(const version of data.versions){const section=node('details'),original=version.after_snapshot||version.before_snapshot||{};section.append(text('summary','النسخة '+version.revision+' • '+(actions[version.action]||version.action)+' • '+date(version.recorded_at)),text('p','المستخدم: '+(version.actor_name||'غير مدون')),text('p',version.reason||''),text('h4',original.title));const saved=text('p',original.body);saved.style.whiteSpace='pre-wrap';section.append(saved);history.append(section);}
    history.append(node('h4','إقرارات الاطلاع المسجلة'));if(!data.acknowledgements.length)history.append(node('p','لا توجد إقرارات اطلاع مسجلة.'));
    for(const acknowledgement of data.acknowledgements)history.append(text('p',(acknowledgement.user_name||'المستأجر')+' • النسخة '+acknowledgement.notice_revision+' • '+date(acknowledgement.acknowledged_at)));
    d.status.textContent='تم استرجاع سجل النسخ والإقرارات من قاعدة البيانات.';
   });card.append(audit);list.append(card);
  }
 }
 async function load({reconcile=false}={}){
  records=[];list.replaceChildren();history.replaceChildren();
  const data=await rpc('list');if(!Array.isArray(data?.properties)||!Array.isArray(data?.notices))throw Error('تعذر قراءة الإعلانات المحفوظة.');
  properties=data.properties;records=data.notices;manager=data.manager===true;add.hidden=!manager;const selected=filter.value,selectedProperty=property.value;
  filter.replaceChildren();const all=node('option','كل العقارات المتاحة');all.value='';filter.append(all);property.replaceChildren();
  for(const p of properties){const option=node('option',p.name),choice=node('option',p.name);option.value=choice.value=p.id;filter.append(option);property.append(choice);}
  if(properties.some(p=>p.id===selected))filter.value=selected;if(properties.some(p=>p.id===selectedProperty))property.value=selectedProperty;
  if(!manager)closeEditor();
  if(reconcile&&pendingWrite)await reconcileWrite();else d.status.textContent='تم استرجاع الإعلانات والإرشادات المحفوظة.';
  render();
 }
 async function reconcileWrite(){
  const operation=pendingWrite;if(!operation)return;
  const verified=records.find(row=>row.id===operation.id),state={save:'draft',publish:'published',archive:'archived'}[operation.action];
  let confirmed=verified?.status===state&&verified.revision===operation.revision+1&&matches(verified,operation.values);
  if(operation.action==='publish')confirmed=confirmed&&Boolean(verified.published_at);
  if(confirmed&&operation.action==='archive'){
   const audit=await rpc('history',{id:operation.id}),version=audit?.versions?.find(row=>row.revision===verified.revision&&row.action==='archive');
   confirmed=version?.reason===operation.reason&&version.after_snapshot?.id===operation.id&&version.after_snapshot?.status==='archived'&&matches(version.after_snapshot,operation.values);
  }
  if(!confirmed){d.status.textContent=operation.action==='save'?'لم تتأكد مطابقة المسودة. احتُفظ بمدخلاتك؛ حدّث السجلات للتحقق قبل إعادة الحفظ.':'لم تتأكد مطابقة العملية السابقة. حدّث السجلات للتحقق قبل إعادة المحاولة.';return;}
  pendingWrite=null;
  if(operation.action==='save'){
   if(snapshot()===operation.draftSnapshot)closeEditor();
   else{editing=verified;requestId=verified.id;baseline=operation.draftSnapshot;}
   d.status.textContent=editor.hidden?'تم التحقق من حفظ المسودة بإعادة القراءة. يمكن نشرها من بطاقة السجل.':'تم التحقق من الحفظ السابق. احتُفظ بتعديلاتك الجديدة في المسودة؛ احفظها عندما تنتهي.';
  }else{
   if(editing?.id===operation.id&&!dirty())closeEditor();
   d.status.textContent=operation.action==='publish'?'تم نشر النسخة والتحقق منها. أصبحت متاحة للمستأجرين المخولين في العقار.':'تمت الأرشفة والتحقق من سببها وسجلها. حُفظ الأصل وسجل الإجراء.';
  }
 }
 async function write(action,data,values){
  if(!manager)throw Error('لا تتيح الصلاحية الحالية تعديل الإعلانات.');
  if(pending()){await load({reconcile:true});return;}
  if(action!=='save'&&dirty())throw Error('احفظ تعديلات المسودة أو أغلقها قبل النشر أو الأرشفة.');
  pendingWrite={action,...data,values:{...values},draftSnapshot:snapshot()};let acknowledged=false;
  try{await rpc(action,data);acknowledged=true;await load({reconcile:true});if(action==='save'&&!pendingWrite&&editor.hidden)d.status.textContent='تم حفظ المسودة والتحقق منها بإعادة القراءة. يمكن نشرها من بطاقة السجل.';}
  catch(error){
   if([401,403].includes(error?.status)||error?.code==='42501'||error?.message==='ACCESS_DENIED')throw error;
   // A confirmed rejection did not commit. Network/unknown outcomes need a read,
   // never a replay using an old revision or newly edited text.
   if(!acknowledged&&([400,404,409,422].includes(error?.status)||['P0001','40001','22007','22008'].includes(error?.code))){pendingWrite=null;render();throw error;}
   render();throw Error('تعذر تأكيد العملية السابقة. احتُفظ بمدخلاتك؛ حدّث السجلات للتحقق دون تكرار العملية.');
  }
 }
 filter.onchange=render;add.onclick=()=>openEditor();cancel.onclick=()=>{if(!pending())closeEditor();};reload.onclick=()=>d.run(()=>load({reconcile:true}));
 editor.onsubmit=e=>{e.preventDefault();d.run(async()=>{
  if(pendingWrite){await load({reconcile:true});return;}
  const expiresAt=expiry.value?new Date(expiry.value+'T23:59:59+03:00').toISOString():null;
  const values={property_id:property.value,kind:kind.value,title:title.value.trim(),body:body.value.trim(),expires_at:expiresAt};
  if(!properties.some(p=>p.id===values.property_id)||!values.title||!values.body)throw Error('أكمل العقار والعنوان والنص.');
  const expected=editing?.revision||0,id=requestId;await write('save',{id,revision:expected,...values},values);
 });};
 d.onDispose(()=>{records=[];properties=[];editing=null;pendingWrite=null;manager=false;list.replaceChildren();history.replaceChildren();editor.reset();});d.run(load);
}
