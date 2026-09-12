import {createDialog,node,field} from '../components/dialog.js';
const monthValue=()=>new Date().toISOString().slice(0,7);
function download(value,name,type){const blob=new Blob([value],{type}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=name;a.rel='noopener';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const streams={rent:'تحصيل إيجار',expense:'مصروف',deposit:'تأمين',adjustment:'تسوية ذمة',opening:'رصيد افتتاحي',tenant_ledger:'قيد مستأجر',credit_allocation:'تخصيص رصيد سابق',petty_cash:'عهدة مالية'};
const states={paid:'مسدد',partial:'جزئي',unpaid:'غير مسدد',confirmed:'مؤكد',approved:'معتمد',draft:'مسودة',cancelled:'ملغى',recorded:'مسجل'};
const directions={received:'استلام',paid:'صرف',receipt:'قبض تأمين',refund:'رد تأمين',debit:'مدين',credit:'دائن',allocation:'تخصيص',fund:'تمويل عهدة',spend:'صرف عهدة',settle:'تسوية عهدة'};
const columns=['التاريخ','نوع الحركة','العقار','الاتجاه','المبلغ بالدينار','الحالة','المرجع','البيان'];
export function archiveCsvCell(value){let s=String(value??'');if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function openFinancialArchive(){
 const d=createDialog('الأرشيف المالي التاريخي');if(!d)return;
 const month=node('input'),loadButton=node('button','استرجاع الشهر'),output=node('section');month.type='month';month.value=monthValue();loadButton.type='button';
 d.body.append(node('p','يعرض السجل التحصيل والمصروفات والتأمين والذمم والعهدة كلّاً بنوعه. الرصيد الافتتاحي وتخصيص الرصيد لا يمثلان تحصيلاً جديداً. لقطة الإقفال تبقى كما صدرت.'),field('الشهر',month),loadButton,output);
 async function load(){
  const requestedMonth=month.value;if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth))throw Error('اختر شهراً صحيحاً.');
  const data=await d.session.request(d.session.client.rpc('aqari_financial_archive',{p_workspace_id:d.session.bound.workspace,p_month:requestedMonth}));
  if(!data||data.month!==requestedMonth||!Array.isArray(data.entries)||!Array.isArray(data.history)||!Array.isArray(data.properties)||!data.summary)throw Error('تعذر تأكيد شهر الأرشيف أو سجلاته.');
  render(data,requestedMonth);
 }
 function render(data,loadedMonth){
  output.replaceChildren(node('h3',`شهر ${loadedMonth}`));const s=data.period?.snapshot||data.summary;
  output.append(node('p',data.period?`الفترة مقفلة منذ ${data.period.closed_at}`:'الفترة غير مقفلة؛ المعروض قراءة حالية.'));
  for(const [key,label]of [['rent_payments','التحصيل في لقطة الإقفال'],['rent_payment_count','عدد عمليات التحصيل في اللقطة'],['approved_expenses','المصروفات المعتمدة'],['approved_expense_count','عدد المصروفات المعتمدة'],['count','عدد المصروفات المعتمدة']])if(s[key]!==undefined)output.append(node('p',label+': '+s[key]));
  if(s.legacy_finance_reconciled===false)output.append(node('p','مطابقة السجلات المالية القديمة ما زالت غير معتمدة.'));
  const property=id=>data.properties.find(x=>x.id===id)?.name||(id?'عقار ضمن السجل':'قيد عام دون توزيع على عقار');
  const rows=data.entries.map(e=>[e.on_date,streams[e.stream]||'حركة أخرى',property(e.property_id),directions[e.direction]||'غير محدد',e.amount,states[e.status]||'غير محددة',e.reference,e.description]);
  const table=node('table'),thead=node('thead'),head=node('tr'),tbody=node('tbody');for(const title of columns)head.append(node('th',title));thead.append(head);for(const row of rows){const tr=node('tr');for(const value of row)tr.append(node('td',value));tbody.append(tr);}table.append(thead,tbody);output.append(table,node('p',`الحركات: ${rows.length} • أحداث التدقيق المعروضة: ${data.history.length}`));
  if(data.history_truncated)output.append(node('p','المعروض آخر ١٠٠ حدث تدقيق؛ لا يمثل كامل تاريخ التدقيق.'));
  for(const event of data.history)output.append(node('p',[event.recorded_at,event.actor_name,event.reason].filter(Boolean).join(' — ')));
  const json=node('button','تصدير السجل للتدقيق'),csv=node('button','تنزيل جدول CSV');json.type=csv.type='button';
  // Bind both exports to the loaded month, even if the input is edited afterward.
  json.onclick=()=>{d.session.check();download(JSON.stringify(data,null,2),`AQARI-finance-${loadedMonth}.json`,'application/json');};
  csv.onclick=()=>{d.session.check();download('\uFEFF'+[columns,...rows].map(row=>row.map(archiveCsvCell).join(',')).join('\r\n'),`AQARI-finance-${loadedMonth}.csv`,'text/csv;charset=utf-8');};output.append(json,csv);
 }
 loadButton.onclick=()=>d.run(load);d.onDispose(()=>output.replaceChildren());d.run(load);
}
