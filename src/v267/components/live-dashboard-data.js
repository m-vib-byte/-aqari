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
  readCounters(session,day),
  Promise.resolve().then(()=>session.request(session.client.from('aqari_rent_payments').select('amount,paid_at,status').eq('workspace_id',session.bound.workspace).neq('status','cancelled').order('paid_at',{ascending:false}).limit(3)))
 ]);
 session.check();
 const values=results.map(result=>result.status==='fulfilled'?result.value:null);
 const projected=projectDashboard(...values);
 const lines=values[2]?.lines;
 projected.overdue=Array.isArray(lines)&&lines.every(row=>typeof row.due_on==='string')?sumMoney(lines.filter(row=>row.due_on<day),'remaining'):null;
 return {values:projected,collections:values[2],payments:values[4],partial:results.some(result=>result.status==='rejected'),day};
}

// Read-only dashboard details. Existing RPCs and table RLS remain authoritative.
// Every request is bound to the same session; denied and failed sources stay unknown.
export async function readReferenceDashboard(session,day){
 const workspace=session.bound.workspace;
 const rpc=(name,args={})=>session.request(session.client.rpc(name,{p_workspace_id:workspace,...args}));
 const year=Number(day.slice(0,4));
 const result={year,months:Array.from({length:12},(_,i)=>({month:i+1,amount:null})),units:null,metrics:{employees:null,invoices:null},properties:null,utilities:null,expiring:null,health:null,partial:false};
 const access=await rpc('aqari_workspace_access');session.check();
 if(access?.user_id!==session.bound.user||access?.workspace_id!==workspace||access?.role!==session.bound.role)throw Error('ACCESS_DENIED');
 const can=section=>access.permissions?.[section]?.read===true;
 const jobs=[];
 const add=(key,run)=>jobs.push({key,run});
 const table=name=>session.client.from(name).select('*').eq('workspace_id',workspace);
 if(can('finance')&&access.role==='general_manager'&&access.features?.kpi_dashboard===true){
  add('units',async()=> (await rpc('aqari_kpi_dashboard',{p_from:day,p_to:day})).units);
  for(let i=0;i<Number(day.slice(5,7));i++){
   const first=year+'-'+String(i+1).padStart(2,'0')+'-01';
   const last=new Date(Date.UTC(year,i+1,0)).toISOString().slice(0,10);
   add('month:'+i,async()=>finiteNumber((await rpc('aqari_kpi_dashboard',{p_from:first,p_to:last>day?day:last})).collections?.actual));
  }
 }
 if(can('employees'))add('employees',async()=>{const value=await rpc('aqari_hr',{p_action:'list',p_data:{}});if(!Array.isArray(value?.employees))throw Error('INVALID_REPORT');return value.employees.length;});
 if(can('properties'))add('properties',()=>session.request(session.client.from('aqari_properties').select('id,name').eq('workspace_id',workspace).order('name').limit(100)));
 if(can('finance')){
  const invoices=()=>table('aqari_utility_entries').eq('entry_type','bill').in('payment_status',['unpaid','partial']).lte('due_on',day);
  add('utilities',()=>session.request(invoices().order('due_on').limit(4)));
  add('invoices',()=>session.request({abortSignal(signal){return session.client.from('aqari_utility_entries').select('id',{count:'exact',head:true}).eq('workspace_id',workspace).eq('entry_type','bill').in('payment_status',['unpaid','partial']).lte('due_on',day).abortSignal(signal).then(response=>({...response,data:response.count}));}}));
 }
 if(can('contracts')&&can('reports')&&access.features?.lease_expiry_report===true)add('expiring',async()=>{const r=await rpc('aqari_lease_expiry_report',{p_status:'upcoming',p_days:90,p_property_id:null,p_search:'',p_offset:0});return Array.isArray(r?.rows)?r.rows:null;});
 if(access.role==='general_manager'&&access.features?.operations_register===true)add('health',()=>rpc('aqari_operations_health'));
 for(let i=0;i<jobs.length;i+=4){
  session.check();
  const batch=jobs.slice(i,i+4),values=await Promise.allSettled(batch.map(job=>Promise.resolve().then(job.run)));
  session.check();values.forEach((value,index)=>{const key=batch[index].key;if(value.status==='rejected'){result.partial=true;return;}if(key.startsWith('month:'))result.months[Number(key.slice(6))].amount=value.value;else if(key==='employees'||key==='invoices')result.metrics[key]=finiteNumber(value.value);else result[key]=value.value;});
 }
 const verified=await rpc('aqari_workspace_access');session.check();
 if(JSON.stringify(verified)!==JSON.stringify(access))throw Error('ACCESS_CHANGED');
 return result;
}
