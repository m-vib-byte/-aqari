export const maintenanceCategories=Object.freeze({electrical:'كهرباء',plumbing:'سباكة',air_conditioning:'تكييف',elevator:'مصعد',doors_windows:'أبواب ونوافذ',cleaning:'نظافة',other:'أخرى'});
export const kuwaitToday=()=>new Date(Date.now()+10800000).toISOString().slice(0,10);
export function maintenancePayload({id,scope,lease,category,description,today=kuwaitToday()}){
 if(!scope?.user||!scope.workspace||!['general_manager','property_manager'].includes(scope.role))throw Error('صلاحية إنشاء طلب الصيانة غير متاحة لهذا الحساب.');
 if(!lease||lease.workspace_id!==scope.workspace||!lease.tenant_id||lease.status!=='signed'||!lease.start_date||!lease.end_date||lease.start_date>today||lease.end_date<today)throw Error('اختر عقداً موقعاً وسارياً ضمن مساحة العمل الحالية.');
 if(!Object.hasOwn(maintenanceCategories,category))throw Error('اختر نوع العطل.');
 const text=String(description??'').trim();
 if(text.length<5||text.length>3000)throw Error('أدخل وصفاً من ٥ إلى ٣٠٠٠ حرف.');
 return Object.freeze({id,workspace_id:scope.workspace,lease_id:lease.id,tenant_id:lease.tenant_id,created_by:scope.user,category_code:category,description:text,status:'received',cost:0});
}
export function matchesMaintenance(row,payload){
 return !!row&&['id','workspace_id','lease_id','tenant_id','created_by','category_code','description'].every(key=>row[key]===payload[key])&&row.request_no!=null;
}
// The caller retains the same payload/UUID across uncertain responses and dialog reopen.
// Reading before retry and a primary-key insert prevent duplicate requests.
export async function saveMaintenanceRequest({payload,read,insert,check}){
 check();let row=await read(payload.id);check();
 if(!row){
  let failure;
  try{await insert(payload);}catch(error){failure=error;}
  check();
  try{row=await read(payload.id);}catch(error){throw failure||error;}
  check();if(!row)throw failure||Error('لم يتأكد الحفظ. اضغط التحقق والمحاولة مجدداً للطلب نفسه.');
 }
 if(!matchesMaintenance(row,payload))throw Error('تعذر مطابقة الطلب المحفوظ. راجع سجل الصيانة قبل إنشاء طلب آخر.');
 return row;
}
