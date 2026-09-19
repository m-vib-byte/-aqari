import {message as visibleMessage} from '../components/locale.js';
import {t as translateStatic} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
import {createArchiveXlsx,ARCHIVE_XLSX_TYPE} from '../reports/financial-archive-xlsx.js';

const PAGE_SIZE=50;
const AUDIT_LIMIT=100;
const validMonth=value=>/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const streams={get rent(){return translateStatic('تحصيل إيجار');},get expense(){return translateStatic('مصروف');},get deposit(){return translateStatic('تأمين');},get adjustment(){return translateStatic('تسوية ذمة');},get opening(){return translateStatic('رصيد افتتاحي');},get tenant_ledger(){return translateStatic('قيد مستأجر');},get credit_allocation(){return translateStatic('تخصيص رصيد سابق');},get petty_cash(){return translateStatic('عهدة مالية');}};
const states={get paid(){return translateStatic('مسدد');},get partial(){return translateStatic('جزئي');},get unpaid(){return translateStatic('غير مسدد');},get confirmed(){return translateStatic('مؤكد');},get approved(){return translateStatic('معتمد');},get draft(){return translateStatic('مسودة');},get cancelled(){return translateStatic('ملغى');},get recorded(){return translateStatic('مسجل');}};
const storedStateAliases=new Map([['مدفوع','paid'],['جزئي','partial'],['غير مدفوع','unpaid'],['ملغى','cancelled']]);
const stateKey=value=>storedStateAliases.get(value)||value;
const stateLabel=value=>Object.hasOwn(states,stateKey(value))?states[stateKey(value)]:null;
const directions={get received(){return translateStatic('استلام');},get paid(){return translateStatic('صرف');},get receipt(){return translateStatic('قبض تأمين');},get refund(){return translateStatic('رد تأمين');},get debit(){return translateStatic('مدين');},get credit(){return translateStatic('دائن');},get allocation(){return translateStatic('تخصيص');},get fund(){return translateStatic('تمويل عهدة');},get spend(){return translateStatic('صرف عهدة');},get settle(){return translateStatic('تسوية عهدة');}};
const columns=()=>[translateStatic('التاريخ'),translateStatic('نوع الحركة'),translateStatic('العقار'),translateStatic('الاتجاه'),translateStatic('المبلغ بالدينار'),translateStatic('الحالة'),translateStatic('المرجع'),translateStatic('البيان')];
export function archiveCsvCell(value){let s=String(value??'');if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
function monthValue(now=new Date()){
 const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Kuwait',year:'numeric',month:'2-digit'}).formatToParts(now);
 return `${parts.find(x=>x.type==='year').value}-${parts.find(x=>x.type==='month').value}`;
}
function money(value){
 if(!['number','string'].includes(typeof value)||!/^\d+(?:\.\d{1,3})?$/.test(String(value)))return translateStatic('غير متاح');
 const amount=Number(value);
 return Number.isFinite(amount)&&amount<=Number.MAX_SAFE_INTEGER/1000?visibleMessage("{value0} د.ك",{value0:(amount.toFixed(3))}):translateStatic('غير متاح');
}
const normalize=value=>String(value??'').normalize('NFKC').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).toLocaleLowerCase('ar').trim();

