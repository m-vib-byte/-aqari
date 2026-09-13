import {ARCHIVE_XLSX_TYPE,createArchiveXlsx} from './financial-archive-xlsx.js';
export {ARCHIVE_XLSX_TYPE};

const money=v=>{
 const s=String(v??'');if(!/^\d+(?:\.\d{1,3})?$/.test(s))throw Error('تعذر تأكيد مبلغ التقرير.');return Number(s).toFixed(3);
};
const safe=v=>v===null||v===undefined?'':String(v);

function collectionRows(envelope){
 const report=envelope.data||{},rows=[];
 for(const line of report.lines||[]){
  const date=safe(line.period).slice(0,10),property=[line.property_name,line.unit_no].filter(Boolean).join(' / '),ref=safe(line.contract_no),status=safe(line.status);
  for(const [kind,direction,value,note] of [
   ['الاستحقاق','مطلوب',line.due,'المبلغ المستحق بعد الخصومات المعتمدة'],
   ['المدفوع المحتسب','تحصيل',line.allocated_paid,'المبلغ المحتسب في نسبة التحصيل'],
   ['المتبقي','متبقي',line.remaining,'الرصيد المتبقي لهذا الاستحقاق'],
   ['الخصم','خصم',line.discount,'فرق إيجار العقد عن الاستحقاق المحفوظ'],
   ['الزيادة','زيادة',line.overpayment,'دفعة زائدة منفصلة لا ترفع نسبة التحصيل']
  ])rows.push([date,kind,property,direction,money(value),status,ref,note]);
 }
 return rows;
}
function collectorRows(envelope){
 const rows=[];for(const line of envelope.data?.lines||[])rows.push([
  safe(line.paid_at).slice(0,10),line.is_settlement?'تسوية':'تحصيل عادي',safe(line.property_name),safe(line.collector_name),money(line.amount),safe(line.mapping_status),safe(line.receipt_no),`العقد ${safe(line.contract_no)} • الوحدة ${safe(line.unit_no)} • ${safe(line.payment_method)}`
 ]);return rows;
}

export function createOperationalReportXlsx(envelope){
 if(!envelope||!['collection','collectors'].includes(envelope.report)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(envelope.month)||!envelope.workspaceId||!Number.isFinite(Date.parse(envelope.retrievedAt)))throw Error('تعذر التحقق من لقطة التقرير.');
 const rows=envelope.report==='collection'?collectionRows(envelope):collectorRows(envelope);
 return createArchiveXlsx({
  month:envelope.month,workspace:envelope.workspaceId,retrievedAt:envelope.retrievedAt,
  columns:['التاريخ','نوع الحركة','العقار / الوحدة','الاتجاه / المحصل','المبلغ بالدينار','الحالة','المرجع','البيان'],
  rows,totalRows:rows.length,filters:{search:'',status:'',stream:envelope.report==='collection'?'كشف التحصيل الفعلي':'أداء موظفي التحصيل'},period:null
 });
}
