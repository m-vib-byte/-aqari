import {uiError} from '../components/ui-error.js';
import {safeError} from '../api/session.js';
import {dateLocale as visibleDateLocale} from '../components/locale.js';
import {t as translateStatic} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';

const states={get draft(){return translateStatic('مسودة غير محتسبة');},get approved(){return translateStatic('مصروف معتمد');},get cancelled(){return translateStatic('ملغى مع حفظ الأصل');}};
const methods={get cash(){return translateStatic('نقدي');},get bank(){return translateStatic('تحويل بنكي');},get cheque(){return translateStatic('شيك');}};
const actions={get save(){return translateStatic('حفظ مسودة');},get approve(){return translateStatic('اعتماد مصروف');},get cancel(){return translateStatic('إلغاء موثق');},get close_period(){return translateStatic('إقفال الفترة');},get 'expense.save'(){return translateStatic('حفظ مسودة');},get 'expense.approve'(){return translateStatic('اعتماد مصروف');},get 'expense.cancel'(){return translateStatic('إلغاء موثق');},get 'period.close'(){return translateStatic('إقفال الفترة');}};
const text=(tag,value)=>node(tag,String(value??''));
const stamp=value=>value?new Date(value).toLocaleString(visibleDateLocale(),{timeZone:'Asia/Kuwait'}):translateStatic('غير مسجل');
const digits=value=>String(value??'').replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-1632)).replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-1776)).replace(/٫/g,'.');
function money(value){
 const normalized=digits(value).trim();
 if(!/^\d{1,12}(?:\.\d{1,3})?$/.test(normalized))throw Error('أدخل المبلغ بالدينار الكويتي، بثلاث منازل عشرية كحد أقصى ومن دون فواصل آلاف.');
 const [whole,fraction='']=normalized.split('.');return whole.replace(/^0+(?=\d)/,'')+'.'+fraction.padEnd(3,'0');
}
function civilDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.slice(0,4)<'1900')return false;
 const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
function today(){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuwait',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 return ['year','month','day'].map(key=>parts.find(part=>part.type===key).value).join('-');
}
function validMonth(value){return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)&&value.slice(0,4)>='1900';}
const searchKey=value=>digits(value).normalize('NFKC').toLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/\s+/g,' ').trim();

