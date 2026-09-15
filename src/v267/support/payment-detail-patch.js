export const PAYMENT_DETAIL_MARKER='v267PaymentDetails';

export function patchDailyPaymentDetails(source){
  let next=String(source||'');
  if(next.includes(PAYMENT_DETAIL_MARKER))return next;

  const protectedAnchor=`    rentLedgerV202:['id','receiptNo','voucherNo','property','unit','tenant','contractId','contract_id','contractNo','contract_no','period','due','paid','balance','paidAt','method','transactionNo','knetTransactionNo','contractReceived','accountant','status','note','source','paymentKey'],`;
  const protectedReplacement=`    rentLedgerV202:['id','receiptNo','voucherNo','property','unit','tenant','contractId','contract_id','contractNo','contract_no','period','due','paid','balance','paidAt','method','transactionNo','knetTransactionNo','paymentProvider','contractReceived','accountant','status','note','source','paymentKey'],`;
  if(!next.includes(protectedAnchor))throw Error('V267 payment provider protected-field anchor not found.');
  next=next.replace(protectedAnchor,protectedReplacement);

  const formAnchor=`        '<label><span>مرجع الحركة — مطلوب لجميع طرق الدفع</span><input id="v267PaymentTransaction" maxlength="150" required placeholder="رقم العملية أو سند القبض النقدي"></label>'+`;
  const formReplacement=formAnchor+`\n        '<label><span>البنك / مزوّد الدفع</span><input id="v267PaymentProvider" maxlength="120" placeholder="مطلوب للتحويل البنكي والشيك وأخرى"></label>'+`;
  if(!next.includes(formAnchor))throw Error('V267 payment provider form anchor not found.');
  next=next.replace(formAnchor,formReplacement);

  const submitAnchor=`    const transactionNo=referenceText(document.getElementById('v267PaymentTransaction')?.value);\n    const paymentError=paymentMethodReferenceError(method,transactionNo);\n    if(paymentError){if(error)error.textContent=paymentError;return false;}`;
  const submitReplacement=`    const transactionNo=referenceText(document.getElementById('v267PaymentTransaction')?.value);\n    let paymentProvider=scalarText(document.getElementById('v267PaymentProvider')?.value);\n    const paymentMethodKey=normalized(method);\n    const isKnet=/(?:k\\s*net|knet|كي\\s*نت)/i.test(paymentMethodKey);\n    const isCash=/(?:cash|نقد|كاش)/i.test(paymentMethodKey);\n    const providerRequired=method==='تحويل بنكي'||method==='شيك'||method==='أخرى'||['bank','cheque','other'].includes(paymentMethodKey);\n    if(isKnet&&!paymentProvider)paymentProvider='KNET';\n    if(isCash)paymentProvider='';\n    if(providerRequired&&(!paymentProvider||paymentProvider.length<2||paymentProvider.length>120)){if(error)error.textContent='أدخل اسم البنك أو مزوّد الدفع لهذه الوسيلة.';return false;}\n    const paymentError=paymentMethodReferenceError(method,transactionNo);\n    if(paymentError){if(error)error.textContent=paymentError;return false;}`;
  if(!next.includes(submitAnchor))throw Error('V267 payment provider submit anchor not found.');
  next=next.replace(submitAnchor,submitReplacement);

  const ledgerAnchor=`      method,transactionNo,accountant:contract.accountant||'',status:finalStatus,note,source:'v202-entry',paymentKey:paymentKey(activeProperty,contract,contract.unit,period)`;
  const ledgerReplacement=`      method,transactionNo,paymentProvider,accountant:contract.accountant||'',status:finalStatus,note,source:'v202-entry',paymentKey:paymentKey(activeProperty,contract,contract.unit,period)`;
  if(!next.includes(ledgerAnchor))throw Error('V267 payment provider ledger anchor not found.');
  next=next.replace(ledgerAnchor,ledgerReplacement);

  const anchor=`        return Object.freeze({property:String(context.property[0]),day,paid:exactMoneySum(today.map(function(entry){return entry.paid})),count:today.length,undated:entries.length-dated.length});`;
  const replacement=`        const v267PaymentDetails=today.map(function(entry){\n          const method=scalarText(entry.method)||'غير مسجل';\n          const transactionNo=referenceText(entry.transactionNo);\n          const knetTransactionNo=referenceText(entry.knetTransactionNo);\n          const receiptNo=referenceText(entry.receiptNo);\n          return Object.freeze({\n            id:identityText(entry.id),\n            receiptNo:receiptNo,\n            method:method,\n            transactionNo:transactionNo,\n            knetTransactionNo:knetTransactionNo,\n            paymentProvider:scalarText(entry.paymentProvider),\n            reference:knetTransactionNo||transactionNo||receiptNo,\n            paidAt:scalarText(entry.paidAt),\n            status:scalarText(entry.status)||'غير مسجل',\n            amount:strictCollectionMoney(entry.paid)\n          });\n        });\n        return Object.freeze({property:String(context.property[0]),day,paid:exactMoneySum(today.map(function(entry){return entry.paid})),count:today.length,undated:entries.length-dated.length,payments:Object.freeze(v267PaymentDetails)});`;
  if(!next.includes(anchor))throw Error('V267 protected daily payment detail anchor not found.');
  return next.replace(anchor,replacement);
}
