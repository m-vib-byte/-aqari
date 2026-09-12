import {createVerifiedUpload} from './verified-upload.js';
import {checksum} from './scan-image.js';

export const MAINTENANCE_BUCKET='aqari-maintenance-private';
export const MAINTENANCE_FILE_LIMIT=10*1024*1024;
export const MAINTENANCE_ATTACHMENT_LIMIT=8;
const CANCEL_REASON='user_cancelled_incomplete_upload';
export async function validateMaintenanceAttachment(file){
 if(!file||!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)||file.size<=0||file.size>MAINTENANCE_FILE_LIMIT)throw Error('اختر صورة JPEG أو PNG أو WebP أو PDF، بحجم أقصى ١٠ ميجابايت للملف.');
 const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer()),ascii=(a,b)=>String.fromCharCode(...bytes.slice(a,b));
 const valid=file.type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:file.type==='image/png'?[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v):file.type==='image/webp'?ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP':ascii(0,5)==='%PDF-';
 if(!valid)throw Error('محتوى الملف لا يطابق نوعه. اختر صورة أو مستنداً صالحاً.');
}

// The caller supplies an authenticated, bounded session. No signed/public URLs,
// local storage, service credentials, overwrites or direct table grants are used.
export function createMaintenanceAttachments({workspaceId,requestId,userId,check,rpc,storage}){
 const pending=new WeakMap(),pendingById=new Map();
 async function call(action,data={}){check();const result=await rpc('aqari_maintenance_attachments',{p_workspace_id:workspaceId,p_request_id:requestId,p_action:action,p_data:data});check();return result;}
 function match(doc){
  if(!doc?.id||doc.workspace_id!==workspaceId||doc.request_id!==requestId||doc.storage_bucket!==MAINTENANCE_BUCKET||doc.storage_path!==workspaceId+'/'+requestId+'/'+doc.id||!['reserved','uploaded'].includes(doc.status)||!['image/jpeg','image/png','image/webp','application/pdf'].includes(doc.mime_type)||!Number.isInteger(doc.size_bytes)||doc.size_bytes<=0||doc.size_bytes>MAINTENANCE_FILE_LIMIT||!/^[a-f0-9]{64}$/.test(doc.checksum_sha256)||typeof doc.filename!=='string')throw Error('لم يتأكد ارتباط المرفق بهذا البلاغ.');
  return doc;
 }
 async function list(){
  const result=await call('list'),pendingReservations=Array.isArray(result?.pending_reservations)?result.pending_reservations:[];
  if(!result||!Array.isArray(result.attachments)||typeof result.can_upload!=='boolean'||result.attachments.length+pendingReservations.length>MAINTENANCE_ATTACHMENT_LIMIT)throw Error('تعذر تأكيد قائمة مرفقات البلاغ.');
  const ids=new Set();
  for(const doc of result.attachments){match(doc);if(doc.status!=='uploaded'||ids.has(doc.id))throw Error('تعذر تأكيد قائمة مرفقات البلاغ.');ids.add(doc.id);}
  for(const doc of pendingReservations){match(doc);if(doc.status!=='reserved'||doc.created_by!==userId||ids.has(doc.id))throw Error('تعذر تأكيد الحجوزات غير المكتملة.');ids.add(doc.id);}
  return {...result,pending_reservations:pendingReservations};
 }
 async function cancel(id){
  if(typeof id!=='string'||!id)throw Error('تعذر تحديد الحجز غير المكتمل.');
  const before=(await list()).pending_reservations.find(doc=>doc.id===id);if(!before)throw Error('الحجز غير المكتمل غير متاح للإلغاء.');
  const result=await call('cancel',{id,reason:CANCEL_REASON});
  if(result?.id!==id||result?.status!=='cancelled'||result?.cancelled_by!==userId||result?.cancel_reason!==CANCEL_REASON||typeof result?.cancelled_at!=='string')throw Error('لم يتأكد توثيق إلغاء الحجز غير المكتمل.');
  const file=pendingById.get(id);if(file){pending.delete(file);pendingById.delete(id);}
  const after=await list();if(after.pending_reservations.some(doc=>doc.id===id)||after.attachments.some(doc=>doc.id===id))throw Error('لم يتأكد تحرير مساحة المرفقات.');
  return result;
 }
 async function upload(file){
  check();await validateMaintenanceAttachment(file);check();
  let entry=pending.get(file);
  if(!entry){entry={id:crypto.randomUUID(),hash:await checksum(file)};check();pending.set(file,entry);}
  if(!entry.doc){
   const doc=match(await call('reserve',{id:entry.id,filename:file.name||'maintenance-photo.jpg',mime_type:file.type,size_bytes:file.size,checksum_sha256:entry.hash}));
   if((doc.id!==entry.id&&doc.reservation_reused!==true)||doc.created_by!==userId||doc.filename!==(file.name||'maintenance-photo.jpg')||doc.mime_type!==file.type||doc.size_bytes!==file.size||doc.checksum_sha256!==entry.hash)throw Error('تعذر تأكيد حجز المرفق.');
   entry.id=doc.id;entry.doc=doc;pendingById.set(doc.id,file);entry.verify=createVerifiedUpload({check,storage},{path:doc.storage_path,blob:file,bucket:MAINTENANCE_BUCKET,readFirst:doc.reservation_reused===true||doc.status==='uploaded'});
  }
  const hash=await entry.verify();check();
  const finalized=match(await call('finalize',{id:entry.id,checksum_sha256:hash}));
  if(finalized.id!==entry.id||finalized.status!=='uploaded'||finalized.created_by!==userId||finalized.checksum_sha256!==hash)throw Error('لم يتأكد حفظ المرفق.');
  const saved=(await list()).attachments.find(doc=>doc.id===entry.id);
  if(!saved||saved.created_by!==userId||saved.filename!==entry.doc.filename||saved.mime_type!==file.type||saved.size_bytes!==file.size||saved.checksum_sha256!==hash)throw Error('لم تتأكد إعادة قراءة المرفق المحفوظ.');
  pendingById.delete(entry.id);pending.delete(file);return saved;
 }
 async function download(id){
  const doc=(await list()).attachments.find(item=>item.id===id);if(!doc)throw Error('المرفق غير متاح لهذا البلاغ.');
  const blob=await storage('GET',doc.storage_path,undefined,MAINTENANCE_BUCKET);check();
  if(blob?.size!==doc.size_bytes||await checksum(blob)!==doc.checksum_sha256)throw Error('لم تتطابق بصمة الملف المسترجع.');
  check();return {doc,blob};
 }
 return {list,cancel,upload,download};
}
