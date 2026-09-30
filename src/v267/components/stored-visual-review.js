import {appendPdfViewer} from './pdf-viewer.js';
import {createPrivateUrls} from './private-urls.js';
import {node,field} from './dialog.js';
import {checksum} from './scan-image.js';

const DOCX_MIME='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const IMAGE_MIMES=new Set(['image/jpeg','image/png','image/webp']);

function stableBlob(blob,mime){
 if(!(blob instanceof Blob))throw Error('تعذر استرجاع بايتات النسخة المرفوعة من التخزين الخاص.');
 return blob.type===mime?blob:new Blob([blob],{type:mime});
}

export function createStoredVisualReview(dialog,{parent,controls=[]}={}){
 const {session,body}=dialog,urls=createPrivateUrls(dialog),box=node('section'),notice=node('p'),viewer=node('div');
 const confirmed=node('input'),confirmField=field('راجعت النسخة المرفوعة فعلياً وجميع صفحاتها وأؤكد وضوح النصوص والصور وعدم فقدان الجودة.',confirmed);
 const confirm=node('button','اعتماد النسخة المرفوعة وإقفال المستند'),abort=node('button','إغلاق المراجعة دون اعتماد');
 confirmed.type='checkbox';box.hidden=true;box.className='aq267-stored-visual-review';notice.setAttribute('role','status');
 box.append(node('h3','مراجعة الجودة من النسخة المرفوعة فعلياً'),notice,viewer,confirmField,confirm,abort);parent.append(box);
 let rejectActive=null,priorDisabled=null,priorBodyInert=null,reviewUrl=null,docxOpened=false;

 function lock(){
  priorDisabled=new Map();
  for(const control of controls){if(!control||!('disabled' in control)||priorDisabled.has(control))continue;priorDisabled.set(control,control.disabled);control.disabled=true;}
 }
 function enableReviewInteraction(){
  if(body&&priorBodyInert===null){priorBodyInert=body.inert;body.inert=false;}
 }
 function unlock(){
  if(priorDisabled){for(const [control,disabled]of priorDisabled)control.disabled=disabled;priorDisabled=null;}
  if(body&&priorBodyInert!==null){body.inert=priorBodyInert;priorBodyInert=null;}
 }
 function clear(){
  rejectActive=null;confirmed.checked=false;docxOpened=false;viewer.replaceChildren();notice.textContent='';box.hidden=true;
  if(reviewUrl){urls.release(reviewUrl);reviewUrl=null;}unlock();
 }
 async function fetchVerified(doc,expectedHash,expectedSize,mime){
  const downloaded=stableBlob(await session.storage('GET',doc.storage_path),mime);session.check();
  if(downloaded.size!==expectedSize)throw Error('حجم النسخة المسترجعة من التخزين لا يطابق الملف الذي تم رفعه.');
  const storedHash=await checksum(downloaded);session.check();
  if(storedHash!==expectedHash)throw Error('بصمة النسخة المسترجعة من التخزين لا تطابق الملف الذي تم رفعه.');
  return {downloaded,storedHash};
 }
 function renderStored(downloaded,target){
  viewer.replaceChildren();if(reviewUrl)urls.release(reviewUrl);reviewUrl=urls.create(downloaded);
  notice.textContent='هذه المعاينة من النسخة التي أُعيد تنزيلها من Storage الخاص بعد مطابقة الحجم وSHA-256. راجع جميع الصفحات قبل الإقفال.';
  if(IMAGE_MIMES.has(target.mime)){
   const image=node('img');image.src=reviewUrl;image.alt='النسخة المرفوعة فعلياً بعد استرجاعها من التخزين';viewer.append(image);return;
  }
  if(target.mime==='application/pdf'){
   appendPdfViewer(viewer,reviewUrl,{title:'مراجعة PDF المرفوع فعلياً',filename:target.name||'document.pdf'});return;
  }
  const link=node('a','فتح أو تنزيل النسخة المرفوعة فعلياً للمراجعة');link.href=reviewUrl;link.download=target.name||'document.docx';
  link.onclick=()=>{docxOpened=true;notice.textContent='تم فتح/تنزيل نسخة DOCX المسترجعة من Storage. راجعها ثم فعّل تأكيد الجودة.';};viewer.append(link);
 }
 async function review({doc,target,expectedHash,expectedSize}){
  if(rejectActive)throw Error('توجد مراجعة جودة معلقة لمستند مرفوع.');
  lock();box.hidden=false;confirmed.checked=false;docxOpened=false;
  try{
   const first=await fetchVerified(doc,expectedHash,expectedSize,target.mime);renderStored(first.downloaded,target);
   return await new Promise((resolve,reject)=>{
    rejectActive=reject;
    confirm.onclick=async()=>{
     if(!confirmed.checked){notice.textContent='يجب تأكيد مراجعة النسخة المرفوعة فعلياً وجميع صفحاتها قبل الإقفال.';return;}
     if(target.mime===DOCX_MIME&&!docxOpened){notice.textContent='افتح أو نزّل نسخة DOCX المسترجعة من Storage وراجعها قبل الإقفال.';return;}
     confirm.disabled=true;abort.disabled=true;if(body)body.inert=true;
     try{
      const second=await fetchVerified(doc,expectedHash,expectedSize,target.mime);
      clear();resolve({hash:second.storedHash,size:second.downloaded.size});
     }catch(error){clear();reject(error);}
     finally{confirm.disabled=false;abort.disabled=false;}
    };
    abort.onclick=()=>{const error=Error('أُغلقت مراجعة الجودة دون اعتماد. بقي المستند غير مقفل.');clear();reject(error);};
    // dialog.run keeps the body inert while an async task owns the dialog.
    // This review intentionally waits for a user decision, so temporarily
    // release the body only after the verified stored copy is rendered.
    // Scanner actions remain serialized by scannerBusy and the passed
    // business controls stay disabled until review completion.
    confirmed.disabled=false;confirm.disabled=false;abort.disabled=false;enableReviewInteraction();
   });
  }catch(error){clear();throw error;}
 }
 dialog.onDispose(()=>{if(rejectActive){const reject=rejectActive;clear();reject(Error('أُغلقت نافذة المستند قبل اعتماد النسخة المرفوعة.'));}else clear();});
 return {review};
}
