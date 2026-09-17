import {createDialog,node,field} from '../components/dialog.js';

const option=(value,label)=>{const o=node('option',label);o.value=value;return o;};
const checkbox=()=>{const x=node('input');x.type='checkbox';return x;};
const input=(type='text')=>{const x=node('input');x.type=type;return x;};
const uuid=()=>crypto.randomUUID();
export function openOwnerExperienceSettings(){
 const d=createDialog('إعدادات تجربة المالك والضيف');if(!d)return false;
 d.el.classList.add('aq-owner-center-dialog','aq-owner-experience-dialog');
 const guest=checkbox(),assistant=checkbox(),report=checkbox(),save=node('button','حفظ الإعدادات'),note=node('p'),targetsHost=node('div'),addTarget=node('button','+ إضافة مالك / مستلم تقرير');
 save.type=addTarget.type='button';note.className='aq-owner-settings-note';targetsHost.className='aq-owner-final-targets';addTarget.className='aq-owner-final-add-target';
 const global=node('section');global.className='aq-owner-settings-grid';global.append(field('وضع الضيف الاختياري — مغلق افتراضيًا وبدون بيانات حقيقية',guest),field('مساعد OpenAI التوليدي — قراءة فقط',assistant),field('إرسال تقرير المالك تلقائيًا',report),save,note);
 d.body.append(node('p','المدير العام فقط يدير هذه الخيارات. المساعد يحترم صلاحيات القراءة، ووضع الضيف لا يفتح بيانات خاصة، وتقارير الملاك تُرسل فقط للأهداف المحددة أدناه.'),global,node('h3','ملاك ومستلمو التقارير'),node('p','حدد لكل مستلم العقار أو كل العقارات، WhatsApp و/أو Email، وجدول الإرسال بتوقيت الكويت.'),targetsHost,addTarget);
 let settingsRevision=0,targetRevision=0,properties=[],targets=[];
 const settingsRpc=(action,data={})=>d.session.request(d.session.client.rpc('aqari_owner_experience_settings',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:data}));
 const targetsRpc=(action,data={})=>d.session.request(d.session.client.rpc('aqari_owner_report_targets',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:data}));
 function blankTarget(){return {id:uuid(),owner_name:'',property_id:'',channels:['whatsapp'],email:'',whatsapp:'',schedule:'monthly',hour:8,enabled:true};}
 function targetCard(target,index){
  const card=node('article'),head=node('div'),remove=node('button','حذف من قائمة الإرسال'),grid=node('div');card.className='aq-owner-final-target';head.className='aq-owner-final-target-head';grid.className='aq-owner-final-target-grid';remove.type='button';remove.className='aq-owner-final-target-remove';head.append(node('strong','المستلم '+(index+1)),remove);
  const owner=input(),property=node('select'),wa=checkbox(),mail=checkbox(),phone=input('tel'),email=input('email'),schedule=node('select'),hour=node('select'),enabled=checkbox();
  owner.value=target.owner_name||'';owner.maxLength=120;owner.required=true;property.append(option('','كل العقارات'));for(const p of properties)property.append(option(p.id,p.name));property.value=target.property_id||'';
  wa.checked=(target.channels||[]).includes('whatsapp');mail.checked=(target.channels||[]).includes('email');phone.value=target.whatsapp||'';phone.placeholder='+965...';phone.autocomplete='off';email.value=target.email||'';email.autocomplete='off';
  schedule.append(option('daily','يومي'),option('weekly','أسبوعي — الأحد'),option('monthly','شهري — أول يوم'));schedule.value=target.schedule||'monthly';for(let i=0;i<24;i++)hour.append(option(String(i),String(i).padStart(2,'0')+':00'));hour.value=String(target.hour??8);enabled.checked=target.enabled!==false;
  function syncChannels(){phone.disabled=!wa.checked;email.disabled=!mail.checked;if(!wa.checked&&!mail.checked){wa.checked=true;phone.disabled=false;} }
  wa.onchange=mail.onchange=syncChannels;syncChannels();
  grid.append(field('اسم المالك / المستلم',owner),field('العقار',property),field('إرسال عبر WhatsApp',wa),field('إرسال عبر Email',mail),field('رقم WhatsApp',phone),field('البريد الإلكتروني',email),field('الجدول',schedule),field('ساعة الإرسال بتوقيت الكويت',hour),field('مفعّل',enabled));card.append(head,grid);
  const read=()=>({id:target.id,owner_name:owner.value.trim(),property_id:property.value||'',channels:[...(wa.checked?['whatsapp']:[]),...(mail.checked?['email']:[])],email:email.value.trim(),whatsapp:phone.value.trim(),schedule:schedule.value,hour:Number(hour.value),enabled:enabled.checked});
  remove.onclick=()=>{targets.splice(index,1);renderTargets();};card._read=read;return card;
 }
 function renderTargets(){targetsHost.replaceChildren();targets.forEach((target,index)=>targetsHost.append(targetCard(target,index)));if(!targets.length)targetsHost.append(node('p','لا توجد أهداف إرسال. التقرير التلقائي يبقى بلا إرسال حتى تضيف مستلمًا.'));}
 function collectTargets(){return [...targetsHost.querySelectorAll('.aq-owner-final-target')].map(card=>card._read());}
 function applySettings(value){guest.checked=value.guest_enabled===true;assistant.checked=value.assistant_enabled!==false;report.checked=value.report_enabled===true;settingsRevision=Number(value.revision||0);syncNote();}
 function applyTargets(value){targetRevision=Number(value.revision||0);properties=Array.isArray(value.properties)?value.properties:[];targets=Array.isArray(value.targets)?structuredClone(value.targets):[];renderTargets();}
 function syncNote(){note.textContent=report.checked?'التقرير التلقائي مفعّل منطقيًا؛ الإرسال الخارجي يتم فقط عندما تكون خدمة WhatsApp/Email والجدولة مهيأة على الخادم.':'التقرير التلقائي متوقف. يمكنك إنشاء تقرير المالك يدويًا بدون إرسال خارجي.';}
 report.onchange=syncNote;addTarget.onclick=()=>{targets=collectTargets();targets.push(blankTarget());renderTargets();};
 async function load(){const [settingsValue,targetValue]=await Promise.all([settingsRpc('read'),targetsRpc('read')]);if(settingsValue?.workspace_id!==d.session.bound.workspace||targetValue?.workspace_id!==d.session.bound.workspace)throw Error('تعذر التحقق من إعدادات تجربة المالك.');applySettings(settingsValue);applyTargets(targetValue);d.status.textContent='تمت قراءة إعدادات المدير العام ومستلمي التقارير.';}
 function validateTargets(rows){if(rows.length>40)throw Error('الحد الأقصى 40 مستلمًا.');for(const row of rows){if(row.owner_name.length<2)throw Error('أدخل اسم كل مالك أو مستلم.');if(!row.channels.length)throw Error('اختر WhatsApp أو Email لكل مستلم.');if(row.channels.includes('whatsapp')&&!/^\+?[0-9\s()\-]{8,24}$/.test(row.whatsapp))throw Error('راجع رقم WhatsApp للمستلم '+row.owner_name+'.');if(row.channels.includes('email')&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))throw Error('راجع بريد المستلم '+row.owner_name+'.');}}
 save.onclick=()=>d.run(async()=>{
  const rows=collectTargets();validateTargets(rows);if(report.checked&&!rows.some(x=>x.enabled))throw Error('فعّل مستلم تقرير واحدًا على الأقل قبل تشغيل الإرسال التلقائي.');
  const globalPayload={guest_enabled:guest.checked,assistant_enabled:assistant.checked,report_enabled:report.checked,report_channel:'whatsapp',report_schedule:'monthly',report_hour:8,report_recipient:'managed-by-report-targets-v2',expected_revision:settingsRevision};
  let targetValue,settingsValue;
  if(report.checked){targetValue=await targetsRpc('save',{targets:rows,expected_revision:targetRevision});settingsValue=await settingsRpc('save',globalPayload);}else{settingsValue=await settingsRpc('save',globalPayload);targetValue=await targetsRpc('save',{targets:rows,expected_revision:targetRevision});}
  d.session.check();if(settingsValue?.workspace_id!==d.session.bound.workspace||targetValue?.workspace_id!==d.session.bound.workspace||Number(settingsValue.revision)!==settingsRevision+1||Number(targetValue.revision)!==targetRevision+1)throw Error('لم تتأكد إعادة قراءة الإعدادات.');
  applySettings(settingsValue);applyTargets(targetValue);window.dispatchEvent(new CustomEvent('aqari:owner-experience-settings',{detail:{guest_enabled:settingsValue.guest_enabled,assistant_enabled:settingsValue.assistant_enabled,report_enabled:settingsValue.report_enabled}}));d.status.textContent='تم حفظ الإعدادات ومستلمي التقارير وإعادة قراءتها من قاعدة البيانات.';
 });
 d.run(load);return true;
}
