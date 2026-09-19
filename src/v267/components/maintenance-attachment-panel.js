import {hasTranslation} from './locale.js';
import {uiText,setText} from './ui-text.js';
import {createMaintenanceAttachments,maintenanceCancellationAudit,MAINTENANCE_ATTACHMENT_LIMIT} from './maintenance-attachments.js';

// Shared by the isolated tenant account and the staff desk. Text is inserted
// literally, and every private blob URL is revoked when the owning view closes.
export async function mountMaintenanceAttachments(container,options){
 const api=createMaintenanceAttachments(options),urls=new Set(),node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
 const labelText=(source,values)=>{const label=node('label');label.append(uiText('span',source,values));return label;};
 let closed=false,busy=false,selection=[],allowed=false;
 const check=()=>{options.check();if(closed)throw Error('تم إغلاق مرفقات البلاغ.');};
 const title=uiText('h4','صور البلاغ ومرفقاته'),hint=uiText('p','أرفق حتى ٨ ملفات لهذا البلاغ. الحد ١٠ ميجابايت لكل صورة أو PDF.'),message=node('p'),list=node('div'),label=labelText('اختيار صور أو PDF للبلاغ'),files=node('input'),cameraLabel=labelText('تصوير العطل بالكاميرا'),camera=node('input'),upload=uiText('button','رفع المرفقات والتحقق منها'),refresh=uiText('button','تحديث مرفقات البلاغ');
 message.setAttribute('role','status');message.setAttribute('aria-live','polite');files.type=camera.type='file';files.accept='image/jpeg,image/png,image/webp,application/pdf';files.multiple=true;camera.accept='image/jpeg';camera.setAttribute('capture','environment');upload.type=refresh.type='button';label.append(files);cameraLabel.append(camera);
 container.replaceChildren(title,hint,label,cameraLabel,upload,refresh,message,list);
 const clearUrls=()=>{for(const url of urls)URL.revokeObjectURL(url);urls.clear();};
 const errors={ATTACHMENT_LIMIT_REACHED:'بلغ البلاغ الحد الأقصى: ٨ مرفقات وحجوزات نشطة. حدّث القائمة لاستئناف حجوزاتك غير المكتملة أو إلغائها مع توثيق السبب.',INVALID_ATTACHMENT:'راجع نوع الملف واسمه وحجمه. المسموح صور JPEG أو PNG أو WebP أو PDF حتى ١٠ ميجابايت.',ATTACHMENT_RESERVATION_CONFLICT:'تغير الملف عن النسخة التي حُجزت له. اختر النسخة الأصلية وأعد المحاولة.',STORED_FILE_NOT_CONFIRMED:'لم يتأكد اكتمال الملف في التخزين. احتُفظ بالاختيار لإعادة المحاولة والتحقق.',ATTACHMENT_CANCELLED:'أُلغي هذا الحجز. حدّث القائمة واختر ملفًا لحجز جديد عند الحاجة.',UPLOADED_ATTACHMENT_IMMUTABLE:'اكتمل حفظ هذا المرفق ولا يمكن إلغاء حجزه. حدّث القائمة لاسترجاع الأصل.',CANCELLATION_CONFLICT:'سُجل الإلغاء مسبقًا بسبب مختلف. حدّث القائمة لمراجعة السجل.',INVALID_CANCELLATION_REASON:'اكتب سبب إلغاء الحجز من ٦ إلى ٢٤٠ حرف.'};
 function dispose(){closed=true;selection=[];for(const input of container.querySelectorAll('input'))input.value='';clearUrls();container.replaceChildren();}
 options.onDispose(dispose);
 function lock(value){busy=value;for(const control of container.querySelectorAll('button,input'))control.disabled=value;if(!value)upload.disabled=!allowed||!selection.length;}
 async function run(work){if(busy||closed)return;lock(true);try{check();await work();check();}catch(error){if(!closed){if([401,403].includes(error.status)||error.code==='42501'||error.message==='ACCESS_DENIED'){dispose();return;}try{check();setText(message,errors[error.message]||(hasTranslation(error.message,'en')?error.message:'تعذر تأكيد العملية. حدّث المرفقات قبل المحاولة مجدداً.'));}catch{dispose();}}}finally{if(!closed)lock(false);}}
 async function load(){
  const result=await api.list();check();allowed=result.can_upload;label.hidden=cameraLabel.hidden=upload.hidden=!allowed;clearUrls();list.replaceChildren();
  if(!result.attachments.length)list.append(uiText('p','لا توجد مرفقات محفوظة لهذا البلاغ.'));
  for(const doc of result.attachments){const row=node('div'),name=node('p',doc.filename),open=uiText('button','استرجاع المرفق');open.type='button';row.append(name,open);list.append(row);open.onclick=()=>run(async()=>{const saved=await api.download(doc.id);check();const url=URL.createObjectURL(saved.blob);urls.add(url);const link=uiText('a','فتح / تحميل الملف المحفوظ');link.href=url;link.download=saved.doc.filename;link.target='_blank';link.rel='noopener';open.replaceWith(link);setText(message,'تم استرجاع المرفق والتحقق من بصمته.');});}
  if(result.pending.length){
   list.append(uiText('h5','حجوزاتك غير المكتملة'),uiText('p','استأنف بالملف الأصلي نفسه، أو ألغِ الحجز مع ذكر السبب لتحرير مكانه. يُحفظ سجل الإلغاء وأي ملف وصل إلى التخزين دون حذف.'));
   for(const doc of result.pending){
    const row=node('div');row.append(node('p',doc.filename));list.append(row);
    if(!allowed){row.append(uiText('p','البلاغ مغلق؛ هذا الحجز محفوظ للقراءة فقط.'));continue;}
    const resumeLabel=labelText('استئناف رفع {filename} — اختر الملف الأصلي',{filename:doc.filename}),original=node('input'),reasonLabel=labelText('سبب إلغاء حجز {filename}',{filename:doc.filename}),reason=node('input'),cancel=uiText('button','إلغاء الحجز وتوثيق السبب');
    original.type='file';original.accept=files.accept;reason.type='text';reason.maxLength=240;cancel.type='button';resumeLabel.append(original);reasonLabel.append(reason);row.append(resumeLabel,reasonLabel,cancel);
    original.onchange=()=>run(async()=>{const file=original.files?.[0];if(!file)return;await api.resume(doc.id,file);check();original.value='';await load();setText(message,'اكتمل استئناف المرفق والتحقق من الملف المحفوظ.');});
    cancel.onclick=()=>run(async()=>{const saved=await api.cancel(doc.id,reason.value);check();selection=[];files.value=camera.value='';await load();setText(message,'تم إلغاء الحجز وتوثيق السبب وإعادة قراءة السجل. لم يُحذف أي ملف. وقت الإلغاء: {date}',{date:maintenanceCancellationAudit(saved).at});});
   }
  }
  if(result.cancelled.length){
   list.append(uiText('h5','سجل حجوزاتك الملغاة — أحدث ٥٠ حجزًا'));
   for(const doc of result.cancelled){const audit=maintenanceCancellationAudit(doc);list.append(uiText('p',audit.incomplete?'{filename} — حجز قديم ملغى؛ السبب والفاعل غير مسجلين. الوقت: {date}':'{filename} — السبب: {reason} — الفاعل: {actor} — الوقت: {date}',{filename:doc.filename,date:audit.at,reason:audit.reason,actor:audit.by}));}
  }
  setText(message,allowed?'المرفقات خاصة بهذا البلاغ ومتاحة للحسابات المخولة فقط.':'يمكنك استرجاع المرفقات المحفوظة. إضافة مرفقات جديدة غير متاحة لهذا البلاغ.');
 }
 const choose=input=>{selection=Array.from(input.files||[]);if(selection.length>MAINTENANCE_ATTACHMENT_LIMIT){selection=[];input.value='';setText(message,'اختر حتى ٨ ملفات فقط.');}else setText(message,selection.length?'الملفات المختارة جاهزة للرفع.':'');upload.disabled=!allowed||!selection.length;};
 files.onchange=()=>{camera.value='';choose(files);};camera.onchange=()=>{files.value='';choose(camera);};
 upload.onclick=()=>run(async()=>{
  if(!allowed||!selection.length)return;const chosen=[...selection];let saved=0;
  for(const file of chosen){setText(message,'جارٍ رفع المرفق {current} من {total} والتحقق منه…',{current:saved+1,total:chosen.length});await api.upload(file);check();saved++;selection=selection.filter(item=>item!==file);}
  files.value=camera.value='';await load();setText(message,'تم حفظ {count} مرفق وإعادة قراءة الملف والسجل والتحقق منهما.',{count:saved});
 });
 refresh.onclick=()=>run(load);await run(load);return {dispose,refresh:()=>run(load)};
}

