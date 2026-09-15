const CONTACT=/^\+?[0-9]{8,15}$/;

export function normalizeTechnicianContact(value){
 const compact=String(value??'').replace(/[ ()-]/g,'');
 return CONTACT.test(compact)?compact:'';
}

export function technicianContactLinks(record={}){
 const phone=normalizeTechnicianContact(record.phone);
 const whatsapp=normalizeTechnicianContact(record.whatsapp);
 return Object.freeze({
  phone,
  whatsapp,
  tel:phone?`tel:${phone}`:'',
  whatsappUrl:whatsapp?`https://wa.me/${whatsapp.replace(/^\+/,'')}`:''
 });
}

export function normalizeTenantPropertySupport(payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||typeof payload.workspaceId!=='string'||!payload.workspaceId||typeof payload.tenantId!=='string'||!payload.tenantId||!Array.isArray(payload.properties))throw Error('INVALID_TENANT_PROPERTY_SUPPORT');
 const properties=payload.properties.map(property=>{
  if(!property||typeof property!=='object'||Array.isArray(property)||typeof property.propertyId!=='string'||!property.propertyId||typeof property.propertyName!=='string'||typeof property.techniciansEnabled!=='boolean'||typeof property.maintenanceEnabled!=='boolean'||!Array.isArray(property.technicians))throw Error('INVALID_TENANT_PROPERTY_SUPPORT');
  const technicians=property.technicians.map(record=>{
   if(!record||typeof record!=='object'||Array.isArray(record)||typeof record.employeeId!=='string'||!record.employeeId||typeof record.nameAr!=='string'||typeof record.nameEn!=='string'||typeof record.jobAr!=='string'||typeof record.phone!=='string'||typeof record.whatsapp!=='string')throw Error('INVALID_TENANT_PROPERTY_SUPPORT');
   const contacts=technicianContactLinks(record);
   return Object.freeze({...record,...contacts});
  });
  return Object.freeze({propertyId:property.propertyId,propertyName:property.propertyName,techniciansEnabled:property.techniciansEnabled,maintenanceEnabled:property.maintenanceEnabled,technicians:Object.freeze(technicians)});
 });
 return Object.freeze({workspaceId:payload.workspaceId,tenantId:payload.tenantId,properties:Object.freeze(properties)});
}
