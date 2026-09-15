const text=value=>String(value??'').normalize('NFKC').trim();
const asMoney=value=>{
 const n=Number(value??0);if(!Number.isFinite(n)||n<0||Math.round(n*1000)/1000!==n)throw Error('مبلغ غير صالح.');return n;
};
const money=value=>asMoney(value).toFixed(3);
export const executionMethods=Object.freeze([['knet','كي نت'],['bank','تحويل بنكي'],['cash','نقدي'],['cheque','شيك']]);
export function paymentMethodLabel(code){const row=executionMethods.find(x=>x[0]===code);if(!row)throw Error('اختر طريقة دفع صحيحة.');return row[1];}

export function executionDue(api,contract){
 if(!api||!contract?.rentEntitlement?.startDate)throw Error('بيانات استحقاق العقد غير مكتملة.');
 const period=String(contract.rentEntitlement.startDate).slice(0,7),breakdown=api.entitlementBreakdown(contract,period);
 const rent=asMoney(breakdown.net),deposit=asMoney(contract.deposit||0),advance=asMoney(contract.advance||0),fees=asMoney(contract.cleaningFee||0);
 return {period,rent,deposit,advance,fees,total:Number((rent+deposit+advance+fees).toFixed(3)),breakdown:{...breakdown,version:1,period,dueOn:api.entitlementDueOn(contract,period)}};
}

export function rentReceiptArtifacts({contract,profile,due,receiptNo,contractReceiptSequence,onDate,method,transactionNo}){
 if(!contract||contract.status!=='signed'||!profile||!due||due.rent<=0)throw Error('لا يمكن إصدار وصل إيجار قبل توقيع العقد ووجود مبلغ إيجار فعلي.');
 const label=paymentMethodLabel(method),reference=text(receiptNo),tx=text(transactionNo),date=text(onDate),sequence=Number(contractReceiptSequence);
 if(!reference||!/^AQ-R-\d{4}-\d{8,}$/.test(reference)||!Number.isSafeInteger(sequence)||sequence<1||!/^\d{4}-\d{2}-\d{2}$/.test(date)||tx.length<3)throw Error('بيانات دفعة الإيجار أو تسلسل الوصل غير مكتملة.');
 const note='دفعة الإبرام · تسلسل الوصل داخل العقد: '+sequence;
 const record=[reference,contract.tenant,due.rent,'مدفوع',contract.property,date,contract.unit,note,due.period,label];
 const ledger={id:'rent-'+reference,receiptNo:reference,property:contract.property,unit:contract.unit,tenant:contract.tenant,contractId:String(contract.id),contractNo:contract.contract_no,contractReceiptSequence:sequence,period:due.period,due:due.rent,paid:due.rent,balance:0,paidAt:date,method:label,transactionNo:tx,accountant:contract.accountant||'',status:'مدفوع',note,source:'v267-contract-execution'};
 const receipt={id:reference,contractReceiptSequence:sequence,template:'rent-voucher-v267-1',record:JSON.parse(JSON.stringify(record)),contract:JSON.parse(JSON.stringify(contract)),tenantId:contract.tenantId||profile.id||null,tenantNameEn:profile.nameEn||'',brand:{ar:contract.property,en:'AQARI PROPERTY',website:'myaqari.com'},detailsVersion:2,accountant:contract.accountant||'',transactionNo:tx,rentPeriodBreakdown:JSON.parse(JSON.stringify(due.breakdown))};
 return {record,ledger,receipt};
}

export function executionManifest({contract,due,onDate,method,transactionNo,receiptNo,contractReceiptSequence,zeroReason,ids}){
 if(!contract||contract.status!=='signed'||!due||!ids?.settlement||!ids?.document||!ids?.version||!ids?.event)throw Error('تعذر تجهيز تسوية الإبرام.');
 const total=asMoney(due.total),tx=text(transactionNo),reason=text(zeroReason),receipt=text(receiptNo),sequence=contractReceiptSequence==null?null:Number(contractReceiptSequence);
 if(total===0){if(method!=='none'||tx||receipt||sequence!==null||reason.length<3)throw Error('وثّق سبب عدم وجود دفعة ولا تنشئ وصلاً وهميًا.');}
 else if(!executionMethods.some(x=>x[0]===method)||tx.length<3)throw Error('طريقة الدفع ورقم العملية مطلوبان.');
 if(due.rent===0&&(receipt||sequence!==null))throw Error('لا يصدر وصل إيجار أو تسلسل وصل لمبلغ إيجار صفري.');
 if(due.rent>0&&(!receipt||!/^AQ-R-\d{4}-\d{8,}$/.test(receipt)||!Number.isSafeInteger(sequence)||sequence<1))throw Error('رقم وصل الإيجار الرسمي وتسلسله داخل العقد مطلوبان.');
 return {id:ids.settlement,contractId:String(contract.id),contractNo:contract.contract_no,tenantId:contract.tenantId,property:contract.property,unit:contract.unit,onDate,method,transactionNo:tx,components:{rent:money(due.rent),deposit:money(due.deposit),advance:money(due.advance),fees:money(due.fees),total:money(total)},rentReceiptNo:receipt,contractReceiptSequence:sequence,zeroReason:total===0?reason:'',contractDocumentId:ids.document,contractDocumentVersionId:ids.version,contractDocumentEventId:ids.event,status:'confirmed'};
}