export function openFinancialRegister(){
 const d=createDialog(translateStatic('سجل المصروفات وإقفال الفترة المالية'));if(!d)return;
 let currentMonth=today().slice(0,7),records=[],properties=[],documents=[],history=[],period=null,summary={},manager=false,canWrite=false;
 let editing=null,requestId=crypto.randomUUID(),baseline='',pendingWrite=null,readDenied=false;
 const reasons=new Map();
 const toolbar=node('div'),month=node('input'),reload=node('button',translateStatic('تحديث السجل والتحقق من الحفظ')),add=node('button',translateStatic('إعداد مصروف جديد'));
 const overview=node('div'),list=node('div'),editor=node('form'),audit=node('div'),closing=node('div');
 const filters=node('div'),search=node('input'),propertyFilter=node('select'),stateFilter=node('select'),resetFilters=node('button',translateStatic('مسح البحث والتصفية')),results=node('p'),pager=node('div');
 let page=1;const pageSize=20;
 filters.className='aq267-financial-filters';pager.className='aq267-financial-pager';search.type='search';search.maxLength=200;search.placeholder=translateStatic('المستفيد، البند، رقم السند أو المرجع');
 resetFilters.type='button';results.setAttribute('role','status');results.setAttribute('aria-live','polite');
 for(const [value,label]of Object.entries({all:translateStatic('كل الحالات'),...states})){const option=node('option',label);option.value=value;stateFilter.append(option);}
 filters.append(field(translateStatic('البحث في مصروفات الفترة'),search),field(translateStatic('تصفية المصروفات حسب العقار'),propertyFilter),field(translateStatic('حالة المصروف'),stateFilter),resetFilters);
 month.type='month';month.value=currentMonth;reload.type=add.type='button';
 const property=node('select'),expenseDate=node('input'),category=node('input'),payee=node('input'),amount=node('input'),method=node('select'),reference=node('input'),description=node('textarea'),document=node('select');
 const save=node('button',translateStatic('حفظ المسودة والتحقق منها')),discard=node('button',translateStatic('إغلاق المسودة'));
 expenseDate.type='date';expenseDate.max=today();amount.type='text';amount.inputMode='decimal';amount.dir='ltr';amount.maxLength=16;description.rows=3;
 property.required=expenseDate.required=category.required=payee.required=amount.required=true;
 category.maxLength=120;payee.maxLength=200;reference.maxLength=200;description.maxLength=2000;
 save.type='submit';discard.type='button';editor.hidden=true;
 for(const [value,label]of Object.entries(methods)){const option=node('option',label);option.value=value;method.append(option);}
 editor.append(node('h3',translateStatic('بيانات المصروف')),field(translateStatic('العقار'),property),field(translateStatic('تاريخ المصروف'),expenseDate),field(translateStatic('بند المصروف'),category),field(translateStatic('المستفيد'),payee),field(translateStatic('المبلغ بالدينار الكويتي'),amount),field(translateStatic('طريقة الصرف'),method),field(translateStatic('رقم مرجع التحويل أو الشيك'),reference),field(translateStatic('البيان والتفاصيل'),description),field(translateStatic('مستند المصروف المحفوظ'),document),node('p',translateStatic('اختر مستنداً مرفوعاً للعقار من قسم المستندات. يمكن حفظ المسودة بدونه، ويلزم إرفاقه قبل الاعتماد.')),save,discard);
 const bankReconciliation=node('button',translateStatic('مطابقة التحويلات البنكية'));
 bankReconciliation.type='button';
 bankReconciliation.onclick=()=>d.run(async()=>{const m=await import('./bank-reconciliation.js');d.close();return m.openBankReconciliation();});
 toolbar.append(field(translateStatic('الفترة المالية'),month),reload,add,bankReconciliation);
 d.body.append(node('p',translateStatic('يحتسب هذا السجل المصروفات المعتمدة فقط. المسودات والملغاة لا تدخل في الإجمالي. لا يمثل إجمالي المصروفات رصيد الصندوق أو صافي ربح العقار.')),toolbar,overview,editor,filters,results,list,pager,audit,closing);
 const rpc=(action,data={})=>d.session.request(d.session.client.rpc('aqari_financial_register',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:data}));
 const formValues=()=>({property_id:property.value,expense_date:expenseDate.value,category:category.value.trim(),payee:payee.value.trim(),amount:amount.value.trim(),method:method.value,reference:reference.value.trim(),description:description.value.trim(),document_id:document.value||null});
 const draftSnapshot=()=>JSON.stringify(formValues());
 const dirty=()=>!editor.hidden&&draftSnapshot()!==baseline;
 const allowDiscard=()=>!dirty()||window.confirm(translateStatic('توجد تعديلات غير محفوظة في مسودة المصروف. هل تريد تركها؟'));
 function closeEditor(){editing=null;requestId=crypto.randomUUID();editor.reset();editor.hidden=true;baseline='';}
 function clearPrivate(){
  readDenied=true;records=[];properties=[];documents=[];history=[];period=null;summary={};manager=false;canWrite=false;reasons.clear();
  // Keep only a lock, never financial values, until an explicit authorized reread.
  pendingWrite=pendingWrite?{redacted:true}:null;
  closeEditor();property.replaceChildren();document.replaceChildren();
  search.value='';propertyFilter.replaceChildren();stateFilter.value='all';page=1;filters.hidden=pager.hidden=true;pager.replaceChildren();results.textContent='';
  overview.replaceChildren();list.replaceChildren();audit.replaceChildren();closing.replaceChildren();add.hidden=true;add.disabled=true;
 }
 function populateProperties(selected=''){
  property.replaceChildren();const placeholder=node('option',translateStatic('اختر العقار'));placeholder.value='';property.append(placeholder);
  for(const item of properties){const option=node('option',item.name);option.value=item.id;property.append(option);}
  if(selected&&!properties.some(item=>item.id===selected)){const unavailable=node('option',translateStatic('العقار السابق غير متاح حالياً'));unavailable.value=selected;property.append(unavailable);}
  property.value=selected;
 }
 function populateDocuments(selected=''){
  document.replaceChildren();const empty=node('option',translateStatic('دون مستند — مسودة فقط'));empty.value='';document.append(empty);
  for(const item of documents.filter(item=>item.property_id===property.value)){
   const option=node('option',(item.document_no?item.document_no+' — ':'')+(item.title||translateStatic('مستند العقار')));option.value=item.id;document.append(option);
  }
  if(selected&&!documents.some(item=>item.id===selected&&item.property_id===property.value)){
   const missing=node('option',translateStatic('المستند السابق غير متاح لهذا العقار'));missing.value=selected;document.append(missing);
  }
  document.value=selected;
 }
 function openEditor(record=null){
  if(!canWrite||period?.closed_at||pendingWrite||!allowDiscard())return;
  editing=record;requestId=record?.id||crypto.randomUUID();editor.reset();populateProperties(record?.property_id||'');
  expenseDate.value=record?.expense_date||(currentMonth===today().slice(0,7)?today():currentMonth+'-01');
  category.value=record?.category||'';payee.value=record?.payee||'';amount.value=record?money(record.amount):'';
  method.value=record?.method||'cash';reference.value=record?.reference||'';description.value=record?.description||'';populateDocuments(record?.document_id||'');
  editor.hidden=false;baseline=JSON.stringify(formValues());category.focus();
 }
 function matches(record,values){
  return Object.entries(values).every(([key,value])=>{
   if(key==='amount'){try{return money(record[key])===money(value);}catch{return false;}}
   return String(record[key]??'')===String(value??'');
  });
 }
 function confirmWrite(write){
  if(write.action==='close_period')return period?.month===write.month+'-01'&&Boolean(period.closed_at)&&period.reason===write.reason;
  const row=records.find(record=>record.id===write.id);
  return row&&row.revision===write.revision+1&&row.state===write.state&&matches(row,write.values||{})
   &&(write.action!=='approve'||Boolean(row.voucher_no&&row.approved_at)&&row.approval_reason===write.reason)
   &&(write.action!=='cancel'||Boolean(row.cancelled_at)&&row.cancel_reason===write.reason);
 }
 function finishWrite(write){
  if(write.action==='save'&&!editor.hidden&&requestId===write.id&&draftSnapshot()!==write.draftSnapshot){
   editing=records.find(row=>row.id===write.id);baseline=write.draftSnapshot;return true;
  }
  if(write.action==='save'||editing?.id===write.id||write.action==='close_period')closeEditor();return false;
 }
 function inspectHistory(record){
  if(readDenied)return;
  audit.replaceChildren(text('h3',translateStatic('سجل الإجراء: ')+(record.voucher_no||record.category)));
  const events=history.filter(event=>event.entity_id===record.id);
  if(!events.length)audit.append(node('p',translateStatic('لا توجد إجراءات معروضة لهذا السجل.')));
  for(const event of events)audit.append(text('p',(actions[event.action]||event.action)+' • '+(event.actor_name||translateStatic('غير مدون'))+' • '+stamp(event.recorded_at)+(event.reason?' • '+event.reason:'')));
 }
 function reasonForm(key,label,buttonText,callback){
  const form=node('form'),reason=node('input'),button=node('button',buttonText);reason.required=true;reason.minLength=3;reason.maxLength=500;button.type='submit';
  reason.value=reasons.get(key)||'';reason.oninput=()=>reasons.set(key,reason.value);
  form.append(field(label,reason),button);form.onsubmit=event=>{event.preventDefault();d.run(async()=>{
   const value=reason.value.trim();reasons.set(key,reason.value);if(value.length<3||value.length>500)throw Error('أدخل سبباً موثقاً من ٣ إلى ٥٠٠ حرف.');await callback(value);
  });};return form;
 }
 function render(){
  if(readDenied)return;
  add.hidden=!canWrite||Boolean(period?.closed_at);add.disabled=Boolean(pendingWrite);overview.replaceChildren();
  overview.append(text('p',translateStatic('الفترة: ')+currentMonth+translateStatic(' • المصروفات المعتمدة لكل العقارات المتاحة: ')+money(summary.approved_expenses??'0')+translateStatic(' د.ك • عددها: ')+Number(summary.count||0)));
  if(period?.closed_at)overview.append(text('p',translateStatic('الفترة مقفلة منذ ')+stamp(period.closed_at)+translateStatic(' بواسطة ')+(period.closed_by_name||translateStatic('الإدارة'))+' — '+(period.reason||'')+translateStatic('؛ لا يسمح بإضافة مصروفات أو تعديلها في هذه الفترة.')));
  filters.hidden=false;
  const propertyNames=new Map(properties.map(p=>[p.id,p.name])),terms=searchKey(search.value).split(' ').filter(Boolean),filtered=records.filter(record=>{
   if(propertyFilter.value&&record.property_id!==propertyFilter.value||stateFilter.value!=='all'&&record.state!==stateFilter.value)return false;
   const haystack=searchKey([record.payee,record.category,record.voucher_no,record.reference,record.description,record.expense_date,methods[record.method],propertyNames.get(record.property_id)].join(' '));
   return terms.every(term=>haystack.includes(term));
  });
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));page=Math.max(1,Math.min(page,pages));const start=(page-1)*pageSize;
  results.textContent=filtered.length?translateStatic('نتائج التصفية: ')+filtered.length+translateStatic(' من ')+records.length+translateStatic(' • المعروض: ')+(start+1)+'–'+Math.min(start+pageSize,filtered.length):translateStatic('نتائج التصفية: 0 من ')+records.length;
  const previous=node('button',translateStatic('الصفحة السابقة')),next=node('button',translateStatic('الصفحة التالية'));previous.type=next.type='button';previous.disabled=page===1;next.disabled=page===pages;pager.hidden=pages===1;
  previous.onclick=()=>{if(readDenied||page===1)return;page--;audit.replaceChildren();render();};
  next.onclick=()=>{if(readDenied||page>=pages)return;page++;audit.replaceChildren();render();};
  pager.replaceChildren(previous,node('span',translateStatic('الصفحة ')+page+translateStatic(' من ')+pages),next);
  resetFilters.hidden=!search.value&&!propertyFilter.value&&stateFilter.value==='all';
  list.replaceChildren();if(!filtered.length)list.append(node('p',records.length?translateStatic('لا توجد مصروفات تطابق البحث والتصفية.'):translateStatic('لا توجد مصروفات محفوظة في هذه الفترة.')));
  for(const record of filtered.slice(start,start+pageSize)){
   const card=node('article');card.append(text('h3',(record.voucher_no?record.voucher_no+' — ':'')+record.category),text('p',(properties.find(item=>item.id===record.property_id)?.name||translateStatic('العقار'))+' • '+record.expense_date+' • '+(states[record.state]||record.state)),text('p',translateStatic('المستفيد: ')+record.payee+translateStatic(' • المبلغ: ')+money(record.amount)+translateStatic(' د.ك')),text('p',translateStatic('طريقة الصرف: ')+(methods[record.method]||record.method)+translateStatic(' • المرجع: ')+(record.reference||translateStatic('غير مسجل'))),text('p',record.description||''));
   const attachment=documents.find(item=>item.id===record.document_id&&item.property_id===record.property_id);
   card.append(text('p',translateStatic('المستند: ')+(attachment?((attachment.document_no?attachment.document_no+' — ':'')+(attachment.title||translateStatic('مستند محفوظ'))):record.document_id?translateStatic('مرتبط بالسجل وغير متاح في القائمة الحالية'):translateStatic('لم يرفق بعد'))));
   if(record.approved_at)card.append(text('p',translateStatic('اعتمده: ')+(record.approved_by_name||translateStatic('غير مدون'))+' • '+stamp(record.approved_at)));
   if(record.cancelled_at)card.append(text('p',translateStatic('ألغاه: ')+(record.cancelled_by_name||translateStatic('غير مدون'))+' • '+stamp(record.cancelled_at)+translateStatic(' • السبب: ')+(record.cancel_reason||'')));
   if(!period?.closed_at&&!pendingWrite){
    if(canWrite&&record.state==='draft'){const edit=node('button',translateStatic('تعديل مسودة المصروف'));edit.type='button';edit.onclick=()=>openEditor(record);card.append(edit);}
    if(manager&&record.state==='draft')card.append(reasonForm('approve:'+record.id,translateStatic('سبب اعتماد المصروف'),translateStatic('اعتماد المصروف'),async reason=>{
     if(!attachment)throw Error('يلزم مستند محفوظ ومربوط بالعقار نفسه قبل اعتماد المصروف.');
     if(dirty())throw Error('احفظ تعديلات المسودة أو أغلقها قبل اعتماد المصروف.');
     await write('approve',{id:record.id,revision:record.revision,reason},{id:record.id,revision:record.revision,state:'approved',reason,values:financialValues(record)});
    }));
    if(manager&&record.state!=='cancelled')card.append(reasonForm('cancel:'+record.id,translateStatic('سبب إلغاء المصروف'),translateStatic('إلغاء المصروف مع حفظ الأصل'),async reason=>{
     if(dirty())throw Error('احفظ تعديلات المسودة أو أغلقها قبل إلغاء المصروف.');
     await write('cancel',{id:record.id,revision:record.revision,reason},{id:record.id,revision:record.revision,state:'cancelled',reason,values:financialValues(record)});
    }));
   }
   const log=node('button',translateStatic('عرض سجل المصروف'));log.type='button';log.onclick=()=>inspectHistory(record);card.append(log);list.append(card);
  }
  closing.replaceChildren();
  if(manager&&!period?.closed_at){
   closing.append(node('h3',translateStatic('إقفال الفترة المالية')),node('p',translateStatic('الإقفال نهائي لهذه الفترة ولا يتاح التعديل بعدها. يتحقق النظام من انتهاء الشهر وإغلاق مسودات المصروفات والرواتب المستحقة قبل الإقفال.')));
   if(currentMonth>=today().slice(0,7))closing.append(node('p',translateStatic('يصبح إقفال هذه الفترة متاحاً بعد انتهاء الشهر.')));
   else if(!pendingWrite)closing.append(reasonForm('close:'+currentMonth,translateStatic('سبب إقفال الفترة'),translateStatic('إقفال الشهر نهائياً'),async reason=>{
    if(dirty())throw Error('احفظ تعديلات المسودة أو أغلقها قبل إقفال الفترة.');
    if(!window.confirm(translateStatic('سيُقفل شهر ')+currentMonth+translateStatic(' ولن يسمح بتعديل حركاته. هل تؤكد الإقفال؟')))return;
    await write('close_period',{month:currentMonth,reason},{month:currentMonth,reason});
   }));
  }
 }
 const financialValues=record=>Object.fromEntries(['property_id','expense_date','category','payee','amount','method','reference','description','document_id'].map(key=>[key,record[key]??null]));
 async function load(nextMonth=currentMonth,{reconcile=false}={}){
  let data;
  try{data=await rpc('list',{month:nextMonth});}
  catch(error){if([401,403].includes(error?.status)||error?.code==='42501'||error?.message==='ACCESS_DENIED')clearPrivate();throw error;}
  if(!Array.isArray(data?.expenses)||!Array.isArray(data.properties)||!Array.isArray(data.documents)||!Array.isArray(data.history)||!data.summary)throw Error('تعذر قراءة سجل المصروفات المحفوظ.');
  const selectedProperty=property.value,selectedDocument=document.value;
  if(nextMonth!==currentMonth)page=1;
  readDenied=false;records=data.expenses;properties=data.properties;documents=data.documents;history=data.history;period=data.period;summary=data.summary;manager=data.manager===true;canWrite=data.can_write===true;currentMonth=nextMonth;month.value=currentMonth;
  populateProperties(selectedProperty);populateDocuments(selectedDocument);
  const selectedFilter=propertyFilter.value;propertyFilter.replaceChildren();const all=node('option',translateStatic('كل العقارات المتاحة'));all.value='';propertyFilter.append(all);
  for(const p of properties){const option=node('option',p.name);option.value=p.id;propertyFilter.append(option);}
  if(selectedFilter&&!properties.some(p=>p.id===selectedFilter)){const unavailable=node('option',translateStatic('العقار المحدد غير متاح حالياً'));unavailable.value=selectedFilter;propertyFilter.append(unavailable);}propertyFilter.value=selectedFilter;
  if(reconcile&&pendingWrite){
   if(pendingWrite.redacted)d.status.textContent=translateStatic('تم استرجاع السجل بعد التحقق من الصلاحية. راجع العملية السابقة في السجلات المحفوظة قبل إضافة عملية جديدة.');
   else if(confirmWrite(pendingWrite)){const kept=finishWrite(pendingWrite);d.status.textContent=kept?translateStatic('تم التحقق من العملية السابقة. احتُفظ بتعديلاتك الجديدة؛ احفظها عندما تنتهي.'):translateStatic('تم التحقق من العملية السابقة بإعادة القراءة من قاعدة البيانات.');}
   else d.status.textContent=translateStatic('السجل المحفوظ لا يطابق العملية المطلوبة. احتُفظ بمدخلات المسودة؛ راجع السجل قبل إعادة الحفظ.');
   pendingWrite=null;
  }
  render();
 }
 async function write(action,values,proof){
  if(pendingWrite)throw Error('حدّث السجل للتحقق من العملية السابقة أولاً.');
  pendingWrite={action,...proof,draftSnapshot:draftSnapshot()};
  try{
   await rpc(action,values);await load();
   if(!confirmWrite(pendingWrite))throw Error('لم تتأكد مطابقة العملية من السجل المحفوظ.');
   const kept=finishWrite(pendingWrite);pendingWrite=null;render();
   if(kept){d.status.textContent=translateStatic('تم التحقق من العملية السابقة. احتُفظ بتعديلاتك الجديدة؛ احفظها عندما تنتهي.');return;}
   d.status.textContent=action==='save'?translateStatic('تم حفظ المسودة والتحقق منها بإعادة القراءة.'):action==='approve'?translateStatic('تم اعتماد المصروف والتحقق من قيمته وسجله.'):action==='cancel'?translateStatic('تم الإلغاء والتحقق منه مع حفظ البيانات الأصلية.'):translateStatic('تم إقفال الشهر والتحقق من سجل الإقفال.');
  }catch(error){
   if([401,403].includes(error?.status)||error?.code==='42501'||error?.message==='ACCESS_DENIED'){clearPrivate();throw error;}
   render();throw uiError(translateStatic(safeError(error))+translateStatic(' حدّث السجل للتحقق قبل إعادة المحاولة.'));
  }
 }
 property.onchange=()=>populateDocuments('');
 add.onclick=()=>openEditor();discard.onclick=()=>{if(pendingWrite){d.status.textContent=translateStatic('حدّث السجل للتحقق من العملية السابقة قبل إغلاق المسودة.');return;}if(allowDiscard())closeEditor();};
 function filterChanged(){if(readDenied)return;page=1;audit.replaceChildren();render();}
 search.oninput=propertyFilter.onchange=stateFilter.onchange=filterChanged;
 resetFilters.onclick=()=>{if(readDenied)return;search.value='';propertyFilter.value='';stateFilter.value='all';filterChanged();};
 reload.onclick=()=>d.run(async()=>{const wasPending=Boolean(pendingWrite);await load(currentMonth,{reconcile:true});if(!wasPending&&!pendingWrite)d.status.textContent=translateStatic('تم استرجاع المصروفات وحالة الفترة من قاعدة البيانات.');});
 month.onchange=()=>{
  const requested=month.value;
  if(!validMonth(requested)){month.value=currentMonth;d.status.textContent=translateStatic('اختر شهراً صحيحاً للفترة المالية.');return;}
  if(pendingWrite){month.value=currentMonth;d.status.textContent=translateStatic('حدّث السجل للتحقق من العملية السابقة قبل تغيير الفترة.');return;}
  if(!allowDiscard()){month.value=currentMonth;return;}
  d.run(async()=>{try{await load(requested);closeEditor();audit.replaceChildren();d.status.textContent=translateStatic('تم استرجاع الفترة المالية المختارة.');}catch(error){month.value=currentMonth;throw error;}});
 };
 editor.onsubmit=event=>{event.preventDefault();d.run(async()=>{
  if(!canWrite||period?.closed_at)throw Error('لا تتاح إضافة المصروفات أو تعديلها في هذه الفترة حسب الصلاحية الحالية.');
  if(pendingWrite)throw Error('حدّث السجل للتحقق من العملية السابقة أولاً.');
  const values=formValues();values.amount=money(values.amount);
  if(values.amount.split('.')[0].length>9)throw Error('مبلغ المصروف يتجاوز الحد المسموح به.');
  if(values.amount==='0.000')throw Error('يجب أن يكون مبلغ المصروف أكبر من صفر.');
  if(!civilDate(values.expense_date)||values.expense_date.slice(0,7)!==currentMonth)throw Error('أدخل تاريخاً صحيحاً ضمن الشهر المعروض.');
  if(values.expense_date>today())throw Error('تاريخ المصروف لا يكون مستقبلياً.');
  if(!properties.some(item=>item.id===values.property_id)||!values.category||!values.payee)throw Error('أكمل العقار وبند المصروف والمستفيد.');
  if(!Object.hasOwn(methods,values.method))throw Error('اختر طريقة صرف صحيحة.');
  if(values.method!=='cash'&&!values.reference)throw Error('أدخل رقم مرجع التحويل أو الشيك.');
  if(values.document_id&&!documents.some(item=>item.id===values.document_id&&item.property_id===values.property_id))throw Error('اختر مستنداً محفوظاً للعقار نفسه.');
  const id=requestId,revision=editing?.revision||0;
  await write('save',{id,revision,...values},{id,revision,state:'draft',values});
 });};
 if(d.el?.addEventListener){
  const closeButton=d.el.querySelector('button');
  const closeAction=closeButton?.onclick;
  // The window navigation handler invokes onclick before dialog capture listeners.
  if(typeof closeAction==='function')closeButton.onclick=function(event){
   if(!allowDiscard()){event?.preventDefault();event?.stopImmediatePropagation();return;}
   return closeAction.call(this,event);
  };
  d.el.addEventListener('cancel',event=>{if(!allowDiscard()){event.preventDefault();event.stopImmediatePropagation();}},true);
 }
 d.onDispose(()=>{clearPrivate();pendingWrite=null;});
 d.run(async()=>{await load();d.status.textContent=translateStatic('تم استرجاع المصروفات وحالة الفترة من قاعدة البيانات.');});
}

