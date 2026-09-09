import {depositDate} from './deposit-ledger.js';
export const EXIT_CHECKS=Object.freeze({rent:'الإيجار',deposit:'التأمين',utilities:'الكهرباء والماء والخدمات',maintenance:'الصيانة وحالة الوحدة',keys:'المفاتيح والاستلام',other:'التزامات أخرى'});
export const EXIT_STATES=Object.freeze({pending:'بانتظار المراجعة',reviewed:'تمت المراجعة مع بيان',outstanding:'يوجد التزام مفتوح'});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const emptyExitChecks=()=>Object.fromEntries(Object.keys(EXIT_CHECKS).map(k=>[k,{status:'pending',note:''}]));
export function exitValues(input){
 if(!uuid.test(input?.lease_id)||!Number.isSafeInteger(input.revision)||input.revision<0||input.revision>99999999)throw Error('EXIT_INVALID_DATA');
 if(!depositDate(input.vacate_on))throw Error('EXIT_INVALID_DATE');
 const reason=String(input.reason??'').trim();if(reason.length<3||reason.length>1000)throw Error('EXIT_INVALID_REASON');
 const document_id=input.document_id||null;if(document_id!==null&&!uuid.test(document_id))throw Error('EXIT_INVALID_DOCUMENT');
 if(!input.checks||Object.keys(input.checks).sort().join()!==Object.keys(EXIT_CHECKS).sort().join())throw Error('EXIT_INVALID_CHECKS');
 const checks={};
 for(const k of Object.keys(EXIT_CHECKS)){
  const row=input.checks[k];if(!row||Object.keys(row).sort().join()!=='note,status'||!Object.hasOwn(EXIT_STATES,row.status)||typeof row.note!=='string'||row.note.length>500||(row.status!=='pending'&&row.note.trim().length<3))throw Error('EXIT_INVALID_CHECKS');
  checks[k]={status:row.status,note:row.note};
 }
 return {lease_id:input.lease_id,revision:input.revision,vacate_on:input.vacate_on,reason,document_id,checks};
}
const canonical=value=>JSON.stringify(exitValues(value));
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
export function createExitWriter({rpc,scope,storage=globalThis.sessionStorage,makeId=()=>crypto.randomUUID(),hash=digest,check=()=>{}}){
 const key='aqari:v267:exit-pending:'+JSON.stringify([scope.workspace,scope.user]);let pending=null,retained=null,busy=false;
 try{const raw=storage.getItem(key);if(raw){pending=JSON.parse(raw);if(!uuid.test(pending?.request_id)||!uuid.test(pending?.lease_id)||!Number.isSafeInteger(pending?.revision)||pending.revision<0||!/^[a-f0-9]{64}$/.test(pending?.digest))throw Error();}}catch{throw Error('EXIT_RECOVERY_UNAVAILABLE');}
 function clear(){storage.removeItem(key);pending=null;retained=null;}
 async function reconcile(){
  check();if(!pending)return {state:'idle'};const r=await rpc('get',{request_id:pending.request_id});check();
  if(!r||!Object.hasOwn(r,'entry'))throw Error('EXIT_UNCERTAIN');
  if(r.entry===null)return {state:'absent'};
  const e=r.entry;if(e.request_id!==pending.request_id||e.lease_id!==pending.lease_id||e.actor_id!==scope.user||e.workspace_id!==scope.workspace||await hash(canonical({...e,revision:e.revision-1}))!==pending.digest)throw Error('EXIT_REQUEST_CONFLICT');
  check();clear();return {state:'saved',entry:e};
 }
 async function attempt(values){
  let failure;try{await rpc('save',{request_id:pending.request_id,...values});check();}catch(e){failure=e;}
  const r=await reconcile();if(r.state==='saved')return r;
  if(failure&&['22023','22P02','22007','22008','23505','23514','42501'].includes(failure.code)){clear();throw failure;}
  if(failure)throw failure;throw Error('EXIT_UNCERTAIN');
 }
 async function exclusive(fn){if(busy)throw Error('EXIT_BUSY');busy=true;try{return await fn();}finally{busy=false;}}
 return {
  get pending(){return pending?{...pending}:null;},get retained(){return retained?structuredClone(retained):null;},
  reconcile:()=>exclusive(reconcile),
  submit:values=>exclusive(async()=>{
   check();if(pending)throw Error('EXIT_UNCERTAIN');const v=exitValues(values),marker={request_id:makeId(),lease_id:v.lease_id,revision:v.revision,digest:await hash(canonical(v))};check();
   try{storage.setItem(key,JSON.stringify(marker));if(storage.getItem(key)!==JSON.stringify(marker))throw Error();}catch{throw Error('EXIT_RECOVERY_UNAVAILABLE');}
   pending=marker;retained=v;return attempt(v);
  }),
  retry:values=>exclusive(async()=>{
   const r=await reconcile();if(r.state==='saved')return r;if(!pending)throw Error('EXIT_UNCERTAIN');
   const v=exitValues(values??retained);if(await hash(canonical(v))!==pending.digest)throw Error('EXIT_REQUEST_CONFLICT');check();retained=v;return attempt(v);
  })
 };
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function exitReviewHTML(entry,{translate=x=>x,locale='ar',direction='rtl'}={}){
 if(!uuid.test(entry?.id)||!entry.document_no||entry.revision<1||entry.snapshot?.lease_id!==entry.lease_id||entry.snapshot.clearance_issued!==false)throw Error('EXIT_UNSAVED_PRINT');
 const s=entry.snapshot,title=translate('طلب إخلاء ومراجعة التسوية');
 const rows=[['رقم المستند',entry.document_no],['الإصدار',entry.revision],['رقم العقد',s.contract_no],['المستأجر',s.tenant_name],['العقار',s.property_name],['الوحدة',s.unit_no],['تاريخ الإخلاء المطلوب',entry.vacate_on],['سبب الإخلاء أو البيان',entry.reason],['أعد المراجعة',entry.actor_name],['وقت الحفظ',entry.created_at],['رصيد التأمين وقت الحفظ — د.ك',s.deposit_balance],['إجمالي دفعات الإيجار المؤكدة — د.ك',s.rent_payments_total]];
 return '<!doctype html><html lang="'+esc(locale)+'" dir="'+esc(direction)+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>'+esc(title)+'</title><style>body{font-family:Arial,sans-serif;line-height:1.7;color:#302a20;margin:0;padding:24px}main{max-width:780px;margin:auto}h1{color:#756034}dl{display:grid;grid-template-columns:1fr 2fr;gap:8px}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}article{border-top:1px solid #d8cab0;padding:12px 0;break-inside:avoid}p{white-space:pre-wrap;overflow-wrap:anywhere}.notice{border:2px solid #947333;padding:12px}@media(max-width:480px){body{padding:12px}dl{display:block}dd{margin-bottom:8px}}@media print{body{padding:12mm}}</style></head><body><main><p>AQARI</p><h1>'+esc(title)+'</h1><p class="notice">'+esc(translate('هذا طلب ومراجعة فقط؛ لا ينهي العقد ولا يثبت استلام الوحدة أو سداد الالتزامات ولا يصدر براءة ذمة.'))+'</p><dl>'+rows.map(([k,v])=>'<dt>'+esc(translate(k))+'</dt><dd>'+esc(v)+'</dd>').join('')+'</dl>'+Object.entries(EXIT_CHECKS).map(([k,label])=>'<article><strong>'+esc(translate(label))+' — '+esc(translate(EXIT_STATES[entry.checks[k].status]))+'</strong><p>'+esc(entry.checks[k].note)+'</p></article>').join('')+'<p>'+esc(translate('المقبوضات ليست الرصيد المستحق. التسوية النهائية تحتاج مطابقة الإيجار والتأمين والخدمات والصيانة والاستلام والالتزامات الأخرى.'))+'</p><p>'+esc(s.document?.document_no||'')+' '+esc(s.document?.title||'')+'</p></main></body></html>';
}
