import {paymentMethodLabel} from './contract-execution.js';

const money=value=>{
 const n=Number(value);if(!Number.isFinite(n)||n<=0||Math.round(n*1000)/1000!==n)throw Error('مبلغ الدفعة المقدمة غير صالح.');return n;
};
const text=value=>String(value??'').normalize('NFKC').trim();
const clone=value=>JSON.parse(JSON.stringify(value));
const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value));
const isoDate=value=>{
 const raw=text(value),match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);if(!match)return false;
 const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]),date=new Date(Date.UTC(year,month-1,day));
 return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;
};
const monthStart=value=>{
 const raw=text(value),match=/^(\d{4})-(\d{2})-01$/.exec(raw);if(!match)return null;
 const month=Number(match[2]);return month>=1&&month<=12?raw:null;
};
const kwdNonnegative=value=>{
 if(value===null||value===undefined||value==='')return null;
 const n=Number(value);return Number.isFinite(n)&&n>=0&&Math.round(n*1000)/1000===n?n:null;
};
const sameMoney=(a,b)=>Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Math.round(Number(a)*1000)===Math.round(Number(b)*1000);

export function allocatePrepaidAmount(periods,total,{maxPeriods=24}={}){
 const requested=money(total);if(!Array.isArray(periods)||!periods.length)throw Error('لا توجد فترات مستحقة قابلة للتغطية.');
 if(!Number.isInteger(maxPeriods)||maxPeriods<1||maxPeriods>60)throw Error('عدد الفترات غير صالح.');
 if(periods.length>maxPeriods)throw Error('عدد الفترات المختارة يتجاوز الحد المسموح. أعد تحميل الاختيار قبل الحفظ.');
 let previousPeriod='';const seenPeriods=new Set();
 const schedule=periods.map(row=>{
  const period=monthStart(row?.period),due=kwdNonnegative(row?.due_amount),balanceValue=kwdNonnegative(row?.balance);
  if(!period||due===null||balanceValue===null)throw Error('جدول الاستحقاقات غير صالح للدفعة المقدمة. أعد تحميل الاستحقاقات من الخادم.');
  if(seenPeriods.has(period))throw Error('جدول الاستحقاقات يحتوي فترة مكررة. أعد تحميل الاستحقاقات قبل الحفظ.');
  if(previousPeriod&&period<=previousPeriod)throw Error('جدول الاستحقاقات يجب أن يكون مرتبًا زمنياً من الأقدم إلى الأحدث. أعد تحميل الاستحقاقات.');
  seenPeriods.add(period);previousPeriod=period;
  return {period,due,balanceValue,dueOn:row.due_on||null};
 });
 let remaining=Math.round(requested*1000),rows=[];
 for(const row of schedule){
  const balance=Math.round(row.balanceValue*1000);if(balance<=0)continue;
  const take=Math.min(balance,remaining);if(take<=0)break;
  rows.push({period:row.period,amount:take/1000,dueAmount:row.due,balanceBefore:balance/1000,dueOn:row.dueOn});remaining-=take;
  if(remaining===0)break;
 }
 if(remaining!==0)throw Error('المبلغ أكبر من رصيد الفترات المختارة. وسّع نطاق الأشهر أو خفّض المبلغ.');
 return rows;
}

