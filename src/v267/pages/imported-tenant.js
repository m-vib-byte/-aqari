import {t as translateStatic} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
import {openTenantCompleteFile} from './property-portfolio-additions.js';
const fields=()=>[['nameAr',translateStatic('الاسم بالعربية')],['nameEn',translateStatic('الاسم بالإنجليزية')],['civilId',translateStatic('الرقم المدني')],['passportNo',translateStatic('رقم الجواز')],['phone',translateStatic('الهاتف')],['email',translateStatic('البريد الإلكتروني')],['nationality',translateStatic('الجنسية')],['address',translateStatic('العنوان')]];
const contactOptions=()=>[['both',translateStatic('البريد والواتساب')],['whatsapp',translateStatic('واتساب فقط')],['email',translateStatic('البريد الإلكتروني فقط')],['sms',translateStatic('رسالة نصية فقط')],['push',translateStatic('إشعار التطبيق فقط')],['phone',translateStatic('اتصال هاتفي يدوي')],['none',translateStatic('لا رسائل آلية')]];
export async function openImportedTenant({ref,draft,onDraft,onSaved}){
 const d=createDialog(translateStatic('تعديل المستأجر المستورد'));if(!d)return;
 const {body,status,session,run}=d,inputs={};let current=null,uncertain=false;
 const portfolio=node('section');portfolio.className='aq267-property-master-section';
 body.append(node('p',translateStatic('التعديل يحدّث ملف المستأجر ودليل الاتصال ويحفظ المصدر والتاريخ. لا يغيّر العقود أو الوصول السابقة. يمكن ترك البيانات غير المتوفرة فارغة؛ يلزم اسم واحد على الأقل.')));
 body.append(portfolio);
 for(const [key,label]of fields()){const input=node('input');input.maxLength=300;input.type=key==='email'?'email':'text';if(key==='civilId'||key==='phone')input.inputMode='tel';inputs[key]=input;body.append(field(label,input));}
 const preferredContact=node('select');for(const [value,label]of contactOptions()){const option=node('option',label);option.value=value;preferredContact.append(option);}inputs.preferredContact=preferredContact;body.append(field(translateStatic('وسيلة التواصل المفضلة'),preferredContact));
 const reason=node('textarea');reason.maxLength=500;
 const save=node('button',translateStatic('حفظ التعديل والتحقق')),draftButton=node('button',translateStatic('حفظ مسودة واستكمال لاحقاً')),reload=node('button',translateStatic('تحديث الملف من السحابة')),history=node('div');
 for(const button of [save,draftButton,reload])button.type='button';
 body.append(field(translateStatic('سبب التعديل أو مرجع التصحيح (اختياري)'),reason),save,draftButton,reload,node('h3',translateStatic('آخر التعديلات الموثقة')),history);
 function show(value,initial=false){
  current=value;for(const [key]of fields())inputs[key].value=String((initial&&draft?draft:value.profile)?.[key]||'');preferredContact.value=String((initial&&draft?draft:value.profile)?.preferredContact||'both');
  history.replaceChildren();
  for(const entry of value.history||[]){const block=node('section');block.append(node('p',entry.created_at+' — '+entry.reason));
   for(const [key,label]of [...fields(),['preferredContact',translateStatic('وسيلة التواصل المفضلة')]])if(entry.before_profile?.[key]!==entry.after_profile?.[key])block.append(node('p',label+': '+(entry.before_profile?.[key]||translateStatic('فارغ'))+' ← '+(entry.after_profile?.[key]||translateStatic('فارغ'))));
   history.append(block);
  }
  if(!value.history?.length)history.append(node('p',translateStatic('لا توجد تعديلات موثقة بعد.')));
 }
 const read=()=>session.request(session.client.rpc('aqari_imported_tenant_read',{p_workspace_id:session.bound.workspace,p_ref:ref}));
 const readPortfolio=()=>session.request(session.client.rpc('aqari_tenant_portfolio_context',{p_workspace_id:session.bound.workspace,p_tenant_ref:ref}));
 const scan=async initial=>{d.close();const page=await import('./document-scanner.js');return page.openDocumentScanner(initial);};
 function showPortfolio(value){
  portfolio.replaceChildren(node('h3','العقود والمستندات والوصولات'));
  if(!value?.tenantId){portfolio.append(node('p','تعذر ربط هذا الملف بسجل المستأجر المحفوظ.'));return;}
  for(const property of value.properties||[]){
   const card=node('article'),full=node('button','عرض الملف الكامل — '+property.name),camera=node('button','مسح/تصوير مستند'),upload=node('button','رفع ملف');
   for(const button of [full,camera,upload])button.type='button';
   full.onclick=()=>{d.close();openTenantCompleteFile(property.id,value.tenantId);};
   camera.onclick=()=>scan({type:'tenant',ref:value.tenantId});upload.onclick=()=>scan({type:'tenant',ref:value.tenantId});
   card.append(node('strong',property.name),node('p','العقود: '+property.leaseCount+' · الوصولات: '+property.receiptCount),full,camera,upload);portfolio.append(card);
  }
  if(!(value.properties||[]).length)portfolio.append(node('p','لا توجد عقود مرتبطة بهذا المستأجر ضمن العقارات المصرح بها.'));
 }
 const execute=fn=>run(fn).then(()=>{if(!d.closed){save.disabled=uncertain||!current;draftButton.disabled=uncertain||!current;}});
 const collect=()=>{const patch={id:ref};for(const [key]of fields())patch[key]=inputs[key].value;patch.preferredContact=preferredContact.value;return patch;};
 reload.onclick=()=>execute(async()=>{const [record,context]=await Promise.all([read(),readPortfolio()]);show(record);showPortfolio(context);uncertain=false;status.textContent=translateStatic('تم تحديث الملف. راجع القيم قبل الحفظ.');});
 draftButton.onclick=()=>execute(async()=>{
  if(uncertain||!current)throw Error('حدّث الملف أولاً.');
  uncertain=true;await onDraft(collect());session.check();current=await read();uncertain=false;status.textContent=translateStatic('تم حفظ المسودة. لم تتغير بيانات المصدر أو العقود.');
 });
 save.onclick=()=>execute(async()=>{
  if(uncertain||!current)throw Error('حدّث الملف للتحقق من الحفظ السابق.');
  const saveReason=reason.value.trim()||'تحديث بيانات المستأجر';
  const patch=collect();delete patch.id;
  uncertain=true;
  const saved=await session.request(session.client.rpc('aqari_imported_tenant_save',{p_workspace_id:session.bound.workspace,p_ref:ref,p_patch:patch,p_expected_revision:current.revision,p_reason:saveReason}));
  const confirmed=await read();
  if(JSON.stringify(saved.profile)!==JSON.stringify(confirmed.profile)||saved.revision!==confirmed.revision)throw Error('حدّث الملف للتحقق من نتيجة الحفظ السابق؛ لا تكرر الإرسال.');
  await onSaved();session.check();show(confirmed);reason.value='';uncertain=false;status.textContent=translateStatic('تم حفظ التعديل وإعادة قراءته وتوثيق تاريخه. المصدر والعقود السابقة محفوظة.');
 });
 await execute(async()=>{const [record,context]=await Promise.all([read(),readPortfolio()]);show(record,true);showPortfolio(context);status.textContent=draft?translateStatic('تم تحميل الملف مع مسودتك المحفوظة.'):translateStatic('تم تحميل الملف المحفوظ وسجل التعديلات.');});
}
