import {readStoredOriginal,originalDocumentExtension} from '../components/stored-original.js';
import {createPrivateUrls} from '../components/private-urls.js';
import {t,dateLocale} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
import {decodeImage,renderScan,scanGeometry,checksum,MAX_SOURCE_BYTES} from '../components/scan-image.js';
import {createVerifiedUpload} from '../components/verified-upload.js';
import {createStoredVisualReview} from '../components/stored-visual-review.js';
import {scanPdf,MAX_SCAN_PAGES,MAX_SCAN_BYTES} from '../components/scan-pdf.js';
import {documentTarget} from '../components/document-target.js';

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
const categoryLabel=value=>{const source=Object.values(DOCUMENT_CATALOG).flat().find(([key])=>key===value)?.[1];return source?t(source):value||'';};

export async function openDocumentScanner(initial={}){
 const dialog=createDialog(t('مسح المستندات ورفع الوثائق'),{localized:true});if(!dialog)return;
 const {session,body,status,run:runDialog}=dialog;
 let scannerBusy=false;
 async function run(task){if(scannerBusy||dialog.closed)return;scannerBusy=true;try{await runDialog(task);}finally{scannerBusy=false;if(!dialog.closed){rotate.disabled=!img;cropBox.hidden=!img;addPage.disabled=!img;}}}
 const urls=createPrivateUrls(dialog),downloads=createPrivateUrls(dialog),pageUrls=createPrivateUrls(dialog);
 const type=node('select'),category=node('select'),query=node('input'),search=node('button',t('بحث السجلات المحفوظة')),records=node('select'),title=node('input'),file=node('input'),rotate=node('button',t('تدوير الصورة')),preview=node('img'),save=node('button',t('رفع نسخة جديدة والتحقق منها')),reload=node('button',t('تحديث المستندات')),list=node('div'),next=node('button',t('مستندات أقدم')),previous=node('button',t('مستندات أحدث'));
 query.maxLength=100;title.maxLength=180;preview.alt=t('معاينة صورة المستند قبل الرفع');file.type='file';
 file.accept='image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
 file.multiple=true;
 const camera=node('input'),addPage=node('button',t('إضافة هذه الصفحة وتصوير التالية')),pagesList=node('section'),selection=node('p'),pages=[];
 const reviewed=node('input'),reviewField=field(t('راجعت الصفحات وهي العقد الموقّع الفعلي لهذا السجل'),reviewed);reviewed.type='checkbox';
 camera.type='file';camera.accept='image/jpeg,image/png,image/webp,image/heic,image/heif';camera.setAttribute('capture','environment');
 selection.setAttribute('role','status');pagesList.className='aq267-scan-pages';
 const back=initial.onBack;if(typeof back==='function'){const b=node('button',t('العودة إلى الملف'));b.onclick=async()=>{await dialog.requestClose();if(dialog.closed)back();};body.append(b);}
 dialog.el?.classList.add('aq267-scanner');
 for(const [value,text]of [['property',t('العقار')],['tenant',t('المستأجر')],['lease',t('العقد')]]){const o=node('option',text);o.value=value;type.append(o);}
 type.value=['property','tenant','lease'].includes(initial.type)?initial.type:'property';
 let img=null,blob=null,rotation=0,previewUrl=null,page=0,pending=null,renderId=0,uploadMime='',uploadName='';
 const crop={top:0,bottom:0,left:0,right:0},cropBox=node('details');cropBox.append(node('summary',t('قص حواف الصورة')));
 for(const [edge,text]of [['top',t('أعلى')],['bottom',t('أسفل')],['left',t('يسار')],['right',t('يمين')]]){const input=node('input');input.type='range';input.min='0';input.max='40';input.value='0';input.onchange=()=>run(async()=>{crop[edge]=Number(input.value);await prepare();});cropBox.append(field(text,input));}
 const targetBox=node('section'),captureBox=node('section'),archiveBox=node('section'),queryField=field(t('اسم السجل أو رقم العقد أو الوحدة'),query);
 targetBox.append(node('h3',t('١. ربط المستند')),field(t('نوع السجل'),type),queryField,search,field(t('السجل المرتبط'),records),field(t('تصنيف المستند'),category),field(t('عنوان المستند'),title));
 captureBox.append(node('h3',t('٢. تصوير الورق أو اختيار ملف')),node('p',t('صوّر كل صفحة، ثم أضف الصفحة التالية. تجمع الصور في PDF واحد بترتيبها. يمكنك أيضاً اختيار PDF أو DOCX جاهز حتى ٢٥ ميجابايت.')),field(t('تصوير ورقة بالكاميرا'),camera),field(t('اختيار ملف أو صور من الجهاز'),file),selection,rotate,cropBox,preview,addPage,pagesList,reviewField,save);
 archiveBox.append(node('h3',t('٣. المستندات المحفوظة')),reload,list,previous,next);
 body.append(targetBox,captureBox,archiveBox);preview.hidden=true;
 const visualReview=createStoredVisualReview(dialog,{parent:captureBox,controls:[type,category,query,search,records,title,file,camera,rotate,...cropBox.querySelectorAll('input'),addPage,reviewed,save]});
 if(initial.ref){type.disabled=query.disabled=search.disabled=records.disabled=true;queryField.hidden=query.hidden=search.hidden=true;}

 function refreshCategories(){
  const previousValue=category.value;category.replaceChildren();
  for(const [value,label] of DOCUMENT_CATALOG[type.value]||[]){const option=node('option',t(label));option.value=value;category.append(option);}
  if([...category.options].some(o=>o.value===previousValue))category.value=previousValue;
  if(initial.category&&[...category.options].some(o=>o.value===initial.category)){category.value=initial.category;initial={...initial,category:null};}
  if(!title.value.trim())title.value=categoryLabel(category.value);
  reviewed.checked=false;reviewField.hidden=!(type.value==='lease'&&category.value==='lease_contract');
 }
 function setPreview(imageBlob){if(previewUrl)urls.release(previewUrl);previewUrl=urls.create(imageBlob);preview.src=previewUrl;preview.hidden=false;}
 async function prepare(){if(!img)return;const id=++renderId;const rendered=await renderScan(img,rotation,crop);session.check();if(dialog.closed||id!==renderId)return;blob=rendered;uploadMime='image/jpeg';pending=null;reviewed.checked=false;setPreview(blob);status.textContent=t('راجع وضوح الصورة والعنوان والسجل، ثم ارفع النسخة.');}
 function currentPage(){const g=scanGeometry(img.naturalWidth,img.naturalHeight,rotation,crop);return {blob,width:g.width,height:g.height};}
 function drawPages(){
  pageUrls.clear();pagesList.replaceChildren();selection.textContent=pages.length?t('صفحات جاهزة: ')+pages.length:'';
  pages.forEach((p,i)=>{const card=node('article'),photo=node('img');photo.src=pageUrls.create(p.blob);photo.alt=t('صفحة ')+(i+1);card.append(photo,node('strong',t('صفحة ')+(i+1)));
   for(const [label,delta]of [[t('تقديم الصفحة'),-1],[t('تأخير الصفحة'),1],[t('إزالة الصفحة'),0]]){const b=node('button',label);b.type='button';b.disabled=delta!==0&&(i+delta<0||i+delta>=pages.length);b.onclick=()=>run(async()=>{if(delta)[pages[i],pages[i+delta]]=[pages[i+delta],pages[i]];else pages.splice(i,1);pending=null;reviewed.checked=false;drawPages();});card.append(b);}pagesList.append(card);});
 }
 function keepPage(){if(!img||!blob)return;if(pages.length>=MAX_SCAN_PAGES)throw Error('الحد الأقصى ٢٠ صفحة.');if(pages.reduce((n,p)=>n+p.blob.size,blob.size)>MAX_SCAN_BYTES-65536)throw Error('حجم الصفحات يتجاوز ٢٥ ميجابايت.');pages.push(currentPage());img=null;blob=null;pending=null;preview.hidden=true;drawPages();}
 addPage.onclick=()=>run(async()=>{keepPage();file.value=camera.value='';status.textContent=t('أُضيفت الصفحة. صوّر التالية أو احفظ المستند.');});
 async function readCandidate(chosen){
  if(!chosen.size||chosen.size>MAX_SOURCE_BYTES)throw Error('اختر ملفاً بحجم لا يتجاوز ٢٥ ميجابايت.');
  if(!SUPPORTED_MIMES.has(chosen.type))throw Error('نوع الملف غير مدعوم. استخدم صورة أو PDF أو DOCX.');
  const name=chosen.name||'document';
  if(IMAGE_MIMES.has(chosen.type)){
   const image=await decodeImage(chosen);session.check();
   const imageBlob=await renderScan(image,0,{top:0,bottom:0,left:0,right:0});session.check();
   const geometry=scanGeometry(image.naturalWidth,image.naturalHeight);
   return {image,blob:imageBlob,mime:'image/jpeg',name:name.replace(/\.[^.]+$/,'')+'.jpg',width:geometry.width,height:geometry.height};
  }
  const header=new Uint8Array(await chosen.slice(0,5).arrayBuffer());session.check();
  if(name.toLowerCase().endsWith('.pdf')&&chosen.type!=='application/pdf')throw Error('صيغة الملف لا تطابق اسمه.');
  if(chosen.type==='application/pdf'?String.fromCharCode(...header)!=='%PDF-':header[0]!==80||header[1]!==75||header[2]!==3||header[3]!==4)throw Error('تعذر قراءة الملف. اختر PDF أو DOCX صالحاً.');
  return {image:null,blob:chosen,mime:chosen.type,name};
 }
 async function chooseFiles(files){
  if(!files.length)return;
  const images=files.every(f=>IMAGE_MIMES.has(f.type));
  if(!images&&(files.length>1||pages.length))throw Error('ارفع PDF أو DOCX منفرداً. احفظ الصفحات المصورة أولاً أو أزلها.');
  if(images&&pages.length+files.length+(img?1:0)>MAX_SCAN_PAGES)throw Error('الحد الأقصى ٢٠ صفحة.');
  // Decode the entire selection before changing the existing scan or retry.
  const nextPages=[...pages,...(images&&img?[currentPage()]:[])];let selected;
  let totalBytes=nextPages.reduce((total,p)=>total+p.blob.size,0);
  for(let i=0;i<files.length;i++){
   selected=await readCandidate(files[i]);session.check();if(dialog.closed)return;
   if(images){totalBytes+=selected.blob.size;if(totalBytes>MAX_SCAN_BYTES-65536)throw Error('حجم الصفحات يتجاوز ٢٥ ميجابايت.');}
   if(images&&i<files.length-1)nextPages.push({blob:selected.blob,width:selected.width,height:selected.height});
  }
  renderId++;pages.splice(0,pages.length,...nextPages);img=selected.image;blob=selected.blob;uploadMime=selected.mime;uploadName=selected.name;rotation=0;pending=null;reviewed.checked=false;
  for(const edge of Object.keys(crop))crop[edge]=0;for(const input of cropBox.querySelectorAll('input'))input.value='0';
  drawPages();if(img)setPreview(blob);else{if(previewUrl)urls.release(previewUrl);previewUrl=null;preview.removeAttribute('src');preview.hidden=true;}
  selection.textContent=uploadName+(img?t(' — راجع الصورة أدناه'):'');
  status.textContent=t(img?'راجع وضوح الصورة والعنوان والسجل، ثم ارفع النسخة.':'تم اختيار الملف. راجع التصنيف والعنوان والسجل ثم ارفع النسخة.');
 }
 file.onchange=()=>run(()=>chooseFiles([...file.files||[]]));camera.onchange=()=>run(()=>chooseFiles([...camera.files||[]]));
 rotate.onclick=()=>run(async()=>{if(!img)return;rotation=(rotation+90)%360;await prepare();});
 async function loadRecords(){records.replaceChildren();const placeholder=node('option',t('اختر السجل الصحيح'));placeholder.value='';records.append(placeholder);const rows=initial.ref?[await documentTarget(session,type.value,String(initial.ref),initial.referenceKey)]:await session.request(session.client.rpc('aqari_document_entities',{p_workspace_id:session.bound.workspace,p_type:type.value,p_query:query.value.trim()}));
  for(const row of rows){const option=node('option',row.title);option.value=row.entity_ref;records.append(option);}if(initial.ref&&rows.length===1)records.value=rows[0].entity_ref;
  page=0;await loadDocuments();status.textContent=rows.length?(initial.ref?t('المستندات مرتبطة بالملف المفتوح. اختر التصنيف ثم صوّر الورق أو ارفع الملف.'):t('اختر من السجلات المحفوظة. يعرض البحث حتى ٥٠ نتيجة.')):t('لا توجد سجلات محفوظة مطابقة. احفظ السجل أولاً قبل رفع المستند.');}
 async function loadDocuments(){downloads.clear();list.replaceChildren();previous.hidden=true;next.hidden=true;if(!records.value)return;
  const rows=await session.request(session.client.rpc('aqari_document_listing',{p_workspace_id:session.bound.workspace,p_entity_type:type.value,p_entity_ref:records.value,p_page:page}));
  for(const row of rows){const card=node('article'),cat=categoryLabel(row.metadata?.document_category);card.append(node('h3',row.title),node('p',[cat,row.document_no].filter(Boolean).join(' • ')),node('p',new Date(row.created_at).toLocaleString(dateLocale())+' • '+(row.status==='uploaded'?t('محفوظ'):row.status==='draft'?t('لم يكتمل تأكيد الرفع'):t('ملغى'))),node('p',t('رفع بواسطة: ')+(row.author_name||t('مستخدم محفوظ'))));
   if(row.status==='uploaded'){const download=node('button',t('تحميل النسخة الأصلية'));download.onclick=()=>run(async()=>{const {blob:data,note}=await readStoredOriginal(session,{id:row.id,storagePath:row.storage_path,entityType:type.value,entityRef:records.value});session.check();const url=downloads.create(data),a=node('a',t('تحميل الملف'));a.href=url;a.download=row.document_no+originalDocumentExtension(row.mime_type);card.append(a);a.click();status.textContent=t(note);});card.append(download);}
   list.append(card);}
  if(!rows.length)list.append(node('p',t('لا توجد مستندات لهذا السجل.')));previous.hidden=page===0;next.hidden=rows.length<20;}
 type.onchange=()=>run(async()=>{refreshCategories();await loadRecords();});
 category.onchange=()=>{reviewed.checked=false;reviewField.hidden=!(type.value==='lease'&&category.value==='lease_contract');if(!title.value.trim()||Object.values(DOCUMENT_CATALOG).flat().some(([,label])=>t(label)===title.value.trim()))title.value=categoryLabel(category.value);};
 search.onclick=()=>run(loadRecords);records.onchange=()=>run(async()=>{page=0;pending=null;reviewed.checked=false;await loadDocuments();status.textContent=t('تم تحديث مستندات السجل المحدد.');});reload.onclick=()=>run(async()=>{await loadDocuments();status.textContent=t('تمت إعادة القراءة من قاعدة البيانات.');});
 save.onclick=()=>run(async()=>{
  if(!records.value||!category.value||!title.value.trim()||(!blob&&!pages.length))throw Error('حدد السجل وتصنيف المستند والعنوان والملف قبل الرفع.');
  if(type.value==='lease'&&category.value==='lease_contract'&&!reviewed.checked)throw Error('أكد مراجعة صفحات العقد الموقّع قبل رفعه.');
  const imagePages=[...pages,...(img?[currentPage()]:[])];
  const sentBlob=imagePages.length?await scanPdf(imagePages):blob;session.check();
  const target={type:type.value,ref:records.value,category:category.value,title:title.value.trim(),mime:sentBlob.type,name:imagePages.length?'scan-'+imagePages.length+'-pages.pdf':uploadName},hash=await checksum(sentBlob);session.check();
  if(!pending||pending.hash!==hash||JSON.stringify(pending.target)!==JSON.stringify(target)){
   const rows=await session.request(session.client.rpc('aqari_reserve_document',{p_workspace_id:session.bound.workspace,p_document_type:target.type==='lease'&&target.category==='lease_contract'?'signed_contract':'mobile_scan',p_entity_type:target.type,p_entity_ref:target.ref,p_title:target.title,p_original_filename:target.name,p_mime_type:target.mime,p_metadata:{capture:imagePages.length?'mobile_scan':'file_upload',page_count:imagePages.length||null,document_category:target.category,release:'V267'}}));
   const doc=Array.isArray(rows)?rows[0]:rows;if(!doc?.document_id||doc.storage_bucket!=='aqari-documents'||!doc.storage_path.startsWith(session.bound.workspace+'/'))throw Error('تعذر حجز نسخة المستند.');
   pending={doc,hash,target,upload:createVerifiedUpload(session,{path:doc.storage_path,blob:sentBlob})};
  }
  const {doc}=pending;await pending.upload();
  await visualReview.review({doc,target,expectedHash:hash,expectedSize:sentBlob.size});session.check();
  await session.request(session.client.rpc('aqari_finalize_document',{p_document_id:doc.document_id,p_size_bytes:sentBlob.size,p_mime_type:target.mime,p_checksum:hash}));
  const verified=await session.request(session.client.from('aqari_documents').select('id,status,entity_type,entity_ref,created_by,checksum_sha256,metadata,mime_type').eq('workspace_id',session.bound.workspace).eq('id',doc.document_id).single());
  if(verified?.id!==doc.document_id||verified.status!=='uploaded'||verified.entity_type!==target.type||verified.entity_ref!==target.ref||verified.created_by!==session.bound.user||verified.checksum_sha256!==hash||verified.mime_type!==target.mime||verified.metadata?.document_category!==target.category)throw Error('لم تتأكد إعادة قراءة سجل المستند.');
  blob=null;img=null;pending=null;reviewed.checked=false;pages.length=0;drawPages();uploadMime='';uploadName='';file.value=camera.value='';preview.hidden=true;rotate.disabled=true;cropBox.hidden=true;page=0;await loadDocuments();status.textContent=t('تم حفظ النسخة بعد استرجاعها من التخزين ومراجعة جودتها ومطابقة بصمتها وتصنيفها وارتباطها بالسجل.');
 });
 next.onclick=()=>run(async()=>{page++;await loadDocuments();status.textContent=t('المستندات الأقدم.');});previous.onclick=()=>run(async()=>{if(page>0)page--;await loadDocuments();status.textContent=t('المستندات الأحدث.');});
 dialog.setBeforeClose(()=>pending?window.confirm(t('لم يتأكد إقفال المستند المرفوع. هل تريد إغلاق الماسح؟ تحقق من المستندات المحفوظة عند العودة قبل إعادة الرفع.')):blob||pages.length?window.confirm(t('توجد صورة أو صفحات أو ملف لم يُحفظ بعد. هل تريد تجاهله وإغلاق الماسح؟')):true);
 dialog.onDispose(()=>{renderId++;img=null;blob=null;pending=null;pages.length=0;file.value=camera.value='';pagesList.replaceChildren();preview.removeAttribute('src');previewUrl=null;});
 rotate.disabled=addPage.disabled=true;cropBox.hidden=true;refreshCategories();await run(loadRecords);
}
