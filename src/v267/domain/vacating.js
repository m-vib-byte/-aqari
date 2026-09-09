import {depositMoney,depositDate,depositToday,isDepositDenied} from './deposit-ledger.js';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function vacatingValues(input){
 if(!UUID.test(input.lease_id)||!Number.isSafeInteger(input.revision)||input.revision<0||!depositDate(input.vacated_on)||input.vacated_on>depositToday())throw Error('راجع العقد وتاريخ الإخلاء.');
 if(typeof input.keys_received!=='boolean'||typeof input.inspection!=='string'||input.inspection.trim().length<3||input.inspection.length>2000)throw Error('أكمل محضر حالة الوحدة والمفاتيح.');
 if(!Array.isArray(input.obligations)||input.obligations.length>100||!Array.isArray(input.document_ids)||input.document_ids.length>50||input.document_ids.some(x=>!UUID.test(x)))throw Error('راجع الالتزامات والمستندات.');
 const obligations=input.obligations.map(x=>{const description=String(x.description??'').trim();if(description.length<3||description.length>500)throw Error('أدخل وصف الالتزام.');return {description,amount:depositMoney(x.amount)};});
 const reason=String(input.reason??'').trim();if(reason.length<3||reason.length>500)throw Error('أدخل سبب العملية.');
 return {lease_id:input.lease_id,revision:input.revision,vacated_on:input.vacated_on,keys_received:input.keys_received,inspection:input.inspection.trim(),obligations,document_ids:[...new Set(input.document_ids)].sort(),reason};
}
export function stableJSON(value){
 if(Array.isArray(value))return '['+value.map(stableJSON).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableJSON(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
async function hash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
// Opaque recovery marker only. Never persist identity, inspection or money fields.
export function createVacatingWriter({rpc,scope,storage=globalThis.sessionStorage,check=()=>{},uuid=()=>crypto.randomUUID(),digest=hash}){
 const key='aqari:v267:vacating-pending:'+JSON.stringify([scope.workspace,scope.user]);let pending=null,retained=null,busy=false;
 try{const raw=storage.getItem(key);if(raw){pending=JSON.parse(raw);if(!UUID.test(pending?.id)||!['save','issue'].includes(pending.action)||!/^[a-f0-9]{64}$/.test(pending.digest))throw Error();}}catch{throw Error('تعذر التحقق من العملية السابقة.');}
 function clear(){storage.removeItem(key);pending=null;retained=null;}
 async function read(){
  check();if(!pending)return {state:'idle'};
  const op=await rpc('operation',{id:pending.id});check();if(op===null)return {state:'absent'};
  if(!op||op.id!==pending.id||op.action!==pending.action||op.request?.id!==pending.id||await digest(stableJSON({action:op.action,data:op.request}))!==pending.digest
   ||op.result?.updated_by!==scope.user||op.result?.workspace_id!==scope.workspace||op.result?.lease_id!==op.request.lease_id
   ||!UUID.test(op.result?.id)||op.result?.state!==(op.action==='save'?'draft':'issued'))throw Error('تعذر مطابقة العملية المحفوظة.');
  check();clear();return {state:'saved',record:op.result};
 }
 async function send(action,data){
  let error;try{await rpc(action,data);check();}catch(e){error=e;}
  let found;try{found=await read();}catch(e){throw isDepositDenied(error)?error:e;}
  if(found.state==='saved')return found;
  if(error&&['22023','23505','23514','40001','42501'].includes(error.code)){clear();throw error;}
  throw Error('تعذر تأكيد العملية. حدّث السجل للتحقق قبل إعادة المحاولة.');
 }
 async function exclusive(fn){if(busy)throw Error('انتظر التحقق من العملية الحالية.');busy=true;try{return await fn();}finally{busy=false;}}
 return {
  get pending(){return pending?{...pending}:null;},get retained(){return retained;},
  reconcile:()=>exclusive(read),
  submit:(action,input)=>exclusive(async()=>{check();if(pending)throw Error('تحقق من العملية السابقة قبل تسجيل حركة جديدة.');if(!['save','issue'].includes(action))throw Error('راجع بيانات العملية.');
   const data={...input,id:uuid()},marker={id:data.id,action,digest:await digest(stableJSON({action,data}))};check();
   storage.setItem(key,JSON.stringify(marker));if(storage.getItem(key)!==JSON.stringify(marker))throw Error('تعذر تأمين إعادة المحاولة.');pending=marker;retained={action,data};return send(action,data);
  }),
  retry:input=>exclusive(async()=>{check();const found=await read();if(found.state==='saved')return found;if(!pending)throw Error('لا توجد عملية بانتظار التحقق.');
   const data={...(input||retained?.data),id:pending.id};if(await digest(stableJSON({action:pending.action,data}))!==pending.digest)throw Error('أعد إدخال بيانات العملية السابقة نفسها لإعادة المحاولة دون تكرار.');return send(pending.action,data);
  })
 };
}
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function clearanceHTML(record,{translate=x=>x,locale='ar',direction='rtl'}={}){
 if(record?.state!=='issued'||!record.certificate_no||!record.issued_by||!record.snapshot?.identity)throw Error('الإصدار المحفوظ مطلوب للطباعة.');
 const s=record.snapshot,i=s.identity,T=x=>esc(translate(x));
 const title=s.exception_reason?'براءة ذمة باستثناء موثق':'براءة ذمة وفق التسوية المحفوظة';
 const rows=[['رقم المستند',record.certificate_no],['رقم العقد',i.contract_no],['المستأجر',i.tenant_name],['العقار',i.property_name],['الوحدة',i.unit_no],['تاريخ الإخلاء',record.vacated_on],['الرصيد المتبقي للإيجار',s.rent_remaining],['رصيد التأمين',s.deposit_balance],['طلبات الصيانة المفتوحة',s.open_maintenance],['فواتير العقار غير المسوّاة',s.unallocated_utility_bills],['المعتمد',record.issued_name],['تاريخ الإصدار',record.issued_at]];
 return `<!doctype html><html lang="${esc(locale)}" dir="${esc(direction)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${T(title)}</title><style>body{font:16px Arial;line-height:1.7;margin:24px;color:#29261e}main{max-width:780px;margin:auto}dl{display:grid;grid-template-columns:1fr 2fr;gap:8px}dd{margin:0;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccb;padding:6px;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}@media print{body{margin:12mm}tr{break-inside:avoid}}@media(max-width:480px){body{margin:12px}dl{display:block}dd{margin-bottom:8px}}</style></head><body><main><p>AQARI</p><h1>${T(title)}</h1><dl>${rows.map(([k,v])=>`<dt>${T(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl><h2>${T('محضر حالة الوحدة')}</h2><pre>${esc(s.inspection)}</pre><h2>${T('فترات الإيجار')}</h2><table><thead><tr>${['الفترة','المستحق','المسدد','المتبقي'].map(x=>'<th>'+T(x)+'</th>').join('')}</tr></thead><tbody>${s.periods.map(p=>'<tr>'+[p.period,p.due,p.paid,p.remaining].map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')}</tbody></table><h2>${T('الالتزامات الإضافية')}</h2>${s.additional_obligations.map(x=>'<p>'+esc(x.description)+' — '+esc(x.amount)+'</p>').join('')}<h2>${T('الاستثناء المعتمد')}</h2><pre>${esc(s.exception_reason||translate('لا يوجد'))}</pre><p>${T('يعكس هذا المستند التسوية والمستندات المحفوظة وقت الإصدار، مع إظهار أي استثناء معتمد أعلاه.')}</p><p>${T('لا ينشئ النظام توقيعًا أو ختمًا نيابة عن الأطراف.')}</p></main></body></html>`;
}
