import {createDialog,node,field} from '../components/dialog.js';

const option=(value,label)=>{const o=node('option',label);o.value=value;return o;};
const checkbox=()=>{const x=node('input');x.type='checkbox';return x;};
export function openOwnerExperienceSettings(){
 const d=createDialog('إعدادات تجربة المالك والضيف');if(!d)return false;
 d.el.classList.add('aq-owner-center-dialog','aq-owner-experience-dialog');
 const guest=checkbox(),assistant=checkbox(),report=checkbox(),channel=node('select'),schedule=node('select'),hour=node('select'),recipient=node('input'),save=node('button','حفظ الإعدادات'),note=node('p');
 channel.append(option('email','البريد الإلكتروني'),option('whatsapp','WhatsApp'));
 schedule.append(option('daily','يومي'),option('weekly','أسبوعي — الأحد'),option('monthly','شهري — أول يوم'));
 for(let i=0;i<24;i++)hour.append(option(String(i),String(i).padStart(2,'0')+':00'));
 recipient.type='text';recipient.maxLength=254;recipient.autocomplete='off';save.type='button';note.className='aq-owner-settings-note';
 const form=node('section');form.className='aq-owner-settings-grid';form.append(field('وضع الضيف التجريبي — بدون بيانات حقيقية',guest),field('المساعد التوليدي',assistant),field('إرسال تقرير المالك تلقائيًا',report),field('قناة التقرير',channel),field('جدول التقرير',schedule),field('ساعة الإرسال بتوقيت الكويت',hour),field('البريد أو رقم WhatsApp المستلم',recipient),save,note);d.body.append(node('p','هذه الإعدادات لا تغيّر مفاتيح النظام أو صلاحيات الأقسام. وضع الضيف يعرض معاينة عامة فقط ولا يفتح بيانات خاصة.'),form);
 let revision=0;
 const rpc=(action,data={})=>d.session.request(d.session.client.rpc('aqari_owner_experience_settings',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:data}));
 function apply(value){guest.checked=value.guest_enabled===true;assistant.checked=value.assistant_enabled!==false;report.checked=value.report_enabled===true;channel.value=value.report_channel||'email';schedule.value=value.report_schedule||'weekly';hour.value=String(value.report_hour??8);recipient.value=value.report_recipient||'';revision=Number(value.revision||0);sync();}
 function sync(){const enabled=report.checked;for(const control of [channel,schedule,hour,recipient])control.disabled=!enabled;note.textContent=enabled?'التسليم التلقائي يحتاج موصل إرسال وخدمة الجدولة مهيأتين على الخادم.':'التقرير التلقائي متوقف؛ يمكن إنشاء التقرير يدويًا من مركز التقارير.';}
 report.onchange=sync;
 async function load(){const value=await rpc('read');if(value?.workspace_id!==d.session.bound.workspace)throw Error('تعذر التحقق من إعدادات تجربة المالك.');apply(value);d.status.textContent='تمت قراءة الإعدادات الحالية.';}
 save.onclick=()=>d.run(async()=>{if(report.checked&&recipient.value.trim().length<3)throw Error('أدخل جهة استلام التقرير قبل تفعيله.');const value=await rpc('save',{guest_enabled:guest.checked,assistant_enabled:assistant.checked,report_enabled:report.checked,report_channel:channel.value,report_schedule:schedule.value,report_hour:Number(hour.value),report_recipient:recipient.value.trim(),expected_revision:revision});d.session.check();if(value?.workspace_id!==d.session.bound.workspace||Number(value.revision)!==revision+1)throw Error('لم تتأكد إعادة قراءة الإعدادات.');apply(value);window.dispatchEvent(new CustomEvent('aqari:owner-experience-settings',{detail:{guest_enabled:value.guest_enabled,assistant_enabled:value.assistant_enabled,report_enabled:value.report_enabled}}));d.status.textContent='تم حفظ الإعدادات وإعادة قراءتها من قاعدة البيانات.';});
 d.run(load);return true;
}
