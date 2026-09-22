const tables={property:['aqari_properties','name'],tenant:['aqari_tenants','full_name'],lease:['aqari_leases','contract_no']};
// Resolve the supplied reference through RLS, independently of a 50-result search.
export async function documentTarget(session,type,ref,referenceKey='external_ref'){
 const spec=tables[type];if(!spec||typeof ref!=='string'||!ref||!['external_ref','id'].includes(referenceKey))throw Error('حدد السجل المرتبط بالمستند.');
 const row=await session.request(session.client.from(spec[0]).select('id,external_ref,'+spec[1]).eq('workspace_id',session.bound.workspace).eq(referenceKey,ref).single());
 session.check();if(!row||row[referenceKey]!==ref||typeof row.external_ref!=='string'||!row.external_ref)throw Error('لم يتم العثور على السجل ضمن صلاحيتك.');
 return {entity_ref:row.external_ref,title:row[spec[1]]};
}
