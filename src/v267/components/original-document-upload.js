import {checksum} from './scan-image.js';
import {createVerifiedUpload} from './verified-upload.js';
import {documentCategory} from './document-catalog.js';
const PROPERTY_ASSETS=Object.freeze({
 property_logo:{documentType:'supporting_document',label:'شعار العقار'},
 property_photo:{documentType:'supporting_document',label:'صورة العقار'},
 property_other:{documentType:'supporting_document',label:'مستند عام للعقار'}
});
function uploadCategory(category,entity){
 const asset=PROPERTY_ASSETS[category];
 if(asset){if(entity!=='property')throw Error('فئة مرفق العقار لا تستخدم مع سجل آخر.');return asset;}
 return documentCategory(category,entity);
}
export async function originalDocument(file){
 if(!file||file.size<1||file.size>10*1024*1024)throw Error('اختر صورة أو PDF بحجم لا يتجاوز ١٠ ميجابايت.');
 const b=new Uint8Array(await file.slice(0,12).arrayBuffer());
 const mime=b[0]===37&&b[1]===80&&b[2]===68&&b[3]===70&&b[4]===45?'application/pdf':b[0]===255&&b[1]===216&&b[2]===255?'image/jpeg':b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71&&b[4]===13&&b[5]===10&&b[6]===26&&b[7]===10?'image/png':String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP'?'image/webp':null;
 if(!mime)throw Error('صيغة الملف غير مدعومة. اختر صورة JPEG أو PNG أو WebP أو ملف PDF.');
 return file.slice(0,file.size,mime);
}
export function createOriginalDocumentUpload(session){
 let pending=null;
 return async(file,target)=>{
  const spec=uploadCategory(target.category,target.type);if(!target.ref||!target.title?.trim()||target.title.length>180)throw Error('حدد السجل وعنوان المستند.');
  const blob=await originalDocument(file),hash=await checksum(blob);session.check();
  if(target.category==='property_logo'||target.category==='property_photo'){
   if(!['image/jpeg','image/png','image/webp'].includes(blob.type))throw Error('شعار وصور العقار يجب أن تكون صور JPEG أو PNG أو WebP.');
  }
  const key=JSON.stringify([target.type,target.ref,target.category,target.title.trim(),file.name,hash]);
  if(!pending||pending.key!==key){
   const rows=await session.request(session.client.rpc('aqari_reserve_document',{p_workspace_id:session.bound.workspace,p_document_type:spec.documentType,p_entity_type:target.type,p_entity_ref:target.ref,p_title:target.title.trim(),p_original_filename:file.name,p_mime_type:blob.type,p_metadata:{category:target.category,asset_role:target.category.startsWith('property_')?target.category:null,original_bytes:true,release:'V267'}}));
   const doc=Array.isArray(rows)?rows[0]:rows;if(!doc?.document_id||doc.storage_bucket!=='aqari-documents'||!doc.storage_path?.startsWith(session.bound.workspace+'/'))throw Error('تعذر حجز نسخة المستند.');
   pending={key,doc,upload:createVerifiedUpload(session,{path:doc.storage_path,blob})};
  }
  const doc=pending.doc;await pending.upload();
  await session.request(session.client.rpc('aqari_finalize_document',{p_document_id:doc.document_id,p_size_bytes:blob.size,p_mime_type:blob.type,p_checksum:hash}));
  const row=await session.request(session.client.from('aqari_documents').select('id,status,entity_type,entity_ref,document_type,metadata,created_by,checksum_sha256').eq('workspace_id',session.bound.workspace).eq('id',doc.document_id).single());
  if(row?.id!==doc.document_id||row.status!=='uploaded'||row.entity_type!==target.type||row.entity_ref!==target.ref||row.created_by!==session.bound.user||row.checksum_sha256!==hash||row.document_type!==spec.documentType||row.metadata?.category!==target.category)throw Error('لم تتأكد إعادة قراءة سجل المستند.');
  return row;
 };
}
