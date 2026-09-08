import {t,dateLocale} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
import {decodeImage,renderScan,checksum} from '../components/scan-image.js';
export async function openDocumentScanner(initial={}){
 const dialog=createDialog(t('مسح المستندات وحفظ النسخ الأصلية'),{localized:true});if(!dialog)return;
 const {session,body,status,run}=dialog;
 const type=node('select'),query=node('input'),search=node('button',t('بحث السجلات المحفوظة')),records=node('select'),title=node('input'),file=node('input'),rotate=node('button',t('تدوير الصورة')),preview=node('img'),save=node('button',t('رفع نسخة جديدة والتحقق منها')),reload=node('button',t('تحديث المستندات')),list=node('div'),next=node('button',t('مستندات أقدم')),previous=node('button',t('مستندات أحدث'));
 query.maxLength=100;title.maxLength=180;preview.alt=t('معاينة صورة المستند قبل الرفع');file.type='file';file.accept='image/jpeg,image/png,image/webp,image/heic,image/heif';file.setAttribute('capture','environment');
 for(const [value,text]of [['property',t('العقار')],['tenant',t('المستأجر')],['lease',t('العقد')]]){const o=node('option',text);o.value=value;type.append(o);}
 type.value=['property','tenant','lease'].includes(initial.type)?initial.type:'property';
 let img=null,blob=null,rotation=0,previewUrl=null,page=0,pending=null,renderId=0;
 const crop={top:0,bottom:0,left:0,right:0},cropBox=node('details');cropBox.append(node('summary',t('قص حواف الصورة')));
 for(const [edge,text]of [['top',t('أعلى')],['bottom',t('أسفل')],['left',t('يسار')],['right',t('يمين')]]){const input=node('input');input.type='range';input.min='0';input.max='40';input.value='0';input.onchange=()=>run(async()=>{crop[edge]=Number(input.value);await prepare();});cropBox.append(field(text,input));}
 body.append(node('p',t('اختر سجلاً محفوظاً، ثم صوّر المستند وراجع الصورة. كل رفع ينشئ نسخة جديدة مرتبطة بالسجل مع وقت الرفع واسم من رفعها، دون استبدال النسخ السابقة.')),field(t('نوع السجل'),type),field(t('اسم السجل أو رقم العقد أو الوحدة'),query),search,field(t('السجل المرتبط'),records),field(t('عنوان المستند'),title),field(t('تصوير المستند أو اختيار صورة'),file),rotate,cropBox,preview,save,reload,list,previous,next);
 function setPreview(imageBlob){if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(imageBlob);preview.src=previewUrl;preview.hidden=false;}
 async function prepare(){if(!img)return;const id=++renderId;const rendered=await renderScan(img,rotation,crop);if(dialog.closed||id!==renderId)return;blob=rendered;setPreview(blob);status.textContent=t('راجع وضوح الصورة والعنوان والسجل، ثم ارفع النسخة.');}
 file.onchange=()=>run(async()=>{pending=null;img=null;blob=null;preview.hidden=true;const chosen=file.files?.[0];if(!chosen)return;img=await decodeImage(chosen);rotation=0;for(const edge of Object.keys(crop))crop[edge]=0;for(const input of cropBox.querySelectorAll('input'))input.value='0';await prepare();});
 rotate.onclick=()=>run(async()=>{rotation=(rotation+90)%360;await prepare();});
 async function loadRecords(){records.replaceChildren();const placeholder=node('option',t('اختر السجل الصحيح'));placeholder.value='';records.append(placeholder);const rows=await session.request(session.client.rpc('aqari_document_entities',{p_workspace_id:session.bound.workspace,p_type:type.value,p_query:query.value.trim()}));
  for(const row of rows){const option=node('option',row.title);option.value=row.entity_ref;records.append(option);}if(initial.ref&&rows.some(r=>r.entity_ref===initial.ref)){records.value=initial.ref;initial={};}
  page=0;await loadDocuments();status.textContent=rows.length?t('اختر من السجلات المحفوظة. يعرض البحث حتى ٥٠ نتيجة.'):t('لا توجد سجلات محفوظة مطابقة. احفظ السجل أولاً قبل رفع المستند.');}
 async function loadDocuments(){list.replaceChildren();previous.hidden=true;next.hidden=true;if(!records.value)return;
  const rows=await session.request(session.client.rpc('aqari_document_listing',{p_workspace_id:session.bound.workspace,p_entity_type:type.value,p_entity_ref:records.value,p_page:page}));
  for(const row of rows){const card=node('article');card.append(node('h3',row.title),node('p',row.document_no),node('p',new Date(row.created_at).toLocaleString(dateLocale())+' • '+(row.status==='uploaded'?t('محفوظ'):row.status==='draft'?t('لم يكتمل تأكيد الرفع'):t('ملغى'))),node('p',t('رفع بواسطة: ')+(row.author_name||t('مستخدم محفوظ'))));
   if(row.status==='uploaded'){const download=node('button',t('تحميل النسخة الأصلية'));download.onclick=()=>run(async()=>{const data=await session.storage('GET',row.storage_path);session.check();const url=URL.createObjectURL(data),a=node('a',t('تحميل الملف'));a.href=url;a.download=row.document_no+(row.mime_type==='image/jpeg'?'.jpg':row.mime_type==='application/pdf'?'.pdf':'');card.append(a);a.click();dialog.el.addEventListener('close',()=>URL.revokeObjectURL(url),{once:true});status.textContent=t('تم استرجاع الملف المحفوظ.');});card.append(download);}
   list.append(card);}
  if(!rows.length)list.append(node('p',t('لا توجد مستندات لهذا السجل.')));previous.hidden=page===0;next.hidden=rows.length<20;}
 type.onchange=()=>run(loadRecords);search.onclick=()=>run(loadRecords);records.onchange=()=>run(async()=>{page=0;pending=null;await loadDocuments();status.textContent=t('تم تحديث مستندات السجل المحدد.');});reload.onclick=()=>run(async()=>{await loadDocuments();status.textContent=t('تمت إعادة القراءة من قاعدة البيانات.');});
 save.onclick=()=>run(async()=>{
  if(!records.value||!title.value.trim()||!blob)throw Error('حدد السجل والعنوان وصورة المستند قبل الرفع.');
  const target={type:type.value,ref:records.value,title:title.value.trim()},sentBlob=blob,hash=await checksum(sentBlob);session.check();
  if(!pending||pending.hash!==hash||JSON.stringify(pending.target)!==JSON.stringify(target)){
   const rows=await session.request(session.client.rpc('aqari_reserve_document',{p_workspace_id:session.bound.workspace,p_document_type:target.type==='lease'?'signed_contract':'mobile_scan',p_entity_type:target.type,p_entity_ref:target.ref,p_title:target.title,p_original_filename:'scan.jpg',p_mime_type:'image/jpeg',p_metadata:{capture:'mobile',release:'V267'}}));
   const doc=Array.isArray(rows)?rows[0]:rows;if(!doc?.document_id||doc.storage_bucket!=='aqari-documents'||!doc.storage_path.startsWith(session.bound.workspace+'/'))throw Error('تعذر حجز نسخة المستند.');
   pending={doc,hash,target,uploadAttempted:false};
  }
  const {doc}=pending;
  // If a previous response timed out, read the SAME path before another upload.
  if(!pending.uploadAttempted){pending.uploadAttempted=true;await session.storage('POST',doc.storage_path,sentBlob);}
  const stored=await session.storage('GET',doc.storage_path);session.check();
  if(stored.size!==sentBlob.size||await checksum(stored)!==hash)throw Error('لم تتطابق إعادة قراءة المستند. لن يتم تأكيده.');
  await session.request(session.client.rpc('aqari_finalize_document',{p_document_id:doc.document_id,p_size_bytes:sentBlob.size,p_mime_type:'image/jpeg',p_checksum:hash}));
  const verified=await session.request(session.client.from('aqari_documents').select('id,status,entity_type,entity_ref,created_by,checksum_sha256').eq('workspace_id',session.bound.workspace).eq('id',doc.document_id).single());
  if(verified.status!=='uploaded'||verified.entity_type!==target.type||verified.entity_ref!==target.ref||verified.created_by!==session.bound.user||verified.checksum_sha256!==hash)throw Error('لم تتأكد إعادة قراءة سجل المستند.');
  blob=null;img=null;pending=null;file.value='';preview.hidden=true;await loadDocuments();status.textContent=t('تم حفظ النسخة وإعادة قراءة الملف ومطابقة بصمته وتأكيد ارتباطه بالسجل.');
 });
 next.onclick=()=>run(async()=>{page++;await loadDocuments();status.textContent=t('المستندات الأقدم.');});previous.onclick=()=>run(async()=>{if(page>0)page--;await loadDocuments();status.textContent=t('المستندات الأحدث.');});
 dialog.el.addEventListener('close',()=>{renderId++;img=null;blob=null;if(previewUrl)URL.revokeObjectURL(previewUrl);},{once:true});
 await run(loadRecords);
}

