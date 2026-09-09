import {checksum} from './scan-image.js';

// Per-dialog, immutable upload reservation. A timeout is retried by reading the same object.
export function createPaymentProof(session){
 let pending;
 return async function saveProof(file,target){
  if(!file||file.size<1||file.size>10*1024*1024)throw Error('اختر صورة أو PDF بحجم لا يتجاوز ١٠ ميجابايت.');
  const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
  const mime=bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46?'application/pdf':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71?'image/png':String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'?'image/webp':null;
  if(!mime)throw Error('صيغة الملف غير مدعومة. اختر صورة JPEG أو PNG أو WebP أو ملف PDF.');
  const blob=file.slice(0,file.size,mime),hash=await checksum(blob),key=JSON.stringify({...target,hash});session.check();
  if(!pending||pending.key!==key){
   const rows=await session.request(session.client.rpc('aqari_reserve_document',{p_workspace_id:session.bound.workspace,p_document_type:'property_document',p_entity_type:'property',p_entity_ref:target.propertyRef,p_title:'إثبات دفع فاتورة '+target.invoice,p_original_filename:file.name,p_mime_type:mime,p_metadata:{utility_entry_id:target.entryId,meter_id:target.meterId,release:'V267'}}));
   const doc=Array.isArray(rows)?rows[0]:rows;
   if(!doc?.document_id||doc.storage_bucket!=='aqari-documents')throw Error('تعذر حجز إثبات الدفع.');
   pending={key,doc,attempted:false};
  }
  let stored;
  if(pending.attempted){
   try{stored=await session.storage('GET',pending.doc.storage_path);}
   catch(error){if(error.status!==404)throw error;}
  }
  if(!stored){
   pending.attempted=true;
   try{await session.storage('POST',pending.doc.storage_path,blob);}
   catch(error){
    // Read after an uncertain upload before considering another insert-only POST.
    try{stored=await session.storage('GET',pending.doc.storage_path);}
    catch{throw error;}
   }
   if(!stored)stored=await session.storage('GET',pending.doc.storage_path);
  }
  if(stored.size!==blob.size||await checksum(stored)!==hash)throw Error('لم تتطابق نسخة إثبات الدفع بعد استرجاعها.');
  await session.request(session.client.rpc('aqari_finalize_document',{p_document_id:pending.doc.document_id,p_size_bytes:blob.size,p_mime_type:mime,p_checksum:hash}));
  const verified=await session.request(session.client.from('aqari_documents').select('id,status,checksum_sha256').eq('workspace_id',session.bound.workspace).eq('id',pending.doc.document_id).single());
  if(verified.status!=='uploaded'||verified.checksum_sha256!==hash)throw Error('لم يتأكد حفظ إثبات الدفع.');
  return verified.id;
 };
}
