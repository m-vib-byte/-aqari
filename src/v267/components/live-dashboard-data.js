// Read projection only; use the same bounded, staging-only session as the KPI report.
export function finiteNumber(value){
 if(value===null||value===undefined||value===''||!['number','string'].includes(typeof value))return null;
 const number=Number(value);return Number.isFinite(number)?number:null;
}
export function sumMoney(rows,key){
 if(!Array.isArray(rows))return null;
 let mills=0;
 for(const row of rows){const value=finiteNumber(row?.[key]);if(value===null)return null;mills+=Math.round(value*1000);}
 return Number.isSafeInteger(mills)?mills/1000:null;
}
export function projectDashboard(month,day,collections,counters){
 const items=new Map((counters?.items||[]).map(item=>[item.id,item.value]));
 const units=finiteNumber(day?.units?.total),occupied=finiteNumber(day?.units?.occupied);
 return {
  today:finiteNumber(day?.collections?.actual),month:finiteNumber(month?.collections?.actual),
  due:sumMoney(collections?.properties,'due'),remaining:sumMoney(collections?.properties,'remaining'),
  properties:finiteNumber(items.get('properties')),tenants:finiteNumber(items.get('tenants')),
  contracts:finiteNumber(items.get('active_contracts')),expiring:finiteNumber(items.get('expiry_30')),
  maintenance:finiteNumber(items.get('open_maintenance')),units,
  occupancy:units>0&&occupied!==null?Math.round(occupied/units*10000)/100:null,
  expenses:finiteNumber(month?.profit?.approved_expenses),net:finiteNumber(month?.profit?.actual_net)
 };
}
export async function readLiveDashboard(session,day,readCounters){
 const first=day.slice(0,7)+'-01';
 const call=(name,args)=>session.request(session.client.rpc(name,{p_workspace_id:session.bound.workspace,...args}));
 const results=await Promise.allSettled([
  call('aqari_kpi_dashboard',{p_from:first,p_to:day}),
  call('aqari_kpi_dashboard',{p_from:day,p_to:day}),
  call('aqari_monthly_collection_report',{p_period:first,p_property_id:null}),
  readCounters(session,day)
 ]);
 session.check();
 const values=results.map(result=>result.status==='fulfilled'?result.value:null);
 return {values:projectDashboard(...values),partial:results.some(result=>result.status==='rejected'),day};
}
