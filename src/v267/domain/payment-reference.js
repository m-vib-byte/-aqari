function normalizePaymentMethod(value){
 return String(value??'').trim().toLowerCase().replace(/[‐‑‒–—−_-]+/g,' ').replace(/\s+/g,' ');
}

export function isKnetPaymentMethod(value){
 const method=normalizePaymentMethod(value);
 return method==='knet'||method==='k net'||method==='كي نت'||method.startsWith('knet ')||method.startsWith('k net ')||method.startsWith('كي نت ');
}

export function statementPaymentReference(row={}){
 const raw=row.payment_operation_raw;
 const value=raw==null||String(raw).trim()===''?null:String(raw).trim();
 return {
  label:isKnetPaymentMethod(row.payment_method_raw)?'رقم KNET بالمصدر':'مرجع الدفع بالمصدر',
  value
 };
}
