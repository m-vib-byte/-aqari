const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DEPOSIT_METHODS=Object.freeze({cash:'نقدي',knet:'كي نت',bank:'تحويل بنكي',cheque:'شيك'});
const digits=value=>String(value??'').replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-1632)).replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-1776)).replace(/٫/g,'.');
export function depositMoney(value,{positive=false}={}){
 const normalized=digits(value).trim();
 if(!/^\d{1,12}(?:\.\d{1,3})?$/.test(normalized))throw Error('أدخل مبلغاً صحيحاً بالدينار الكويتي، بثلاث منازل عشرية كحد أقصى.');
 const [whole,fraction='']=normalized.split('.'),amount=whole.replace(/^0+(?=\d)/,'')+'.'+fraction.padEnd(3,'0');
 if(positive&&amount==='0.000')throw Error('يجب أن يكون المبلغ أكبر من صفر.');
 return amount;
}
export const depositFils=value=>BigInt(depositMoney(value).replace('.',''));
export function depositDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value))||value.slice(0,4)==='0000')return false;
 const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function depositToday(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuwait',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 return ['year','month','day'].map(key=>parts.find(part=>part.type===key).value).join('-');
}
export function depositValues(action,input){
 if(!['receive','refund'].includes(action)||!UUID.test(String(input?.lease_id)))throw Error('اختر عقداً محفوظاً.');
 const values={lease_id:input.lease_id,amount:depositMoney(input.amount,{positive:true}),on_date:String(input.on_date??''),method:String(input.method??''),reference:String(input.reference??'').trim(),reason:String(input.reason??'').trim()};
 if(!depositDate(values.on_date)||values.on_date>depositToday())throw Error('أدخل تاريخاً صحيحاً لا يتجاوز اليوم.');
 if(!Object.hasOwn(DEPOSIT_METHODS,values.method))throw Error('اختر طريقة دفع صحيحة.');
 if(values.reference.length>120||(values.method!=='cash'&&values.reference.length<3))throw Error('أدخل مرجع التحويل أو الدفع من 3 إلى 120 حرفاً.');
 if(values.reason.length>500||(action==='refund'&&values.reason.length<3))throw Error('أدخل سبب رد التأمين من 3 إلى 500 حرف.');
 return values;
}
function canonical(action,values){return JSON.stringify([action,values.lease_id,depositMoney(values.amount),values.on_date,values.method,values.reference??'',values.reason??'']);}
async function fingerprint(value){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function isDepositDenied(error){return ['42501','PGRST301','PGRST302'].includes(String(error?.code))||[401,403].includes(Number(error?.status))||/^(ACCESS_DENIED|SECTION_READ_DENIED|SECTION_WRITE_DENIED)/.test(String(error?.message));}
const definiteRejection=error=>['22023','23505','23514','42501'].includes(String(error?.code));

// Only an opaque operation ID and a one-way fingerprint survive reload. No
// tenant names, amounts, references or reasons are written to browser storage.
// A pending operation is never replaced by a new ID, even after a lost reply.
export function createDepositWriter({rpc,scope,storage=globalThis.sessionStorage,uuid=()=>crypto.randomUUID(),hash=fingerprint,check=()=>{}}){
 const key='aqari:v267:deposit-pending:'+JSON.stringify([scope.workspace,scope.user]);
 let pending=null,retained=null,busy=false;
 try{const raw=storage.getItem(key);if(raw){pending=JSON.parse(raw);if(!UUID.test(pending?.id)||!UUID.test(pending?.lease_id)||!['receive','refund'].includes(pending.action)||!/^[a-f0-9]{64}$/.test(pending.digest))throw Error();}}
 catch{throw Error('تعذر التحقق من العملية السابقة. أعد فتح الصفحة قبل تسجيل حركة تأمين.');}
 function remember(marker){
  try{storage.setItem(key,JSON.stringify(marker));if(storage.getItem(key)!==JSON.stringify(marker))throw Error();}
  catch{throw Error('تعذر تأمين إعادة المحاولة. أعد فتح الصفحة قبل تسجيل حركة تأمين.');}
  pending=marker;
 }
 function clear(){storage.removeItem(key);pending=null;retained=null;}
 async function readback(){
  check();if(!pending)return {state:'idle'};
  const marker=pending,result=await rpc('get',{id:marker.id});check();
  if(!result||!Object.hasOwn(result,'entry')||!Object.hasOwn(result,'lease')||(!result.entry&&(result.entry!==null||result.lease!==null)))throw Error('تعذر تأكيد العملية. حدّث السجل للتحقق قبل إعادة المحاولة.');
  const entry=result.entry;if(entry===null)return {state:'absent',pending:{...marker}};
  const action=entry.kind==='receipt'?'receive':entry.kind==='refund'?'refund':null;
  const values={...entry,lease_id:entry.snapshot?.lease_id??entry.lease_id};
  if(entry.id!==marker.id||entry.status!=='confirmed'||entry.actor_id!==scope.user||action!==marker.action||values.lease_id!==marker.lease_id||await hash(canonical(action,values))!==marker.digest)throw Error('لا تطابق الحركة المحفوظة بيانات العملية. راجع السجل قبل أي إجراء جديد.');
  check();clear();return {state:'saved',entry,lease:result.lease};
 }
 async function attempt(values){
  let failure;
  try{await rpc(pending.action,{id:pending.id,...values});check();}catch(error){failure=error;}
  let result;
  try{result=await readback();}catch(error){if(isDepositDenied(failure))throw failure;throw error;}
  if(result.state==='saved')return result;
  // A completed transactional rejection plus a successful absent read proves
  // this attempt did not commit. A timeout or transport error does not.
  if(failure&&definiteRejection(failure)){clear();throw failure;}
  return result;
 }
 async function exclusive(work){if(busy)throw Error('انتظر التحقق من العملية الحالية.');busy=true;try{return await work();}finally{busy=false;}}
 return {
  get pending(){return pending?{...pending}:null;},
  get retained(){return retained?{...retained}:null;},
  reconcile:()=>exclusive(readback),
  submit:(action,input)=>exclusive(async()=>{
   check();if(pending)throw Error('تحقق من العملية السابقة قبل تسجيل حركة جديدة.');
   const values=depositValues(action,input),digest=await hash(canonical(action,values));check();
   remember({id:uuid(),lease_id:values.lease_id,action,digest});retained=values;
   return attempt(values);
  }),
  retry:input=>exclusive(async()=>{
   check();if(!pending)throw Error('لا توجد عملية بانتظار التحقق.');
   const current=await readback();if(current.state==='saved')return current;
   const values=depositValues(pending.action,input??retained);
   if(values.lease_id!==pending.lease_id||await hash(canonical(pending.action,values))!==pending.digest)throw Error('أعد إدخال بيانات العملية السابقة نفسها لإعادة المحاولة دون تكرار.');
   check();retained=values;return attempt(values);
  })
 };
}

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function depositReceiptHTML(entry,{translate=x=>x,locale='ar',direction='rtl'}={}){
 if(!entry?.id||entry.status!=='confirmed'||!entry.voucher_no||!['receipt','refund'].includes(entry.kind)||!entry.snapshot?.lease_id)throw Error('اختر حركة محفوظة ومؤكدة قبل تجهيز الوصل.');
 const title=translate(entry.kind==='receipt'?'وصل قبض تأمين':'وصل رد تأمين'),snapshot=entry.snapshot;
 const rows=[['رقم الوصل',entry.voucher_no],['تاريخ العملية',entry.on_date],['رقم العقد',snapshot.contract_no],['المستأجر',snapshot.tenant_name],['العقار',snapshot.property_name],['الوحدة',snapshot.unit_no],['المبلغ بالدينار الكويتي',depositMoney(entry.amount,{positive:true})],['طريقة الدفع',translate(DEPOSIT_METHODS[entry.method]||'غير مسجل')],['مرجع الدفع',entry.reference||translate('غير مسجل')],['السبب أو البيان',entry.reason||translate('غير مسجل')],['سجل العملية',entry.actor_name||translate('غير مسجل')],['رصيد التأمين بعد تسجيل السند — د.ك',depositMoney(entry.balance_after)]];
 return '<!doctype html><html lang="'+escape(locale)+'" dir="'+escape(direction)+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>'+escape(title)+' '+escape(entry.voucher_no)+'</title><style>body{font-family:Arial,sans-serif;color:#26231d;margin:0;padding:24px;line-height:1.7}main{max-width:760px;margin:auto;border:1px solid #b69a55;padding:24px}h1{font-size:25px;color:#695528}dl{display:grid;grid-template-columns:minmax(130px,1fr) 2fr;gap:8px 20px}dt{font-weight:bold}dd{margin:0;overflow-wrap:anywhere;white-space:pre-wrap}.note{border-top:1px solid #d6c9ab;padding-top:16px;font-size:13px}@media(max-width:480px){body,main{padding:12px}dl{display:block}dd{margin-bottom:12px}}@media print{body{padding:0}main{border:0;padding:12mm;max-width:none}dt,dd{break-inside:avoid}}</style></head><body><main><p>AQARI · '+escape(translate('دفتر التأمين'))+'</p><h1>'+escape(title)+'</h1><dl>'+rows.map(([label,value])=>'<dt>'+escape(translate(label))+'</dt><dd>'+escape(value)+'</dd>').join('')+'</dl><p class="note">'+escape(translate('هذا الوصل يثبت تسجيل حركة التأمين في السجل، ولا ينفذ تحويلاً مالياً خارجياً.'))+'</p><p>'+escape(translate('وصل التأمين مستقل عن الإيجار ولا يمثل مخالصة أو براءة ذمة.'))+'</p></main></body></html>';
}