export function openFinancialArchive(){
 const d=createDialog(translateStatic('الأرشيف المالي التاريخي'));if(!d)return;
 const month=node('input'),loadButton=node('button',translateStatic('استرجاع الشهر')),output=node('section');
 const downloads=new Map();let generation=0,loading=false,loaded=null;
 month.type='month';month.value=monthValue();loadButton.type='button';
 output.setAttribute('aria-label',translateStatic('نتيجة الأرشيف المالي'));output.setAttribute('aria-live','polite');
 d.body.append(node('p',translateStatic('يعرض السجل التحصيل والمصروفات والتأمين والذمم والعهدة كلّاً بنوعه. الرصيد الافتتاحي وتخصيص الرصيد لا يمثلان تحصيلاً جديداً. لقطة الإقفال تبقى كما صدرت.')),field(translateStatic('الشهر'),month),loadButton,output);
 function release(url){const timer=downloads.get(url);if(timer!==undefined)clearTimeout(timer);downloads.delete(url);URL.revokeObjectURL(url);}
 function clear(){loaded=null;output.replaceChildren();for(const url of [...downloads.keys()])release(url);}
 function invalidate(){generation++;clear();d.status.textContent=translateStatic('تغيّر الشهر؛ اضغط استرجاع الشهر لعرض بياناته.');}
 month.oninput=invalidate;month.onchange=invalidate;
 function validate(data,selectedMonth){
  if(!object(data)||data.month!==selectedMonth||!object(data.summary)||!Array.isArray(data.entries)||!Array.isArray(data.history)||!Array.isArray(data.properties))throw Error('تعذر تأكيد شهر الأرشيف أو سجلاته.');
  if(data.workspace_id!==undefined&&data.workspace_id!==d.session.bound.workspace)throw Error('تعذر التحقق من نطاق سجلات الأرشيف.');
  if(data.period!==null&&data.period!==undefined){
   if(!object(data.period)||data.period.month!==`${selectedMonth}-01`||(data.period.workspace_id!==undefined&&data.period.workspace_id!==d.session.bound.workspace)||(data.period.snapshot!==undefined&&data.period.snapshot!==null&&!object(data.period.snapshot)))throw Error('تعذر التحقق من شهر لقطة الإقفال.');
  }
  if(data.entries.some(x=>!object(x)||typeof x.on_date!=='string'||x.on_date.slice(0,7)!==selectedMonth||(x.workspace_id!==undefined&&x.workspace_id!==d.session.bound.workspace)))throw Error('تعذر التحقق من نطاق سجلات الأرشيف.');
 }
 async function load(){
  if(loading||d.closed)return;
  const selection={month:month.value},epoch=++generation;clear();loading=true;output.setAttribute('aria-busy','true');
  try{await d.run(async()=>{
   if(!validMonth(selection.month))throw Error('اختر شهراً صحيحاً.');
   const result=await d.session.request(d.session.client.rpc('aqari_financial_archive',{p_workspace_id:d.session.bound.workspace,p_month:selection.month}));
   d.session.check();
   if(d.closed||epoch!==generation||selection.month!==month.value)return;
   validate(result,selection.month);
   // Keep the exact canonical multi-stream readback; do not revert to the expense-only register.
   const data=JSON.parse(JSON.stringify(result));
   loaded={month:selection.month,epoch,retrievedAt:new Date().toISOString()};
   render(data,loaded);d.status.textContent=visibleMessage("تم استرجاع بيانات {value0}.",{value0:(selection.month)});
  });}finally{loading=false;if(!d.closed)output.setAttribute('aria-busy','false');}
 }
 function render(data,identity){
  output.replaceChildren(node('h3',visibleMessage("شهر {value0}",{value0:(identity.month)})));
  const s=data.period?.snapshot||data.summary;
  const hasSnapshot=object(data.period?.snapshot);
  const notice=data.period?(hasSnapshot?visibleMessage("الفترة مقفلة منذ {value0}؛ الملخص من لقطة الإقفال.",{value0:(data.period.closed_at||translateStatic('تاريخ غير متاح'))}):translateStatic('الفترة مقفلة؛ لقطة الإقفال غير متاحة لهذا الحساب، والملخص قراءة حالية ضمن صلاحياته.')):translateStatic('الفترة غير مقفلة؛ المعروض قراءة حالية.');
  const summary=node('dl');
  function metric(label,value){summary.append(node('dt',label),node('dd',value));}
  metric(translateStatic('المصروفات المعتمدة'),money(s.approved_expenses));
  const count=s.approved_expense_count??s.count;
  metric(translateStatic('عدد المصروفات المعتمدة'),Number.isSafeInteger(count)&&count>=0?String(count):translateStatic('غير متاح'));
  if(Object.hasOwn(s,'rent_payments'))metric(translateStatic('التحصيل في لقطة الإقفال'),money(s.rent_payments));
  if(Object.hasOwn(s,'rent_payment_count'))metric(translateStatic('عدد عمليات التحصيل في اللقطة'),Number.isSafeInteger(s.rent_payment_count)&&s.rent_payment_count>=0?String(s.rent_payment_count):translateStatic('غير متاح'));
  output.append(node('p',notice),summary,node('p',translateStatic('الأرقام تخص البيانات المعادة فقط، وليست كشفاً محاسبياً شاملاً أو صافي ربح.')),node('p',visibleMessage("الحركات: {value0} • أحداث التدقيق المعادة: {value1} (بحد أقصى أحدث {value2} حدثاً).",{value0:(data.entries.length),value1:(data.history.length),value2:(AUDIT_LIMIT)})));
  if(s.legacy_finance_reconciled===false)output.append(node('p',translateStatic('مطابقة السجلات المالية القديمة ما زالت غير معتمدة.')));
  if(data.history_truncated)output.append(node('p',translateStatic('المعروض آخر ١٠٠ حدث تدقيق؛ لا يمثل كامل تاريخ التدقيق.')));
  const search=node('input'),state=node('select'),stream=node('select'),resultCount=node('p'),table=node('table'),thead=node('thead'),tbody=node('tbody'),pager=node('div'),previous=node('button',translateStatic('السابق')),next=node('button',translateStatic('التالي')),pageText=node('span');
  search.type='search';search.placeholder=translateStatic('رقم المرجع أو البيان أو العقار');search.maxLength=200;
  function options(control,first,labels){for(const [value,label] of [['',first],...Object.entries(labels)]){const option=node('option',label);option.value=value;control.append(option);}}
  options(state,translateStatic('كل الحالات'),states);options(stream,translateStatic('كل الحركات'),streams);
  table.style.minWidth='58rem';table.style.width='100%';table.style.borderCollapse='separate';table.style.borderSpacing='0.75rem 0.5rem';
  table.append(node('caption',translateStatic('حركات الشهر المسترجع')),thead,tbody);const header=node('tr');
  for(const label of columns()){const th=node('th',label);th.scope='col';th.style.whiteSpace='nowrap';header.append(th);}thead.append(header);
  const wrap=node('div');wrap.style.overflowX='auto';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',translateStatic('جدول الحركات؛ قابل للتمرير أفقياً'));wrap.append(table);
  previous.type=next.type='button';pager.append(previous,pageText,next);resultCount.setAttribute('role','status');
  const properties=new Map(data.properties.filter(object).map(x=>[x.id,String(x.name??'')]));
  const property=id=>properties.get(id)||(id?translateStatic('عقار ضمن السجل'):translateStatic('قيد عام دون توزيع على عقار'));
  const rows=data.entries.map(entry=>({entry,property:property(entry.property_id),terms:normalize([entry.reference,entry.description,property(entry.property_id),streams[entry.stream]].join(' '))}));
  const exportRow=({entry:e,property:p})=>[e.on_date,streams[e.stream]||e.stream||translateStatic('حركة أخرى'),p,directions[e.direction]||e.direction||translateStatic('غير محدد'),e.amount,stateLabel(e.status)||e.status||translateStatic('غير محددة'),e.reference,e.description];
  const csvRows=rows.map(exportRow);
  const filterValue=()=>({search:search.value,status:state.value,stream:stream.value});
  const matchingRows=filters=>{const query=normalize(filters.search);return rows.filter(x=>(!filters.status||stateKey(x.entry.status)===filters.status)&&(!filters.stream||x.entry.stream===filters.stream)&&(!query||x.terms.includes(query)));};
  let page=0;
  function showRows(){
   const matching=matchingRows(filterValue()),pages=Math.max(1,Math.ceil(matching.length/PAGE_SIZE));
   page=Math.max(0,Math.min(page,pages-1));tbody.replaceChildren();
   for(const {entry:e,property:p} of matching.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE)){
    const values=[e.on_date,streams[e.stream]||translateStatic('حركة أخرى'),p,directions[e.direction]||translateStatic('غير محدد'),money(e.amount),stateLabel(e.status)||translateStatic('غير محددة'),e.reference||'—',e.description||'—'];
    const tr=node('tr');for(const [index,value] of values.entries()){const td=node('td',value);if([0,4,6].includes(index))td.style.whiteSpace='nowrap';tr.append(td);}tbody.append(tr);
   }
   if(!matching.length){const tr=node('tr'),td=node('td',rows.length?translateStatic('لا توجد حركات تطابق البحث.'):translateStatic('لا توجد حركات محفوظة لهذا الشهر.'));td.colSpan=columns().length;tr.append(td);tbody.append(tr);}
   resultCount.textContent=visibleMessage("النتائج: {value0} من {value1} حركة.",{value0:(matching.length),value1:(rows.length)});pageText.textContent=visibleMessage("الصفحة {value0} من {value1}",{value0:(page+1),value1:(pages)});previous.disabled=page===0;next.disabled=page>=pages-1;
  }
  search.oninput=state.onchange=stream.onchange=()=>{page=0;showRows();};previous.onclick=()=>{page--;showRows();};next.onclick=()=>{page++;showRows();};
  output.append(field(translateStatic('البحث في الحركات'),search),field(translateStatic('حالة الحركة'),state),field(translateStatic('نوع الحركة'),stream),resultCount,wrap,pager);showRows();
  const details=node('details');details.append(node('summary',translateStatic('عرض ملخص التدقيق الخام')),node('pre',JSON.stringify(s,null,2)));output.append(details);
  const audit=node('details');audit.append(node('summary',translateStatic('أحداث التدقيق المعادة')));
  for(const event of data.history)if(object(event))audit.append(node('p',[event.recorded_at,event.actor_name,event.reason].filter(Boolean).join(' — ')));
  output.append(audit);
  function download(kind,contents,type){
   if(d.closed)return;
   if(loaded!==identity||generation!==identity.epoch||month.value!==identity.month){invalidate();return;}
   try{
    d.session.check();
    const blob=new Blob([contents],{type}),url=URL.createObjectURL(blob),a=node('a');
    downloads.set(url,setTimeout(()=>release(url),60_000));a.href=url;a.download=`AQARI-finance-${identity.month}.${kind}`;a.rel='noopener';a.hidden=true;
    document.body.append(a);try{a.click();}catch(error){release(url);throw error;}finally{a.remove();}
   }catch(error){d.run(()=>{throw error;});}
  }
  function exportData(kind){
   const value={...data,month:identity.month,workspace_id:d.session.bound.workspace,retrieved_at:identity.retrievedAt,audit_history_limit:AUDIT_LIMIT};
   const contents=kind==='csv'?'\uFEFF'+[columns(),...csvRows].map(row=>row.map(archiveCsvCell).join(',')).join('\r\n'):JSON.stringify(value,null,2);
   download(kind,contents,kind==='csv'?'text/csv;charset=utf-8':'application/json;charset=utf-8');
  }
  async function exportExcel(){
   if(d.closed)return;
   if(loaded!==identity||generation!==identity.epoch||month.value!==identity.month){invalidate();return;}
   const selection=filterValue();
   await d.run(async()=>{
    // Re-read through the same scoped RPC: cached session context alone cannot
    // prove that a property/role has not been revoked since the table loaded.
    const current=await d.session.request(d.session.client.rpc('aqari_financial_archive',{p_workspace_id:d.session.bound.workspace,p_month:identity.month}));
    d.session.check();
    if(d.closed||loaded!==identity||generation!==identity.epoch||month.value!==identity.month)return;
    validate(current,identity.month);
    const snapshot=value=>JSON.stringify([value.entries,value.properties,value.period]);
    if(snapshot(current)!==snapshot(data)){clear();throw Error('تغيّرت سجلات الشهر أو صلاحياته؛ استرجع الشهر وراجع البيانات قبل تنزيل التقرير.');}
    if(JSON.stringify(selection)!==JSON.stringify(filterValue()))throw Error('تغيّرت المرشحات؛ أعد تنزيل التقرير.');
    const contents=createArchiveXlsx({month:identity.month,workspace:d.session.bound.workspace,retrievedAt:identity.retrievedAt,columns:columns(),rows:matchingRows(selection).map(exportRow),totalRows:rows.length,period:data.period,filters:{search:selection.search,status:states[selection.status]||selection.status,stream:streams[selection.stream]||selection.stream}});
    download('xlsx',contents,ARCHIVE_XLSX_TYPE);
   });
  }
  const json=node('button',translateStatic('تصدير السجل للتدقيق')),csv=node('button',translateStatic('تنزيل جدول CSV'));json.type=csv.type='button';json.onclick=()=>exportData('json');csv.onclick=()=>exportData('csv');
  output.append(node('p',translateStatic('التصدير يشمل كل الحركات المعادة للشهر، ولا يتأثر بمرشح البحث. سجل التدقيق محدود بالأحداث المعادة.')),json,csv);
  const excel=node('button',translateStatic('تنزيل Excel للنتائج'));excel.type='button';excel.onclick=exportExcel;
  output.append(node('p',translateStatic('Excel يشمل جميع النتائج المطابقة للبحث والحالة والنوع، عبر كل الصفحات، مع بيان المرشحات ووقت استرجاع البيانات. يُعاد التحقق من السجلات والصلاحيات قبل التنزيل.')),excel);
 }
 loadButton.onclick=load;d.onDispose(()=>{generation++;clear();});load();
}

