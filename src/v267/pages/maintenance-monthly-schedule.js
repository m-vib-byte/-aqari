import {node} from '../components/dialog.js';
import {t} from '../components/locale.js';

export function checkArchiveScope(value,session,propertyId){
 if(value?.version!==1||value.workspace_id!==session.bound.workspace||value.propertyId!==propertyId||value.user_id!==session.bound.user)throw Error('تعذر تأكيد نطاق أرشيف تقرير الصيانة.');return value;
}
export function mountMonthlySchedule(d,target,{propertyId,month,onSnapshot}){
 const box=node('section'),status=node('p'),toggle=node('button'),open=node('button',t('فتح تقرير يوم 25 المحفوظ لهذا الشهر')),refresh=node('button',t('تحديث حالة الجدولة'));
 toggle.type=open.type=refresh.type='button';box.append(node('h3',t('تقرير يوم 25')),status,toggle,open,refresh);target.append(box);
 let schedule=null,uncertain=false;
 const rpc=async(action,data={})=>{const result=await d.session.request(d.session.client.rpc('aqari_maintenance_monthly_archive',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_action:action,p_data:data}));d.session.check();return checkArchiveScope(result,d.session,propertyId);};
 async function read(){const result=await rpc('context');if(!Number.isInteger(result.schedule?.revision)||typeof result.schedule.enabled!=='boolean'||!Array.isArray(result.reports))throw Error('تعذر قراءة حالة الجدولة.');schedule=result.schedule;uncertain=false;toggle.disabled=false;toggle.textContent=t(schedule.enabled?'إيقاف إصدار يوم 25 لهذا العقار':'تفعيل إصدار يوم 25 لهذا العقار');status.textContent=t(schedule.enabled?'الجدولة محفوظة: يوم 25 الساعة 8 صباحًا بتوقيت الكويت.':'إصدار يوم 25 غير مفعّل لهذا العقار.')+' '+t(result.schedulerReady?'المشغّل الدوري مثبت.':'المشغّل الدوري غير مثبت؛ لن يحدث إصدار تلقائي بعد.');open.disabled=!result.reports.some(x=>x.month===month);return result;}
 toggle.onclick=()=>d.run(async()=>{
  if(!schedule||uncertain)throw Error('حدّث حالة الجدولة قبل المحاولة.');
  const expected={revision:schedule.revision+1,enabled:!schedule.enabled};let acknowledged=false;
  uncertain=true;toggle.disabled=true;
  try{
   await rpc('save_schedule',{revision:schedule.revision,enabled:expected.enabled});acknowledged=true;
   const fresh=await read();if(fresh.schedule.revision!==expected.revision||fresh.schedule.enabled!==expected.enabled)throw Error('لم تتأكد مطابقة إعداد الجدولة. حدّث الحالة قبل أي محاولة أخرى.');
  }catch(error){
   uncertain=true;toggle.disabled=true;
   // Do not treat an error from the post-save read as a rejected write.
   if(!acknowledged&&error?.status===403&&error?.code==='42501'&&['MFA_REQUIRED','MFA_RECENT_REAUTH_REQUIRED'].includes(error?.message)){
    d.session.check();uncertain=false;toggle.disabled=false;
    status.textContent=t('لم يتغير إعداد الجدولة. أكمل التحقق الثنائي ثم أعد المحاولة.');
   }
   throw error;
  }
 });
 refresh.onclick=()=>d.run(read);
 open.onclick=()=>d.run(async()=>{const snapshot=await rpc('snapshot',{month});if(snapshot.payload?.schemaVersion!==1||snapshot.payload.dueMonth!==month||!snapshot.issuedAt)throw Error('تعذر تأكيد النسخة الشهرية المحفوظة.');await onSnapshot(snapshot);});
 return {initialize:read,toggle,open,refresh,status};
}
