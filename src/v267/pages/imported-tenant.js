import {createDialog,node,field} from '../components/dialog.js';
const fields=[['nameAr','الاسم بالعربية'],['nameEn','الاسم بالإنجليزية'],['civilId','الرقم المدني'],['passportNo','رقم الجواز'],['phone','الهاتف'],['email','البريد الإلكتروني'],['nationality','الجنسية'],['address','العنوان']];
const contactOptions=[['both','البريد والواتساب'],['whatsapp','واتساب فقط'],['email','البريد الإلكتروني فقط'],['sms','رسالة نصية فقط'],['push','إشعار التطبيق فقط'],['phone','اتصال هاتفي يدوي'],['none','لا رسائل آلية']];
export async function openImportedTenant({ref,draft,onDraft,onSaved}){
 const d=createDialog('تعديل المستأجر المستورد');if(!d)return;
 const {body,status,session,run}=d,inputs={};let current=null,uncertain=false;
 body.append(node('p','التعديل يحدّث ملف المستأجر ودليل الاتصال ويحفظ المصدر والتاريخ. لا يغيّر العقود أو الوصول السابقة. يمكن ترك البيانات غير المتوفرة فارغة؛ يلزم اسم واحد على الأقل.'));
 for(const [key,label]of fields){const input=node('input');input.maxLength=300;input.type=key==='email'?'email':'text';if(key==='civilId'||key==='phone')input.inputMode='tel';inputs[key]=input;body.append(field(label,input));}
 const preferredContact=node('select');for(const [value,label]of contactOptions){const option=node('option',label);option.value=value;preferredContact.append(option);}inputs.preferredContact=preferredContact;body.append(field('وسيلة التواصل المفضلة',preferredContact));
 const reason=node('textarea');reason.maxLength=500;
 const save=node('button','حفظ التعديل والتحقق'),draftButton=node('button','حفظ مسودة واستكمال لاحقاً'),reload=node('button','تحديث الملف من السحابة'),history=node('div');
 for(const button of [save,draftButton,reload])button.type='button';
 body.append(field('سبب التعديل أو مرجع التصحيح',reason),save,draftButton,reload,node('h3','آخر التعديلات الموثقة'),history);
 function show(value,initial=false){
  current=value;for(const [key]of fields)inputs[key].value=String((initial&&draft?draft:value.profile)?.[key]||'');preferredContact.value=String((initial&&draft?draft:value.profile)?.preferredContact||'both');
  history.replaceChildren();
  for(const entry of value.history||[]){const block=node('section');block.append(node('p',entry.created_at+' — '+entry.reason));
   for(const [key,label]of [...fields,['preferredContact','وسيلة التواصل المفضلة']])if(entry.before_profile?.[key]!==entry.after_profile?.[key])block.append(node('p',label+': '+(entry.before_profile?.[key]||'فارغ')+' ← '+(entry.after_profile?.[key]||'فارغ')));
   history.append(block);
  }
  if(!value.history?.length)history.append(node('p','لا توجد تعديلات موثقة بعد.'));
 }
 const read=()=>session.request(session.client.rpc('aqari_imported_tenant_read',{p_workspace_id:session.bound.workspace,p_ref:ref}));
 const execute=fn=>run(fn).then(()=>{if(!d.closed){save.disabled=uncertain||!current;draftButton.disabled=uncertain||!current;}});
 const collect=()=>{const patch={id:ref};for(const [key]of fields)patch[key]=inputs[key].value;patch.preferredContact=preferredContact.value;return patch;};
 reload.onclick=()=>execute(async()=>{show(await read());uncertain=false;status.textContent='تم تحديث الملف. راجع القيم قبل الحفظ.';});
 draftButton.onclick=()=>execute(async()=>{
  if(uncertain||!current)throw Error('حدّث الملف أولاً.');
  uncertain=true;await onDraft(collect());session.check();current=await read();uncertain=false;status.textContent='تم حفظ المسودة. لم تتغير بيانات المصدر أو العقود.';
 });
 save.onclick=()=>execute(async()=>{
  if(uncertain||!current)throw Error('حدّث الملف للتحقق من الحفظ السابق.');
  if(reason.value.trim().length<3)throw Error('أدخل سبب التعديل أو مرجع التصحيح.');
  const patch=collect();delete patch.id;
  uncertain=true;
  const saved=await session.request(session.client.rpc('aqari_imported_tenant_save',{p_workspace_id:session.bound.workspace,p_ref:ref,p_patch:patch,p_expected_revision:current.revision,p_reason:reason.value.trim()}));
  const confirmed=await read();
  if(JSON.stringify(saved.profile)!==JSON.stringify(confirmed.profile)||saved.revision!==confirmed.revision)throw Error('حدّث الملف للتحقق من نتيجة الحفظ السابق؛ لا تكرر الإرسال.');
  await onSaved();session.check();show(confirmed);reason.value='';uncertain=false;status.textContent='تم حفظ التعديل وإعادة قراءته وتوثيق تاريخه. المصدر والعقود السابقة محفوظة.';
 });
 await execute(async()=>{show(await read(),true);status.textContent=draft?'تم تحميل الملف مع مسودتك المحفوظة.':'تم تحميل الملف المحفوظ وسجل التعديلات.';});
}