export function prepaidReceiptArtifacts({api,contract,profile,periodRow,allocation,receiptNo,contractReceiptSequence,paidAt,method,transactionNo,batchId}){
 if(!api||!contract||contract.status!=='signed'||!profile)throw Error('لا يمكن إصدار دفعة مقدمة قبل توقيع العقد.');
 const paid=money(allocation?.amount),rowPeriod=String(periodRow?.period||'').slice(0,10),allocationPeriod=String(allocation?.period||'').slice(0,10),period=rowPeriod.slice(0,7),receipt=text(receiptNo),tx=text(transactionNo),date=text(paidAt),sequence=Number(contractReceiptSequence),batch=text(batchId);
 if(!/^\d{4}-\d{2}-01$/.test(rowPeriod)||allocationPeriod!==rowPeriod||!isoDate(date)||!uuid(batch)||!/^AQ-R-\d{4}-\d{8,}$/.test(receipt)||!Number.isSafeInteger(sequence)||sequence<1||tx.length<1||tx.length>150)throw Error('بيانات الوصل أو الفترة غير مكتملة.');
 const due=Number(periodRow.due_amount),before=Number(periodRow.balance),plannedBefore=Number(allocation?.balanceBefore),after=Number((before-paid).toFixed(3));
 if(!Number.isFinite(due)||due<0||!Number.isFinite(before)||before<=0||!sameMoney(plannedBefore,before)||paid>before+0.0001||after<0)throw Error('تغير رصيد الفترة أو تتجاوز الدفعة رصيدها. أعد تحميل الاستحقاقات قبل الحفظ.');
 const breakdown=api.entitlementBreakdown(contract,period);if(Math.round(Number(breakdown.net)*1000)!==Math.round(due*1000))throw Error('صافي الفترة لا يطابق جدول الاستحقاق الخادمي.');
 const label=paymentMethodLabel(method),status=after===0?'مدفوع':'جزئي',note=`دفعة مقدمة مجمعة · ${batch} · تسلسل الوصل داخل العقد: ${sequence}`;
 const record=[receipt,contract.tenant,paid,status,contract.property,date,contract.unit,note,period,label];
 const ledger={id:'rent-'+receipt,receiptNo:receipt,property:contract.property,unit:contract.unit,tenant:contract.tenant,contractId:String(contract.id),contractNo:contract.contract_no,contractReceiptSequence:sequence,period,due,paid,balance:after,paidAt:date,method:label,transactionNo:tx,accountant:contract.accountant||'',status,note,source:'v267-prepaid-batch',prepaymentBatchId:batch};
 const receiptSnapshot={id:receipt,contractReceiptSequence:sequence,template:'rent-voucher-v267-1',record:clone(record),contract:clone(contract),tenantId:contract.tenantId||profile.id||null,tenantNameEn:profile.nameEn||'',brand:{ar:contract.property,en:'AQARI PROPERTY',website:'myaqari.com'},detailsVersion:2,accountant:contract.accountant||'',transactionNo:tx,rentPeriodBreakdown:{...clone(breakdown),version:1,period,dueOn:api.entitlementDueOn(contract,period)},prepaymentBatchId:batch};
 return {record,ledger,receipt:receiptSnapshot};
}

export function prepaidBatchManifest({id,contract,leaseId,method,transactionNo,paidAt,total,allocations}){
 const batch=text(id),lease=text(leaseId),tx=text(transactionNo),date=text(paidAt),amount=money(total);
 if(!uuid(batch)||!uuid(lease)||!contract?.id||tx.length<1||tx.length>150||!isoDate(date)||!Array.isArray(allocations)||!allocations.length||allocations.length>24)throw Error('بيانات دفعة الإيجار المقدمة غير مكتملة.');
 paymentMethodLabel(method);
 const periods=new Set(),receipts=new Set(),operations=new Set();
 const sum=allocations.reduce((s,x)=>{
  const period=String(x?.period||'').slice(0,10),receipt=text(x?.receiptNo),operation=text(x?.operationRef),sequence=Number(x?.contractReceiptSequence),part=money(x?.amount);
  if(!/^\d{4}-\d{2}-01$/.test(period)||!/^AQ-R-\d{4}-\d{8,}$/.test(receipt)||!uuid(operation)||!Number.isSafeInteger(sequence)||sequence<1)throw Error('بيانات توزيع الدفعة المقدمة غير مكتملة.');
  if(periods.has(period)||receipts.has(receipt)||operations.has(operation))throw Error('توزيع الدفعة المقدمة يحتوي فترة أو وصلًا أو مرجع عملية مكررًا.');
  periods.add(period);receipts.add(receipt);operations.add(operation);return s+Math.round(part*1000);
 },0);
 if(sum!==Math.round(amount*1000))throw Error('مجموع توزيع الدفعة لا يساوي مبلغ القبض.');
 return {id:batch,contractId:String(contract.id),contractNo:contract.contract_no,leaseId:lease,method,transactionNo:tx,paidAt:date,total:amount,allocations:clone(allocations),status:'confirmed'};
}
