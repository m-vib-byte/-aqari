import {node,field} from './dialog.js';

const labels={original:'أصل',copy:'نسخة',hand:'باليد',courier:'بالمندوب',electronic:'إلكتروني'};
const button=(text,action)=>{const b=node('button',text);b.type='button';b.onclick=action;return b;};
const input=(type='text',maxLength=180)=>{const i=node('input');i.type=type;i.maxLength=maxLength;return i;};
const select=options=>{const s=node('select');for(const [value,label] of options){const o=node('option',label);o.value=value;s.append(o);}return s;};
const time=value=>new Intl.DateTimeFormat('ar-KW',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kuwait'}).format(new Date(value));
const matches=(row,payload,user)=>row?.id===payload.id&&row.actor_id===user&&row.evidence_document_id===payload.evidence_document_id&&
 ['sender_name','recipient_name','copy_kind','method','note'].every(k=>row.details?.[k]===payload[k])&&
 Number(row.details?.copies)===payload.copies&&new Date(row.details?.handed_at).getTime()===new Date(payload.handed_at).getTime();

export function mountDocumentHandovers(d,host,documentId){
 const root=node('section'),body=node('div');let page=0,pending=null,disposed=false;const cancellations=new Map();
 const rpc=(action,data)=>d.session.request(d.session.client.rpc('aqari_document_handover_register',{
  p_workspace_id:d.session.bound.workspace,p_document_id:documentId,p_action:action,p_data:data
 }));
 const check=()=>{d.session.check();if(disposed||!root.isConnected)throw Error('أعد فتح سجل تسليم المستند.');};
 async function load(){const result=await rpc('list',{page});check();if(!Array.isArray(result?.entries)||!Array.isArray(result?.evidence)||typeof result.can_write!=='boolean')throw Error('تعذر التحقق من سجل التسليم.');return result;}
 async function refresh(){const result=await load();if(pending&&matches(result.entries.find(r=>r.id===pending.id),pending,d.session.bound.user))pending=null;render(result);}
 root.append(button('سجل تسليم واستلام هذا المستند',()=>d.run(refresh)),body);host.append(root);
 function render(result){
  body.replaceChildren(node('h3','تسليم واستلام الورقة'),node('p','التوقيت بتوقيت الكويت. اسم المسلّم والمستلم يسجله الموظف، ويرتبط إثبات التسليم بالمستند المحفوظ.'));
  if(result.can_write){
   const sender=input(),recipient=input(),date=input('datetime-local'),copies=input('number'),note=input('text',500),kind=select([['original','أصل'],['copy','نسخة']]),method=select([['hand','باليد'],['courier','بالمندوب'],['electronic','إلكتروني']]),proof=select([['','اختر إثبات التسليم'],...result.evidence.map(r=>[r.id,r.document_no+' — '+r.title])]);
   copies.value='1';copies.min='1';copies.max='99';copies.step='1';
   if(pending){sender.value=pending.sender_name;recipient.value=pending.recipient_name;date.value=new Date(new Date(pending.handed_at).getTime()+10800000).toISOString().slice(0,16);copies.value=String(pending.copies);note.value=pending.note;kind.value=pending.copy_kind;method.value=pending.method;proof.value=pending.evidence_document_id;}
   for(const c of [sender,recipient,date,proof])c.required=true;
   const form=node('form');form.append(field('اسم المسلّم',sender),field('اسم المستلم',recipient),field('وقت التسليم بتوقيت الكويت',date),field('أصل أو نسخة',kind),field('عدد النسخ',copies),field('طريقة التسليم',method),field('مستند إثبات التسليم',proof),field('ملاحظة',note));
   if(!result.evidence.length)form.append(node('p','ارفع إثبات التسليم أولًا ضمن مستندات السجل نفسه، ثم حدّث سجل التسليم.'));
   const save=node('button','حفظ التسليم والتحقق منه');save.type='submit';form.append(save);
   form.onsubmit=e=>{e.preventDefault();return d.run(async()=>{
    check();if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(date.value))throw Error('أدخل وقت التسليم بتوقيت الكويت.');
    const payload={id:pending?.id||crypto.randomUUID(),sender_name:sender.value.trim(),recipient_name:recipient.value.trim(),handed_at:new Date(date.value+':00+03:00').toISOString(),copy_kind:kind.value,copies:Number(copies.value),method:method.value,evidence_document_id:proof.value,note:note.value.trim()};
    if(payload.sender_name.length<2||payload.recipient_name.length<2||!payload.evidence_document_id||!Number.isInteger(payload.copies)||payload.copies<1||payload.copies>99)throw Error('أكمل أسماء الأطراف وعدد النسخ وإثبات التسليم.');
    if(pending&&JSON.stringify(pending)!==JSON.stringify(payload))throw Error('توجد عملية لم يتأكد حفظها. أعد المحاولة بنفس البيانات قبل تسجيل تسليم آخر.');
    pending=payload;let writeError;try{await rpc('record',pending);}catch(e){
     if(['INVALID_HANDOVER','HANDOVER_VERIFIED_DOCUMENT_REQUIRED','HANDOVER_VERIFIED_EVIDENCE_REQUIRED','HANDOVER_IDEMPOTENCY_CONFLICT'].includes(e?.message)){pending=null;throw e;}
     writeError=e;
    }
    check();page=0;const updated=await load(),saved=updated.entries.find(r=>r.id===pending.id);
    if(!matches(saved,pending,d.session.bound.user)||saved.document_id!==documentId||saved.workspace_id!==d.session.bound.workspace)throw writeError||Error('لم يتأكد حفظ التسليم. أعد المحاولة بنفس البيانات.');
    pending=null;render(updated);d.status.textContent='تم حفظ التسليم والتحقق من المستند والأطراف والوقت بإعادة القراءة.';
   });};body.append(form);
  }
  if(!result.entries.length)body.append(node('p','لا توجد عمليات تسليم في هذه الصفحة.'));
  for(const row of result.entries){
   const card=node('article'),r=row.details;card.append(node('h4',r.sender_name+' ← '+r.recipient_name),node('p',time(r.handed_at)+' • '+labels[r.copy_kind]+' • '+r.copies+' • '+labels[r.method]),
    node('p','سجّلها: '+row.actor_name+' — '+time(row.recorded_at)),node('p','إثبات التسليم: '+row.evidence_snapshot.document_no+' — '+row.evidence_snapshot.title));
   if(r.note)card.append(node('p',r.note));
   if(row.cancellation)card.append(node('p','أُلغي القيد: '+row.cancellation.reason+' — '+row.cancellation.actor_name+' — '+time(row.cancellation.recorded_at)));
   else if(result.can_write){const reason=input('text',500);reason.value=cancellations.get(row.id)?.reason||'';card.append(field('سبب إلغاء هذا القيد',reason),button('إلغاء القيد مع حفظ الأصل',()=>d.run(async()=>{
    check();if(reason.value.trim().length<5)throw Error('اكتب سبب الإلغاء بوضوح.');
    const payload={id:cancellations.get(row.id)?.id||crypto.randomUUID(),handover_id:row.id,reason:reason.value.trim()};
    if(cancellations.has(row.id)&&JSON.stringify(cancellations.get(row.id))!==JSON.stringify(payload))throw Error('أعد محاولة الإلغاء بنفس السبب للتحقق من العملية السابقة.');
    cancellations.set(row.id,payload);let writeError;try{await rpc('void',payload);}catch(e){writeError=e;}check();const updated=await load(),c=updated.entries.find(x=>x.id===row.id)?.cancellation;
    if(c?.id!==payload.id||c?.reason!==payload.reason||c?.actor_id!==d.session.bound.user)throw writeError||Error('لم يتأكد إلغاء القيد. أعد المحاولة.');
    cancellations.delete(row.id);render(updated);d.status.textContent='تم توثيق الإلغاء مع الاحتفاظ بقيد التسليم والمستند الأصلي.';
   })));}body.append(card);
  }
  const previous=button('عمليات أحدث',()=>d.run(async()=>{if(page>0)page--;await refresh();})),next=button('عمليات أقدم',()=>d.run(async()=>{page++;await refresh();}));previous.disabled=page===0;next.disabled=result.entries.length<50;body.append(previous,next);
 }
 d.onDispose(()=>{disposed=true;pending=null;cancellations.clear();body.replaceChildren();});
}
