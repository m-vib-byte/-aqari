import {createVerifiedUpload} from './verified-upload.js';
import {checksum} from './scan-image.js';

export const MAINTENANCE_BUCKET='aqari-maintenance-private';
export const MAINTENANCE_FILE_LIMIT=10*1024*1024;
export const MAINTENANCE_ATTACHMENT_LIMIT=8;
export function maintenanceCancellationAudit(doc){return doc.status==='abandoned'?{by:doc.abandoned_by,at:doc.abandoned_at,reason:doc.abandon_reason,incomplete:false}:{by:doc.cancelled_by,at:doc.cancelled_at,reason:doc.cancel_reason,incomplete:doc.audit_incomplete===true};}
export async function validateMaintenanceAttachment(file){
 if(!file||!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)||file.size<=0||file.size>MAINTENANCE_FILE_LIMIT)throw Error('اختر صورة JPEG أو PNG أو WebP أو PDF، بحجم أقصى ١٠ ميجابايت للملف.');
 const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer()),ascii=(a,b)=>String.fromCharCode(...bytes.slice(a,b));
 const valid=file.type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:file.type==='image/png'?[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v):file.type==='image/webp'?ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP':ascii(0,5)==='%PDF-';
 if(!valid)throw Error('محتوى الملف لا يطابق نوعه. اختر صورة أو مستنداً صالحاً.');
}

