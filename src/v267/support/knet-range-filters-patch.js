export const KNET_RANGE_MARKER='v267KnetRangeFilters';

export function patchKnetRangeFilters(source){
  let next=String(source||'');
  if(next.includes(KNET_RANGE_MARKER))return next;
  if(!next.includes('function todayKnetMarkup(knet){'))throw Error('V267 KNET range markup anchor not found.');
  if(!next.includes("document.addEventListener('click',function(event){"))throw Error('V267 KNET range click anchor not found.');

  const helperAnchor='  function todayKnetMarkup(knet){';
  const helpers=`  // ${KNET_RANGE_MARKER}
  function v267KnetDateMs(value){
    if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(value||'')))return NaN;
    const parts=String(value).split('-').map(Number),ms=Date.UTC(parts[0],parts[1]-1,parts[2]),d=new Date(ms);
    return d.getUTCFullYear()===parts[0]&&d.getUTCMonth()===parts[1]-1&&d.getUTCDate()===parts[2]?ms:NaN;
  }
  function v267KnetDateText(ms){return new Date(ms).toISOString().slice(0,10)}
  function v267KnetToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuwait',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
  function v267KnetToken(value){return String(value||'').normalize('NFKC').trim().toLowerCase().replace(/\\s+/g,'')}
  function v267KnetRange(scope,from,to){
    if(!scope||scopeKey()!==scope)return null;
    const start=v267KnetDateMs(from),end=v267KnetDateMs(to),dayMs=86400000;
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||Math.floor((end-start)/dayMs)>365)return null;
    const candidates=[];let baseReview=0;
    for(let cursor=start;cursor<=end;cursor+=dayMs){
      const day=v267KnetDateText(cursor);
      for(const name of propertyNames(scope)){
        const row=window.AQARI_V202?.dailyKnetPayments?.(name,day);
        if(!row||row.day!==day||norm(row.property)!==norm(name)||scopeKey()!==scope)return null;
        baseReview+=Math.max(0,Math.trunc(number(row.reviewCount)));
        for(const record of Array.isArray(row.records)?row.records:[])candidates.push(record);
      }
    }
    const parent=candidates.map((_,index)=>index),root=index=>{while(parent[index]!==index){parent[index]=parent[parent[index]];index=parent[index]}return index},join=(a,b)=>{a=root(a);b=root(b);if(a!==b)parent[b]=a};
    const tokenOwner=new Map(),tokensFor=row=>[row.transactionNo,row.internalReceiptNo,row.externalReceiptNo,row.receiptNo].map(v267KnetToken).filter(Boolean);
    candidates.forEach((row,index)=>tokensFor(row).forEach(token=>{const prior=tokenOwner.get(token);if(prior===undefined)tokenOwner.set(token,index);else join(index,prior)}));
    const groups=new Map();candidates.forEach((row,index)=>{const key=root(index);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)});
    const records=[];let reviewCount=baseReview;
    groups.forEach(group=>{
      if(group.some(row=>tokensFor(row).length===0)){reviewCount+=group.length;return}
      const signatures=new Set(group.map(row=>JSON.stringify([v267KnetToken(row.transactionNo),v267KnetToken(row.internalReceiptNo),v267KnetToken(row.externalReceiptNo),v267KnetToken(row.receiptNo),norm(row.property),String(row.unit||''),String(row.contractNo||row.contractId||''),String(number(row.amount)),String(row.paidAt||''),String(row.period||''),String(row.accountant||'')])));
      if(signatures.size!==1){reviewCount+=group.length;return}
      records.push(group[0]);
    });
    records.sort((a,b)=>String(b.paidAt||'').localeCompare(String(a.paidAt||'')));
    const total=records.reduce((sum,row)=>sum+Math.round(number(row.amount)*1000),0);
    const receiptCount=new Set(records.map(row=>v267KnetToken(row.receiptNo)).filter(Boolean)).size;
    return {from:String(from),to:String(to),total,count:records.length,receiptCount,reviewCount,records};
  }
  function v267KnetRangeMarkup(result,label){
    if(!result)return '<div class="v210-clear"><strong>تعذر عرض الفترة</strong><span>تحقق من التواريخ والصلاحية؛ الحد الأقصى 366 يومًا.</span></div>';
    const details=result.records.length?result.records.map(row=>{
      const refs=[row.unit&&'الوحدة '+row.unit,row.tenant,row.paidAt,row.period&&'عن '+row.period,row.transactionNo&&'KNET '+row.transactionNo,row.receiptNo&&'وصل '+row.receiptNo,row.accountant&&'المحاسب '+row.accountant].filter(Boolean).join(' • ');
      return '<button type="button" class="v267-today-payment-row" data-v210-property="'+esc(row.property)+'"><span dir="auto">'+esc(row.property)+'</span><strong>'+esc(money(row.amount))+'</strong><small>'+esc(refs)+'</small></button>';
    }).join(''):'<div class="v210-clear"><strong>لا توجد عمليات KNET في هذه الفترة</strong><span>لا توجد عمليات مؤرخة ومربوطة بمرجع صالح ضمن النطاق المختار.</span></div>';
    const diff=Math.max(0,result.count-result.receiptCount),review=result.reviewCount+diff;
    return '<div class="v210-title"><div><span>الفترة '+esc(result.from)+' — '+esc(result.to)+'</span><h4>'+esc(label)+'</h4></div><strong>'+result.count+' عملية • '+esc(money(result.total/1000))+'</strong></div><div class="v210-clear"><strong>'+result.receiptCount+' وصل مرتبط</strong><span>فرق العمليات/الوصولات '+diff+(review?' • يحتاج مراجعة: '+review:'')+'</span></div><div class="v267-today-payment-list">'+details+'</div>';
  }
  function v267RunKnetFilter(mode){
    const scope=scopeKey(),target=document.getElementById('v267KnetRangeResult');if(!scope||!target)return false;
    const today=v267KnetToday(),todayMs=v267KnetDateMs(today);let from=today,to=today,label='KNET اليوم';
    if(mode==='yesterday'){from=to=v267KnetDateText(todayMs-86400000);label='KNET أمس'}
    else if(mode==='month'){from=today.slice(0,7)+'-01';label='KNET الشهر الحالي'}
    else if(mode==='custom'){
      from=String(document.getElementById('v267KnetFrom')?.value||'');to=String(document.getElementById('v267KnetTo')?.value||'');label='KNET فترة مخصصة';
    }
    const result=v267KnetRange(scope,from,to);target.innerHTML=v267KnetRangeMarkup(result,label);return Boolean(result);
  }

`;
  next=next.replace(helperAnchor,helpers+helperAnchor);

  const controlAnchor=`    return '<section id="v267TodayKnetDetails" class="v267-today-knet" aria-labelledby="v267TodayKnetTitle"><div class="v210-title"><div><span>إقفال اليوم</span><h3 id="v267TodayKnetTitle">KNET اليوم</h3></div><strong>'+knet.count+' عملية • '+esc(money(knet.total/1000))+'</strong></div><div class="v210-clear"><strong>'+knet.receiptCount+' وصل مرتبط</strong><span>فرق العمليات/الوصولات '+difference+warning+'</span></div><div class="v267-today-payment-list">'+detail+'</div></section>';`;
  if(!next.includes(controlAnchor))throw Error('V267 KNET range control anchor not found.');
  const controlReplacement=`    return '<section id="v267TodayKnetDetails" class="v267-today-knet" aria-labelledby="v267TodayKnetTitle"><div class="v210-title"><div><span>إقفال اليوم</span><h3 id="v267TodayKnetTitle">KNET اليوم</h3></div><strong>'+knet.count+' عملية • '+esc(money(knet.total/1000))+'</strong></div><div class="v210-clear"><strong>'+knet.receiptCount+' وصل مرتبط</strong><span>فرق العمليات/الوصولات '+difference+warning+'</span></div><div class="v267-knet-range-controls" role="group" aria-label="فلتر عمليات KNET"><button type="button" data-v267-knet-range="today">اليوم</button><button type="button" data-v267-knet-range="yesterday">أمس</button><button type="button" data-v267-knet-range="month">الشهر الحالي</button><label>من <input id="v267KnetFrom" type="date" dir="ltr"></label><label>إلى <input id="v267KnetTo" type="date" dir="ltr"></label><button type="button" data-v267-knet-range="custom">عرض الفترة</button></div><div id="v267KnetRangeResult" aria-live="polite"></div><div class="v267-today-payment-list">'+detail+'</div></section>';`;
  next=next.replace(controlAnchor,controlReplacement);

  const clickAnchor=`  document.addEventListener('click',function(event){
    const property=event.target?.closest?.('[data-v210-property]');`;
  if(!next.includes(clickAnchor))throw Error('V267 KNET range click binding anchor not found.');
  next=next.replace(clickAnchor,`  document.addEventListener('click',function(event){
    const range=event.target?.closest?.('[data-v267-knet-range]');
    if(range){event.preventDefault();v267RunKnetFilter(range.getAttribute('data-v267-knet-range')||'today');return}
    const property=event.target?.closest?.('[data-v210-property]');`);
  return next;
}
