import {createPrivateUrls} from '../components/private-urls.js';
import {t,dateLocale} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
import {decodeImage,renderScan,checksum} from '../components/scan-image.js';
import {createVerifiedUpload} from '../components/verified-upload.js';

const DOCUMENT_CATALOG={
 property:[
  ['owner_identity','هوية المالك / المؤجر'],
  ['ownership_deed','صك الملكية / وثيقة التملك'],
  ['survey_plan','المسح الميداني / كروكي العقار'],
  ['utility_bill','اشتراك أو فاتورة خدمات']
 ],
 tenant:[
  ['tenant_identity','هوية / بطاقة مدنية للمستأجر'],
  ['commercial_registration','السجل التجاري'],
  ['power_of_attorney','الوكالة الشرعية / التوكيل الرسمي']
 ],
 lease:[
  ['lease_contract','عقد الإيجار الموحد / الإلكتروني'],
  ['contract_addendum','ملحق عقد / شروط خاصة'],
  ['receipt','سند قبض'],
  ['cheque','شيك'],
  ['bank_transfer','إيصال تحويل بنكي'],
  ['vacating_inspection','محضر معاينة واستلام عند الإخلاء'],
  ['utility_clearance','براءة ذمة خدمات'],
  ['vacating_notice','إشعار إخلاء رسمي'],
  ['amicable_settlement','اتفاقية تصفية ودية'],
  ['damage_invoice','فاتورة / سند صيانة أضرار']
 ]
};
const IMAGE_MIMES=new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif']);
const SUPPORTED_MIMES=new Set([...IMAGE_MIMES,'application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
const extension=mime=>mime==='application/pdf'?'.pdf':mime==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'?'.docx':'.jpg';
const categoryLabel=value=>Object.values(DOCUMENT_CATALOG).flat().find(([key])=>key===value)?.[1]||value||'';

export async function openDocumentScanner(initial={}){
 const dialog=createDialog(t('مسح المستندات وحفظ النسخ الأصلية'),{localized:true});if(!dialog)return;
 const {session,body,status,run}=dialog;
 const urls=createPrivateUrls(dialog),downloads=createPrivateUrls(dialog);
 const type=node('select'),category=node('select'),query=node('input'),search=node('button',t('بحث السجلات المحفوظة')),records=node('select'),title=node('input'),file=node('input'),rotate=node('button',t('تدوير الصورة')),preview=node('img'),save=node('button',t('رفع نسخة جديدة والتحقق منها')),reload=node('button',t('تحديث المستندات')),list=node('div'),next=node('button',t('مستندات أقدم')),previous=node('button',t('مستندات أحدث'));
 query.maxLength=100;title.maxLength=180;preview.alt=t('معاينة صورة المستند قبل الرفع');file.type='file';
 file.accept='image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
 file.setAttribute('capture','environment');
 for(const [value,text]of [['property',t('العقار')],['tenant',t('المستأجر')],['lease',t('العقد')]]){const o=node('option',text);o.value=value;type.append(o);}
 type.value=['property','tenant','lease'].includes(initial.type)?initial.type:'property';
 let img=null,blob=null,rotation=0,previewUrl=null,page=0,pending=null,renderId=0,uploadMime='',uploadName='';
 const crop={top:0,bottom:0,left:0,right:0},cropBox=node('details');cropBox.append(node('summary',t('قص حواف الصورة')));
 for(const [edge,text]of [['top',t('أعلى')],['bottom',t('أسفل')],['left',t('يسار')],['right',t('يمين')]]){const input=node('input');input.type='range';input.min='0';input.max='40';input.value='0';input.onchange=()=>run(async()=>{crop[edge]=Number(input.value);await prepare();});cropBox.append(field(text,input));}
 body.append(node('p',t('اختر سجلاً محفوظاً، ثم اختر نوع المستند وارفع صورة أو PDF أو DOCX. كل رفع ينشئ نسخة جديدة مرتبطة بالسجل مع وقت الرفع واسم من رفعها، دون استبدال النسخ السابقة.')),field(t('نوع السجل'),type),field(t('تصنيف المستند'),category),field(t('اسم السجل أو رقم العقد أو الوحدة'),query),search,field(t('السجل المرتبط'),records),field(t('عنوان المستند'),title),field(t('تصوير المستند أو اختيار ملف'),file),rotate,cropBox,preview,save,reload,list,previous,next);

 function refreshCategories(){
  const previousValue=category.value;category.replaceChildren();
  for(const [value,label] of DOCUMENT_CATALOG[type.value]||[]){const option=node('option',t(label));option.value=value;category.append(option);}
  if([...category.options].some(o=>o.value===previousValue))category.value=previousValue;
  if(initial.category&&[...category.options].some(o=>o.value===initial.category)){category.value=initial.category;initial={...initial,category:null};}
  if(!title.value.trim())title.value=categoryLabel(category.value);
 }
 function setPreview(imageBlob){if(previewUrl)urls.release(previewUrl);previewUrl=urls.create(imageBlob);preview.src=previewUrl;preview.hidden=false;}
 async function prepare(){if(!img)return;const id=++renderId;const rendered=await renderScan(img,rotation,crop);if(dialog.closed||id!==renderId)return;blob=rendered;uploadMime='image/jpeg';setPreview(blob);status.textContent=t('راجع وضوح الصورة والعنوان والسجل، ثم ارفع النسخة.');}
 file.onchange=()=>run(async()=>{
  pending=null;img=null;blob=null;uploadMime='';uploadName='';preview.hidden=true;rotate.disabled=true;cropBox.hidden=true;
  const chosen=file.files?.[0];if(!chosen)return;
  if(!SUPPORTED_MIMES.has(chosen.type))throw Error('نوع الملف غير مدعوم. استخدم صورة أو PDF أو DOCX.');
  uploadName=chosen.name||'document';
  if(IMAGE_MIMES.has(chosen.type)){
   const decoded=await decodeImage(chosen);session.check();if(dialog.closed)return;img=decoded;rotation=0;
   for(const edge of Object.keys(crop))crop[edge]=0;for(const input of cropBox.querySelectorAll('input'))input.value='0';
   rotate.disabled=false;cropBox.hidden=false;uploadName=uploadName.replace(/\.[^.]+$/,'')+'.jpg';await prepare();
  }else{
   blob=chosen;uploadMime=chosen.type;status.textContent=t('تم اختيار الملف. راجع التصنيف والعنوان والسجل ثم ارفع النسخة.');
  }
 });
 rotate.onclick=()=>run(async()=>{if(!img)return;rotation=(rotation+90)%360;await prepare();});
 async function loadRecords(){records.replaceChildren();const placeholder=node('option',t('اختر السجل الصحيح'));placeholder.value='';records.append(placeholder);const rows=await session.request(session.client.rpc('aqari_document_entities',{p_workspace_id:session.bound.workspace,p_type:type.value,p_query:query.value.trim()}));
  for(const row of rows){const option=node('option',row.title);option.value=row.entity_ref;records.append(option);}if(initial.ref&&rows.some(r=>r.entity_ref===initial.ref)){records.value=initial.ref;initial={...initial,ref:null};}
  page=0;await loadDocuments();status.textContent=rows.length?t('اختر من السجلات المحفوظة. يعرض البحث حتى ٥٠ نتيجة.'):t('لا توجد سجلات محفوظة مطابقة. احفظ السجل أولاً قبل رفع المستند.');}
 async function loadDocuments(){downloads.clear();list.replaceChildren();previous.hidden=true;next.hidden=true;if(!records.value)return;
  const rows=await session.request(session.client.rpc('aqari_document_listing',{p_workspace_id:session.bound.workspace,p_entity_type:type.value,p_entity_ref:records.value,p_page:page}));
  for(const row of rows){const card=node('article'),cat=categoryLabel(row.metadata?.document_category);card.append(node('h3',row.title),node('p',[cat,row.document_no].filter(Boolean).join(' • ')),node('p',new Date(row.created_at).toLocaleString(dateLocale())+' • '+(row.status==='uploaded'?t('محفوظ'):row.status==='draft'?t('لم يكتمل تأكيد الرفع'):t('ملغى'))),node('p',t('رفع بواسطة: ')+(row.author_name||t('مستخدم محفوظ'))));
   if(row.status==='uploaded'){const download=node('button',t('تحميل النسخة الأصلية'));download.onclick=()=>run(async()=>{const data=await session.storage('GET',row.storage_path);session.check();const url=downloads.create(data),a=node('a',t('تحميل الملف'));a.href=url;a.download=row.document_no+extension(row.mime_type);card.append(a);a.click();status.textContent=t('تم استرجاع الملف المحفوظ.');});card.append(download);}
   list.append(card);}
  if(!rows.length)list.append(node('p',t('لا توجد مستندات لهذا السجل.')));previous.hidden=page===0;next.hidden=rows.length<20;}
 type.onchange=()=>run(async()=>{refreshCategories();await loadRecords();});
 category.onchange=()=>{if(!title.value.trim()||Object.values(DOCUMENT_CATALOG).flat().some(([,label])=>label===title.value.trim()))title.value=categoryLabel(category.value);};
 search.onclick=()=>run(loadRecords);records.onchange=()=>run(async()=>{page=0;pending=null;await loadDocuments();status.textContent=t('تم تحديث مستندات السجل المحدد.');});reload.onclick=()=>run(async()=>{await loadDocuments();status.textContent=t('تمت إعادة القراءة من قاعدة البيانات.');});
 save.onclick=()=>run(async()=>{
  if(!records.value||!category.value||!title.value.trim()||!blob||!uploadMime)throw Error('حدد السجل وتصنيف المستند والعنوان والملف قبل الرفع.');
  const target={type:type.value,ref:records.value,category:category.value,title:title.value.trim(),mime:uploadMime,name:uploadName},sentBlob=blob,hash=await checksum(sentBlob);session.check();
  if(!pending||pending.hash!==hash||JSON.stringify(pending.target)!==JSON.stringify(target)){
   const rows=await session.request(session.client.rpc('aqari_reserve_document',{p_workspace_id:session.bound.workspace,p_document_type:target.type==='lease'&&target.category==='lease_contract'?'signed_contract':'mobile_scan',p_entity_type:target.type,p_entity_ref:target.ref,p_title:target.title,p_original_filename:target.name,p_mime_type:target.mime,p_metadata:{capture:IMAGE_MIMES.has(target.mime)?'mobile_scan':'file_upload',document_category:target.category,release:'V267'}}));
   const doc=Array.isArray(rows)?rows[0]:rows;if(!doc?.document_id||doc.storage_bucket!=='aqari-documents'||!doc.storage_path.startsWith(session.bound.workspace+'/'))throw Error('تعذر حجز نسخة المستند.');
   pending={doc,hash,target,upload:createVerifiedUpload(session,{path:doc.storage_path,blob:sentBlob})};
  }
  const {doc}=pending;await pending.upload();
  await session.request(session.client.rpc('aqari_finalize_document',{p_document_id:doc.document_id,p_size_bytes:sentBlob.size,p_mime_type:target.mime,p_checksum:hash}));
  const verified=await session.request(session.client.from('aqari_documents').select('id,status,entity_type,entity_ref,created_by,checksum_sha256,metadata,mime_type').eq('workspace_id',session.bound.workspace).eq('id',doc.document_id).single());
  if(verified.status!=='uploaded'||verified.entity_type!==target.type||verified.entity_ref!==target.ref||verified.created_by!==session.bound.user||verified.checksum_sha256!==hash||verified.mime_type!==target.mime||verified.metadata?.document_category!==target.category)throw Error('لم تتأكد إعادة قراءة سجل المستند.');
  blob=null;img=null;pending=null;uploadMime='';uploadName='';file.value='';preview.hidden=true;rotate.disabled=true;cropBox.hidden=true;await loadDocuments();status.textContent=t('تم حفظ النسخة وإعادة قراءة الملف ومطابقة بصمته وتصنيفه وارتباطه بالسجل.');
 });
 next.onclick=()=>run(async()=>{page++;await loadDocuments();status.textContent=t('المستندات الأقدم.');});previous.onclick=()=>run(async()=>{if(page>0)page--;await loadDocuments();status.textContent=t('المستندات الأحدث.');});
 dialog.onDispose(()=>{renderId++;img=null;blob=null;pending=null;file.value='';preview.removeAttribute('src');previewUrl=null;});
 rotate.disabled=true;cropBox.hidden=true;refreshCategories();await run(loadRecords);
}
