import {createSession} from './session.js';

// Use the signed-in client's property RLS, even when no rent ledger exists.
// Keep only unit identity: this directory does not infer any financial state.
export function createUnitSearch(){
 const session=createSession();
 async function readAll(table,columns){
  const rows=[];
  for(let offset=0;offset<10000;offset+=500){
   const page=await session.request(session.client.from(table).select(columns)
    .eq('workspace_id',session.bound.workspace).order('id').range(offset,offset+499));
   if(!Array.isArray(page))throw Error('تعذر التحقق من سجل الوحدات.');
   if(page.some(row=>row.workspace_id!==session.bound.workspace))throw Error('تغير نطاق سجل الوحدات.');
   rows.push(...page);
   if(page.length<500)return rows;
  }
  throw Error('تجاوز سجل الوحدات حد البحث. افتح ملف العقار للبحث داخله.');
 }
 async function read(){
  try{
   await session.connect();
   const properties=await readAll('aqari_properties','id,workspace_id,name');
   const units=await readAll('aqari_units','id,workspace_id,property_id,unit_no');
   session.check();
   const names=new Map(properties.map(p=>[p.id,p.name]));
   const seen=new Set();
   return units.filter(u=>u.id&&names.has(u.property_id)&&!seen.has(u.id)&&seen.add(u.id))
    .map(u=>({propertyId:u.property_id,unitId:u.id,property:String(names.get(u.property_id)||''),unit:String(u.unit_no||'')}));
  }finally{session.close();}
 }
 return {read,close:()=>session.close()};
}

export async function openSearchUnit(item){
 const session=createSession();
 try{
  await session.connect();
  // Re-read the exact identity under current RLS before opening by property ID.
  const rows=await session.request(session.client.from('aqari_units').select('id,property_id')
   .eq('workspace_id',session.bound.workspace).eq('id',item.unitId).eq('property_id',item.propertyId).limit(2));
  if(rows?.length!==1||rows[0].id!==item.unitId||rows[0].property_id!==item.propertyId)throw Error('لم تعد الوحدة متاحة لحسابك. حدّث البحث.');
  const page=await import('../pages/property-master-file.js');
  session.check();
  return page.openPropertyMasterFile(item.propertyId);
 }finally{session.close();}
}
