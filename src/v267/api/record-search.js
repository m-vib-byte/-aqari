import {createSession} from './session.js';

const fold=value=>String(value??'').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
 .replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).normalize('NFKD')
 .replace(/[\u064B-\u065F\u0670]/g,'').replace(/\s+/g,' ').trim().toLocaleLowerCase('ar');
const digits=value=>{const v=fold(value).replace(/[\s()+.-]/g,'');return /^\d+$/.test(v)?v:'';};
const denied=()=>Object.assign(Error('ACCESS_DENIED'),{code:'42501'});

async function access(session){
 const a=await session.request(session.client.rpc('aqari_workspace_access',{p_workspace_id:session.bound.workspace}));
 if(a?.user_id!==session.bound.user||a?.workspace_id!==session.bound.workspace||a?.role!==session.bound.role||a?.permissions?.tenants?.read!==true)throw denied();
 return a;
}
async function readAll(session,table,columns){
 const rows=[];
 for(let offset=0;offset<10000;offset+=500){
  const page=await session.request(session.client.from(table).select(columns).eq('workspace_id',session.bound.workspace).order('id').range(offset,offset+499));
  if(!Array.isArray(page)||page.some(row=>row.workspace_id!==session.bound.workspace))throw Error('تعذر تأكيد نطاق سجل المستأجرين والعقود.');
  rows.push(...page);if(page.length<500)return rows;
 }
 throw Error('تجاوز السجل حد البحث. افتح سجل المستأجرين للبحث داخله.');
}

// Match identifiers only while reading authorized rows. Return no phone/civil
// values, financial amounts, raw profiles, or a cached directory to the caller.
export function createRecordSearch(){
 const session=createSession();
 async function read(query){
  try{
   const needle=fold(query);if(!needle||(needle.length<2&&!/^\d+$/.test(needle)))return [];
   await session.connect();const a=await access(session);
   const tenants=await readAll(session,'aqari_tenants','id,workspace_id,full_name,civil_id,phone');
   const wanted=digits(query),matches=new Set();
   for(const t of tenants){
    const phone=digits(t.phone),civil=digits(t.civil_id);
    if(fold(t.full_name).includes(needle)||(wanted.length>=8&&phone.length>=8&&phone.includes(wanted))||(wanted.length===12&&civil===wanted))matches.add(t.id);
   }
   const names=new Map(tenants.map(t=>[t.id,String(t.full_name||'—')])),rows=[],linked=new Set();
   if(a.permissions?.contracts?.read===true&&a.permissions?.properties?.read===true){
    const properties=await readAll(session,'aqari_properties','id,workspace_id,name');
    const units=await readAll(session,'aqari_units','id,workspace_id,property_id,unit_no');
    const leases=await readAll(session,'aqari_leases','id,workspace_id,tenant_id,unit_id,contract_no,status');
    const propertiesById=new Map(properties.map(p=>[p.id,p])),unitsById=new Map(units.map(u=>[u.id,u]));
    for(const lease of leases){
     const unit=unitsById.get(lease.unit_id),property=unit&&propertiesById.get(unit.property_id);
     if(!names.has(lease.tenant_id)||!property)continue;
     if(!matches.has(lease.tenant_id)&&![lease.contract_no,unit.unit_no,property.name].some(v=>fold(v).includes(needle)))continue;
     linked.add(lease.tenant_id);
     rows.push({kind:'directory-contract',tenantId:lease.tenant_id,leaseId:lease.id,propertyId:property.id,unitId:unit.id,
      tenant:names.get(lease.tenant_id),property:String(property.name||''),unit:String(unit.unit_no||''),contractNo:String(lease.contract_no||'')});
    }
   }
   for(const id of matches)if(!linked.has(id))rows.push({kind:'directory-tenant',tenantId:id,tenant:names.get(id),property:'',unit:'',contractNo:''});
   session.check();return rows;
  }finally{session.close();}
 }
 return {read,close:()=>session.close()};
}

export async function openSearchRecord(item){
 const session=createSession();
 try{
  await session.connect();const a=await access(session);
  if(!['directory-tenant','directory-contract'].includes(item?.kind)||!item.tenantId)throw denied();
  const tenants=await session.request(session.client.from('aqari_tenants').select('id').eq('workspace_id',session.bound.workspace).eq('id',item.tenantId).limit(2));
  if(tenants?.length!==1||tenants[0].id!==item.tenantId)throw denied();
  if(item.kind==='directory-contract'){
   if(a.permissions?.contracts?.read!==true||a.permissions?.properties?.read!==true)throw denied();
   const leases=await session.request(session.client.from('aqari_leases').select('id,tenant_id,unit_id').eq('workspace_id',session.bound.workspace).eq('id',item.leaseId).eq('tenant_id',item.tenantId).eq('unit_id',item.unitId).limit(2));
   const units=await session.request(session.client.from('aqari_units').select('id,property_id').eq('workspace_id',session.bound.workspace).eq('id',item.unitId).eq('property_id',item.propertyId).limit(2));
   const properties=await session.request(session.client.from('aqari_properties').select('id').eq('workspace_id',session.bound.workspace).eq('id',item.propertyId).limit(2));
   if(leases?.length!==1||leases[0].id!==item.leaseId||leases[0].tenant_id!==item.tenantId||leases[0].unit_id!==item.unitId||units?.length!==1||units[0].id!==item.unitId||units[0].property_id!==item.propertyId||properties?.length!==1||properties[0].id!==item.propertyId)throw denied();
  }
  const page=await import('../pages/tenant-timeline.js');session.check();
  return page.openTenantTimeline({tenantId:item.tenantId});
 }finally{session.close();}
}
