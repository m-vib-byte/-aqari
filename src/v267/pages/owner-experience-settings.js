import {t as visibleText} from '../components/locale.js';
import {t as translateStatic} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
import {serviceReadinessError} from '../components/service-readiness.js';

const option=(value,label)=>{const o=node('option',label);o.value=value;return o;};
const checkbox=()=>{const x=node('input');x.type='checkbox';return x;};
const input=(type='text')=>{const x=node('input');x.type=type;return x;};
const uuid=()=>crypto.randomUUID();
const selectedValues=select=>[...select.options].filter(x=>x.selected).map(x=>x.value).filter(Boolean);

export function openOwnerExperienceSettings(){
 const d=createDialog(translateStatic('إعدادات تجربة المالك والضيف'));if(!d)return false;
 d.el.classList.add('aq-owner-center-dialog','aq-owner-experience-dialog');
 const guest=checkbox(),assistant=checkbox(),report=checkbox(),save=node('button',translateStatic('حفظ الإعدادات')),reload=node('button',translateStatic('إعادة قراءة الإعدادات المحفوظة')),note=node('p'),targetsHost=node('div'),addTarget=node('button',translateStatic('+ إضافة مالك / مستلم تقرير')),storageBackup=node('button',translateStatic('تنزيل نسخة احتياطية للملفات الأصلية'));
 save.type=reload.type=addTarget.type=storageBackup.type='button';save.disabled=true;storageBackup.disabled=true;note.className='aq-owner-settings-note';targetsHost.className='aq-owner-final-targets';addTarget.className='aq-owner-final-add-target';
 const global=node('section');global.className='aq-owner-settings-grid';
 global.append(field(translateStatic('وضع الضيف الاختياري — مغلق افتراضيًا وبدون بيانات حقيقية'),guest),field(translateStatic('مساعد OpenAI التوليدي — قراءة فقط'),assistant),field(translateStatic('إرسال تقرير المالك تلقائيًا'),report),save,reload,note);
 const backupSection=node('section');backupSection.className='aq-owner-settings-grid';backupSection.append(node('h3',translateStatic('نسخة احتياطية لملفات Storage')),node('p',translateStatic('ينزّل المدير العام نسخة ZIP من الملفات الأصلية في Storage مع manifest وبصمات SHA-256، ثم يعيد نفس البايتات إلى بيئة الاستعادة المعزولة ويتحقق منها. يلزم التوثيق الثنائي AAL2 ولا يتم تعديل ملفات الإنتاج.')),storageBackup);
 d.body.append(node('p',translateStatic('المدير العام فقط يدير هذه الخيارات. تقارير الملاك تحترم نطاق العقارات المحفوظ، وإذا ربطت المستلم بحساب مالك فعلي فلن يتجاوز التقرير العقارات المصرح بها لذلك الحساب.')),global,backupSection,node('h3',translateStatic('ملاك ومستلمو التقارير')),node('p',translateStatic('WhatsApp عبر Meta Cloud API هو المسار الأساسي، ويمكن إضافة Email بصورة مستقلة. اختر عقارًا واحدًا أو مجموعة عقارات لكل مستلم.')),targetsHost,addTarget);

 let settingsRevision=0,targetRevision=0,properties=[],owners=[],targets=[],ready=false,uncertain=false;
 const settingsRpc=(action,data={})=>d.session.request(d.session.client.rpc('aqari_owner_experience_settings',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:data}));
 const targetsRpc=async(action,data={})=>{try{return await d.session.request(d.session.client.rpc('aqari_owner_report_targets',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:data}));}catch(error){d.session.check();throw serviceReadinessError(error,'aqari_owner_report_targets');}};
 async function downloadStorageBackup(){
  d.session.check();if(d.session.bound.role!=='general_manager')throw Error('لا تملك صلاحية هذه العملية.');
  const auth=await window.AQARI_SUPABASE.getSession();d.session.check();
  if(!auth?.access_token||auth.user?.id!==d.session.bound.user)throw Error('تغيرت جلسة الدخول. افتح الصفحة من جديد.');
  const cfg=window.AQARI_PUBLIC_CONFIG||{},base=new URL(String(cfg.supabaseUrl||'')),endpoint=new URL('/functions/v1/aqari-stage-c-storage-export',base);
  if(base.protocol!=='https:'||endpoint.origin!==base.origin||!cfg.supabasePublishableKey)throw Error('تعذر التحقق من إعداد خدمة النسخة الاحتياطية.');
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+auth.access_token},body:JSON.stringify({workspaceId:d.session.bound.workspace,restoreToIsolated:true}),cache:'no-store',credentials:'omit',redirect:'error'});
  d.session.check();
  if(!response.ok){
   let code='';try{code=String((await response.clone().json())?.error||'')}catch{}
   if(code==='MFA_REQUIRED')throw Error('يلزم التوثيق الثنائي AAL2 قبل تنزيل النسخة الاحتياطية.');
   if(code==='ACCESS_DENIED')throw Error('لا تملك صلاحية هذه العملية.');
   throw Error('تعذر تنزيل النسخة الاحتياطية للملفات.');
  }
  const restoreVerified=response.headers.get('x-aqari-restore-verified')==='true';
  if(!restoreVerified)throw Error(translateStatic('لم تتأكد الاستعادة المعزولة للملفات؛ لم تُعتمد النسخة بعد.'));
  const blob=await response.blob();d.session.check();
  if(!(blob instanceof Blob)||blob.size<1||blob.size>70*1024*1024)throw Error('تعذر التحقق من ملف النسخة الاحتياطية.');
  const disposition=response.headers.get('content-disposition')||'',savedName=disposition.match(/filename="([A-Za-z0-9._-]+)"/)?.[1]||'aqari-storage-backup.zip';
  const href=URL.createObjectURL(blob),link=document.createElement('a');link.href=href;link.download=savedName;link.rel='noopener';link.hidden=true;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(href),30000);
  const hash=response.headers.get('x-aqari-backup-sha256')||'',count=response.headers.get('x-aqari-backup-object-count')||'—';
  d.status.textContent=translateStatic('تم تنزيل النسخة الاحتياطية للملفات والتحقق من الاستعادة المعزولة. عدد الملفات: ')+count+(hash?translateStatic(' — بصمة SHA-256: ')+hash:'');
 }
 function blankTarget(){return {id:uuid(),owner_name:'',owner_user_id:'',property_ids:[],channels:['whatsapp'],email:'',whatsapp:'',schedule:'monthly',hour:8,enabled:true};}
 function allowedProperties(ownerUserId){const owner=owners.find(x=>x.user_id===ownerUserId);if(!owner)return properties;const ids=new Set(owner.property_ids||[]);return properties.filter(x=>ids.has(x.id));}
 function targetCard(target,index){
  const card=node('article'),head=node('div'),remove=node('button',translateStatic('حذف من قائمة الإرسال')),grid=node('div');
  card.className='aq-owner-final-target';head.className='aq-owner-final-target-head';grid.className='aq-owner-final-target-grid';remove.type='button';remove.className='aq-owner-final-target-remove';head.append(node('strong',translateStatic('المستلم ')+(index+1)),remove);
  const ownerAccount=node('select'),owner=input(),property=node('select'),wa=checkbox(),mail=checkbox(),phone=input('tel'),email=input('email'),schedule=node('select'),hour=node('select'),enabled=checkbox();
  ownerAccount.append(option('',visibleText('مالك / مستلم يدوي')));for(const x of owners)ownerAccount.append(option(x.user_id,(x.display_name||x.email||visibleText('مالك'))+visibleText(' — حساب مرتبط')));ownerAccount.value=target.owner_user_id||'';
  owner.value=target.owner_name||'';owner.maxLength=120;owner.required=true;
  property.multiple=true;property.size=Math.min(6,Math.max(3,properties.length||3));
  function fillProperties(){
   const before=new Set(selectedValues(property));property.replaceChildren();
   const list=allowedProperties(ownerAccount.value);
   for(const p of list){const o=option(p.id,p.name);o.selected=(target.property_ids||[]).includes(p.id)||before.has(p.id);property.append(o);}
  }
  fillProperties();
  wa.checked=(target.channels||[]).includes('whatsapp');mail.checked=(target.channels||[]).includes('email');
  phone.value=target.whatsapp||'';phone.placeholder='+965...';phone.autocomplete='off';email.value=target.email||'';email.autocomplete='off';
  schedule.append(option('daily',visibleText('يومي')),option('weekly',visibleText('أسبوعي — الأحد')),option('monthly',visibleText('شهري — أول يوم')));schedule.value=target.schedule||'monthly';
  for(let i=0;i<24;i++)hour.append(option(String(i),String(i).padStart(2,'0')+':00'));hour.value=String(target.hour??8);enabled.checked=target.enabled!==false;
  ownerAccount.onchange=()=>{
   const linked=owners.find(x=>x.user_id===ownerAccount.value);
   if(linked){owner.value=linked.display_name||owner.value;if(!email.value)email.value=linked.email||'';}
   fillProperties();
  };
  function syncChannels(){phone.disabled=!wa.checked;email.disabled=!mail.checked;if(!wa.checked&&!mail.checked){wa.checked=true;phone.disabled=false;}}
  wa.onchange=mail.onchange=syncChannels;syncChannels();
  const scopeNote=node('small',ownerAccount.value?visibleText('إذا لم تحدد عقارًا، يشمل التقرير كل العقارات المصرح بها لهذا المالك فقط.'):visibleText('للمستلم اليدوي يجب تحديد عقار واحد على الأقل.'));
  grid.append(field(translateStatic('حساب المالك المرتبط — اختياري'),ownerAccount),field(translateStatic('اسم المالك / المستلم'),owner),field(translateStatic('العقار أو مجموعة العقارات'),property),scopeNote,field(translateStatic('إرسال عبر WhatsApp — Meta Cloud API'),wa),field(translateStatic('إرسال عبر Email'),mail),field(translateStatic('رقم WhatsApp'),phone),field(translateStatic('البريد الإلكتروني'),email),field(translateStatic('نوع التقرير'),schedule),field(translateStatic('ساعة الإرسال بتوقيت الكويت'),hour),field(translateStatic('مفعّل'),enabled));
  card.append(head,grid);
  card._read=()=>({id:target.id,owner_name:owner.value.trim(),owner_user_id:ownerAccount.value||'',property_ids:selectedValues(property),channels:[...(wa.checked?['whatsapp']:[]),...(mail.checked?['email']:[])],email:email.value.trim(),whatsapp:phone.value.trim(),schedule:schedule.value,hour:Number(hour.value),enabled:enabled.checked});
  remove.onclick=()=>{targets=collectTargets();targets.splice(index,1);renderTargets();};return card;
 }
 function renderTargets(){targetsHost.replaceChildren();targets.forEach((target,index)=>targetsHost.append(targetCard(target,index)));if(!targets.length)targetsHost.append(node('p',translateStatic('لا توجد أهداف إرسال. التقرير التلقائي يبقى بلا إرسال حتى تضيف مستلمًا.')));}
 function collectTargets(){return [...targetsHost.querySelectorAll('.aq-owner-final-target')].map(card=>card._read());}
 function applySettings(value){guest.checked=value.guest_enabled===true;assistant.checked=value.assistant_enabled!==false;report.checked=value.report_enabled===true;settingsRevision=Number(value.revision||0);syncNote();}
 function applyTargets(value){targetRevision=Number(value.revision||0);properties=Array.isArray(value.properties)?value.properties:[];owners=Array.isArray(value.owners)?value.owners:[];targets=Array.isArray(value.targets)?structuredClone(value.targets):[];renderTargets();}
 function syncNote(){note.textContent=report.checked?visibleText('التقرير التلقائي مفعّل منطقيًا. الإرسال يحتاج Secrets الخادم لـMeta WhatsApp و/أو مزود Email، وتنفذ الجدولة كل ساعة ثم تطابق توقيت الكويت لكل مستلم.'):visibleText('التقرير التلقائي متوقف. يمكنك إنشاء تقرير المالك يدويًا بدون إرسال خارجي.');}
 report.onchange=syncNote;addTarget.onclick=()=>{targets=collectTargets();targets.push(blankTarget());renderTargets();};storageBackup.onclick=()=>d.run(downloadStorageBackup);
 function validateRead(settingsValue,targetValue){if(settingsValue?.workspace_id!==d.session.bound.workspace||targetValue?.workspace_id!==d.session.bound.workspace||!Number.isSafeInteger(settingsValue.revision)||settingsValue.revision<0||!Number.isSafeInteger(targetValue.revision)||targetValue.revision<0||!['guest_enabled','assistant_enabled','report_enabled'].every(key=>typeof settingsValue[key]==='boolean')||!['properties','owners','targets'].every(key=>Array.isArray(targetValue[key])))throw Error('تعذر التحقق من إعدادات تجربة المالك.');}
 async function load(){const [settingsValue,targetValue]=await Promise.all([settingsRpc('read'),targetsRpc('read')]);validateRead(settingsValue,targetValue);applySettings(settingsValue);applyTargets(targetValue);ready=true;uncertain=false;save.disabled=false;storageBackup.disabled=d.session.bound.role!=='general_manager';d.status.textContent=translateStatic('تمت قراءة إعدادات المدير العام ومستلمي التقارير.');}
 function validateTargets(rows){
  if(rows.length>40)throw Error('الحد الأقصى 40 مستلمًا.');
  for(const row of rows){
   if(row.owner_name.length<2)throw Error('أدخل اسم كل مالك أو مستلم.');
   if(!row.owner_user_id&&!row.property_ids.length)throw Error('حدد عقارًا واحدًا على الأقل للمستلم اليدوي '+row.owner_name+'.');
   if(!row.channels.length)throw Error('اختر WhatsApp أو Email لكل مستلم.');
   if(row.channels.includes('whatsapp')&&!/^\+?[0-9\s()\-]{8,24}$/.test(row.whatsapp))throw Error('راجع رقم WhatsApp للمستلم '+row.owner_name+'.');
   if(row.channels.includes('email')&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))throw Error('راجع بريد المستلم '+row.owner_name+'.');
  }
 }
 reload.onclick=()=>d.run(load);
 save.onclick=()=>d.run(async()=>{
  if(!ready||uncertain)throw Error('أعد قراءة الإعدادات المحفوظة وراجعها قبل محاولة الحفظ.');
  const rows=collectTargets();validateTargets(rows);if(report.checked&&!rows.some(x=>x.enabled))throw Error('فعّل مستلم تقرير واحدًا على الأقل قبل تشغيل الإرسال التلقائي.');
  const globalPayload={guest_enabled:guest.checked,assistant_enabled:assistant.checked,report_enabled:report.checked,report_channel:'whatsapp',report_schedule:'monthly',report_hour:8,report_recipient:'managed-by-report-targets-v3',expected_revision:settingsRevision};
  let targetValue,settingsValue;
  try{
  if(report.checked){targetValue=await targetsRpc('save',{targets:rows,expected_revision:targetRevision});settingsValue=await settingsRpc('save',globalPayload);}else{settingsValue=await settingsRpc('save',globalPayload);targetValue=await targetsRpc('save',{targets:rows,expected_revision:targetRevision});}
  d.session.check();validateRead(settingsValue,targetValue);if(settingsValue?.workspace_id!==d.session.bound.workspace||targetValue?.workspace_id!==d.session.bound.workspace||Number(settingsValue.revision)!==settingsRevision+1||Number(targetValue.revision)!==targetRevision+1)throw Error('لم تتأكد إعادة قراءة الإعدادات.');
  applySettings(settingsValue);applyTargets(targetValue);window.dispatchEvent(new CustomEvent('aqari:owner-experience-settings',{detail:{guest_enabled:settingsValue.guest_enabled,assistant_enabled:settingsValue.assistant_enabled,report_enabled:settingsValue.report_enabled}}));d.status.textContent=translateStatic('تم حفظ الإعدادات ونطاقات الملاك وقنوات التقارير وإعادة قراءتها من قاعدة البيانات.');
  }catch(error){uncertain=true;save.disabled=true;if(error?.code==='42501'||[401,403].includes(error?.status))throw error;throw Error('لم يتأكد حفظ الإعدادات كاملًا؛ قد يكون جزء منها قد حُفظ. أعد قراءة الإعدادات المحفوظة وراجعها قبل المحاولة مجددًا.');}
 });
 d.run(load);return true;
}
