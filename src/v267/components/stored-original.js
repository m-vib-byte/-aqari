import {checksum} from './scan-image.js';

const extensions=Object.freeze({'application/pdf':'.pdf','image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/heic':'.heic','image/heif':'.heif','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'.docx'});
export const originalDocumentExtension=mime=>{const type=String(mime||'').split(';')[0].trim().toLowerCase();return Object.hasOwn(extensions,type)?extensions[type]:'';};

// Read immutable original bytes using the current workspace and saved metadata.
// Historical records without a checksum remain readable, with an explicit note.
export async function readStoredOriginal(session,{id,storagePath,entityType,entityRef}){
 session.check();
 if(typeof id!=='string'||!id||typeof storagePath!=='string'||!storagePath.startsWith(session.bound.workspace+'/')||storagePath.includes('..'))throw Error('تعذر تأكيد نطاق الملف الأصلي.');
 const row=await session.request(session.client.from('aqari_documents').select('id,workspace_id,status,entity_type,entity_ref,storage_bucket,storage_path,mime_type,size_bytes,checksum_sha256').eq('workspace_id',session.bound.workspace).eq('id',id).single());session.check();
 if(row?.id!==id||row.workspace_id!==session.bound.workspace||row.status!=='uploaded'||row.storage_path!==storagePath||(row.storage_bucket&&row.storage_bucket!=='aqari-documents')||(entityType!==undefined&&row.entity_type!==entityType)||(entityRef!==undefined&&row.entity_ref!==String(entityRef)))throw Error('لم يتأكد ارتباط الملف الأصلي بالسجل المحدد.');
 const savedHash=row.checksum_sha256;
 if(savedHash!==null&&savedHash!==undefined&&savedHash!==''&&(typeof savedHash!=='string'||!/^[a-f0-9]{64}$/i.test(savedHash)))throw Error('تعذر قراءة بصمة الملف المحفوظة. أعد التحقق من سجل المستند.');
 const blob=await session.storage('GET',row.storage_path);session.check();
 if(!(blob instanceof Blob))throw Error('تعذر قراءة بايتات الملف الأصلي.');
 if(row.size_bytes!==null&&row.size_bytes!==undefined){const size=Number(row.size_bytes);if(!Number.isSafeInteger(size)||size<0||blob.size!==size)throw Error('حجم الملف المسترجع لا يطابق الأصل المحفوظ. لم يتم عرض الملف.');}
 if(savedHash){const actual=await checksum(blob);session.check();if(actual!==savedHash.toLowerCase())throw Error('بصمة الملف المسترجع لا تطابق الأصل المحفوظ. لم يتم عرض الملف.');}
 session.check();return {blob,verified:Boolean(savedHash),note:savedHash?'تم استرجاع الملف الأصلي والتحقق من مطابقته للبصمة المحفوظة.':'هذا مستند قديم بلا بصمة محفوظة؛ عُرضت النسخة المسترجعة دون تأكيد مطابقتها للأصل.'};
}
