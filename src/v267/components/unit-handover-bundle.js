const SHA256=/^[a-f0-9]{64}$/i;

function nonEmpty(value,label){
  const text=String(value??'').trim();
  if(!text)throw new Error(`UNIT_HANDOVER_${label}_REQUIRED`);
  return text;
}
function immutable(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value))immutable(child);
  }
  return value;
}
function verifiedDocument(index,id,role){
  const key=nonEmpty(id,`${role}_DOCUMENT`);
  const doc=index.get(key);
  if(!doc||doc.status!=='uploaded')throw new Error(`UNIT_HANDOVER_${role}_DOCUMENT_UNVERIFIED`);
  const checksum=String(doc.checksum_sha256??'').trim().toLowerCase();
  const size=Number(doc.size_bytes);
  const mime=String(doc.mime_type??'').trim().toLowerCase();
  if(!SHA256.test(checksum)||!Number.isSafeInteger(size)||size<=0||!(mime.startsWith('image/')||mime==='application/pdf')){
    throw new Error(`UNIT_HANDOVER_${role}_DOCUMENT_UNVERIFIED`);
  }
  return {id:key,role,checksum_sha256:checksum,size_bytes:size,mime_type:mime};
}
function normalizedChecklist(checklist){
  if(!Array.isArray(checklist)||checklist.length===0)throw new Error('UNIT_HANDOVER_CHECKLIST_REQUIRED');
  return checklist.map((row,index)=>{
    const item=nonEmpty(row?.item,`CHECKLIST_ITEM_${index+1}`);
    const result=nonEmpty(row?.result,`CHECKLIST_RESULT_${index+1}`);
    const note=String(row?.note??'').trim();
    return {item,result,...(note?{note}:{})};
  });
}

export function buildUnitHandoverBundle({inspection,lease,documents}){
  if(!inspection||typeof inspection!=='object')throw new Error('UNIT_HANDOVER_INSPECTION_REQUIRED');
  if(inspection.kind!=='move_out')throw new Error('UNIT_HANDOVER_MOVE_OUT_INSPECTION_REQUIRED');
  if(inspection.status!=='signed')throw new Error('UNIT_HANDOVER_SIGNED_INSPECTION_REQUIRED');
  const inspectionId=nonEmpty(inspection.id,'INSPECTION_ID');
  const leaseId=nonEmpty(inspection.lease_id,'LEASE_ID');
  const unitId=nonEmpty(inspection.unit_id,'UNIT_ID');
  if(!lease||typeof lease!=='object'||String(lease.id)!==leaseId)throw new Error('UNIT_HANDOVER_LEASE_MISMATCH');
  if(lease.unit_id!=null&&String(lease.unit_id)!==unitId)throw new Error('UNIT_HANDOVER_UNIT_MISMATCH');
  const inspectedAt=nonEmpty(inspection.inspected_at,'INSPECTED_AT');
  const signedAt=nonEmpty(inspection.signed_at,'SIGNED_AT');
  const revision=Number(inspection.revision);
  if(!Number.isSafeInteger(revision)||revision<1)throw new Error('UNIT_HANDOVER_REVISION_INVALID');
  const photoIds=Array.isArray(inspection.photo_document_ids)?inspection.photo_document_ids.map(String):[];
  if(photoIds.length===0)throw new Error('UNIT_HANDOVER_PHOTO_REQUIRED');
  const tenantSignature=nonEmpty(inspection.tenant_signature_document_id,'TENANT_SIGNATURE');
  const inspectorSignature=nonEmpty(inspection.inspector_signature_document_id,'INSPECTOR_SIGNATURE');
  const allIds=[...photoIds,tenantSignature,inspectorSignature];
  if(new Set(allIds).size!==allIds.length)throw new Error('UNIT_HANDOVER_DOCUMENT_ROLE_CONFLICT');
  const index=new Map((Array.isArray(documents)?documents:[]).map(doc=>[String(doc?.id??''),doc]));
  const attachments=[
    ...photoIds.map((id,i)=>verifiedDocument(index,id,`PHOTO_${i+1}`)),
    verifiedDocument(index,tenantSignature,'TENANT_SIGNATURE'),
    verifiedDocument(index,inspectorSignature,'INSPECTOR_SIGNATURE')
  ];
  const checklist=normalizedChecklist(inspection.checklist);
  const tenantName=nonEmpty(lease.tenant_name,'TENANT_NAME');
  const contractNo=nonEmpty(lease.contract_no,'CONTRACT_NO');
  const propertyName=nonEmpty(lease.property_name,'PROPERTY_NAME');
  const unitNo=nonEmpty(lease.unit_no,'UNIT_NO');
  const source={inspection_id:inspectionId,lease_id:leaseId,unit_id:unitId,inspection_revision:revision,inspected_at:inspectedAt,signed_at:signedAt};
  const summary=`محضر تسليم واستلام الوحدة ${unitNo} في ${propertyName} للعقد ${contractNo} والمستأجر ${tenantName}. الفحص المحفوظ ${inspectionId} يتضمن ${checklist.length} بنداً و${photoIds.length} صورة وتوقيعَي الطرفين.`;
  return immutable({
    kind:'unit_handover',
    title:'محضر تسليم واستلام وحدة',
    source,
    parties:{tenant_name:tenantName,contract_no:contractNo,property_name:propertyName,unit_no:unitNo},
    checklist,
    attachments,
    summary
  });
}
