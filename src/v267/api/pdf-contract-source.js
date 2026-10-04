import {resolveRentalDocumentContext} from '../domain/rental-document-cycle.js';

export function createPdfContractSource(session,property){
 const check=()=>{session.check();if(session.bound.role!=='general_manager')throw Error('هذه العملية متاحة للمدير فقط.');};
 const rpc=(name,args)=>session.request(session.client.rpc(name,args));
 async function one(table,columns,column,value){
  check();const rows=await session.request(session.client.from(table).select(columns).eq('workspace_id',session.bound.workspace).eq(column,value).limit(2));check();
  if(!Array.isArray(rows)||rows.length!==1||rows[0].workspace_id!==session.bound.workspace)throw Error('تعذر تأكيد السجل المرتبط وصلاحية الوصول إليه.');
  return rows[0];
 }
 return {
  async list(query='',offset=0){
   check();const result=await rpc('aqari_pdf_contract_bindings',{p_workspace_id:session.bound.workspace,p_action:'leases',p_data:{property_id:property.id,query,offset}});check();
   if(!Array.isArray(result?.items))throw Error('تعذر تحميل عقود العقار.');return result;
  },
  async read(contractRef){
   check();const workspace=session.bound.workspace,user=session.bound.user;
   const lease=await one('aqari_leases','id,workspace_id,external_ref,tenant_id,unit_id,snapshot,start_date,end_date,monthly_rent,status','external_ref',contractRef);
   if(['cancelled','void'].includes(lease.status))throw Error('العقد ملغى؛ اختر عقدًا متاحًا.');
   const [unit,tenant]=await Promise.all([
    one('aqari_units','id,workspace_id,property_id,unit_no','id',lease.unit_id),
    one('aqari_tenants','id,workspace_id,external_ref,full_name,civil_id,phone,email,profile','id',lease.tenant_id)
   ]);
   if(unit.property_id!==property.id)throw Error('العقد لا يخص العقار المحدد.');
   const [prop,master,saved]=await Promise.all([
    one('aqari_properties','id,workspace_id,name,external_ref,metadata','id',property.id),
    rpc('aqari_property_contract_context',{p_workspace_id:workspace,p_property_id:property.id,p_unit_id:unit.id}),
    rpc('aqari_read_state_v267',{p_workspace_id:workspace})
   ]);check();
   if(session.bound.workspace!==workspace||session.bound.user!==user||saved?.workspace_id!==workspace||master?.workspace_id!==workspace||master?.user_id!==user||master.property?.id!==property.id||master.unit?.id!==unit.id||master.unit?.propertyId!==property.id)throw Error('تغير نطاق السجلات؛ أعد فتح المعاينة.');
   const context=resolveRentalDocumentContext(saved.payload,{contractId:contractRef},{workspaceId:workspace,leases:[lease],units:[{...unit,...master.unit,workspace_id:workspace}],tenants:[tenant],properties:[prop],propertyMasters:[master],receipts:[]});
   if(String(context.links.propertyId)!==property.id)throw Error('العقد لا يخص العقار المحدد.');
   return context;
  }
 };
}
