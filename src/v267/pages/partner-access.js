import {t} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
export async function openPartnerAccess(){
 const dialog=createDialog(t('صلاحيات الشركاء حسب العقار'),{localized:true});if(!dialog)return;
 const {body,status,session,run}=dialog;
 let rows=[],uncertain=false;
 const email=node('input'),name=node('input'),property=node('select'),enabled=node('input'),reason=node('textarea'),save=node('button',t('حفظ الإعدادات والتحقق')),reload=node('button',t('تحديث الإعدادات')),list=node('div');
 email.type='email';email.maxLength=254;name.maxLength=120;enabled.type='checkbox';enabled.checked=true;reason.maxLength=500;
 body.append(node('p',t('حساب الشريك مستقل عن حساب الموظف. يسمح بعرض ملخص العقارات المحددة فقط.')),
 field(t('البريد الإلكتروني'),email),field(t('اسم الشريك'),name),field(t('العقار'),property),field(t('تفعيل الوصول'),enabled),field(t('سبب التعديل'),reason),save,reload,list);
 async function load(){
  const properties=await session.request(session.client.from('aqari_properties').select('id,name').eq('workspace_id',session.bound.workspace).or('metadata->>source_only.is.null,metadata->>source_only.neq.true').order('name'));
  rows=await session.request(session.client.rpc('aqari_partner_access_list',{p_workspace_id:session.bound.workspace}));
  property.replaceChildren();for(const p of properties){const o=node('option',p.name);o.value=p.id;property.append(o);}
  list.replaceChildren();for(const row of rows){const button=node('button',row.display_name+' • '+(properties.find(p=>p.id===row.property_id)?.name||'—')+' • '+t(row.is_active?'مسموح':'ممنوع'));
   button.onclick=()=>{email.value=row.email;name.value=row.display_name;property.value=row.property_id;enabled.checked=row.is_active;};list.append(button);}
  uncertain=false;status.textContent=t('تمت قراءة الصلاحيات من قاعدة البيانات.');
 }
 const execute=task=>run(task).then(()=>{if(!dialog.closed)save.disabled=uncertain;});
 reload.onclick=()=>execute(load);
 save.onclick=()=>execute(async()=>{
  if(uncertain)throw Error('حدّث الصلاحيات للتحقق من نتيجة الحفظ أولاً.');
  const address=email.value.trim().toLowerCase(),partnerName=name.value.trim(),propertyId=property.value,active=enabled.checked;
  if(!email.checkValidity()||!address||!partnerName||!propertyId||reason.value.trim().length<3)throw Error('راجع البريد والاسم والعقار وسبب التعديل.');
  const old=rows.find(r=>r.email===address&&r.property_id===propertyId);uncertain=true;
  let saved;
  try{saved=await session.request(session.client.rpc('aqari_manage_partner_access',{p_workspace_id:session.bound.workspace,p_email:address,p_property_id:propertyId,p_name:partnerName,p_enabled:active,p_expected_revision:old?.revision||0,p_reason:reason.value.trim()}));}
  catch(error){
   // Only rejection of the write itself permits retry with the original revision.
   if(error?.status===403&&error?.code==='42501'&&['MFA_REQUIRED','MFA_RECENT_REAUTH_REQUIRED'].includes(error?.message)){
    session.check();uncertain=false;
   }
   throw error;
  }
  const verified=await session.request(session.client.rpc('aqari_partner_access_list',{p_workspace_id:session.bound.workspace}));
  const row=verified.find(r=>r.email===address&&r.property_id===propertyId);
  if(!row||row.revision!==saved.revision||row.display_name!==partnerName||row.is_active!==active)throw Error('حدّث الصلاحيات للتحقق من نتيجة الحفظ أولاً.');
  rows=verified;uncertain=false;reason.value='';await load();status.textContent=t('تم الحفظ وإعادة القراءة وتسجيل التعديل.');
 });
 await execute(load);
}

