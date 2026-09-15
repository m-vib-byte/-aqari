export const PAYMENT_DETAIL_MARKER='v267PaymentDetails';

export function patchDailyPaymentDetails(source){
  let next=String(source||'');
  if(next.includes(PAYMENT_DETAIL_MARKER))return next;
  const anchor=`        return Object.freeze({property:String(context.property[0]),day,paid:exactMoneySum(today.map(function(entry){return entry.paid})),count:today.length,undated:entries.length-dated.length});`;
  const replacement=`        const v267PaymentDetails=today.map(function(entry){\n          const method=scalarText(entry.method)||'غير مسجل';\n          const transactionNo=referenceText(entry.transactionNo);\n          const knetTransactionNo=referenceText(entry.knetTransactionNo);\n          const receiptNo=referenceText(entry.receiptNo);\n          return Object.freeze({\n            id:identityText(entry.id),\n            receiptNo:receiptNo,\n            method:method,\n            transactionNo:transactionNo,\n            knetTransactionNo:knetTransactionNo,\n            reference:knetTransactionNo||transactionNo||receiptNo,\n            paidAt:scalarText(entry.paidAt),\n            status:scalarText(entry.status)||'غير مسجل',\n            amount:strictCollectionMoney(entry.paid)\n          });\n        });\n        return Object.freeze({property:String(context.property[0]),day,paid:exactMoneySum(today.map(function(entry){return entry.paid})),count:today.length,undated:entries.length-dated.length,payments:Object.freeze(v267PaymentDetails)});`;
  if(!next.includes(anchor))throw Error('V267 protected daily payment detail anchor not found.');
  return next.replace(anchor,replacement);
}
