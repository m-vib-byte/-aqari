export const MAINTENANCE_TYPES=Object.freeze([
 ['general','عام'],['electrical','كهرباء'],['plumbing','سباكة'],['air_conditioning','تكييف'],['elevator','مصعد'],['fire_safety','إطفاء وسلامة'],['other','أخرى']
]);
const IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif']);
export const MAX_MAINTENANCE_PHOTOS=4;
export const MAX_MAINTENANCE_PHOTO_BYTES=10*1024*1024;

export function maintenanceTypeLabel(value){return MAINTENANCE_TYPES.find(([key])=>key===value)?.[1]||'أخرى';}
export function validateMaintenanceFiles(files){
 const list=[...(files||[])];
 if(list.length>MAX_MAINTENANCE_PHOTOS)throw Error('الحد الأقصى أربع صور لكل طلب.');
 for(const file of list){
  if(!file?.size||file.size>MAX_MAINTENANCE_PHOTO_BYTES)throw Error('كل صورة يجب أن تكون بحجم لا يتجاوز ١٠ ميجابايت.');
  if(!IMAGE_TYPES.has(file.type))throw Error('ارفع صور JPEG أو PNG أو WebP أو HEIC فقط.');
 }
 return list;
}
async function sha256(file){
 const bytes=await file.arrayBuffer();
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function uploadMaintenanceFiles({client,workspaceId,requestId,files,check}){
 const list=validateMaintenanceFiles(files),saved=[];
 for(const file of list){
  check?.();
  const {data:reserved,error:reserveError}=await client.rpc('aqari_maintenance_attachment_reserve',{
   p_workspace_id:workspaceId,p_request_id:requestId,p_original_filename:file.name||'maintenance-photo',p_mime_type:file.type
  });
  if(reserveError)throw reserveError;
  const row=Array.isArray(reserved)?reserved[0]:reserved;
  if(!row?.attachment_id||!row.storage_path||row.storage_bucket!=='aqari-documents')throw Error('تعذر حجز مرفق الصيانة.');
  const {error:uploadError}=await client.storage.from(row.storage_bucket).upload(row.storage_path,file,{contentType:file.type,upsert:false});
  if(uploadError)throw uploadError;
  check?.();
  const checksum=await sha256(file);check?.();
  const {data:finalized,error:finalizeError}=await client.rpc('aqari_maintenance_attachment_finalize',{
   p_attachment_id:row.attachment_id,p_size_bytes:file.size,p_checksum:checksum
  });
  if(finalizeError||finalized!==row.attachment_id)throw finalizeError||Error('تعذر تأكيد مرفق الصيانة.');
  saved.push({id:row.attachment_id,path:row.storage_path,checksum});
 }
 return saved;
}
