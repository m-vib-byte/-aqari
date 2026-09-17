export const KNET_RANGE_API_MARKER='v267KnetRangePayments';
export const KNET_RANGE_UI_MARKER='v267KnetRangeReport';

export function patchProtectedKnetRangeApi(source){
  let next=String(source||'');
  if(next.includes(KNET_RANGE_API_MARKER))return next;

  const anchor=`  function secureRentOfficeData(name,period){`;
  if(!next.includes(anchor))throw Error('V267 KNET range protected API anchor not found.');

  const insertion=`  // ${KNET_RANGE_API_MARKER}\
  function v267KnetLedgerEntry(entry){\
    const explicit=referenceText(entry?.knetTransactionNo);\
    const hint=String(entry?.method||'')+' '+String(entry?.note||'');\
    return Boolean(explicit||/(?:k\\s*net|knet|كي\\s*نت)/i.test(hint));\
  }\
\
  function v267KnetDay(value){\
    const day=String(value||'');\
    if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(day)||!validRecordedDate(day))return '';\
    const stamp=Date.parse(day+'T00:00:00Z');\
    return Number.isFinite(stamp)?day:'';\
  }\
\
  function knetPayments(name,fromDay,toDay){\
    if(!protectedAccessReady())return null;\
    const from=v267KnetDay(fromDay),to=v267KnetDay(toDay);\
    if(!from||!to||from>to)return null;\
    const span=Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z');\
    if(!Number.isFinite(span)||span<0||span>365*86400000)return null;\
    const context=contextFor(name);\
    if(!context)return null;\
    const candidates=context.propertyLedger.filter(function(entry){\
      if(!settledPayment(entry?.status)||!validLedgerPaymentAmount(entry)||!validRecordedDate(entry?.paidAt)||!v267KnetLedgerEntry(entry))return false;\
      const day=ledgerPaymentDateKey(entry.paidAt);\
      return Boolean(day&&day>=from&&day<=to);\
    }).map(function(entry){\
      const transactionNo=ledgerTransactionNo(entry);\
      const internalReceiptNo=referenceText(entry?.receiptNo);\
      const externalReceiptNo=referenceText(entry?.voucherNo);\
      const receiptNo=ledgerReference(entry);\
      const amount=strictMoney(entry?.paid);\
      const tokens=[transactionNo&&'transaction:'+normalizedReference(transactionNo),internalReceiptNo&&'receipt:'+normalizedReference(internalReceiptNo),externalReceiptNo&&'voucher:'+normalizedReference(externalReceiptNo)].filter(Boolean);\
      const signature=JSON.stringify([normalizedReference(transactionNo),normalizedReference(internalReceiptNo),normalizedReference(externalReceiptNo),identitySignature(entry?.unit),identitySignature(entry?.tenant),String(amount),signatureScalar(entry?.paidAt),signatureScalar(entry?.period),signatureScalar(entry?.accountant)]);\
      return {entry,transactionNo,internalReceiptNo,externalReceiptNo,receiptNo,amount,tokens,signature};\
    });\
    const parent=candidates.map(function(_,index){return index});\
    function root(index){while(parent[index]!==index){parent[index]=parent[parent[index]];index=parent[index]}return index}\
    function join(left,right){const a=root(left),b=root(right);if(a!==b)parent[b]=a}\
    const owner=new Map();\
    candidates.forEach(function(item,index){item.tokens.forEach(function(token){const previous=owner.get(token);if(previous==null)owner.set(token,index);else join(index,previous)})});\
    const groups=new Map();\
    candidates.forEach(function(item,index){const key=root(index);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item)});\
    const records=[];\
    let reviewCount=0;\
    groups.forEach(function(group){\
      if(group.some(function(item){return item.tokens.length===0})){reviewCount+=group.length;return}\
      const signatures=new Set(group.map(function(item){return item.signature}));\
      if(signatures.size!==1){reviewCount+=group.length;return}\
      const item=group[0],entry=item.entry;\
      records.push(Object.freeze({\
        property:String(context.property?.[0]||''),unit:String(entry?.unit||''),tenant:String(entry?.tenant||''),contractId:String(entry?.contractId||entry?.contract_id||''),contractNo:String(entry?.contractNo||entry?.contract_no||''),\
        amount:item.amount,paidAt:String(entry?.paidAt||''),period:String(entry?.period||''),method:String(entry?.method||''),transactionNo:String(item.transactionNo||''),receiptNo:String(item.receiptNo||''),internalReceiptNo:String(item.internalReceiptNo||''),externalReceiptNo:String(item.externalReceiptNo||''),accountant:String(entry?.accountant||'')\
      }));\
    });\
    records.sort(function(left,right){return String(right.paidAt).localeCompare(String(left.paidAt))});\
    const receiptCount=new Set(records.map(function(row){return normalizedReference(row.receiptNo)}).filter(Boolean)).size;\
    return Object.freeze({property:String(context.property?.[0]||''),fromDay:from,toDay:to,knetTotal:exactMoneySum(records.map(function(row){return row.amount})),count:records.length,receiptCount:receiptCount,reviewCount:reviewCount,records:Object.freeze(records)});\
  }\
\
`;
  next=next.replace(anchor,insertion+anchor);

  const exportAnchor=`      dailyCollectionSummary:dailyCollectionSummary,\
`;
  if(!next.includes(exportAnchor))throw Error('V267 KNET range protected API export anchor not found.');
  next=next.replace(exportAnchor,exportAnchor+`      knetPayments:knetPayments,\
`);
  return next;
}

