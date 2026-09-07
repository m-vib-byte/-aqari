// Read-only migration planning. Never treats imported status as verification.
import {createHash} from 'node:crypto';
const str=v=>String(v??'').normalize('NFKC').trim();
const digits=v=>str(v).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776));
const key=v=>digits(v).toLowerCase();
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const money=v=>/^(0|[1-9]\d*)(\.\d{1,3})?$/.test(String(v))&&Number.isSafeInteger(Math.round(Number(v)*1000));
export function unwrap(payload){
 const data=payload?.format==='aqari-cloud-state-v1'?payload.snapshot?.values?.aqari_v30:payload?.schema==='aqari-local-snapshot-v1'?payload.values?.aqari_v30:payload;
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('INVALID_SOURCE');
 return data;
}
export function migrationPreflight(payload){
 const data=unwrap(payload),issues=[];
 const list=k=>{const v=data[k]??[];if(!Array.isArray(v))throw Error('INVALID_ARRAY:'+k);return v};
 const properties=list('properties'),contracts=list('contractsV202'),directory=list('tenantDirectoryV202'),profiles=list('tenantProfilesV267'),ledger=list('rentLedgerV202'),collections=list('collections');
 const add=(entity,index,code)=>issues.push({entity,index,code});
 const duplicate=(rows,field,entity)=>{const seen=new Map();rows.forEach((r,i)=>{const v=key(field(r));if(!v)return;if(seen.has(v)){add(entity,i,'DUPLICATE_IDENTITY');add(entity,seen.get(v),'DUPLICATE_IDENTITY')}else seen.set(v,i)})};
 duplicate(properties,r=>Array.isArray(r)?r[0]:'','property');duplicate(profiles,r=>r.civilId,'profile');duplicate(profiles,r=>digits(r.phone).replace(/[ ()-]/g,''),'profile');duplicate(contracts,r=>r.contract_no,'contract');duplicate(contracts,r=>r.id,'contract');duplicate(ledger,r=>r.receiptNo||r.voucherNo,'payment');
 const propertyNames=new Set(properties.filter(Array.isArray).map(p=>key(p[0])));
 contracts.forEach((c,i)=>{
  if(!c||typeof c!=='object'||Array.isArray(c)){add('contract',i,'INVALID_RECORD');return}
  if(!c.id||!str(c.contract_no)||!str(c.unit)||!str(c.tenant))add('contract',i,'MISSING_LINK');
  if(!propertyNames.has(key(c.property)))add('contract',i,'PROPERTY_NOT_FOUND');
  if(!validDate(c.start_date)||!validDate(c.end_date)||c.end_date<c.start_date)add('contract',i,'INVALID_DATES');
  if(!money(c.rent)||Number(c.rent)<=0)add('contract',i,'INVALID_RENT');
  if(c.source!=='v267-cloud')add('contract',i,'IMPORTED_REQUIRES_REVIEW');
  if(!['draft','ready','approved','signing','signed','cancelled','expired'].includes(c.status))add('contract',i,'UNKNOWN_STATUS');
  const profile=profiles.filter(p=>p.id===c.tenantId&&str(c.tenantId));
  if(profile.length!==1)add('contract',i,'VERIFIED_PROFILE_REQUIRED');
  else if(key(profile[0].nameAr)!==key(c.tenant)||!/^\d{12}$/.test(digits(profile[0].civilId)))add('contract',i,'PROFILE_MISMATCH');
  const matches=directory.filter(d=>key(d.contractNo)===key(c.contract_no)&&key(d.property)===key(c.property)&&key(d.unit)===key(c.unit)&&key(d.tenant)===key(c.tenant));
  if(matches.length!==1)add('contract',i,'DIRECTORY_LINK_AMBIGUOUS');
  for(let j=0;j<i;j++){const other=contracts[j];if(!other||c.status==='cancelled'||other.status==='cancelled')continue;
   if(key(c.property)===key(other.property)&&key(c.unit)===key(other.unit)&&validDate(c.start_date)&&validDate(c.end_date)&&validDate(other.start_date)&&validDate(other.end_date)&&c.start_date<=other.end_date&&c.end_date>=other.start_date){add('contract',i,'UNIT_DATE_OVERLAP');add('contract',j,'UNIT_DATE_OVERLAP')}
  }
 });
 directory.forEach((d,i)=>{
  if(!/^\d{12}$/.test(digits(d.civilId)))add('tenant',i,'INVALID_CIVIL_ID');
  if(!/^\+?\d{8,15}$/.test(digits(d.phone).replace(/[ ()-]/g,'')))add('tenant',i,'INVALID_PHONE');
  if(d.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(d.email)))add('tenant',i,'INVALID_EMAIL');
  if(d.verified!==true)add('tenant',i,'IDENTITY_REQUIRES_REVIEW');
 });
 ledger.forEach((p,i)=>{
  if(!p||typeof p!=='object'||Array.isArray(p)){add('payment',i,'INVALID_RECORD');return}
  if(!money(p.paid)||!money(p.due)||Number(p.paid)<0)add('payment',i,'INVALID_AMOUNT');
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(str(p.period)))add('payment',i,'INVALID_PERIOD');
  const matches=contracts.filter(c=>str(c.id)===str(p.contractId)&&str(c.contract_no)===str(p.contractNo)&&key(c.property)===key(p.property)&&key(c.unit)===key(p.unit)&&key(c.tenant)===key(p.tenant));
  if(matches.length!==1)add('payment',i,'CONTRACT_LINK_AMBIGUOUS');
  if(Number(p.paid)>0){
   if(!validDate(p.paidAt))add('payment',i,'MISSING_PAYMENT_DATE');
   if(!str(p.receiptNo||p.voucherNo))add('payment',i,'MISSING_RECEIPT');
   if(!['paid','partial','settled','received','مدفوع','مسدد','جزئي','مستلم'].includes(p.status))add('payment',i,'UNCONFIRMED_PAYMENT');
  }
  if(p.source!=='v267-cloud')add('payment',i,'HISTORICAL_RECONCILIATION_REQUIRED');
 });
 // Unlinked collection rows must survive in the source archive, never be silently dropped or double counted.
 collections.forEach((row,i)=>{if(!Array.isArray(row)||ledger.filter(p=>str(p.receiptNo||p.voucherNo)===str(row[0])&&Number(p.paid)===Number(row[2])).length!==1)add('collection',i,'UNRECONCILED_COLLECTION')});
 const unique=[...new Map(issues.map(i=>[`${i.entity}:${i.index}:${i.code}`,i])).values()];
 return {version:'V267',readOnly:true,sourceSha256:createHash('sha256').update(JSON.stringify(payload)).digest('hex'),counts:{properties:properties.length,contracts:contracts.length,directory:directory.length,profiles:profiles.length,ledger:ledger.length,collections:collections.length},canMigrate:unique.length===0,issues:unique,issueCounts:unique.reduce((a,i)=>(a[i.code]=(a[i.code]||0)+1,a),{})};
}
