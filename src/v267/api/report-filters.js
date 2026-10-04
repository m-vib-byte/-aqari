const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validDate=value=>typeof value==='string'&&/^[1-9][0-9]{3}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export function normalizeReportFilters(key,filters){
 if(!filters||typeof filters!=='object'||Array.isArray(filters))throw Error('INVALID_REPORT_FILTERS');
 const keys=key==='owner_report'?['from','to']:['property_id',key==='hr_annual'?'year':'month'];
 if(!['property_statements','owner_report','hr_monthly','hr_annual'].includes(key)||Object.keys(filters).some(k=>!keys.includes(k))||keys.some(k=>typeof filters[k]!=='string'))throw Error('INVALID_REPORT_FILTERS');
 if(key==='owner_report'){
  if(!validDate(filters.from)||!validDate(filters.to)||filters.from>filters.to)throw Error('INVALID_REPORT_FILTERS');
 }else{
  if(!(uuid.test(filters.property_id)||(key==='hr_annual'&&filters.property_id==='')))throw Error('INVALID_REPORT_FILTERS');
  if(key==='hr_annual'?!/^[1-9][0-9]{3}$/.test(filters.year):!/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(filters.month))throw Error('INVALID_REPORT_FILTERS');
 }
 return Object.fromEntries(keys.map(k=>[k,filters[k]]));
}
export function createReportFilters(session,key){
 const request=(action,filters={})=>{session.check();return session.request(session.client.rpc('aqari_report_filters',{p_workspace_id:session.bound.workspace,p_report_key:key,p_action:action,p_filters:filters}));};
 return {
  async read(){const data=await request('get');if(data&&typeof data==='object'&&!Array.isArray(data)&&Object.keys(data).length===0)return null;return normalizeReportFilters(key,data);},
  async save(filters){const expected=normalizeReportFilters(key,filters);await request('save',expected);const actual=normalizeReportFilters(key,await request('get'));if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('REPORT_FILTERS_CHANGED');return actual;},
  clear:()=>request('clear')
 };
}
