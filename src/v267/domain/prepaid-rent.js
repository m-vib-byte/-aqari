import {paymentMethodLabel} from './contract-execution.js';

const money=value=>{
 const n=Number(value);if(!Number.isFinite(n)||n<=0||Math.round(n*1000)/1000!==n)throw Error('مبلغ الدفعة المقدمة غير صالح.');return n;
};
const text=value=>String(value??'').normalize('NFKC').trim();
const clone=value=>JSON.parse(JSON.stringify(value));

export function allocatePrepaidAmount(periods,total,{maxPeriods=24}={}){
 const requested=money(total);if(!Array.isArray(periods)||!periods.length)throw Error('لا توجد فترات مستحقة قابلة للتغطية.');
 if(!Number.isInteger(maxPeriods)||maxPeriods<1||maxPeriods>60)throw Error('عدد الفترات غير صالح.');
 let remaining=Math.round(requested*1000),rows=[];
 for(const row of periods.slice(0,maxPeriods)){
  const balance=Math.round(Number(row?.balance||0)*1000);if(balance<=0)continue;
  const take=Math.min(balance,remaining);if(take<=0)break;
  rows.push({period:String(row.period).slice(0,10),amount:take/1000,dueAmount:Number(row.due_amount),balanceBefore:balance/1000,dueOn:row.due_on||null});remaining-=take;
  if(remaining===0)break;
 }
 if(remaining!==0)throw Error('المبلغ أكبر من رصيد الفترات المختارة. وسّع نطاق الأشهر أو خفّض المبلغ.');
 return rows;
}

export function prepaidReceiptArtifacts({api,contract,profile,periodRow,allocation,receiptNo,contractReceiptSequence,paidAt,method,transactionNo,batchId}){
 if(!api||!contract||contract.status!=='signed'||!profile)throw Error('لا يمكن إصدار دفعة مقدمة قبل توقيع العقد.');
 const paid=money(allocation?.amount),period=String(periodRow?.period||'').slice(0,7),receipt=text(receiptNo),tx=text(transactionNo),date=text(paidAt),sequence=Number(contractReceiptSequence);
 if(!/^\d{4}-\d{2}$/.test(period)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^AQ-R-\d{4}-\d{8,}$/.test(receipt)||!Number.isSafeInteger(sequence)||sequence<1||tx.length<1||tx.length>150)throw Error('بيانات الوصل أو الفترة غير مكتملة.');
 const due=Number(periodRow.due_amount),before=Number(periodRow.balance),after=Number((before-paid).toFixed(3));if(!Number.isFinite(due)||due<0||paid>before+0.0001||after<0)throw Error('الدفعة تتجاوز رصيد الفترة.');
 const breakdown=api.entitlementBreakdown(contract,period);if(Math.round(Number(breakdown.net)*1000)!==Math.round(due*1000))throw Error('صافي الفترة لا يطابق جدول الاستحقاق الخادمي.');
 const label=paymentMethodLabel(method),status=after===0?'مدفوع':'جزئي',note=`دفعة مقدمة مجمعة · ${batchId} · تسلسل الوصل داخل العقد: ${sequence}`;
 const record=[receipt,contract.tenant,paid,status,contract.property,date,contract.unit,note,period,label];
 const ledger={id:'rent-'+receipt,receiptNo:receipt,property:contract.property,unit:contract.unit,tenant:contract.tenant,contractId:String(contract.id),contractNo:contract.contract_no,contractReceiptSequence:sequence,period,due,paid,balance:after,paidAt:date,method:label,transactionNo:tx,accountant:contract.accountant||'',status,note,source:'v267-prepaid-batch',prepaymentBatchId:batchId};
 const receiptSnapshot={id:receipt,contractReceiptSequence:sequence,template:'rent-voucher-v267-1',record:clone(record),contract:clone(contract),tenantId:contract.tenantId||profile.id||null,tenantNameEn:profile.nameEn||'',brand:{ar:contract.property,en:'AQARI PROPERTY',website:'myaqari.com'},detailsVersion:2,accountant:contract.accountant||'',transactionNo:tx,rentPeriodBreakdown:{...clone(breakdown),version:1,period,dueOn:api.entitlementDueOn(contract,period)},prepaymentBatchId:batchId};
 return {record,ledger,receipt:receiptSnapshot};
}

export function prepaidBatchManifest({id,contract,leaseId,method,transactionNo,paidAt,total,allocations}){
 const tx=text(transactionNo),date=text(paidAt),amount=money(total);if(!id||!leaseId||!contract?.id||tx.length<1||tx.length>150||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Array.isArray(allocations)||!allocations.length)throw Error('بيانات دفعة الإيجار المقدمة غير مكتملة.');
 const sum=allocations.reduce((s,x)=>s+Math.round(Number(x.amount)*1000),0);if(sum!==Math.round(amount*1000))throw Error('مجموع توزيع الدفعة لا يساوي مبلغ القبض.');
 return {id,contractId:String(contract.id),contractNo:contract.contract_no,leaseId,method,transactionNo:tx,paidAt:date,total:amount,allocations:clone(allocations),status:'confirmed'};
}
