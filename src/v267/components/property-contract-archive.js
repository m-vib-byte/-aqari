import {checksum} from './scan-image.js';

function belongsToProperty(row,session,property){
 const metadata=row?.metadata;
 return row?.status==='uploaded'&&row.entity_type==='property'&&row.entity_ref===property.externalRef
  &&row.document_type==='supporting_document'&&row.storage_bucket==='aqari-documents'
  &&typeof row.storage_path==='string'&&row.storage_path.startsWith(session.bound.workspace+'/')
  &&row.mime_type==='application/pdf'&&Number.isSafeInteger(row.size_bytes)&&row.size_bytes>0&&row.size_bytes<=25*1024*1024
  &&/^[a-f0-9]{64}$/.test(row.checksum_sha256||'')&&metadata?.category==='property_other'
  &&metadata?.asset_role==='property_contract'&&metadata?.property_id===property.id;
}

const columns='id,title,original_filename,created_at,status,entity_type,entity_ref,document_type,metadata,storage_bucket,storage_path,mime_type,size_bytes,checksum_sha256';

/** List only uploaded contract originals bound to this property's stable ID. */
export async function listPropertyContractArchive(session,property,offset=0){
 if(!property?.id||!property?.externalRef)throw Error('اختر عقارًا محفوظًا.');
 if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw Error('صفحة أرشيف العقود غير صالحة.');
 const pageSize=100;
 const rows=await session.request(session.client.from('aqari_documents').select(columns)
  .eq('workspace_id',session.bound.workspace).eq('entity_type','property').eq('entity_ref',property.externalRef)
  .eq('status','uploaded').eq('document_type','supporting_document').eq('mime_type','application/pdf')
  .contains('metadata',{category:'property_other',asset_role:'property_contract',property_id:property.id})
  .order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+pageSize));
 session.check();
 if(!Array.isArray(rows))throw Error('تعذر قراءة أرشيف عقود العقار.');
 return {items:rows.slice(0,pageSize).filter(row=>belongsToProperty(row,session,property)),
  hasMore:rows.length>pageSize,nextOffset:offset+pageSize};
}

/** Re-read the authoritative row and bytes before opening an archived PDF. */
export async function readPropertyContractArchive(session,property,id){
 if(!property?.id||!property?.externalRef||!/^[0-9a-f-]{36}$/i.test(id||''))throw Error('ملف العقد غير صالح.');
 const row=await session.request(session.client.from('aqari_documents').select(columns)
  .eq('workspace_id',session.bound.workspace).eq('id',id).single());
 session.check();
 if(!belongsToProperty(row,session,property))throw Error('ملف العقد غير مرتبط بهذا العقار.');
 const blob=await session.storage('GET',row.storage_path);session.check();
 if(!(blob instanceof Blob)||blob.size!==row.size_bytes||await checksum(blob)!==row.checksum_sha256)throw Error('النسخة المحفوظة لا تطابق بصمة ملف العقد.');
 session.check();
 if(await blob.slice(0,5).text()!=='%PDF-')throw Error('النسخة المحفوظة ليست ملف PDF صالحًا.');
 return blob.type==='application/pdf'?blob:new Blob([blob],{type:'application/pdf'});
}
