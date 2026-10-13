import {createDialog,node,field} from '../components/dialog.js';
import {t,message} from '../components/locale.js';
const label=(tag,text)=>node(tag,t(text));

export function confirmPropertyLifecycle(value,scope){
 const life=value?.lifecycle;
 if(value?.workspace_id!==scope.workspace||value?.user_id!==scope.user||value?.propertyId!==scope.propertyId||
  !['active','archived'].includes(life?.state)||!Number.isSafeInteger(life?.revision)||life.revision<0)
  throw Error('تعذر تأكيد حالة العقار من الخادم.');
 return value;
}

export function openPropertyLifecycle(propertyId){
 const d=createDialog(t('أرشفة العقار وإعادة تفعيله'));if(!d)return false;
 let state,busy=false,uncertain=false;
 const scope={workspace:d.session.bound.workspace,user:d.session.bound.user,propertyId};
 const rpc=(action,extra={})=>d.session.request(d.session.client.rpc('aqari_property_lifecycle',{p_workspace_id:scope.workspace,p_property_id:propertyId,p_action:action,...extra}));
 const read=async()=>{const result=await rpc('context');d.session.check();state=confirmPropertyLifecycle(result,scope);return state;};
 const button=(text,fn)=>{const b=label('button',text);b.type='button';b.onclick=()=>d.run(fn);return b;};
 async function render(confirmed){
  if(confirmed)state=confirmed;else await read();uncertain=false;
  const archived=state.lifecycle.state==='archived',revision=state.lifecycle.revision,target=archived?'active':'archived',action=archived?'restore':'archive';
  const reason=node('textarea'),form=node('form'),save=label('button',archived?'إعادة تفعيل العقار':'أرشفة العقار');
  reason.required=true;reason.minLength=3;reason.maxLength=1000;save.type='submit';
  const hasDraft=()=>uncertain||reason.value.trim()!=='';
  d.setBeforeUnload(()=>busy||hasDraft());d.setBeforeClose(()=>!busy&&(!hasDraft()||window.confirm(t('توجد معلومات لم يتأكد حفظها. هل تريد المغادرة؟'))));
  d.body.replaceChildren(node('h3',state.name),label('p',archived?'العقار مؤرشف':'العقار مفعّل'),
   label('p','الأرشفة تمنع إنشاء وحدات وعقود إيجار جديدة. تبقى الملفات والعقود والتحصيلات السابقة محفوظة ومتاحة حسب الصلاحية.'),
   node('p',message('الارتباطات الحالية: {units} وحدة · {contracts} عقد · {documents} مستند',state)));
  form.append(field(t('سبب الإجراء'),reason),save);d.body.append(form,button('تحديث الحالة من الخادم',async()=>{if(busy)return;if(hasDraft()&&!window.confirm(t('تحديث الحالة سيعيد تحميل النموذج. هل تريد المتابعة؟')))return;await render();}));
  let attempted=false;
  form.onsubmit=e=>{e.preventDefault();return d.run(async()=>{
   if(busy||attempted)throw Error('سبق إرسال الطلب. حدّث الحالة قبل إعادة المحاولة.');
   const why=reason.value.trim();if(why.length<3||why.length>1000)throw Error('اكتب سببًا من 3 إلى 1000 حرف.');
   if(!window.confirm(message(archived?'إعادة تفعيل العقار «{name}»؟ ستبقى جميع الملفات مرتبطة به.':'أرشفة العقار «{name}»؟ ستبقى جميع الملفات مرتبطة به.',{name:state.name})))return;
   const operation=crypto.randomUUID();let acknowledged=false;attempted=true;uncertain=true;busy=true;save.disabled=true;
   try{
    const response=await rpc(action,{p_expected_revision:revision,p_operation_id:operation,p_reason:why});acknowledged=true;
    const result=confirmPropertyLifecycle(response,scope);d.session.check();
    if(result.lifecycle.state!==target||result.lifecycle.revision!==revision+1||result.lifecycle.operationId!==operation)throw Error('لم تتأكد نتيجة الإجراء. حدّث الحالة قبل إعادة المحاولة.');
    const fresh=await read();if(fresh.lifecycle.state!==target||fresh.lifecycle.revision!==revision+1||fresh.lifecycle.operationId!==operation)throw Error('تغيرت حالة العقار أثناء التحقق. حدّث الحالة.');
    uncertain=false;reason.value='';await render(fresh);d.status.textContent=t(target==='archived'?'تمت أرشفة العقار والتحقق منها. جميع ارتباطاته محفوظة.':'تمت إعادة تفعيل العقار والتحقق منها.');
   }catch(error){
    if(!acknowledged&&error?.code==='42501'&&['MFA_REQUIRED','MFA_RECENT_REAUTH_REQUIRED'].includes(error?.message)){attempted=false;uncertain=false;save.disabled=false;}
    throw error;
   }finally{busy=false;}
  });};
 }
 d.run(async()=>{try{await render();}catch(error){if(['PGRST202','42883'].includes(error?.code)&&/aqari_property_lifecycle/.test(error?.message||'')){d.body.replaceChildren(label('p','أرشفة العقار غير مفعّلة في هذه البيئة بعد. لم تتغير بيانات العقار.'));return;}throw error;}});
 return true;
}