export function patchKnetRangeUi(source){
  let next=String(source||'');
  if(next.includes(KNET_RANGE_UI_MARKER))return next;
  if(!next.includes('id="v267TodayPayments"'))throw Error('V267 KNET range UI requires the today-payments overlay first.');

  const stateAnchor=`  let lastSignature='';`;
  if(!next.includes(stateAnchor))throw Error('V267 KNET range state anchor not found.');
  next=next.replace(stateAnchor,stateAnchor+`\
  let v267KnetMode='today';\
  let v267KnetFrom='';\
  let v267KnetTo='';`);

  const snapshotAnchor=`\
  function snapshot(){`;
  const rangeHelpers=`\
  function v267KnetRange(day){\
    const mode=['today','yesterday','month','custom'].includes(v267KnetMode)?v267KnetMode:'today';\
    let from=day,to=day,label='اليوم';\
    if(mode==='yesterday'){\
      const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-1);from=to=date.toISOString().slice(0,10);label='أمس';\
    }else if(mode==='month'){from=day.slice(0,7)+'-01';label='الشهر الحالي';}\
    else if(mode==='custom'){from=v267KnetFrom;to=v267KnetTo;label='فترة مخصصة';}\
    const format=/^\\d{4}-\\d{2}-\\d{2}$/;\
    const start=format.test(from)?Date.parse(from+'T00:00:00Z'):Number.NaN;\
    const end=format.test(to)?Date.parse(to+'T00:00:00Z'):Number.NaN;\
    const today=Date.parse(day+'T00:00:00Z');\
    const valid=Boolean(format.test(from)&&format.test(to)&&Number.isFinite(start)&&Number.isFinite(end)&&start<=end&&end<=today&&(end-start)<=365*86400000);\
    return Object.freeze({mode:mode,from:from,to:to,label:label,valid:valid});\
  }\
`;
  if(!next.includes(snapshotAnchor))throw Error('V267 KNET range snapshot anchor not found.');
  next=next.replace(snapshotAnchor,rangeHelpers+snapshotAnchor);

  const dailyAnchor=`    const daily=dailyRows.length&&dailyRows.every(Boolean)?dailyRows.reduce(function(out,row){\
      out.paid+=Math.round(row.paid*1000);out.count+=row.count;out.undated+=row.undated;out.rows.push(row);return out;\
    },{paid:0,count:0,undated:0,rows:[]}):null;`;
  const dailyReplacement=dailyAnchor+`\
    const knetRange=v267KnetRange(day);\
    const knetRows=knetRange.valid?propertyNames(scope).map(function(name){\
      const row=window.AQARI_V202?.knetPayments?.(name,knetRange.from,knetRange.to);\
      return row&&row.fromDay===knetRange.from&&row.toDay===knetRange.to&&norm(row.property)===norm(name)?row:null;\
    }):[];\
    const knet=knetRange.valid&&knetRows.length&&knetRows.every(Boolean)?knetRows.reduce(function(out,row){\
      out.total+=Math.round(number(row.knetTotal)*1000);out.count+=Math.max(0,Math.trunc(number(row.count)));out.receiptCount+=Math.max(0,Math.trunc(number(row.receiptCount)));out.reviewCount+=Math.max(0,Math.trunc(number(row.reviewCount)));\
      (Array.isArray(row.records)?row.records:[]).forEach(function(record){out.records.push(record)});return out;\
    },{total:0,count:0,receiptCount:0,reviewCount:0,records:[]}):null;`;
  if(!next.includes(dailyAnchor))throw Error('V267 KNET range daily anchor not found.');
  next=next.replace(dailyAnchor,dailyReplacement);

  const returnAnchor=`    return {scope:scope,period:period,summary:aggregate(items),daily:daily,day:day};`;
  if(!next.includes(returnAnchor))throw Error('V267 KNET range snapshot return anchor not found.');
  next=next.replace(returnAnchor,`    return {scope:scope,period:period,summary:aggregate(items),daily:daily,knet:knet,knetRange:knetRange,day:day};`);

  const markupAnchor=`\
  function markup(state){`;
  const markup=`\
  function v267KnetRangeMarkup(knet,range){\
    const current=range||{mode:'today',from:'',to:'',label:'اليوم',valid:false};\
    const option=function(value,label){return '<option value="'+value+'"'+(current.mode===value?' selected':'')+'>'+label+'</option>'};\
    const custom=current.mode==='custom';\
    const controls='<div class="v267-knet-range-controls"><label><span>الفترة</span><select id="v267KnetRangeMode">'+option('today','اليوم')+option('yesterday','أمس')+option('month','الشهر الحالي')+option('custom','فترة مخصصة')+'</select></label><label'+(custom?'':' hidden')+'><span>من</span><input id="v267KnetFrom" type="date" value="'+esc(current.from||'')+'"></label><label'+(custom?'':' hidden')+'><span>إلى</span><input id="v267KnetTo" type="date" value="'+esc(current.to||'')+'"></label></div>';\
    if(!current.valid)return '<section id="v267KnetRangeReport" class="v267-today-knet" aria-label="تقرير KNET">'+controls+'<div class="v210-clear"><strong>KNET</strong><span>اختر فترة صحيحة لا تتجاوز 366 يوماً ولا تتجاوز تاريخ اليوم.</span></div></section>';\
    const rows=knet&&Array.isArray(knet.records)?knet.records:[];\
    const detail=rows.length?rows.map(function(row){\
      const receipts=[row.internalReceiptNo&&'داخلي '+row.internalReceiptNo,row.externalReceiptNo&&'خارجي/يدوي '+row.externalReceiptNo].filter(Boolean).join(' • ');\
      const meta=[row.unit&&'الوحدة '+row.unit,row.tenant,row.period&&'عن '+row.period,row.paidAt,row.transactionNo&&'KNET '+row.transactionNo,row.receiptNo&&'وصل '+row.receiptNo,row.accountant&&'المحاسب '+row.accountant,receipts].filter(Boolean).join(' • ');\
      return '<button type="button" class="v267-today-payment-row" data-v210-property="'+esc(row.property)+'"><span dir="auto">'+esc(row.property)+'</span><strong>'+esc(money(row.amount))+'</strong><small>'+esc(meta)+'</small></button>';\
    }).join(''):'<div class="v210-clear"><strong>لا توجد عمليات KNET في الفترة</strong><span>لا توجد عملية مؤرخة ومربوطة بمرجع صالح ضمن العقارات المخولة.</span></div>';\
    if(!knet)return '<section id="v267KnetRangeReport" class="v267-today-knet" aria-label="تقرير KNET">'+controls+'<div class="v210-clear"><strong>KNET — '+esc(current.label)+'</strong><span>لا يتوفر سجل KNET محمي يمكن اعتماده.</span></div></section>';\
    const difference=Math.max(0,knet.count-knet.receiptCount);\
    const review=knet.reviewCount+difference;\
    const periodText=current.from===current.to?current.from:current.from+' ← '+current.to;\
    return '<section id="v267KnetRangeReport" class="v267-today-knet" aria-labelledby="v267KnetRangeTitle">'+controls+'<div class="v210-title"><div><span>'+esc(periodText)+'</span><h3 id="v267KnetRangeTitle">KNET — '+esc(current.label)+'</h3></div><strong>'+knet.count+' عملية • '+esc(money(knet.total/1000))+'</strong></div><div class="v210-clear"><strong>'+knet.receiptCount+' وصل مرتبط</strong><span>فرق العمليات/الوصولات '+difference+(review?' • يحتاج مراجعة: '+review:'')+'</span></div><div class="v267-today-payment-list">'+detail+'</div></section>';\
  }\
`;
  if(!next.includes(markupAnchor))throw Error('V267 KNET range markup anchor not found.');
  next=next.replace(markupAnchor,markup+markupAnchor);

  const detailAnchor=`      '</div>'+todayPaymentsMarkup(state.daily)+'<details class="v267-financial-detail"><summary>المستحقات وحالة المحفظة</summary><div class="v210-kpis v267-secondary-kpis">'+`;
  if(!next.includes(detailAnchor))throw Error('V267 KNET range detail anchor not found.');
  next=next.replace(detailAnchor,`      '</div>'+todayPaymentsMarkup(state.daily)+v267KnetRangeMarkup(state.knet,state.knetRange)+'<details class="v267-financial-detail"><summary>المستحقات وحالة المحفظة</summary><div class="v210-kpis v267-secondary-kpis">'+`);

  const signatureAnchor=`    const signature=JSON.stringify([state.scope,state.period,state.summary,state.day,state.daily]);`;
  if(!next.includes(signatureAnchor))throw Error('V267 KNET range signature anchor not found.');
  next=next.replace(signatureAnchor,`    const signature=JSON.stringify([state.scope,state.period,state.summary,state.day,state.daily,state.knetRange,state.knet]);`);

  const inputAnchor=`  document.addEventListener('input',function(event){\
    if(event.target?.id==='v210Period'){\
      const value=text(event.target.value);\
      event.target.setCustomValidity(PERIOD.test(value)?'':'أدخل شهراً صحيحاً بصيغة السنة ثم الشهر، مثل 2026-09.');\
      if(event.target.validity.valid)syncPeriod(value);\
    }\
  });`;
  const inputReplacement=`  document.addEventListener('input',function(event){\
    if(event.target?.id==='v210Period'){\
      const value=text(event.target.value);\
      event.target.setCustomValidity(PERIOD.test(value)?'':'أدخل شهراً صحيحاً بصيغة السنة ثم الشهر، مثل 2026-09.');\
      if(event.target.validity.valid)syncPeriod(value);\
      return;\
    }\
    if(event.target?.id==='v267KnetRangeMode'){\
      const value=text(event.target.value);\
      if(!['today','yesterday','month','custom'].includes(value))return;\
      v267KnetMode=value;\
      if(value==='custom'&&(!v267KnetFrom||!v267KnetTo)){const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuwait',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());v267KnetFrom=today;v267KnetTo=today}\
      lastSignature='';render();return;\
    }\
    if(event.target?.id==='v267KnetFrom'||event.target?.id==='v267KnetTo'){\
      const value=text(event.target.value);\
      if(value&&!/^\\d{4}-\\d{2}-\\d{2}$/.test(value))return;\
      if(event.target.id==='v267KnetFrom')v267KnetFrom=value;else v267KnetTo=value;\
      lastSignature='';render();\
    }\
  });`;
  if(!next.includes(inputAnchor))throw Error('V267 KNET range input anchor not found.');
  next=next.replace(inputAnchor,inputReplacement);

  return next;
}
