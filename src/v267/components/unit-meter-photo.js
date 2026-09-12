import {MAX_SOURCE_BYTES,checksum,decodeImage,renderScan} from './scan-image.js';
import {createVerifiedUpload} from './verified-upload.js';

// The original file stays in memory only; private stored bytes are decoded JPEG.
export function createUnitMeterPhoto(session){
 let pending;
 return async(file,target)=>{
  if(!file||file.size<1||file.size>MAX_SOURCE_BYTES)throw Error('اختر صورة بحجم لا يتجاوز ٢٥ ميجابايت.');
  const key=JSON.stringify({...target,sourceHash:await checksum(file)});session.check();
  if(!pending||pending.key!==key){
   const decoded=await decodeImage(file),blob=await renderScan(decoded,0,{top:0,bottom:0,left:0,right:0}),hash=await checksum(blob);
   const rows=await session.request(session.client.rpc('aqari_reserve_document',{p_workspace_id:session.bound.workspace,p_document_type:'property_document',p_entity_type:'property',p_entity_ref:target.propertyRef,p_title:'صورة قراءة عداد الوحدة',p_original_filename:file.name,p_mime_type:'image/jpeg',p_metadata:{unit_meter_reading_id:target.readingId,meter_id:target.meterId,lease_id:target.leaseId,category:'meter_reading',release:'V267'}}));
   const doc=Array.isArray(rows)?rows[0]:rows;
   if(!doc?.document_id||doc.storage_bucket!=='aqari-documents')throw Error('تعذر حجز صورة العداد.');
   pending={key,doc,blob,hash,upload:createVerifiedUpload(session,{path:doc.storage_path,blob})};
  }
  const {doc,blob,hash}=pending;await pending.upload();
  await session.request(session.client.rpc('aqari_finalize_document',{p_document_id:doc.document_id,p_size_bytes:blob.size,p_mime_type:blob.type,p_checksum:hash}));
  const saved=await session.request(session.client.from('aqari_documents').select('id,status,checksum_sha256').eq('workspace_id',session.bound.workspace).eq('id',doc.document_id).single());
  if(saved?.id!==doc.document_id||saved.status!=='uploaded'||saved.checksum_sha256!==hash)throw Error('لم يتأكد حفظ صورة العداد.');
  return doc.document_id;
 };
}
