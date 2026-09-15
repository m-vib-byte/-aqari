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
 const start=text(candidate?.start_date),end=text(candidate?.end_date),property=key(candidate?.property),unit=key(candidate?.unit),id=String(candidate?.id??'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||!property||!unit)return null;
 return (contracts||[]).find(old=>{
  if(String(old?.id??old?.contractId??'')===id||old?.status==='cancelled')return false;
  if(key(old?.property??old?.propertyName)!==property||key(old?.unit??old?.unitName)!==unit)return false;
  const oldStart=text(old?.start_date??old?.startDate),oldEnd=text(old?.end_date??old?.endDate);
  return !oldStart||!oldEnd||start<=oldEnd&&end>=oldStart;
 })||null;
}

export function completeTenantIdentity(profile){
 const p=profile||{};
 return Boolean(text(p.nameAr)&&text(p.nameEn)&&/^\d{12}$/.test(digits(p.civilId))&&text(p.passportNo)&&/^\+?\d{8,15}$/.test(digits(p.phone).replace(/[ ()-]/g,''))&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(p.email))&&text(p.nationality)&&text(p.nationalityEn));
}
