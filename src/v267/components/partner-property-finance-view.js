const integerText=value=>typeof value==='string'&&/^-?(0|[1-9]\d{0,17})$/.test(value);

const moneyFromFils=value=>{
 const raw=String(value??'');
 if(!/^-?(0|[1-9]\d{0,17})$/.test(raw))return '—';
 const negative=raw.startsWith('-'),digits=negative?raw.slice(1):raw,padded=digits.padStart(4,'0');
 const whole=padded.slice(0,-3),fraction=padded.slice(-3);
 return (negative?'-':'')+whole+'.'+fraction+' د.ك';
};

const moneyCsvFromFils=value=>{
 if(!integerText(value))throw Error('PARTNER_FINANCE_EXPORT_INVALID');
 const negative=value.startsWith('-'),digits=negative?value.slice(1):value,padded=digits.padStart(4,'0');
 return (negative?'-':'')+padded.slice(0,-3)+'.'+padded.slice(-3);
};

const csvCell=value=>{
 const text=String(value??'').replace(/\r\n?/g,'\n');
 const guarded=/^[\s]*[=+\-@]/.test(text)?"'"+text:text;
 return '"'+guarded.replace(/"/g,'""')+'"';
};

const pair=(list,label,value)=>{
 const dt=document.createElement('dt'),dd=document.createElement('dd');
 dt.textContent=label;dd.textContent=moneyFromFils(value);list.append(dt,dd);
};

export function partnerPropertyFinanceCsv(data,{propertyName='',period=''}={}){
 if(!data?.available||data.currency!=='KWD'||typeof data.complete!=='boolean'||!data.month||!data.year||!integerText(data.arrears_fils))throw Error('PARTNER_FINANCE_EXPORT_INVALID');
 const resolvedPeriod=String(data.period||'');
 if(!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(resolvedPeriod))throw Error('PARTNER_FINANCE_EXPORT_INVALID');
 if(period&&resolvedPeriod!==String(period).replace(/^(\d{4}-\d{2})$/,'$1-01'))throw Error('PARTNER_FINANCE_EXPORT_SCOPE_MISMATCH');
 const rows=[
  ['العقار',String(propertyName||'')],
  ['الفترة',resolvedPeriod.slice(0,7)],
  ['العملة','KWD'],
  ['حالة الملخص',data.complete?'مكتمل':'غير مكتمل'],
  ['تحصيل الشهر',moneyCsvFromFils(data.month.income_fils)],
  ['المستحق للشهر',moneyCsvFromFils(data.month.expected_income_fils)],
  ['مصروفات الشهر',moneyCsvFromFils(data.month.expenses_fils)],
  ['صافي الشهر',moneyCsvFromFils(data.month.net_fils)],
  ['تحصيل السنة حتى الفترة',moneyCsvFromFils(data.year.income_fils)],
  ['مصروفات السنة حتى الفترة',moneyCsvFromFils(data.year.expenses_fils)],
  ['صافي السنة حتى الفترة',moneyCsvFromFils(data.year.net_fils)],
  ['المتأخرات حتى الفترة',moneyCsvFromFils(data.arrears_fils)],
  ['ملاحظة',data.complete?'أرقام مجمعة مصرح بها فقط.':'غير مكتمل: توجد رواتب مشتركة لم تخصص للعقار بعد؛ لا يعتمد الصافي كقيمة نهائية.']
 ];
 return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}

const downloadCsv=(csv,period)=>{
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download='AQARI-partner-finance-'+String(period||'period').replace(/[^0-9-]/g,'')+'.csv';link.rel='noopener';
 document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
};

export function partnerPropertyFinanceView(data,context={}){
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
 const exportButton=document.createElement('button');exportButton.type='button';exportButton.textContent='تنزيل CSV المصرح';exportButton.dataset.aqariPartnerFinanceExport='true';
 exportButton.addEventListener('click',()=>downloadCsv(partnerPropertyFinanceCsv(data,context),data.period));section.append(exportButton);
 const note=document.createElement('p');note.textContent='الأرقام مجمعة من التحصيلات الفعلية غير الملغاة والمصروفات المعتمدة والمخصصة لهذا العقار فقط. التصدير يحتوي هذه المجاميع فقط ولا يضم بيانات المستأجرين أو الملاك الآخرين.';section.append(note);
 return section;
}
