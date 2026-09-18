import {createDialog,node,field} from '../components/dialog.js';
import {t,getLocale,direction} from '../components/locale.js';
import {createPrivateUrls} from '../components/private-urls.js';
import {depositToday,isDepositDenied} from '../domain/deposit-ledger.js';
import {EXIT_CHECKS,EXIT_STATES,emptyExitChecks,exitValues,createExitWriter,exitReviewHTML} from '../domain/exit-review.js';
const fresh=()=>({vacate_on:depositToday(),reason:'',document_id:null,checks:emptyExitChecks()});
const errorText={EXIT_INVALID_DATA:'راجع بيانات طلب الإخلاء.',EXIT_INVALID_DATE:'اختر تاريخ إخلاء صحيحاً.',EXIT_BEFORE_CONTRACT:'تاريخ الإخلاء يسبق بداية العقد.',EXIT_INVALID_REASON:'اكتب سبب الإخلاء من 3 إلى 1000 حرف.',EXIT_INVALID_DOCUMENT:'اختر مستنداً محفوظاً مرتبطاً بالعقد.',EXIT_INVALID_CHECKS:'أكمل بيان كل بند تمت مراجعته أو عليه التزام.',EXIT_STALE_REVISION:'حُفظ إصدار أحدث. حدّث السجل قبل إعداد مراجعة جديدة.',EXIT_REQUEST_CONFLICT:'البيانات لا تطابق العملية السابقة؛ حدّث السجل وتحقق منها.',EXIT_CONTRACT_REQUIRED:'طلب الإخلاء يحتاج عقداً موقّعاً أو منتهياً محفوظاً.',EXIT_RECOVERY_UNAVAILABLE:'تعذر تأمين استعادة العملية؛ أعد فتح الصفحة.',EXIT_UNCERTAIN:'تعذر تأكيد الحفظ؛ تحقق من العملية السابقة قبل حفظ طلب آخر.',EXIT_BUSY:'انتظر التحقق من العملية الحالية.'};
export function openExitReview(){
 const d=createDialog(t('طلب إخلاء ومراجعة التسوية'),{localized:true});if(!d)return;
 const urls=createPrivateUrls(d);let writer,leases=[],documents=[],entries=[],leaseId='',draft=fresh(),revision=0,canWrite=false,output=null;
 const rpc=(action,data={})=>d.session.request(d.session.client.rpc('aqari_exit_review',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:data}));
 const text=(tag,value)=>node(tag,t(value));
 const button=(label,action)=>{const b=text('button',label);b.type='button';b.onclick=action;return b;};
 function forget(){leases=[];documents=[];entries=[];draft=fresh();leaseId='';output=null;urls.clear();d.body.replaceChildren();}
 const work=task=>d.run(async()=>{try{await task();d.session.check();}catch(e){if(isDepositDenied(e)){forget();throw e;}d.session.check();d.status.textContent=t(errorText[e?.message]||t('تعذر إكمال العملية. حدّث السجل وتحقق من البيانات.'));render();}});
 async function read(recover=true){
  const result=recover&&writer.pending?await writer.reconcile():null;
  if(result?.state==='saved')leaseId=result.entry.lease_id;
  if(writer.pending)leaseId=writer.pending.lease_id;
  const r=await rpc('list',leaseId?{lease_id:leaseId}:{});d.session.check();
  if(!Array.isArray(r?.leases)||!Array.isArray(r?.entries)||!Array.isArray(r?.documents))throw Error('EXIT_UNCERTAIN');
  leases=r.leases;documents=r.documents;entries=r.entries;canWrite=r.can_write===true;revision=writer.pending?writer.pending.revision:(entries[0]?.revision||0);
  if(writer.pending&&writer.retained){const v=writer.retained;draft={vacate_on:v.vacate_on,reason:v.reason,document_id:v.document_id,checks:v.checks};revision=v.revision;}
  else if(!writer.pending){const e=entries[0];draft=e?{vacate_on:e.vacate_on,reason:e.reason,document_id:e.document_id,checks:structuredClone(e.checks)}:fresh();}
  output=null;urls.clear();render();d.status.textContent=t(writer.pending?t('تحقق من العملية السابقة قبل إعداد مراجعة أخرى.'):t('تم استرجاع طلب الإخلاء وإصداراته المحفوظة.'));
 }
 async function save(){
  const values=exitValues({lease_id:leaseId,revision,...draft});
  const result=await (writer.pending?writer.retry(values):writer.submit(values));d.session.check();
  if(result.state==='saved'){await read(false);d.status.textContent=t('حُفظ طلب الإخلاء وتم التحقق من نسخته.');}
 }
 async function print(request_id){
  output=null;urls.clear();const r=await rpc('get',{request_id});d.session.check();
  if(r?.entry?.request_id!==request_id||r.entry.lease_id!==leaseId)throw Error('EXIT_UNCERTAIN');
  output=urls.create(new Blob([exitReviewHTML(r.entry,{translate:t,locale:getLocale(),direction:direction()})],{type:'text/html;charset=utf-8'}));render();
 }
 function render(){
  if(d.closed)return;d.body.replaceChildren(text('p',t('هذا طلب ومراجعة فقط؛ لا ينهي العقد ولا يثبت استلام الوحدة أو سداد الالتزامات ولا يصدر براءة ذمة.')));
  const select=node('select');const empty=text('option',t('اختر عقداً محفوظاً.'));empty.value='';select.append(empty);
  for(const l of leases){const o=node('option',[l.contract_no,l.tenant_name,l.property_name,l.unit_no].join(' · '));o.value=l.id;select.append(o);}
  select.value=leaseId;select.disabled=!!writer?.pending;select.onchange=()=>work(async()=>{leaseId=select.value;draft=fresh();await read(false);});
  d.body.append(field(t('العقد المحفوظ'),select),button(t('تحديث السجل والتحقق من العملية'),()=>work(()=>read())));
  if(writer?.pending)d.body.append(text('p',t('تحقق من العملية السابقة قبل إعداد مراجعة أخرى.')));
  if(!leaseId)return;
  const lease=leases.find(x=>x.id===leaseId);if(!lease)return;
  if(canWrite&&(['signed','expired'].includes(lease.status)||writer?.pending)){
   const form=node('form');form.dataset.aq267ExitForm='true';
   const input=(label,key,type='text')=>{const c=node(type==='textarea'?'textarea':'input');if(type!=='textarea')c.type=type;c.value=draft[key]??'';c.disabled=!!writer.pending&&!!writer.retained;c.oninput=()=>{draft[key]=c.value;};form.append(field(t(label),c));return c;};
   const date=input(t('تاريخ الإخلاء المطلوب'),'vacate_on','date');date.required=true;date.min=lease.start_date;
   const why=input(t('سبب الإخلاء أو البيان'),'reason','textarea');why.required=true;why.minLength=3;why.maxLength=1000;why.rows=3;
   const doc=node('select');const noDoc=text('option',t('بدون مستند مرتبط'));noDoc.value='';doc.append(noDoc);
   for(const x of documents){const o=node('option',[x.document_no,x.title].join(' · '));o.value=x.id;doc.append(o);}
   doc.value=draft.document_id||'';doc.disabled=!!writer.pending&&!!writer.retained;doc.onchange=()=>{draft.document_id=doc.value||null;};form.append(field(t('المستند الداعم من أرشيف العقد'),doc));
   form.append(text('p',t('تسجيل المراجعة لا يسدد الالتزام أو يعفي منه. اذكر المرجع والنتيجة لكل بند.')));
   for(const [key,label]of Object.entries(EXIT_CHECKS)){
    const group=node('fieldset');group.append(text('legend',label));const state=node('select');
    for(const [value,title]of Object.entries(EXIT_STATES)){const o=text('option',title);o.value=value;state.append(o);}
    state.value=draft.checks[key].status;state.disabled=!!writer.pending&&!!writer.retained;
    const note=node('textarea');note.rows=2;note.maxLength=500;note.value=draft.checks[key].note;note.required=state.value!=='pending';note.disabled=state.disabled;
    state.onchange=()=>{draft.checks[key].status=state.value;note.required=state.value!=='pending';};note.oninput=()=>{draft.checks[key].note=note.value;};
    group.append(field(t('حالة المراجعة'),state),field(t('البيان والمرجع'),note));form.append(group);
   }
   const submit=text('button',writer.pending?t('إعادة نفس العملية دون تكرار'):t('حفظ إصدار جديد والتحقق منه'));submit.type='submit';form.append(submit);form.onsubmit=event=>{event.preventDefault();return work(save);};d.body.append(form);
  }
  d.body.append(text('h3',t('الإصدارات المحفوظة')));
  if(!entries.length)d.body.append(text('p',t('لا توجد مراجعات إخلاء محفوظة لهذا العقد.')));
  for(const e of entries){const card=node('article');card.append(node('h4',e.document_no+' · '+t('الإصدار')+' '+e.revision),node('p',e.vacate_on+' · '+e.actor_name),node('p',e.reason),button(t('فتح النسخة المحفوظة للطباعة'),()=>work(()=>print(e.request_id))));d.body.append(card);}
  if(output){const a=text('a',t('فتح طلب الإخلاء للطباعة أو الحفظ'));a.href=output;a.target='_blank';a.rel='noopener';d.body.append(a);}
  d.body.append(text('p',t('المقبوضات ليست الرصيد المستحق. التسوية النهائية تحتاج مطابقة الإيجار والتأمين والخدمات والصيانة والاستلام والالتزامات الأخرى.')));
 }
 d.onDispose(()=>{forget();writer=null;});
 return work(async()=>{writer=createExitWriter({rpc,scope:d.session.bound,check:d.session.check});await read();});
}

