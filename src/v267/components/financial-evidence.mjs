export function paymentTotal(rows,month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('شهر غير صالح.');
 let fils=0,count=0;
 for(const row of rows){if(!['paid','partial','مدفوع','جزئي'].includes(row.status)||!row.paid_at?.startsWith(month+'-'))continue;
 const value=String(row.amount);if(!/^\d+(\.\d{1,3})?$/.test(value))throw Error('مبلغ محفوظ غير صالح.');
 const amount=Math.round(Number(value)*1000);if(!Number.isSafeInteger(amount)||!Number.isSafeInteger(fils+amount))throw Error('مبلغ يتجاوز دقة الحساب.');fils+=amount;count++;}
 return {amount:(fils/1000).toFixed(3),count};
}
