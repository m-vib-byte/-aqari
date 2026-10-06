export function ownershipShareBasisPoints(value){
 const text=String(value??'').normalize('NFKC').trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace('٫','.').replace(/^\./,'0.');
 const match=/^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text);
 const bps=match?Number(match[1])*100+Number((match[2]||'').padEnd(2,'0')):0;
 if(!match||bps<1||bps>10000)throw Error('أدخل النسبة بين 0.01 و100 وبمنزلتين عشريتين كحد أقصى، دون تقريب.');
 return bps;
}

