import {node,field} from './dialog.js';
const labels={edit:'تعديل اسم الحساب ومرجعه',archive:'أرشفة الحساب',active:'نشط',archived:'مؤرشف',bank:'حساب بنكي',cashbox:'صندوق نقدي'};
const errors={REVISION_CONFLICT:'تغير الحساب لدى مستخدم آخر. حدّث السجل وراجع البيانات قبل التعديل.',ACCOUNT_ARCHIVED:'الحساب مؤرشف ولا يقبل تعديلًا أو ترحيلات جديدة.',ACCOUNT_UNCHANGED:'لم تغير اسم الحساب أو مرجعه.',ACCOUNT_NAME_OR_MASKED_REFERENCE_REQUIRED:'راجع اسم الحساب وأدخل مرجعًا محجوبًا مثل ****1234.'};
const option=(value,label)=>Object.assign(node('option',label),{value});
export function createCollectionAccountManager(d,{onChanged=async()=>{}}={}){
 const el=node('section'),header=node('h3','إدارة الحسابات والصناديق المحفوظة'),info=node('p'),form=node('form'),account=node('select'),action=node('select'),name=node('input'),reference=node('input'),reason=node('input'),confirm=node('input'),details=node('p'),status=node('p'),history=node('section');
 const save=Object.assign(node('button','حفظ تعديل الحساب'),{type:'submit'}),recover=Object.assign(node('button','التحقق من الحفظ السابق'),{type:'button'}),refresh=Object.assign(node('button','تحديث الحساب وسجل التعديلات'),{type:'button'});
 const names=field('اسم الحساب',name),refs=field('مرجع الحساب المحجوب',reference),confirmation=field('أفهم أن الأرشفة تمنع ترحيلات جديدة لهذا الحساب',confirm);
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');name.maxLength=160;name.minLength=2;reference.maxLength=80;reason.minLength=3;reason.maxLength=1000;confirm.type='checkbox';reason.required=true;name.required=reference.required=true;
 action.append(option('edit',labels.edit),option('archive',labels.archive));action.value='edit';
 form.append(field('الحساب المحفوظ',account),details,field('الإجراء على الحساب',action),names,refs,field('سبب التعديل أو الأرشفة',reason),confirmation,save);
 el.append(header,info,form,refresh,recover,status,history);
 let data={accounts:[],properties:[]},pending=null,busy=false,disposed=false,stale=false;recover.hidden=true;
 const rpc=(a,p={})=>d.session.request(d.session.client.rpc('aqari_collection_account_manage',{p_workspace_id:d.session.bound.workspace,p_action:a,p_data:p}));
 const current=()=>data.accounts.find(x=>x.id===account.value);
 function controls(){const selected=current(),available=selected&&Number.isInteger(selected.revision),archived=selected?.status!=='active',locked=busy||!!pending||disposed;
  form.hidden=!available;info.textContent=available?'يمكن تعديل الاسم والمرجع أو أرشفة الحساب. يبقى العقار ونوع الحساب والحركات السابقة محفوظة.':data.accounts.length?'إدارة هذه الحسابات غير متاحة في هذه النسخة بعد.':'أضف حسابًا أو صندوقًا أولًا من سجل العمليات.';
  for(const x of [account,action,name,reference,reason,confirm])x.disabled=locked||!available||archived;
  // An archived selection must remain switchable so other accounts stay reachable.
  account.disabled=locked||!available;save.disabled=locked||!available||archived||stale;refresh.disabled=busy;recover.hidden=!pending;recover.disabled=busy;
  names.hidden=refs.hidden=action.value==='archive';confirmation.hidden=action.value!=='archive';name.required=reference.required=action.value==='edit';confirm.required=action.value==='archive';save.textContent=action.value==='archive'?'تأكيد أرشفة الحساب':'حفظ تعديل الحساب';
 }
 function fill(){const a=current();stale=false;name.value=a?.name||'';reference.value=a?.masked_reference||'';reason.value='';confirm.checked=false;
  details.textContent=a?`${data.properties.find(p=>p.id===a.property_id)?.name||'العقار المحفوظ'} • ${labels[a.kind]||a.kind} • ${labels[a.status]||a.status} • المراجعة ${a.revision||'—'}`:'';history.replaceChildren();controls();
 }
 function update(next){if(disposed)return;data={accounts:Array.isArray(next?.accounts)?next.accounts:[],properties:Array.isArray(next?.properties)?next.properties:[]};
  if(pending){controls();return;}const previous=account.value;account.replaceChildren(...data.accounts.map(a=>option(a.id,`${a.name} — ${labels[a.status]||a.status}`)));account.value=data.accounts.some(a=>a.id===previous)?previous:data.accounts[0]?.id||'';fill();
 }
 function showHistory(events){history.replaceChildren(node('h4','سجل التعديلات المحفوظ'));if(!events.length)history.append(node('p','لا توجد تعديلات مسجلة على الحساب.'));
  for(const e of events){const card=node('article');card.append(node('p',`${labels[e.action]||'تعديل'} • ${String(e.recorded_at||'').slice(0,10)} • ${e.actor_name||'الإدارة'}`),node('p',e.reason||''),node('p',`${e.before_value?.name||''} ← ${e.after_value?.name||''} • ${labels[e.after_value?.status]||e.after_value?.status||''}`));history.append(card);}
 }
 function mergeRead(read){if(!read?.account||read.account.id!==account.value||!Array.isArray(read.events))throw Error('تعذر مطابقة الحساب المحفوظ.');data.accounts=data.accounts.map(a=>a.id===read.account.id?read.account:a);showHistory(read.events);return read.account;}
 function matchEvent(read,request){const e=read.events.find(x=>x.operation_id===request.operation_id);if(!e)return null;
  const expected={...request,action:pending.action};if(e.account_id!==request.id||e.action!==pending.action||e.after_value?.id!==request.id||e.after_value.revision!==request.revision+1||Object.keys(expected).some(k=>e.request?.[k]!==expected[k]))throw Error('تعذر مطابقة العملية المحفوظة.');
  if(pending.action==='archive'?e.after_value.status!=='archived':e.after_value.name!==request.name||e.after_value.masked_reference!==request.masked_reference)throw Error('تعذر مطابقة بيانات الحساب بعد الحفظ.');
  if(read.account.revision===e.after_value.revision&&['name','masked_reference','status','property_id','kind','currency'].some(k=>read.account[k]!==e.after_value[k]))throw Error('تعذر مطابقة الحساب بعد الحفظ.');
  if(e.before_value?.id!==request.id||e.before_value.revision!==request.revision)throw Error('تعذر مطابقة تاريخ المراجعة.');
  if(read.account.revision<e.after_value.revision)throw Error('تعذر مطابقة المراجعة المحفوظة.');return e;
 }
 async function verify(){if(!pending)return false;const request=pending.payload,read=await rpc('read',{id:request.id,operation_id:request.operation_id});const saved=mergeRead(read),event=matchEvent(read,request);
  if(!event){if(saved.revision!==request.revision){stale=true;pending=null;status.textContent=errors.REVISION_CONFLICT;controls();return false;}
   if(pending.error){status.textContent=pending.error;pending=null;controls();return false;}
   pending.verifiedAbsent=true;status.textContent='لم تُسجل العملية. يمكن إعادة محاولة الطلب نفسه دون تكرار.';recover.textContent='إعادة محاولة الطلب نفسه';controls();return false;}
  const newer=saved.revision>event.after_value.revision;pending=null;recover.textContent='التحقق من الحفظ السابق';fill();showHistory(read.events);status.textContent=newer?'تم التحقق من حفظ العملية، ويوجد تعديل أحدث على الحساب.':'تم حفظ الحساب والتحقق من المراجعة وسجل التعديل.';try{await onChanged({account:saved,event});}catch{status.textContent+=' تعذر تحديث بقية السجلات؛ حدّث الصفحة لعرضها.';}return true;
 }
 async function send(){try{await rpc(pending.action,pending.payload);}catch(error){if(error?.code==='42501'||[401,403].includes(error?.status))throw error;pending.error=errors[error.message];}
  try{await verify();}catch(error){if(error?.code==='42501'||[401,403].includes(error?.status))throw error;status.textContent='لم يتأكد الحفظ. احتُفظ بالطلب؛ اضغط «التحقق من الحفظ السابق» قبل أي تعديل آخر.';}
 }
 form.onsubmit=async e=>{e.preventDefault();await d.run(async()=>{
  if(busy||pending||disposed)return;const a=current();if(!a||a.status!=='active'||!Number.isInteger(a.revision)||stale)return;
  const why=reason.value.trim();if(why.length<3)throw Error('أدخل سببًا واضحًا للتعديل أو الأرشفة.');
  const payload={id:a.id,operation_id:crypto.randomUUID(),revision:a.revision,reason:why};
  if(action.value==='archive'){if(!confirm.checked)throw Error('أكد منع الترحيلات الجديدة قبل أرشفة الحساب.');}
  else {payload.name=name.value.trim();payload.masked_reference=reference.value.trim();if(payload.name.length<2||!payload.masked_reference||(payload.masked_reference.match(/[0-9٠-٩۰-۹]/g)||[]).length>4)throw Error('أدخل اسمًا صحيحًا ومرجع حساب محجوبًا.');}
  pending={action:action.value,payload:Object.freeze(payload),verifiedAbsent:false};busy=true;controls();try{await send();}finally{busy=false;controls();}
 });controls();};
 recover.onclick=async()=>{await d.run(async()=>{if(!pending||busy||disposed)return;busy=true;controls();try{if(pending.verifiedAbsent){pending.verifiedAbsent=false;await send();}else await verify();}catch(error){status.textContent='تعذر التحقق الآن. الطلب محفوظ للمراجعة دون إنشاء عملية جديدة.';throw error;}finally{busy=false;controls();}});controls();};
 refresh.onclick=async()=>{await d.run(async()=>{if(pending){await verify();return;}const a=current();if(!a)return;const read=await rpc('read',{id:a.id});mergeRead(read);fill();showHistory(read.events);status.textContent='تمت قراءة الحساب وسجل تعديلاته.';});controls();};
 account.onchange=()=>{if(!pending)fill();};action.onchange=()=>{confirm.checked=false;controls();};
 function clear(){disposed=true;data={accounts:[],properties:[]};pending=null;form.replaceChildren();history.replaceChildren();details.textContent=status.textContent=info.textContent='';}
 update(data);return {el,update,clear};
}
