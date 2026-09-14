const text=value=>String(value??'').normalize('NFKC').trim();
const asMoney=value=>{
 const n=Number(value??0);if(!Number.isFinite(n)||n<0||Math.round(n*1000)/1000!==n)throw Error('مبلغ غير صالح.');return n;
};
const money=value=>asMoney(value).toFixed(3);
export const executionMethods=Object.freeze([['knet','كي نت'],['bank','تحويل بنكي'],['cash','نقدي'],['cheque','شيك']]);
export function paymentMethodLabel(code){const row=executionMethods.find(x=>x[0]===code);if(!row)throw Error('اختر طريقة دفع صحيحة.');return row[1];}

export function nextRentReceiptSerial(db,year){
 const y=String(year||'').trim();if(!/^\d{4}$/.test(y))throw Error('تعذر تحديد سنة الوصل.');
 const used=[];
 for(const row of db?.collections||[])if(Array.isArray(row)&&row[0])used.push(String(row[0]));
 for(const row of db?.rentLedgerV202||[])for(const value of [row?.receiptNo,row?.voucherNo])if(value)used.push(String(value));
 for(const row of db?.rentReceiptsV267||[])if(row?.id)used.push(String(row.id));
 const pattern=new RegExp('^AQ-R-'+y+'-(\\d+)$','i');let seq=0;
 for(const value of used){const match=text(value).match(pattern);if(match)seq=Math.max(seq,Number(match[1])||0);}
 const normalized=new Set(used.map(v=>text(v).toLocaleLowerCase('ar')));let candidate;
 do{candidate='AQ-R-'+y+'-'+String(++seq).padStart(4,'0');}while(normalized.has(candidate.toLocaleLowerCase('ar')));
 return candidate;
}

export function executionDue(api,contract){
 if(!api||!contract?.rentEntitlement?.startDate)throw Error('بيانات استحقاق العقد غير مكتملة.');
 const period=String(contract.rentEntitlement.startDate).slice(0,7),breakdown=api.entitlementBreakdown(contract,period);
 const rent=asMoney(breakdown.net),deposit=asMoney(contract.deposit||0),advance=asMoney(contract.advance||0),fees=asMoney(contract.cleaningFee||0);
 return {period,rent,deposit,advance,fees,total:Number((rent+deposit+advance+fees).toFixed(3)),breakdown:{...breakdown,version:1,period,dueOn:api.entitlementDueOn(contract,period)}};
}

export function rentReceiptArtifacts({contract,profile,due,receiptNo,onDate,method,transactionNo}){
 if(!contract||contract.status!=='signed'||!profile||!due||due.rent<=0)throw Error('لا يمكن إصدار وصل إيجار قبل توقيع العقد ووجود مبلغ إيجار فعلي.');
 const label=paymentMethodLabel(method),reference=text(receiptNo),tx=text(transactionNo),date=text(onDate);
 if(!reference||!/^\d{4}-\d{2}-\d{2}$/.test(date)||tx.length<3)throw Error('بيانات دفعة الإيجار غير مكتملة.');
 const record=[reference,contract.tenant,due.rent,'مدفوع',contract.property,date,contract.unit,'دفعة الإبرام',due.period,label];
 const ledger={id:'rent-'+reference,receiptNo:reference,property:contract.property,unit:contract.unit,tenant:contract.tenant,contractId:String(contract.id),contractNo:contract.contract_no,period:due.period,due:due.rent,paid:due.rent,balance:0,paidAt:date,method:label,transactionNo:tx,accountant:contract.accountant||'',status:'مدفوع',note:'دفعة الإبرام',source:'v267-contract-execution'};
 const receipt={id:reference,template:'rent-voucher-v267-1',record:JSON.parse(JSON.stringify(record)),contract:JSON.parse(JSON.stringify(contract)),tenantId:contract.tenantId||profile.id||null,tenantNameEn:profile.nameEn||'',brand:{ar:contract.property,en:'AQARI PROPERTY',website:'myaqari.com'},detailsVersion:2,accountant:contract.accountant||'',transactionNo:tx,rentPeriodBreakdown:JSON.parse(JSON.stringify(due.breakdown))};
 return {record,ledger,receipt};
}

export function executionManifest({contract,due,onDate,method,transactionNo,receiptNo,zeroReason,ids}){
 if(!contract||contract.status!=='signed'||!due||!ids?.settlement||!ids?.document||!ids?.version||!ids?.event)throw Error('تعذر تجهيز تسوية الإبرام.');
 const total=asMoney(due.total),tx=text(transactionNo),reason=text(zeroReason),receipt=text(receiptNo);
 if(total===0){if(method!=='none'||tx||receipt||reason.length<3)throw Error('وثّق سبب عدم وجود دفعة ولا تنشئ وصلاً وهميًا.');}
 else if(!executionMethods.some(x=>x[0]===method)||tx.length<3)throw Error('طريقة الدفع ورقم العملية مطلوبان.');
 if(due.rent===0&&receipt)throw Error('لا يصدر وصل إيجار لمبلغ إيجار صفري.');
 if(due.rent>0&&!receipt)throw Error('رقم وصل الإيجار مطلوب.');
 return {id:ids.settlement,contractId:String(contract.id),contractNo:contract.contract_no,tenantId:contract.tenantId,property:contract.property,unit:contract.unit,onDate,method,transactionNo:tx,components:{rent:money(due.rent),deposit:money(due.deposit),advance:money(due.advance),fees:money(due.fees),total:money(total)},rentReceiptNo:receipt,zeroReason:total===0?reason:'',contractDocumentId:ids.document,contractDocumentVersionId:ids.version,contractDocumentEventId:ids.event,status:'confirmed'};
}