// The caller supplies an authenticated, bounded session. No signed/public URLs,
// local storage, service credentials, overwrites or direct table grants are used.
export function createMaintenanceAttachments({workspaceId,requestId,userId,check,rpc,storage}){
 const pending=new WeakMap(),cancelledIds=new Set();
 async function call(action,data={}){check();const result=await rpc('aqari_maintenance_attachments',{p_workspace_id:workspaceId,p_request_id:requestId,p_action:action,p_data:data});check();return result;}
 function match(doc,statuses=['reserved','uploaded']){
  if(!doc?.id||doc.workspace_id!==workspaceId||doc.request_id!==requestId||doc.storage_bucket!==MAINTENANCE_BUCKET||doc.storage_path!==workspaceId+'/'+requestId+'/'+doc.id||!statuses.includes(doc.status)||!['image/jpeg','image/png','image/webp','application/pdf'].includes(doc.mime_type)||!Number.isInteger(doc.size_bytes)||doc.size_bytes<=0||doc.size_bytes>MAINTENANCE_FILE_LIMIT||!/^[a-f0-9]{64}$/.test(doc.checksum_sha256)||typeof doc.filename!=='string')throw Error('لم يتأكد ارتباط المرفق بهذا البلاغ.');
  if(['abandoned','cancelled'].includes(doc.status)){
   const audit=maintenanceCancellationAudit(doc);
   if(doc.created_by!==userId||typeof audit.at!=='string'||!Number.isFinite(Date.parse(audit.at)))throw Error('لم يتأكد سجل إلغاء الحجز.');
   if(audit.incomplete){if(doc.status!=='cancelled'||audit.by!=null||audit.reason!=null)throw Error('لم يتأكد توثيق الحجز القديم.');}
   else if(typeof audit.by!=='string'||!audit.by||typeof audit.reason!=='string'||audit.reason.trim().length<6||audit.reason.length>240)throw Error('لم يتأكد سجل إلغاء الحجز.');
  }
  return doc;
 }
 async function list(){
  const result=await call('list');if(!result||!Array.isArray(result.attachments)||typeof result.can_upload!=='boolean'||result.attachments.length>MAINTENANCE_ATTACHMENT_LIMIT)throw Error('تعذر تأكيد قائمة مرفقات البلاغ.');
  const ownPending=result.pending??result.pending_reservations??[],normalized={...result,pending:ownPending};
  const ids=new Set();for(const [key,statuses,limit] of [['attachments',['uploaded'],8],['pending',['reserved'],8],['cancelled',['abandoned','cancelled'],50]]){
   const rows=normalized[key]??[];if(!Array.isArray(rows)||rows.length>limit)throw Error('تعذر تأكيد قائمة مرفقات البلاغ.');
   for(const doc of rows){match(doc,statuses);if(ids.has(doc.id)||(key!=='attachments'&&doc.created_by!==userId))throw Error('تعذر تأكيد قائمة مرفقات البلاغ.');ids.add(doc.id);if(['abandoned','cancelled'].includes(doc.status))cancelledIds.add(doc.id);}
  }
  if(result.attachments.length+ownPending.length>MAINTENANCE_ATTACHMENT_LIMIT)throw Error('تعذر تأكيد قائمة مرفقات البلاغ.');
  return {...result,pending:ownPending,pending_reservations:ownPending,cancelled:result.cancelled??[]};
 }
 async function upload(file){
  check();await validateMaintenanceAttachment(file);check();
  let entry=pending.get(file);
  if(entry&&cancelledIds.has(entry.id))throw Error('ATTACHMENT_CANCELLED');
  if(!entry){entry={id:crypto.randomUUID(),hash:await checksum(file)};check();pending.set(file,entry);}
  if(!entry.doc){
   const doc=match(await call('reserve',{id:entry.id,filename:file.name||'maintenance-photo.jpg',mime_type:file.type,size_bytes:file.size,checksum_sha256:entry.hash}));
   if((doc.id!==entry.id&&doc.reservation_reused!==true)||doc.created_by!==userId||doc.filename!==(file.name||'maintenance-photo.jpg')||doc.mime_type!==file.type||doc.size_bytes!==file.size||doc.checksum_sha256!==entry.hash)throw Error('تعذر تأكيد حجز المرفق.');
   entry.id=doc.id;entry.doc=doc;entry.verify=createVerifiedUpload({check,storage},{path:doc.storage_path,blob:file,bucket:MAINTENANCE_BUCKET,readFirst:doc.reservation_reused===true||doc.status==='uploaded'});
  }
  const hash=await entry.verify();check();
  const finalized=match(await call('finalize',{id:entry.id,checksum_sha256:hash}));
  if(finalized.id!==entry.id||finalized.status!=='uploaded'||finalized.created_by!==userId||finalized.checksum_sha256!==hash)throw Error('لم يتأكد حفظ المرفق.');
  const saved=(await list()).attachments.find(doc=>doc.id===entry.id);
  if(!saved||saved.created_by!==userId||saved.filename!==entry.doc.filename||saved.mime_type!==file.type||saved.size_bytes!==file.size||saved.checksum_sha256!==hash)throw Error('لم تتأكد إعادة قراءة المرفق المحفوظ.');
  return saved;
 }
 async function download(id){
  const doc=(await list()).attachments.find(item=>item.id===id);if(!doc)throw Error('المرفق غير متاح لهذا البلاغ.');
  const blob=await storage('GET',doc.storage_path,undefined,MAINTENANCE_BUCKET);check();
  if(blob?.size!==doc.size_bytes||await checksum(blob)!==doc.checksum_sha256)throw Error('لم تتطابق بصمة الملف المسترجع.');
  check();return {doc,blob};
 }
 async function inspect(id){const doc=match(await call('inspect',{id}),['reserved','uploaded','abandoned','cancelled']);if(doc.id!==id||doc.created_by!==userId)throw Error('لم يتأكد سجل الحجز.');return doc;}
 async function resume(id,file){
  const snapshot=await list(),doc=snapshot.pending.find(item=>item.id===id);
  if(!snapshot.can_upload||!doc)throw Error('الحجز غير متاح للاستئناف.');
  await validateMaintenanceAttachment(file);const hash=await checksum(file);check();
  if(doc.filename!==(file.name||'maintenance-photo.jpg')||doc.mime_type!==file.type||doc.size_bytes!==file.size||doc.checksum_sha256!==hash)throw Error('اختر الملف الأصلي نفسه لاستئناف هذا الحجز.');
  pending.set(file,{id:doc.id,hash});return upload(file);
 }
 async function cancel(id,reason){
  if(typeof id!=='string'||!id)throw Error('تعذر تحديد الحجز غير المكتمل.');
  const why=String(reason??'').trim();if(why.length<6||why.length>240||/[\u0000-\u001f\u007f]/.test(why))throw Error('اكتب سبب إلغاء الحجز من ٦ إلى ٢٤٠ حرف.');
  let reply;
  try{reply=match(await call('cancel',{id,reason:why}),['cancelled','abandoned']);}
  catch(error){
   if([401,403].includes(error.status)||error.code==='42501'||error.message==='ACCESS_DENIED')throw error;
   // A lost mutation reply is resolved through a separate authorized read. Do
   // not send a second cancellation or claim success for a different reason.
   const found=await inspect(id);if(!['abandoned','cancelled'].includes(found.status)||maintenanceCancellationAudit(found).reason!==why)throw error;reply=found;
  }
  const audit=maintenanceCancellationAudit(reply);
  if(reply.id!==id||reply.created_by!==userId||audit.by!==userId||audit.reason!==why||audit.incomplete)throw Error('لم يتأكد سجل إلغاء الحجز.');
  const saved=await inspect(id),savedAudit=maintenanceCancellationAudit(saved);
  if(saved.status!==reply.status||savedAudit.incomplete||savedAudit.reason!==why||savedAudit.at!==audit.at||savedAudit.by!==audit.by||['filename','mime_type','size_bytes','checksum_sha256','storage_bucket','storage_path'].some(key=>saved[key]!==reply[key]))throw Error('لم تتأكد إعادة قراءة إلغاء الحجز.');
  const snapshot=await list();if(snapshot.pending.some(doc=>doc.id===id)||snapshot.attachments.some(doc=>doc.id===id))throw Error('لم تتأكد إعادة قراءة إلغاء الحجز.');
  cancelledIds.add(id);return saved;
 }
 return {list,upload,download,resume,cancel};
}
