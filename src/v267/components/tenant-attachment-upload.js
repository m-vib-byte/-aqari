import {createVerifiedUpload} from './verified-upload.js';

// Reservations live for the open tenant form, including failed confirmations.
export function createTenantAttachmentUploader({getClient,check,bounded,workspaceId,userId}){
 const pending=new WeakMap();
 const request=async task=>{
  check();const result=await bounded(task);check();
  if(result.error){const error=Error(result.error.message||'تعذر تأكيد المرفق.');error.status=Number(result.error.status??result.error.statusCode)||undefined;error.code=result.error.code;throw error;}
  return result.data;
 };
 return async function upload(file,kind,tenantId){
  const types=['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  if(!types.includes(file.type)||file.size<=0||file.size>25*1024*1024)throw Error('المرفق يجب أن يكون صورة أو PDF أو Word وألا يتجاوز ٢٥ ميجابايت.');
  check();const client=await getClient();check();
  let entries=pending.get(file);if(!entries){entries=new Map();pending.set(file,entries);}
  const key=JSON.stringify([tenantId,kind]);let entry=entries.get(key);
  if(!entry){
   const reserved=await request(()=>client.rpc('aqari_reserve_document',{p_workspace_id:workspaceId,p_document_type:'tenant_attachment',p_entity_type:'tenant',p_entity_ref:tenantId,p_title:kind,p_original_filename:file.name,p_mime_type:file.type,p_metadata:{release:'V267',tenantProfileId:tenantId,attachmentKind:kind}}));
   const doc=Array.isArray(reserved)?reserved[0]:reserved;
   if(!doc?.document_id||doc.storage_bucket!=='aqari-documents'||typeof doc.storage_path!=='string'||!doc.storage_path.startsWith(workspaceId+'/'))throw Error('تعذر حجز المرفق.');
   const session={check,storage:(method,path,blob,bucket)=>request(()=>method==='POST'?client.storage.from(bucket).upload(path,blob,{contentType:blob.type,upsert:false}):client.storage.from(bucket).download(path))};
   entry={doc,upload:createVerifiedUpload(session,{path:doc.storage_path,blob:file,bucket:doc.storage_bucket})};entries.set(key,entry);
  }
  const {doc}=entry,hash=await entry.upload();check();
  await request(()=>client.rpc('aqari_finalize_document',{p_document_id:doc.document_id,p_size_bytes:file.size,p_mime_type:file.type,p_checksum:hash}));
  const saved=await request(()=>client.from('aqari_documents').select('id,status,workspace_id,entity_type,entity_ref,created_by,document_type,storage_bucket,storage_path,checksum_sha256,metadata').eq('workspace_id',workspaceId).eq('id',doc.document_id).single());
  if(saved?.id!==doc.document_id||saved.status!=='uploaded'||saved.workspace_id!==workspaceId||saved.entity_type!=='tenant'||saved.entity_ref!==tenantId||saved.created_by!==userId||saved.document_type!=='tenant_attachment'||saved.storage_bucket!==doc.storage_bucket||saved.storage_path!==doc.storage_path||saved.checksum_sha256!==hash||saved.metadata?.tenantProfileId!==tenantId||saved.metadata?.attachmentKind!==kind)throw Error('لم تتأكد إعادة قراءة سجل المرفق.');
  return {id:doc.document_id,bucket:doc.storage_bucket,path:doc.storage_path,name:file.name,kind,size:file.size};
 };
}
