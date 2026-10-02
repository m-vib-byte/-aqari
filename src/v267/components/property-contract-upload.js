import {decodeImage,renderScan,scanGeometry} from './scan-image.js';
import {scanPdf,MAX_SCAN_PAGES} from './scan-pdf.js';
import {node,field} from './dialog.js';
import {t} from './locale.js';
import {createOriginalDocumentUpload,originalDocument} from './original-document-upload.js';
import {createTemplateLogoContext} from './template-property-logo.js';
import {listPropertyContractArchive,readPropertyContractArchive} from './property-contract-archive.js';

const CONTRACT_TITLE='ملف عقد العقار';
const propertyChoice=(rows,value='')=>{
 const input=node('select');input.name='property_id';input.required=true;
 if(!value){const placeholder=node('option',t('اختر العقار'));placeholder.value='';placeholder.disabled=true;input.append(placeholder);}
 for(const property of rows){const option=node('option',property.name);option.value=property.id;input.append(option);}
 input.value=value;return input;
};

/** Uploads one immutable PDF contract document under a verified property scope. */
export async function mountPropertyContractUpload(d,target,{propertyId=null,onBack,onArchive,archiveOnly=false}={}){
 const service=createTemplateLogoContext(d.session),access=await service.getAccess();
 if(!access.canUpload)throw Error('رفع عقد العقار يتطلب صلاحية تعديل العقارات ورفع المستندات.');
 const properties=await service.listProperties();
 if(!properties.length)throw Error('لا توجد عقارات متاحة لربط العقد بها.');
 const selected=propertyId?properties.find(property=>property.id===propertyId):null;
 if(propertyId&&!selected)throw Error('العقار المحدد غير متاح ضمن مساحة العمل الحالية.');
 const property=propertyChoice(properties,selected?.id||''),file=node('input'),form=node('form'),save=node('button',t('حفظ الملف')),
  archive=node('section'),archiveRows=node('div'),refresh=node('button',t('عرض عقود PDF المحفوظة')),
  viewer=node('section'),more=node('button',t('عرض المزيد من العقود'));
 file.type='file';file.name='contract_pdf';file.accept='application/pdf,.pdf';file.required=false;save.type='submit';save.disabled=true;save.hidden=true;save.className='aq267-upload-save';form.className='aq267-simple-upload';
 refresh.type=more.type='button';more.hidden=true;archive.append(node('h4',t('أرشيف عقود PDF للعقار')),refresh,archiveRows,more,viewer);
 const uploadFields=node('section'),propertyField=field(t('العقار'),property),success=node('section'),savedName=node('p'),viewSaved=node('button',t('عرض الملف المحفوظ')),archiveLink=node('button',t('الذهاب إلى الأرشيف'));
 uploadFields.hidden=archiveOnly;archive.hidden=!archiveOnly;success.hidden=true;success.className='aq267-upload-success';success.setAttribute('role','status');viewSaved.type=archiveLink.type='button';viewSaved.className=archiveLink.className='aq267-upload-secondary';
 success.append(node('h4',t('✓ تم حفظ الملف')),savedName,viewSaved,archiveLink);
 form.append(uploadFields,success,archive);uploadFields.append(node('h3',t('حفظ عقد جاهز')),node('p',t('اختر الملف، ثم اضغط حفظ. ستجده في الأرشيف.')));
 if(selected){property.disabled=true;uploadFields.append(node('p',t('سيُحفظ في: ')+selected.name));propertyField.hidden=true;uploadFields.append(propertyField);}
 else if(archiveOnly)archive.prepend(propertyField);else uploadFields.append(propertyField);
 uploadFields.append(field(t('ملف العقد PDF'),file),save);
 let savedRow=null;
 archiveLink.onclick=()=>onArchive?onArchive():d.run(async()=>{uploadFields.hidden=success.hidden=true;archive.hidden=false;await showArchive();});
 viewSaved.onclick=()=>d.run(async()=>{if(savedRow)await openSavedFile(savedRow,selectedProperty(),archiveEpoch);});
 if(onBack){const back=node('button',t('رجوع'));back.type='button';back.onclick=onBack;form.prepend(back);}
 const photos=node('input'),camera=node('input'),sources=node('div'),list=node('ol'),selectionNote=node('p');
 photos.type=camera.type='file';photos.accept=camera.accept='image/jpeg,image/png,image/webp,image/heic,image/heif';photos.multiple=true;camera.setAttribute('capture','environment');photos.hidden=camera.hidden=true;
 sources.className='aq267-contract-source-choices';list.className='aq267-contract-file-list';selectionNote.className='aq267-upload-selection';selectionNote.setAttribute('aria-live','polite');let selectedFiles=[],preparedFile=null;
 function updateSelection(){const hasFile=!!file.files?.[0]||selectedFiles.length>0;save.hidden=!hasFile;save.disabled=!hasFile;selectionNote.textContent=file.files?.[0]?.name||(selectedFiles.length?t('راجع ترتيب الصفحات، ثم اضغط حفظ.') : t('لم تختر ملفًا بعد'));}
 function drawFiles(){list.replaceChildren();selectedFiles.forEach((item,index)=>{const row=node('li'),title=node('span',`${index+1}. ${item.name}`),remove=node('button',t('حذف')),up=node('button',t('للأعلى'));remove.type=up.type='button';up.disabled=index===0;remove.onclick=()=>{selectedFiles.splice(index,1);preparedFile=null;drawFiles();};up.onclick=()=>{[selectedFiles[index-1],selectedFiles[index]]=[selectedFiles[index],selectedFiles[index-1]];preparedFile=null;drawFiles();};row.append(title,up,remove);list.append(row);});updateSelection();}
 for(const [label,input]of [['اختيار ملف PDF',file],['اختيار صور',photos],['تصوير العقد',camera]]){const button=node('button',t(label));button.type='button';button.className=input===file?'aq267-upload-pick':'aq267-upload-secondary';button.onclick=()=>input.click();sources.append(button);}file.parentElement.hidden=true;
 const addImages=input=>{const chosen=Array.from(input.files||[]);if(!chosen.length)return;return d.run(async()=>{if(selectedFiles.length+chosen.length>MAX_SCAN_PAGES)throw Error('أضف من صفحة إلى ٢٠ صفحة للمستند.');success.hidden=true;file.value='';preparedFile=null;selectedFiles.push(...chosen);input.value='';drawFiles();});};
 photos.onchange=()=>addImages(photos);camera.onchange=()=>addImages(camera);file.onchange=()=>{if(!file.files?.length)return;success.hidden=true;selectedFiles=[];preparedFile=null;drawFiles();};
 uploadFields.insertBefore(sources,save);uploadFields.insertBefore(selectionNote,save);uploadFields.insertBefore(list,save);uploadFields.append(photos,camera);
 const upload=createOriginalDocumentUpload(d.session);
 let openedUrl=null,archiveEpoch=0,archiveOffset=0;
 function clearViewer(){if(openedUrl){URL.revokeObjectURL(openedUrl);openedUrl=null;}viewer.replaceChildren();}
 function selectedProperty(){return properties.find(item=>item.id===property.value)||null;}
 async function openSavedFile(row,current,epoch){const currentProperty=selectedProperty();if(!currentProperty||currentProperty.id!==current?.id)throw Error('تغير العقار المحدد. حدّث الأرشيف.');
     const blob=await readPropertyContractArchive(d.session,currentProperty,row.id);if(epoch!==archiveEpoch)return;
     if(archive.hidden)success.append(viewer);else archive.append(viewer);clearViewer();viewer.hidden=false;openedUrl=URL.createObjectURL(blob);
     const full=node('a',t('فتح جميع صفحات PDF في تبويب مستقل')),download=node('a',t('تحميل ملف PDF الأصلي'));
     full.href=download.href=openedUrl;full.target='_blank';full.rel='noopener noreferrer';
     download.download=String(row.original_filename||'contract.pdf').replace(/[\\/]/g,'_');
     for(const link of [full,download]){link.style.display='block';link.style.padding='14px';link.style.marginBlock='10px';link.style.overflowWrap='anywhere';}
     viewer.append(node('p',t('افتح الملف في تبويب مستقل لتصفح جميع صفحاته والتكبير، أو حمّل النسخة الأصلية.')),full,download);
     d.status.textContent=t('هذه النسخة المسترجعة من التخزين بعد التحقق من بصمتها وربطها بالعقار.');
 }
 async function loadArchivePage(current,epoch,offset){
  more.disabled=true;
  try{
   const page=await listPropertyContractArchive(d.session,current,offset);if(epoch!==archiveEpoch)return;
   archiveOffset=page.nextOffset;more.hidden=!page.hasMore;
   if(!page.items.length&&offset===0)archiveRows.append(node('p',t('لا توجد ملفات عقود PDF محفوظة لهذا العقار.')));
   for(const row of page.items){const open=node('button',t('عرض PDF المحفوظ')),entry=node('div');open.type='button';
    open.onclick=()=>d.run(()=>openSavedFile(row,current,epoch));
    entry.append(node('span',`${String(row.original_filename||'').trim()||row.title||t('ملف عقد العقار')} · ${new Date(row.created_at).toLocaleDateString('ar-KW')}`),open);archiveRows.append(entry);}
  }finally{more.disabled=false;}
 }
 async function showArchive(){const current=selectedProperty(),epoch=++archiveEpoch;archiveOffset=0;clearViewer();archiveRows.replaceChildren();more.hidden=true;
  if(!current){archiveRows.append(node('p',t('اختر العقار لعرض عقوده المحفوظة.')));return;}
  await loadArchivePage(current,epoch,0);
 }
 refresh.onclick=()=>d.run(showArchive);more.onclick=()=>d.run(async()=>{const current=selectedProperty();if(current)await loadArchivePage(current,archiveEpoch,archiveOffset);});property.onchange=()=>{archiveEpoch++;success.hidden=true;more.hidden=true;clearViewer();archiveRows.replaceChildren();if(archiveOnly)d.run(showArchive);};
 d.onDispose(()=>{archiveEpoch++;clearViewer();});
 form.onsubmit=event=>{event.preventDefault();d.run(async()=>{
  if(save.disabled)return;
  if(!file.files?.[0]&&!selectedFiles.length)throw Error('اختر ملف PDF أو صور العقد.');
  const current=properties.find(item=>item.id===property.value);if(!current)throw Error('اختر عقارًا محفوظًا ضمن مساحة العمل الحالية.');
  save.disabled=true;save.textContent=t('جارٍ الحفظ…');file.disabled=true;property.disabled=true;
  const controls=Array.from(sources.querySelectorAll('button'));for(const button of [...controls,...list.querySelectorAll('button')])button.disabled=true;photos.disabled=camera.disabled=true;
  try{
   let chosen=file.files?.[0]||preparedFile;
   if(!chosen){const pages=[];for(const imageFile of selectedFiles){const image=await decodeImage(imageFile),geometry=scanGeometry(image.naturalWidth,image.naturalHeight);const blob=await renderScan(image,0,{top:0,bottom:0,left:0,right:0});pages.push({blob,width:geometry.width,height:geometry.height});d.session.check();}chosen=preparedFile=new File([await scanPdf(pages)],'contract-scan.pdf',{type:'application/pdf'});}
   const blob=await originalDocument(chosen);if(blob.type!=='application/pdf')throw Error('اختر ملف PDF صالحًا لعقد العقار.');
   const row=await upload(chosen,{type:'property',ref:current.externalRef,category:'property_contract',title:CONTRACT_TITLE,propertyId:current.id});
   if(row.metadata?.property_id!==current.id)throw Error('لم يتأكد ربط العقد بمعرّف العقار.');
   savedRow=row;file.value='';selectedFiles=[];preparedFile=null;drawFiles();savedName.textContent=chosen.name;clearViewer();success.hidden=false;d.status.textContent=t('تم حفظ الملف في أرشيف العقار.');success.scrollIntoView?.({block:'nearest',behavior:'smooth'});
  }finally{save.textContent=t('حفظ الملف');file.disabled=false;property.disabled=!!selected;photos.disabled=camera.disabled=false;for(const button of controls)button.disabled=false;drawFiles();}
 });};
 drawFiles();target.replaceChildren(form);
 if(archiveOnly)await showArchive();
 return {form};
}
