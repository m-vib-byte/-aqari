import {createMaintenanceAttachments,maintenanceCancellationAudit,MAINTENANCE_ATTACHMENT_LIMIT} from './maintenance-attachments.js';

// Shared by the isolated tenant account and the staff desk. Text is inserted
// literally, and every private blob URL is revoked when the owning view closes.
export async function mountMaintenanceAttachments(container,options){
 const api=createMaintenanceAttachments(options),urls=new Set(),node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
 let closed=false,busy=false,selection=[],allowed=false;
 const check=()=>{options.check();if(closed)throw Error('تم إغلاق مرفقات البلاغ.');};
 const title=node('h4','صور البلاغ ومرفقاته'),hint=node('p','أرفق حتى ٨ ملفات لهذا البلاغ. الحد ١٠ ميجابايت لكل صورة أو PDF.'),message=node('p'),list=node('div'),label=node('label','اختيار صور أو PDF للبلاغ'),files=node('input'),cameraLabel=node('label','تصوير العطل بالكاميرا'),camera=node('input'),upload=node('button','رفع المرفقات والتحقق منها'),refresh=node('button','تحديث مرفقات البلاغ');
 message.setAttribute('role','status');message.setAttribute('aria-live','polite');files.type=camera.type='file';files.accept='image/jpeg,image/png,image/webp,application/pdf';files.multiple=true;camera.accept='image/jpeg';camera.setAttribute('capture','environment');upload.type=refresh.type='button';label.append(files);cameraLabel.append(camera);
 container.replaceChildren(title,hint,label,cameraLabel,upload,refresh,message,list);
 const clearUrls=()=>{for(const url of urls)URL.revokeObjectURL(url);urls.clear();};
 const errors={ATTACHMENT_LIMIT_REACHED:'بلغ البلاغ الحد الأقصى: ٨ مرفقات وحجوزات نشطة. حدّث القائمة لاستئناف حجوزاتك غير المكتملة أو إلغائها مع توثيق السبب.',INVALID_ATTACHMENT:'راجع نوع الملف واسمه وحجمه. المسموح صور JPEG أو PNG أو WebP أو PDF حتى ١٠ ميجابايت.',ATTACHMENT_RESERVATION_CONFLICT:'تغير الملف عن النسخة التي حُجزت له. اختر النسخة الأصلية وأعد المحاولة.',STORED_FILE_NOT_CONFIRMED:'لم يتأكد اكتمال الملف في التخزين. احتُفظ بالاختيار لإعادة المحاولة والتحقق.',ATTACHMENT_CANCELLED:'أُلغي هذا الحجز. حدّث القائمة واختر ملفًا لحجز جديد عند الحاجة.',UPLOADED_ATTACHMENT_IMMUTABLE:'اكتمل حفظ هذا المرفق ولا يمكن إلغاء حجزه. حدّث القائمة لاسترجاع الأصل.',CANCELLATION_CONFLICT:'سُجل الإلغاء مسبقًا بسبب مختلف. حدّث القائمة لمراجعة السجل.',INVALID_CANCELLATION_REASON:'اكتب سبب إلغاء الحجز من ٦ إلى ٢٤٠ حرف.'};
 function dispose(){closed=true;selection=[];for(const input of container.querySelectorAll('input'))input.value='';clearUrls();container.replaceChildren();}
 options.onDispose(dispose);
 function lock(value){busy=value;for(const control of container.querySelectorAll('button,input'))control.disabled=value;if(!value)upload.disabled=!allowed||!selection.length;}
 async function run(work){if(busy||closed)return;lock(true);try{check();await work();check();}catch(error){if(!closed){if([401,403].includes(error.status)||error.code==='42501'||error.message==='ACCESS_DENIED'){dispose();return;}try{check();message.textContent=errors[error.message]||(/^[\u0600-\u06ff]/.test(error.message||'')?error.message:'تعذر تأكيد العملية. حدّث المرفقات قبل المحاولة مجدداً.');}catch{dispose();}}}finally{if(!closed)lock(false);}}
 async function load(){
  const result=await api.list();check();allowed=result.can_upload;label.hidden=cameraLabel.hidden=upload.hidden=!allowed;clearUrls();list.replaceChildren();
  if(!result.attachments.length)list.append(node('p','لا توجد مرفقات محفوظة لهذا البلاغ.'));
  for(const doc of result.attachments){const row=node('div'),name=node('p',doc.filename),open=node('button','استرجاع المرفق');open.type='button';row.append(name,open);list.append(row);open.onclick=()=>run(async()=>{const saved=await api.download(doc.id);check();const url=URL.createObjectURL(saved.blob);urls.add(url);const link=node('a','فتح / تحميل الملف المحفوظ');link.href=url;link.download=saved.doc.filename;link.target='_blank';link.rel='noopener';open.replaceWith(link);message.textContent='تم استرجاع المرفق والتحقق من بصمته.';});}
  if(result.pending.length){
   list.append(node('h5','حجوزاتك غير المكتملة'),node('p','استأنف بالملف الأصلي نفسه، أو ألغِ الحجز مع ذكر السبب لتحرير مكانه. يُحفظ سجل الإلغاء وأي ملف وصل إلى التخزين دون حذف.'));
   for(const doc of result.pending){
    const row=node('div');row.append(node('p',doc.filename));list.append(row);
    if(!allowed){row.append(node('p','البلاغ مغلق؛ هذا الحجز محفوظ للقراءة فقط.'));continue;}
    const resumeLabel=node('label','استئناف رفع '+doc.filename+' — اختر الملف الأصلي'),original=node('input'),reasonLabel=node('label','سبب إلغاء حجز '+doc.filename),reason=node('input'),cancel=node('button','إلغاء الحجز وتوثيق السبب');
    original.type='file';original.accept=files.accept;reason.type='text';reason.maxLength=240;cancel.type='button';resumeLabel.append(original);reasonLabel.append(reason);row.append(resumeLabel,reasonLabel,cancel);
    original.onchange=()=>run(async()=>{const file=original.files?.[0];if(!file)return;await api.resume(doc.id,file);check();original.value='';await load();message.textContent='اكتمل استئناف المرفق والتحقق من الملف المحفوظ.';});
    cancel.onclick=()=>run(async()=>{const saved=await api.cancel(doc.id,reason.value);check();selection=[];files.value=camera.value='';await load();message.textContent='تم إلغاء الحجز وتوثيق السبب وإعادة قراءة السجل. لم يُحذف أي ملف. وقت الإلغاء: '+maintenanceCancellationAudit(saved).at;});
   }
  }
  if(result.cancelled.length){
   list.append(node('h5','سجل حجوزاتك الملغاة — أحدث ٥٠ حجزًا'));
   for(const doc of result.cancelled){const audit=maintenanceCancellationAudit(doc);list.append(node('p',audit.incomplete?doc.filename+' — حجز قديم ملغى؛ السبب والفاعل غير مسجلين. الوقت: '+audit.at:doc.filename+' — السبب: '+audit.reason+' — الفاعل: '+audit.by+' — الوقت: '+audit.at));}
  }
  message.textContent=allowed?'المرفقات خاصة بهذا البلاغ ومتاحة للحسابات المخولة فقط.':'يمكنك استرجاع المرفقات المحفوظة. إضافة مرفقات جديدة غير متاحة لهذا البلاغ.';
 }
 const choose=input=>{selection=Array.from(input.files||[]);if(selection.length>MAINTENANCE_ATTACHMENT_LIMIT){selection=[];input.value='';message.textContent='اختر حتى ٨ ملفات فقط.';}else message.textContent=selection.length?'الملفات المختارة جاهزة للرفع.':'';upload.disabled=!allowed||!selection.length;};
 files.onchange=()=>{camera.value='';choose(files);};camera.onchange=()=>{files.value='';choose(camera);};
 upload.onclick=()=>run(async()=>{
  if(!allowed||!selection.length)return;const chosen=[...selection];let saved=0;
  for(const file of chosen){message.textContent='جارٍ رفع المرفق '+(saved+1)+' من '+chosen.length+' والتحقق منه…';await api.upload(file);check();saved++;selection=selection.filter(item=>item!==file);}
  files.value=camera.value='';await load();message.textContent='تم حفظ '+saved+' مرفق وإعادة قراءة الملف والسجل والتحقق منهما.';
 });
 refresh.onclick=()=>run(load);await run(load);return {dispose,refresh:()=>run(load)};
}
