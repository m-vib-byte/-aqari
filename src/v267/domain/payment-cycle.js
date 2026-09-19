export const paymentCycleOptions=Object.freeze([
 [1,'شهري — كل شهر'],
 [3,'ربع سنوي — كل 3 أشهر'],
 [6,'نصف سنوي — كل 6 أشهر'],
 [12,'سنوي — كل 12 شهرًا']
]);

export function paymentCycleMonths(value,{historical=false}={}){
 const n=Number(value);
 if(paymentCycleOptions.some(([months])=>months===n))return n;
 if(historical&&(value==null||value===''))return 1;
 throw Error('اختر دورة سداد صحيحة: شهرية أو ربع سنوية أو نصف سنوية أو سنوية.');
}

export function paymentCycleLabel(value,{historical=false}={}){
 const months=paymentCycleMonths(value,{historical});
 return paymentCycleOptions.find(([n])=>n===months)?.[1]||String(months);
}
