import {createDialog,node,field} from '../components/dialog.js';

const PAGE_SIZE=50;
const AUDIT_LIMIT=100;
const validMonth=value=>/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function monthValue(now=new Date()){
 const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Kuwait',year:'numeric',month:'2-digit'}).formatToParts(now);
 return `${parts.find(x=>x.type==='year').value}-${parts.find(x=>x.type==='month').value}`;
}
function money(value){
 if(!['number','string'].includes(typeof value)||!/^\d+(?:\.\d{1,3})?$/.test(String(value)))return 'غير متاح';
 const amount=Number(value);
 return Number.isFinite(amount)&&amount<=Number.MAX_SAFE_INTEGER/1000?`${amount.toFixed(3)} د.ك`:'غير متاح';
}
const normalize=value=>String(value??'').normalize('NFKC').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).toLocaleLowerCase('ar').trim();
const stateLabels={draft:'مسودة',approved:'معتمد',cancelled:'ملغى'};

export function openFinancialArchive(){
 const d=createDialog('الأرشيف المالي التاريخي');if(!d)return;
 const month=node('input'),loadButton=node('button','استرجاع الشهر'),output=node('section');
 const downloads=new Map();let generation=0,loading=false,loaded=null;
 month.type='month';month.value=monthValue();loadButton.type='button';
 output.setAttribute('aria-label','نتيجة الأرشيف المالي');output.setAttribute('aria-live','polite');
 d.body.append(node('p','يعرض هذا القسم السجلات المحفوظة دون تعديلها. الشهر المقفل يظهر مع لقطة الإقفال الأصلية عند توفر صلاحية عرضها.'),field('الشهر',month),loadButton,output);
 function release(url){const timer=downloads.get(url);if(timer!==undefined)clearTimeout(timer);downloads.delete(url);URL.revokeObjectURL(url);}
 function clear(){loaded=null;output.replaceChildren();for(const url of [...downloads.keys()])release(url);}
 function invalidate(){generation++;clear();d.status.textContent='تغيّر الشهر؛ اضغط استرجاع الشهر لعرض بياناته.';}
 month.oninput=invalidate;month.onchange=invalidate;
 function validate(data,selectedMonth){
  if(!object(data)||!object(data.summary)||!Array.isArray(data.expenses)||!Array.isArray(data.history))throw Error('تعذر استرجاع الأرشيف المالي.');
  if(data.period!==null&&data.period!==undefined){
   if(!object(data.period)||data.period.month!==`${selectedMonth}-01`||(data.period.workspace_id!==undefined&&data.period.workspace_id!==d.session.bound.workspace)||(data.period.snapshot!==undefined&&data.period.snapshot!==null&&!object(data.period.snapshot)))throw Error('تعذر التحقق من شهر لقطة الإقفال.');
  }
  if(data.expenses.some(x=>!object(x)||typeof x.expense_date!=='string'||x.expense_date.slice(0,7)!==selectedMonth||(x.workspace_id!==undefined&&x.workspace_id!==d.session.bound.workspace)))throw Error('تعذر التحقق من نطاق سجلات الأرشيف.');
 }
 async function load(){
  if(loading||d.closed)return;
  // Capture the month before session.connect can yield; never label old data with a new selection.
  const selection={month:month.value},epoch=++generation;clear();loading=true;output.setAttribute('aria-busy','true');
  try{await d.run(async()=>{
   if(!validMonth(selection.month))throw Error('اختر شهراً صحيحاً.');
   const result=await d.session.request(d.session.client.rpc('aqari_financial_register',{p_workspace_id:d.session.bound.workspace,p_action:'list',p_data:selection}));
   d.session.check();
   if(d.closed||epoch!==generation||selection.month!==month.value)return;
   validate(result,selection.month);
   // The export and displayed rows share the same immutable JSON readback, not mutable controls.
   const data=JSON.parse(JSON.stringify(result));
   loaded={month:selection.month,epoch,retrievedAt:new Date().toISOString()};
   render(data,loaded);d.status.textContent=`تم استرجاع بيانات ${selection.month}.`;
  });}finally{loading=false;if(!d.closed)output.setAttribute('aria-busy','false');}
 }
 function render(data,identity){
  output.replaceChildren(node('h3',`شهر ${identity.month}`));
  const s=data.period?.snapshot||data.summary;
  const hasSnapshot=object(data.period?.snapshot);
  const notice=data.period?(hasSnapshot?`الفترة مقفلة منذ ${data.period.closed_at||'تاريخ غير متاح'}؛ الملخص من لقطة الإقفال.`:'الفترة مقفلة؛ لقطة الإقفال غير متاحة لهذا الحساب، والملخص قراءة حالية ضمن صلاحياته.'):'الفترة غير مقفلة؛ المعروض قراءة حالية.';
  const summary=node('dl');
  function metric(label,value){summary.append(node('dt',label),node('dd',value));}
  metric('المصروفات المعتمدة',money(s.approved_expenses));
  const count=s.approved_expense_count??s.count;
  metric('عدد المصروفات المعتمدة',Number.isSafeInteger(count)&&count>=0?String(count):'غير متاح');
  if(Object.hasOwn(s,'rent_payments'))metric('الإيجارات المسجلة في لقطة الإقفال',money(s.rent_payments));
  output.append(node('p',notice),summary,node('p','الأرقام تخص البيانات المعادة فقط، وليست كشفاً محاسبياً شاملاً.'),node('p',`المصروفات: ${data.expenses.length} • أحداث التدقيق المعادة: ${data.history.length} (بحد أقصى أحدث ${AUDIT_LIMIT} حدثاً).`));
  const search=node('input'),state=node('select'),resultCount=node('p'),table=node('table'),thead=node('thead'),tbody=node('tbody'),pager=node('div'),previous=node('button','السابق'),next=node('button','التالي'),pageText=node('span');
  search.type='search';search.placeholder='رقم السند أو المستفيد أو العقار';search.maxLength=200;
  for(const [value,label] of [['','كل الحالات'],...Object.entries(stateLabels)]){const option=node('option',label);option.value=value;state.append(option);}
  table.append(node('caption','مصروفات الشهر المسترجع'),thead,tbody);const header=node('tr');
  for(const label of ['التاريخ','السند','العقار','المستفيد','المبلغ','الحالة']){const th=node('th',label);th.scope='col';header.append(th);}thead.append(header);
  const wrap=node('div');wrap.style.overflowX='auto';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','جدول المصروفات؛ قابل للتمرير أفقياً');wrap.append(table);
  previous.type=next.type='button';pager.append(previous,pageText,next);resultCount.setAttribute('role','status');
  const properties=new Map((Array.isArray(data.properties)?data.properties:[]).filter(object).map(x=>[x.id,String(x.name??'')]));
  const rows=data.expenses.map(expense=>({expense,property:properties.get(expense.property_id)||'غير متاح',terms:normalize([expense.voucher_no,expense.reference,expense.payee,expense.category,expense.description,properties.get(expense.property_id)].join(' '))}));
  let page=0;
  function showRows(){
   const query=normalize(search.value),matching=rows.filter(x=>(!state.value||x.expense.state===state.value)&&(!query||x.terms.includes(query))),pages=Math.max(1,Math.ceil(matching.length/PAGE_SIZE));
   page=Math.max(0,Math.min(page,pages-1));tbody.replaceChildren();
   for(const {expense:x,property} of matching.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE)){
    const tr=node('tr');for(const value of [x.expense_date,x.voucher_no||x.reference||'—',property,x.payee||'—',money(x.amount),stateLabels[x.state]||'غير معروفة'])tr.append(node('td',value));tbody.append(tr);
   }
   if(!matching.length){const tr=node('tr'),td=node('td',rows.length?'لا توجد مصروفات تطابق البحث.':'لا توجد مصروفات محفوظة لهذا الشهر.');td.colSpan=6;tr.append(td);tbody.append(tr);}
   resultCount.textContent=`النتائج: ${matching.length} من ${rows.length} مصروفاً.`;pageText.textContent=`الصفحة ${page+1} من ${pages}`;previous.disabled=page===0;next.disabled=page>=pages-1;
  }
  search.oninput=state.onchange=()=>{page=0;showRows();};previous.onclick=()=>{page--;showRows();};next.onclick=()=>{page++;showRows();};
  output.append(field('البحث في المصروفات',search),field('حالة المصروف',state),resultCount,wrap,pager);showRows();
  const details=node('details');details.append(node('summary','عرض ملخص التدقيق الخام'),node('pre',JSON.stringify(s,null,2)));output.append(details);
  const exportButton=node('button','تصدير نسخة JSON للتدقيق');exportButton.type='button';
  exportButton.onclick=()=>{
   if(d.closed)return;
   if(loaded!==identity||generation!==identity.epoch||month.value!==identity.month){invalidate();return;}
   try{
    d.session.check();
    const value={month:identity.month,period:data.period,summary:s,expenses:data.expenses,history:data.history,workspace_id:d.session.bound.workspace,retrieved_at:identity.retrievedAt,audit_history_limit:AUDIT_LIMIT};
    const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=node('a');
    downloads.set(url,setTimeout(()=>release(url),60_000));a.href=url;a.download=`AQARI-finance-${identity.month}.json`;a.rel='noopener';a.hidden=true;
    document.body.append(a);try{a.click();}catch(error){release(url);throw error;}finally{a.remove();}
   }catch(error){d.run(()=>{throw error;});}
  };
  output.append(node('p','التصدير يشمل كل المصروفات المعادة للشهر، ولا يتأثر بمرشح البحث. سجل التدقيق محدود بالأحداث المعادة.'),exportButton);
 }
 loadButton.onclick=load;d.onDispose(()=>{generation++;clear();});load();
}
