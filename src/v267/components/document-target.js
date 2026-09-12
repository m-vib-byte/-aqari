const tables={property:['aqari_properties','name'],tenant:['aqari_tenants','full_name'],lease:['aqari_leases','contract_no']};
// Resolve the supplied reference through RLS, independently of a 50-result search.
export async function documentTarget(session,type,ref){
 const spec=tables[type];if(!spec||typeof ref!=='string'||!ref)throw Error('حدد السجل المرتبط بالمستند.');
 const row=await session.request(session.client.from(spec[0]).select('external_ref,'+spec[1]).eq('workspace_id',session.bound.workspace).eq('external_ref',ref).single());
 session.check();if(!row||row.external_ref!==ref)throw Error('لم يتم العثور على السجل ضمن صلاحيتك.');
 return {entity_ref:row.external_ref,title:row[spec[1]]};
}
