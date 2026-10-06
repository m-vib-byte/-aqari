import {masterOwnersMatch} from './ownership-shares.js';

const canonical=value=>{
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 return value;
};
// Compare decimal values without converting money to a floating point number.
const income=value=>{
 if(value===null)return null;
 const m=/^\+?(\d*)(?:\.(\d*))?$/.exec(String(value??''));
 if(!m||!(m[1]||m[2])||(m[2]||'').slice(3).replace(/0/g,''))return undefined;
 return BigInt(m[1]||'0')*1000n+BigInt((m[2]||'').slice(0,3).padEnd(3,'0'));
};
// The snapshot retains the stored office_hours key and adds its UI alias.
const visibility=value=>{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const result={...value};
 if(Object.hasOwn(result,'office_hours')){
  if(Object.hasOwn(result,'officeHours')&&result.officeHours!==result.office_hours)return null;
  result.officeHours=result.office_hours;delete result.office_hours;
 }
 return result;
};
export function propertyMasterReadbackMatches(actual,expected){
 if(!actual||!expected||!masterOwnersMatch(actual.owners,expected.owners))return false;
 for(const [key,value] of Object.entries(expected)){
  if(key==='owners')continue;
  if(key==='statedIncome'){
   const wanted=income(value);if(wanted===undefined||income(actual[key])!==wanted)return false;
  }else if(key==='email'){
   if(String(actual[key]??'')!==String(value??'').trim().toLowerCase())return false;
  }else if(key==='description'){
   if(actual[key]!==String(value??'').trim())return false;
  }else if(key==='tenantVisibility'){
   const wanted=visibility(value),read=visibility(actual[key]);
   if(!wanted||!read||JSON.stringify(canonical(read))!==JSON.stringify(canonical(wanted)))return false;
  }else if(JSON.stringify(canonical(actual[key]))!==JSON.stringify(canonical(value)))return false;
 }
 return true;
}
