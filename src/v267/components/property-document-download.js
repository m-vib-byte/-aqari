import {readStoredOriginal,originalDocumentExtension} from './stored-original.js';

// Resolve historical external references only through the selected property's
// RLS-protected row; never trust a document number or a client-supplied path.
export async function readPropertyDocument(session,propertyId,documentId){
 session.check();
 if(!propertyId||!documentId)throw Error('تعذر تأكيد نطاق الملف الأصلي.');
 const property=await session.request(session.client.from('aqari_properties').select('id,workspace_id,external_ref').eq('workspace_id',session.bound.workspace).eq('id',propertyId).single());session.check();
 if(property?.id!==propertyId||property.workspace_id!==session.bound.workspace)throw Error('تعذر تأكيد نطاق الملف الأصلي.');
 const row=await session.request(session.client.from('aqari_documents').select('id,workspace_id,entity_type,entity_ref,status,storage_path,mime_type,document_no').eq('workspace_id',session.bound.workspace).eq('id',documentId).single());session.check();
 const refs=[String(propertyId)];if(property.external_ref)refs.push(String(property.external_ref));
 if(row?.id!==documentId||row.workspace_id!==session.bound.workspace||row.entity_type!=='property'||!refs.includes(row.entity_ref)||row.status!=='uploaded')throw Error('لم يتأكد ارتباط الملف الأصلي بالسجل المحدد.');
 const result=await readStoredOriginal(session,{id:documentId,storagePath:row.storage_path,entityType:'property',entityRef:row.entity_ref});session.check();
 return {...result,name:String(row.document_no||documentId).replace(/[\\/\x00-\x1f]/g,'_')+originalDocumentExtension(row.mime_type)};
}
