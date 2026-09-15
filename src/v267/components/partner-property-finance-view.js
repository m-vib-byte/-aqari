const moneyFromFils=value=>{
 const raw=String(value??'');
 if(!/^-?(0|[1-9]\d{0,17})$/.test(raw))return '—';
 const negative=raw.startsWith('-'),digits=negative?raw.slice(1):raw,padded=digits.padStart(4,'0');
 const whole=padded.slice(0,-3),fraction=padded.slice(-3);
 return (negative?'-':'')+whole+'.'+fraction+' د.ك';
};

const pair=(list,label,value)=>{
 const dt=document.createElement('dt'),dd=document.createElement('dd');
 dt.textContent=label;dd.textContent=moneyFromFils(value);list.append(dt,dd);
};

export function partnerPropertyFinanceView(data){
 const section=document.createElement('section'),heading=document.createElement('h3');
 heading.textContent='الملخص المالي للعقار';section.append(heading);
 if(!data?.available){const p=document.createElement('p');p.textContent=data?.reason==='FUTURE_MONTH'?'لا يوجد ملخص مالي معتمد لشهر مستقبلي.':'الملخص المالي غير متاح.';section.append(p);return section;}
 const list=document.createElement('dl');
 pair(list,'تحصيل الشهر',data.month?.income_fils);
 pair(list,'المستحق للشهر',data.month?.expected_income_fils);
 pair(list,'مصروفات الشهر',data.month?.expenses_fils);
 pair(list,'صافي الشهر',data.month?.net_fils);
 pair(list,'تحصيل السنة حتى الفترة',data.year?.income_fils);
 pair(list,'مصروفات السنة حتى الفترة',data.year?.expenses_fils);
 pair(list,'صافي السنة حتى الفترة',data.year?.net_fils);
 pair(list,'المتأخرات حتى الفترة',data.arrears_fils);
 section.append(list);
 if(data.complete===false){const warning=document.createElement('p');warning.textContent='الملخص غير مكتمل: توجد رواتب مشتركة لم تُخصص للعقار بعد، لذلك لا يُعتمد الصافي كقيمة نهائية.';section.append(warning);}
 const note=document.createElement('p');note.textContent='الأرقام مجمعة من التحصيلات الفعلية غير الملغاة والمصروفات المعتمدة والمخصصة لهذا العقار فقط.';section.append(note);
 return section;
}
