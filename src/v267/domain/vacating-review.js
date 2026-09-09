import {depositMoney,depositFils,depositDate,isDepositDenied} from './deposit-ledger.js';
export const REVIEW_AMOUNTS=['rent_due','utilities_due','damage_due','other_due'];
export const REVIEW_LABELS={rent_due:'الإيجار قيد التسوية',utilities_due:'الخدمات قيد التسوية',damage_due:'الأضرار قيد التسوية',other_due:'التزامات أخرى قيد التسوية'};
export function reviewValues(input){
 const values={vacate_date:String(input.vacate_date??''),reason:String(input.reason??'').trim()};
 if(!depositDate(values.vacate_date))throw Error('أدخل تاريخ إخلاء صحيحاً.');
 if(values.reason.length<3||values.reason.length>2000)throw Error('أدخل مرجع المراجعة وملاحظاتها من 3 إلى 2000 حرف.');
 for(const key of ['keys_returned','inspection_complete','utilities_verified']){
  if(typeof input[key]!=='boolean')throw Error('راجع قائمة فحص الإخلاء.');values[key]=input[key];
 }
 for(const key of REVIEW_AMOUNTS)values[key]=input[key]===null||input[key]===undefined||String(input[key]).trim()===''?null:depositMoney(input[key]);
 return values;
}
export function reviewSummary(values,deposit){
 const missing=REVIEW_AMOUNTS.filter(key=>values[key]===null||values[key]===undefined||values[key]==='');
 if(missing.length)return {complete:false,missing,net:null};
 const total=REVIEW_AMOUNTS.reduce((sum,key)=>sum+depositFils(values[key]),0n),net=total-depositFils(deposit);
 const absolute=net<0n?-net:net;
 return {complete:true,missing:[],net:(net<0n?'-':'')+(absolute/1000n)+'.'+String(absolute%1000n).padStart(3,'0')};
}
// Draft revisions carry no payment side effect. A lost reply retains the exact
// request in memory and forbids editing/replacing it until authoritative readback.
export function createReviewWriter({rpc,scope,check=()=>{},uuid=()=>crypto.randomUUID()}){
 let pending=null,busy=false;
 async function readback(){
  check();if(!pending)return null;
  const result=await rpc('get',{id:pending.id});check();
  if(!result||!Object.hasOwn(result,'review'))throw Error('تعذر التحقق من المراجعة المحفوظة.');
  if(result.review===null)return null;
  const row=result.review;
  if(row.id!==pending.id||row.lease_id!==pending.lease_id||row.workspace_id!==scope.workspace||row.actor_id!==scope.user||row.revision!==pending.revision+1||
   Object.entries(pending).some(([key,value])=>row.request_data?.[key]!==value))throw Error('بيانات المراجعة المحفوظة لا تطابق الطلب.');
  pending=null;return row;
 }
 async function attempt(){
  let failure;
  try{await rpc('save',pending);check();}catch(error){failure=error;}
  if(isDepositDenied(failure))throw failure;
  const row=await readback();if(row)return row;
  if(failure&&['22023','23505','23514','22007','22008'].includes(failure.code)){pending=null;throw failure;}
  throw Error('تعذر تأكيد الحفظ. استخدم التحقق وإعادة نفس الطلب.');
 }
 async function exclusive(fn){if(busy)throw Error('انتظر اكتمال العملية الحالية.');busy=true;try{return await fn();}finally{busy=false;}}
 return {
  get pending(){return pending?{...pending}:null;},
  save:(input,context)=>exclusive(async()=>{check();if(pending)throw Error('تحقق من الطلب السابق أولاً.');
   pending={...reviewValues(input),id:uuid(),lease_id:context.lease_id,revision:context.revision,evidence_token:context.evidence_token};return attempt();}),
  retry:()=>exclusive(async()=>{check();if(!pending)return null;return await readback()||await attempt();}),
  dispose:()=>{pending=null;}
 };
}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function reviewHTML(row){
 if(!row?.id||!Number.isInteger(row.revision)||row.revision<1||row.lease_id!==row.evidence?.lease?.id)throw Error('اختر مراجعة محفوظة قبل الطباعة.');
 const v=row.request_data,l=row.evidence.lease,summary=reviewSummary(v,l.balance);
 const rows=[['مرجع المراجعة',row.id],['نسخة المراجعة',row.revision],['تاريخ الحفظ',row.created_at],['المراجع',row.actor_name],['رقم العقد',l.contract_no],['المستأجر',l.tenant_name],['العقار والوحدة',l.property_name+' · '+l.unit_no],['تاريخ الإخلاء المقترح',v.vacate_date],
  ...REVIEW_AMOUNTS.map(key=>[REVIEW_LABELS[key],v[key]===null?'لم يُراجع':depositMoney(v[key])]),['رصيد التأمين المحفوظ عند المراجعة',depositMoney(l.balance)],['صافي التسوية المقترح — موجب على المستأجر / سالب للمستأجر',summary.net??'غير محسوب: مبالغ غير مراجعة'],
  ...[['keys_returned','استلام المفاتيح'],['inspection_complete','فحص الوحدة'],['utilities_verified','مراجعة الخدمات']].map(([key,label])=>[label,v[key]?'مسجل كمكتمل':'قيد المراجعة']),['مرجع المراجعة وملاحظاتها',v.reason]];
 return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>مسودة مراجعة إخلاء</title><style>body{font-family:Arial;line-height:1.7;padding:24px;color:#29261e}main{max-width:760px;margin:auto}dt{font-weight:bold}dd{margin:0 0 12px;white-space:pre-wrap;overflow-wrap:anywhere}.notice{border:2px solid #9d7e35;padding:16px}h1{font-size:24px}</style></head><body><main><h1>مسودة مراجعة إخلاء — ليست براءة ذمة</h1><p class="notice">هذه نسخة مراجعة محفوظة. المبالغ المدخلة مقترحات تحتاج مطابقة المستندات والدفاتر. لا تنهي العقد، ولا تثبت قبضاً أو رد تأمين، ولا تُسقط أي التزام. راجع السجل الحالي قبل اتخاذ إجراء.</p><dl>'+rows.map(([label,value])=>'<dt>'+escape(label)+'</dt><dd>'+escape(value)+'</dd>').join('')+'</dl></main></body></html>';
}
