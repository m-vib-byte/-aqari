import {createMaintenanceAttachments,MAINTENANCE_ATTACHMENT_LIMIT} from './maintenance-attachments.js';

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
 const errors={ATTACHMENT_LIMIT_REACHED:'بلغ البلاغ الحد الأقصى: ٨ مرفقات. تخلَّ عن الحجز غير المكتمل إذا فُقد الملف الأصلي، أو أعد اختيار الملف نفسه لإكماله.',INVALID_ATTACHMENT:'راجع نوع الملف واسمه وحجمه. المسموح صور JPEG أو PNG أو WebP أو PDF حتى ١٠ ميجابايت.',ATTACHMENT_RESERVATION_CONFLICT:'تغير الملف عن النسخة التي حُجزت له. اختر النسخة الأصلية وأعد المحاولة.',STORED_FILE_NOT_CONFIRMED:'لم يتأكد اكتمال الملف في التخزين. احتُفظ بالاختيار لإعادة المحاولة والتحقق.',ATTACHMENT_ALREADY_UPLOADED:'المرفق محفوظ نهائيًا ولا يمكن التخلي عن أصله.',ATTACHMENT_OBJECT_PRESENT:'يوجد ملف محفوظ لهذا الحجز؛ لا يمكن التخلي عنه قبل حسم حالة الملف.',INVALID_ABANDON_REASON:'تعذر تسجيل سبب التخلي عن الحجز.'};
 function dispose(){closed=true;selection=[];files.value=camera.value='';clearUrls();container.replaceChildren();}
 options.onDispose(dispose);
 function lock(value){busy=value;for(const control of container.querySelectorAll('button,input'))control.disabled=value;if(!value)upload.disabled=!allowed||!selection.length;}
 async function run(work){if(busy||closed)return;lock(true);try{check();await work();check();}catch(error){if(!closed){if([401,403].includes(error.status)||error.code==='42501'||error.message==='ACCESS_DENIED'){dispose();return;}try{check();message.textContent=errors[error.message]||(/^[\u0600-\u06ff]/.test(error.message||'')?error.message:'تعذر تأكيد العملية. حدّث المرفقات قبل المحاولة مجددًا.');}catch{dispose();}}}finally{if(!closed)lock(false);}}
 async function load(){
  const result=await api.list();check();allowed=result.can_upload;label.hidden=cameraLabel.hidden=upload.hidden=!allowed;clearUrls();list.replaceChildren();
  if(!result.attachments.length)list.append(node('p','لا توجد مرفقات محفوظة لهذا البلاغ.'));
  for(const doc of result.attachments){const row=node('div'),name=node('p',doc.filename),open=node('button','استرجاع المرفق');open.type='button';row.append(name,open);list.append(row);open.onclick=()=>run(async()=>{const saved=await api.download(doc.id);check();const url=URL.createObjectURL(saved.blob);urls.add(url);const link=node('a','فتح / تحميل الملف المحفوظ');link.href=url;link.download=saved.doc.filename;link.target='_blank';link.rel='noopener';open.replaceWith(link);message.textContent='تم استرجاع المرفق والتحقق من بصمته.';});}
  if(result.pending_reservations.length){
   const heading=node('h5','حجوزات رفع غير مكتملة');list.append(heading);
   for(const doc of result.pending_reservations){const row=node('div'),name=node('p',doc.filename),abandon=node('button','التخلي عن الحجز غير المكتمل');abandon.type='button';row.append(name,abandon);list.append(row);abandon.onclick=()=>run(async()=>{await api.abandon(doc.id,'تعذر استكمال رفع الملف الأصلي وتم تحرير الحجز من واجهة الصيانة.');check();await load();message.textContent='تم أرشفة الحجز غير المكتمل وتحرير مساحة المرفقات دون حذف أي ملف محفوظ نهائيًا.';});}
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
