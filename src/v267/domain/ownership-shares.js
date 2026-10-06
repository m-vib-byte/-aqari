export function ownershipShareBasisPoints(value){
 const text=String(value??'').normalize('NFKC').trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace('٫','.').replace(/^\./,'0.');
 const match=/^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text);
 const bps=match?Number(match[1])*100+Number((match[2]||'').padEnd(2,'0')):0;
 if(!match||bps<1||bps>10000)throw Error('أدخل النسبة بين 0.01 و100 وبمنزلتين عشريتين كحد أقصى، دون تقريب.');
 return bps;
}


// Master-file rows have no stable owner IDs. Compare a multiset, preserving duplicates.
export function masterOwnersMatch(actual,expected){
 const canonical=rows=>{
  if(!Array.isArray(rows))return null;
  const result=[];
  for(const row of rows){
   if(!row||!Number.isInteger(row.bps)||row.bps<1||row.bps>10000)return null;
   result.push(JSON.stringify([row.bps,...['name','role','email','phone','whatsapp'].map(key=>String(row[key]??''))]));
  }
  return JSON.stringify(result.sort());
 };
 const wanted=canonical(expected);
 return wanted!==null&&canonical(actual)===wanted;
}
