export const TODAY_PAYMENTS_MARKER='v267TodayPayments';

export function patchTodayPayments(source){
  let next=String(source||'');
  if(next.includes(TODAY_PAYMENTS_MARKER))return next;

  const dailyAnchor=`    const dailyRows=propertyNames(scope).map(function(name){return window.AQARI_V202?.dailyCollectionSummary?.(name,day)});\n    const daily=dailyRows.length&&dailyRows.every(function(row){return row&&row.day===day})?dailyRows.reduce(function(out,row){out.paid+=Math.round(row.paid*1000);out.undated+=row.undated;return out},{paid:0,undated:0}):null;`;
  const dailyReplacement=`    const dailyRows=propertyNames(scope).map(function(name){\n      const row=window.AQARI_V202?.dailyCollectionSummary?.(name,day);\n      return row&&row.day===day?{name:name,paid:Math.max(0,number(row.paid)),count:Math.max(0,Math.trunc(number(row.count))),undated:Math.max(0,Math.trunc(number(row.undated)))}:null;\n    });\n    const daily=dailyRows.length&&dailyRows.every(Boolean)?dailyRows.reduce(function(out,row){\n      out.paid+=Math.round(row.paid*1000);out.count+=row.count;out.undated+=row.undated;out.rows.push(row);return out;\n    },{paid:0,count:0,undated:0,rows:[]}):null;`;
  if(!next.includes(dailyAnchor))throw Error('V267 today payments daily summary anchor not found.');
  next=next.replace(dailyAnchor,dailyReplacement);

  const markupAnchor='\n  function markup(state){';
  const todayMarkup=`\n  function todayPaymentsMarkup(daily){\n    if(!daily)return '<section id="v267TodayPayments" class="v267-today-payments" aria-label="دفعات اليوم"><div class="v210-clear"><strong>دفعات اليوم</strong><span>لا يتوفر سجل دفعات مؤرخ يمكن اعتماده.</span></div></section>';\n    const rows=Array.isArray(daily.rows)?daily.rows:[];\n    const list=rows.length?rows.map(function(row){\n      const warning=row.undated?' • توجد دفعات بلا تاريخ ولا تدخل في رقم اليوم':'';\n      return '<div class="v267-today-payment-row"><span dir="auto">'+esc(row.name)+'</span><strong>'+row.count+' عملية • '+esc(money(row.paid))+'</strong><small>'+esc('حسب تاريخ الدفع — الكويت'+warning)+'</small></div>';\n    }).join(''):'<div class="v210-clear"><strong>لا توجد عقارات ظاهرة</strong><span>لا توجد بيانات مخولة لهذا الحساب.</span></div>';\n    return '<section id="v267TodayPayments" class="v267-today-payments" aria-labelledby="v267TodayPaymentsTitle"><div class="v210-title"><div><span>السجل المؤرخ</span><h3 id="v267TodayPaymentsTitle">دفعات اليوم</h3></div><strong>'+daily.count+' عملية • '+esc(money(daily.paid/1000))+'</strong></div><div class="v267-today-payment-list">'+list+'</div></section>';\n  }\n`;
  if(!next.includes(markupAnchor))throw Error('V267 today payments markup anchor not found.');
  next=next.replace(markupAnchor,todayMarkup+markupAnchor);

  if(!next.includes('<span>تحصيل اليوم</span>'))throw Error('V267 today payments hero label anchor not found.');
  next=next.replace('<span>تحصيل اليوم</span>','<span>دفعات اليوم</span>');

  const detailAnchor=`      '</div><details class="v267-financial-detail"><summary>المستحقات وحالة المحفظة</summary><div class="v210-kpis v267-secondary-kpis">'+`;
  const detailReplacement=`      '</div>'+todayPaymentsMarkup(state.daily)+'<details class="v267-financial-detail"><summary>المستحقات وحالة المحفظة</summary><div class="v210-kpis v267-secondary-kpis">'+`;
  if(!next.includes(detailAnchor))throw Error('V267 today payments detail anchor not found.');
  next=next.replace(detailAnchor,detailReplacement);

  const statusAnchor=`state.daily?(state.daily.undated?'دفعات مؤرخة فقط؛ توجد دفعات بلا تاريخ':'الدفعات المسجلة بتاريخ اليوم — الكويت'):'لا يتوفر سجل دفعات مؤرخ'`;
  const statusReplacement=`state.daily?(state.daily.count+' عملية مسجلة اليوم'+(state.daily.undated?'؛ توجد دفعات بلا تاريخ':' — الكويت')):'لا يتوفر سجل دفعات مؤرخ'`;
  if(!next.includes(statusAnchor))throw Error('V267 today payments hero status anchor not found.');
  next=next.replace(statusAnchor,statusReplacement);

  return next;
}
