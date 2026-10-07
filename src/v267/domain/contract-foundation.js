import {resolveRentalDocumentContext,linkedDocumentFieldKeys} from './rental-document-cycle.js';

const text=value=>String(value??'').normalize('NFKC').trim();
const digits=value=>text(value).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776));
const key=value=>digits(value).toLocaleLowerCase('ar');
const fils=value=>{
 const raw=digits(value).replace('٫','.');
 if(!/^\d+(?:\.\d{1,3})?$/.test(raw))throw Error('أدخل مبلغاً صحيحاً بدقة ثلاثة منازل كحد أقصى.');
 const amount=Number(raw),minor=Math.round(amount*1000);
 if(!Number.isSafeInteger(minor)||minor<0)throw Error('أدخل مبلغاً صحيحاً.');
 return minor;
};

export const isFoundationContractTemplate=template=>!['apartment_handover','eviction','rent_receipt','owner_final_clearance','salary_voucher','employment_contract'].includes(template?.kind);

export function foundationTemplateValues(data,preparation,values,sources){
 if(!preparation?.id||!preparation.tenantId||!preparation.propertyId||!preparation.unitId)throw Error('احفظ ربط المستأجر والعقار والوحدة قبل اختيار حقول العقد.');
 const candidate={...values,id:preparation.id,contract_no:preparation.contractNo,tenantId:preparation.tenantId,propertyId:preparation.propertyId,unitId:preparation.unitId,property:preparation.property,unit:preparation.unit};
 const masterUnits=(sources.propertyMasters||[]).filter(row=>row?.property?.id===preparation.propertyId&&row?.unit?.id===preparation.unitId&&row.unit.propertyId===preparation.propertyId).map(row=>row.unit);
 if(masterUnits.length>1)throw Error('تعارض بيانات الوحدة المرتبطة؛ أعد قراءة الربط قبل المتابعة.');
 const units=(sources.units||[]).map(row=>masterUnits[0]?.id===row.id?{...row,...masterUnits[0]}:row);
 const resolved=resolveRentalDocumentContext({...data,contractsV202:[candidate]},{contractId:candidate.id},{...sources,units}).values;
 return {...Object.fromEntries(linkedDocumentFieldKeys.map(key=>[key,''])),...resolved};
}

export function nextContractSerial(year,contracts=[],preparations=[]){
 const y=String(year||'').trim();
 if(!/^\d{4}$/.test(y))throw Error('تعذر تحديد سنة رقم العقد.');
 const pattern=new RegExp('^AQ-C-'+y+'-(\\d+)$','i');
 let sequence=0;
 for(const row of [...(contracts||[]),...(preparations||[])]){
  const value=text(row?.contract_no??row?.contractNo),match=pattern.exec(value);
  if(match)sequence=Math.max(sequence,Number(match[1])||0);
 }
 return `AQ-C-${y}-${String(sequence+1).padStart(6,'0')}`;
}

export function executionAmount({firstRent=0,deposit=0,advance=0,fees=0}={}){
 const parts={firstRent:fils(firstRent),deposit:fils(deposit),advance:fils(advance),fees:fils(fees)};
 const total=Object.values(parts).reduce((sum,value)=>sum+value,0);
 if(!Number.isSafeInteger(total))throw Error('المبلغ المستحق أكبر من الحد المسموح.');
 return {firstRent:parts.firstRent/1000,deposit:parts.deposit/1000,advance:parts.advance/1000,fees:parts.fees/1000,total:total/1000};
}

export function activeUnitConflict(contracts,candidate){
 const start=text(candidate?.start_date),end=text(candidate?.end_date),property=key(candidate?.property),unit=key(candidate?.unit),id=text(candidate?.id);
 const propertyId=text(candidate?.propertyId??candidate?.property_id),unitId=text(candidate?.unitId??candidate?.unit_id);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end))return null;
 return (contracts||[]).find(old=>{
  if((id&&text(old?.id??old?.contractId)===id)||old?.status==='cancelled'||(old?.status==='draft'&&old?.source==='statement-import'))return false;
  const oldUnitId=text(old?.unitId??old?.unit_id),oldPropertyId=text(old?.propertyId??old?.property_id);
  // A saved unit ID is authoritative within this workspace. Names can change
  // or collide; legacy records without unit IDs still need normalized labels.
  if(unitId&&oldUnitId){if(unitId!==oldUnitId)return false;}
  else{
   const sameProperty=propertyId&&oldPropertyId?propertyId===oldPropertyId:Boolean(property&&key(old?.property??old?.propertyName)===property);
   if(!sameProperty||!unit||key(old?.unit??old?.unitName)!==unit)return false;
  }
  const oldStart=text(old?.start_date??old?.startDate),oldEnd=text(old?.end_date??old?.endDate),released=text(old?.vacated_on??old?.vacatedOn);
  // Match the server's inclusive occupancy range without changing contract history.
  // Invalid or out-of-range release metadata must not bypass the existing conflict.
  const releasedTime=/^\d{4}-\d{2}-\d{2}$/.test(released)?Date.parse(released+'T00:00:00Z'):NaN;
  const validRelease=Number.isFinite(releasedTime)&&new Date(releasedTime).toISOString().slice(0,10)===released&&released>=oldStart&&released<=oldEnd;
  const occupancyEnd=validRelease?released:oldEnd;
  return !oldStart||!oldEnd||start<=occupancyEnd&&end>=oldStart;
 })||null;
}

export function completeTenantIdentity(profile){
 const p=profile||{};
 return Boolean(text(p.nameAr)&&text(p.nameEn)&&/^\d{12}$/.test(digits(p.civilId))&&text(p.passportNo)&&/^\+?\d{8,15}$/.test(digits(p.phone).replace(/[ ()-]/g,''))&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(p.email))&&text(p.nationality)&&text(p.nationalityEn));
}

export function foundationPaymentCycle(value){
 if(!['1','3','6','12'].includes(String(value??'')))throw Error('اختر دورية السداد: شهري أو ربع سنوي أو نصف سنوي أو سنوي.');
 return Number(value);
}
