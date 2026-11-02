(function(){
  'use strict';

  const DESIGN='V210-daily-command-center';
  const PERIOD=/^\d{4}-(0[1-9]|1[0-2])$/;
  let period=currentPeriod();
  let authSuspended=false;
  let authListenerInstalled=false;
  let timer=0;
  let lastSignature='';
  let lastSnapshot=null;
  let lastSnapshotKey='';

  function currentPeriod(){
    const date=new Date();
    return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');
  }

  function text(value){return String(value==null?'':value).trim()}
  function number(value){const result=Number(value);return Number.isFinite(result)?result:0}
  function esc(value){
    return String(value==null?'':value).replace(/[&<>'\"]/g,function(char){
      return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[char];
    });
  }
  function identity(value){
    if(typeof value!=='string'||value!==value.trim()||/(?:\p{Cc}|\p{Cf}|\p{Zl}|\p{Zp}|\p{Default_Ignorable_Code_Point})/u.test(value))return '';
    return value;
  }
  function norm(value){
    return text(value).normalize('NFKD').replace(/[\u064B-\u065F\u0670]/g,'').replace(/\s+/g,' ').toLocaleLowerCase('ar');
  }
  function money(value){
    try{return number(value).toLocaleString('ar-KW',{maximumFractionDigits:3})+' د.ك'}
    catch(_){return String(number(value))+' د.ك'}
  }
  function periodLabel(value){
    try{return new Intl.DateTimeFormat('ar-KW',{month:'long',year:'numeric'}).format(new Date(value+'-01T12:00:00'))}
    catch(_){return value}
  }

  function authAccess(context){
    const userId=identity(context?.user?.id);
    const workspaceId=identity(context?.workspace?.id);
    const membership=context?.membership;
    const membershipUserId=identity(membership?.user_id);
    const membershipWorkspaceId=identity(membership?.workspace_id);
    const role=identity(membership?.role);
    if(!userId||!workspaceId||!role||membership?.is_active!==true||membershipUserId!==userId||membershipWorkspaceId!==workspaceId)return null;
    return Object.freeze({userId:userId,workspaceId:workspaceId,role:role});
  }

  function sameAccess(left,right){
    return Boolean(left&&right&&left.userId===right.userId&&left.workspaceId===right.workspaceId&&left.role===right.role);
  }

  function dataScopesReady(access){
    const dataScope=window.AQARI_DATA_GATE?.scope;
    const storageScope=window.AQARI_EARLY_STORAGE_GATE?.scope;
    return Boolean(access&&dataScope&&storageScope&&
      identity(dataScope.userId)===access.userId&&identity(dataScope.workspaceId)===access.workspaceId&&
      identity(storageScope.userId)===access.userId&&identity(storageScope.workspaceId)===access.workspaceId);
  }

  function scopeKey(){
    try{
      const access=authAccess(window.AQARI_SUPABASE?.context);
      return authSuspended||!dataScopesReady(access)?'':access.userId+'\u0000'+access.workspaceId+'\u0000'+access.role;
    }catch(_){return ''}
  }

  function propertyNames(expectedScope){
    const scope=scopeKey();
    if(!scope||(expectedScope&&scope!==expectedScope)||typeof window.AQARI_V202?.rentOfficeProperties!=='function')return [];
    let names=[];
    try{names=window.AQARI_V202.rentOfficeProperties()}catch(_){names=[]}
    if(scopeKey()!==scope||!Array.isArray(names))return [];
    const seen=new Set();
    return names.map(text).filter(function(name){
      const key=norm(name);
      if(!name||!key||seen.has(key))return false;
      seen.add(key);return true;
    });
  }

  function officeData(name,expectedScope){
    const scope=scopeKey();
    if(!scope||scope!==expectedScope||!PERIOD.test(period)||typeof window.AQARI_V202?.rentOfficeData!=='function')return null;
    let data=null;
    try{data=window.AQARI_V202.rentOfficeData(name,period)}catch(_){data=null}
    if(scopeKey()!==scope||!data||norm(data.property)!==norm(name)||text(data.period)!==period)return null;
    return data;
  }

  function aggregate(items){
    const output={unreviewed:0,properties:0,due:0,collected:0,balance:0,dueProperties:0,lateTenants:0,pendingApprovals:0,readyDocuments:0,setup:0,priorities:[]};
    (Array.isArray(items)?items:[]).forEach(function(item){
      if(!item||item.valid!==true)return;
      output.properties+=1;if(item.obligationsVerified===false)output.unreviewed+=1;
      output.due+=Math.max(0,number(item.due));
      output.collected+=Math.max(0,number(item.collected));
      output.balance+=Math.max(0,number(item.balance));
      if(number(item.balance)>0)output.dueProperties+=1;
      if(number(item.units)===0)output.setup+=1;
      const records=Array.isArray(item.records)?item.records:[];
      records.forEach(function(record){
        const balance=Math.max(0,number(record?.balance));
        const pending=Math.max(0,number(record?.pending));
        if(record?.billable===true&&balance>0&&pending===0)output.lateTenants+=1;
        if(pending>0||['قيد المراجعة','يحتاج مراجعة'].includes(text(record?.paymentStatus)))output.pendingApprovals+=1;
        if(record?.hasContract===true||text(record?.receiptNo))output.readyDocuments+=1;
      });
      if(number(item.balance)>0||number(item.pending)>0||number(item.units)===0){
        output.priorities.push({name:text(item.name),balance:Math.max(0,number(item.balance)),pending:Math.max(0,number(item.pending)),setup:number(item.units)===0,canRecordPayment:item.canRecordPayment===true});
      }
    });
    output.priorities.sort(function(left,right){
      if(left.balance!==right.balance)return right.balance-left.balance;
      if(left.pending!==right.pending)return right.pending-left.pending;
      if(left.setup!==right.setup)return left.setup?1:-1;
      return left.name.localeCompare(right.name,'ar',{numeric:true,sensitivity:'base'});
    });
    output.priorities=output.priorities.slice(0,4);
    return output;
  }

  function snapshot(){
    const scope=scopeKey();
    if(!scope){lastSnapshot=null;lastSnapshotKey='';return null}
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuwait',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const revision=window.AQARI_V202?.rentOfficeRevision?.();
    const key=Number.isSafeInteger(revision)?JSON.stringify([scope,period,day,revision]):'';
    if(key&&key===lastSnapshotKey&&scopeKey()===scope)return lastSnapshot;
    const result=computeSnapshot(scope,day);
    // Build overlays extend computeSnapshot; retain their complete result too.
    lastSnapshotKey=key&&result&&scopeKey()===scope&&window.AQARI_V202?.rentOfficeRevision?.()===revision?key:'';
    lastSnapshot=lastSnapshotKey?result:null;
    return result;
  }

  function computeSnapshot(scope,day){
    const items=propertyNames(scope).map(function(name){
      const data=officeData(name,scope);
      if(!data)return {name:name,valid:false};
      const records=Array.isArray(data.records)?data.records:[];
      return {
        name:name,valid:true,obligationsVerified:data.obligationsVerified!==false,due:number(data.totalRent),collected:number(data.totalCollected),balance:number(data.totalBalance),units:number(data.unitCount),
        pending:records.reduce(function(sum,row){return sum+Math.max(0,number(row?.pending))},0),
        canRecordPayment:data.canRecordPayment===true,
        records:records.map(function(row){return {billable:row?.billable===true,balance:number(row?.balance),pending:number(row?.pending),paymentStatus:text(row?.paymentStatus),hasContract:row?.hasContract===true,receiptNo:text(row?.receiptNo)}})
      };
    });
    if(scopeKey()!==scope)return null;
    const dailyRows=propertyNames(scope).map(function(name){
      const row=window.AQARI_V202?.dailyCollectionSummary?.(name,day);
      return row&&row.day===day?{name:name,paid:Math.max(0,number(row.paid)),count:Math.max(0,Math.trunc(number(row.count))),undated:Math.max(0,Math.trunc(number(row.undated)))}:null;
    });
    const daily=dailyRows.length&&dailyRows.every(Boolean)?dailyRows.reduce(function(out,row){
      out.paid+=Math.round(row.paid*1000);out.count+=row.count;out.undated+=row.undated;out.rows.push(row);return out;
    },{paid:0,count:0,undated:0,rows:[]}):null;
    const knetRows=propertyNames(scope).map(function(name){
      const row=window.AQARI_V202?.dailyKnetPayments?.(name,day);
      return row&&row.day===day&&norm(row.property)===norm(name)?row:null;
    });
    const knet=knetRows.length&&knetRows.every(Boolean)?knetRows.reduce(function(out,row){
      out.total+=Math.round(number(row.knetTotal)*1000);out.count+=Math.max(0,Math.trunc(number(row.count)));out.receiptCount+=Math.max(0,Math.trunc(number(row.receiptCount)));out.reviewCount+=Math.max(0,Math.trunc(number(row.reviewCount)));
      (Array.isArray(row.records)?row.records:[]).forEach(function(record){out.records.push(record)});return out;
    },{total:0,count:0,receiptCount:0,reviewCount:0,records:[]}):null;
    if(scopeKey()!==scope)return null;
    return {scope:scope,period:period,summary:aggregate(items),daily:daily,knet:knet,day:day};
  }

  function priorityMarkup(items){
    if(!items.length)return '<div class="v210-clear"><strong>يومك منتظم</strong><span>لا توجد أولويات تحصيل معلّقة لهذه الفترة.</span></div>';
    return items.map(function(item,index){
      const detail=item.balance>0?money(item.balance)+' متبقي':item.pending>0?money(item.pending)+' قيد المراجعة':'يحتاج ربط بيانات الإيجار';
      return '<button type="button" class="v210-priority" data-v210-property="'+esc(item.name)+'"><b>'+(index+1)+'</b><span><strong dir="auto">'+esc(item.name)+'</strong><small>'+esc(detail)+(item.balance>0&&!item.canRecordPayment?' • عرض فقط':'')+'</small></span><i aria-hidden="true">←</i></button>';
    }).join('');
  }

  function todayPaymentsMarkup(daily){
    if(!daily)return '<section id="v267TodayPayments" class="v267-today-payments" aria-label="دفعات اليوم"><div class="v210-clear"><strong>دفعات اليوم</strong><span>لا يتوفر سجل دفعات مؤرخ يمكن اعتماده.</span></div></section>';
    const rows=Array.isArray(daily.rows)?daily.rows:[];
    const list=rows.length?rows.map(function(row){
      const warning=row.undated?' • توجد دفعات بلا تاريخ ولا تدخل في رقم اليوم':'';
      return '<div class="v267-today-payment-row"><span dir="auto">'+esc(row.name)+'</span><strong>'+row.count+' عملية • '+esc(money(row.paid))+'</strong><small>'+esc('حسب تاريخ الدفع — الكويت'+warning)+'</small></div>';
    }).join(''):'<div class="v210-clear"><strong>لا توجد عقارات ظاهرة</strong><span>لا توجد بيانات مخولة لهذا الحساب.</span></div>';
    return '<section id="v267TodayPayments" class="v267-today-payments" aria-labelledby="v267TodayPaymentsTitle"><div class="v210-title"><div><span>السجل المؤرخ</span><h3 id="v267TodayPaymentsTitle">دفعات اليوم</h3></div><strong>'+daily.count+' عملية • '+esc(money(daily.paid/1000))+'</strong></div><div class="v267-today-payment-list">'+list+'</div></section>';
  }

  // v267KnetRangeFilters
  function v267KnetDateMs(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return NaN;
    const parts=String(value).split('-').map(Number),ms=Date.UTC(parts[0],parts[1]-1,parts[2]),d=new Date(ms);
    return d.getUTCFullYear()===parts[0]&&d.getUTCMonth()===parts[1]-1&&d.getUTCDate()===parts[2]?ms:NaN;
  }
  function v267KnetDateText(ms){return new Date(ms).toISOString().slice(0,10)}
  function v267KnetToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuwait',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
  function v267KnetToken(value){return String(value||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,'')}
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

  function todayKnetMarkup(knet){
    if(!knet)return '<section id="v267TodayKnetDetails" class="v267-today-knet" aria-label="تفاصيل KNET اليوم"><div class="v210-clear"><strong>KNET اليوم</strong><span>لا يتوفر سجل KNET محمي يمكن اعتماده.</span></div></section>';
    const rows=Array.isArray(knet.records)?knet.records:[];
    const detail=rows.length?rows.map(function(row){
      const receipts=[row.internalReceiptNo&&'داخلي '+row.internalReceiptNo,row.externalReceiptNo&&'خارجي/يدوي '+row.externalReceiptNo].filter(Boolean).join(' • ');
      const meta=[row.unit&&'الوحدة '+row.unit,row.tenant,row.period&&'عن '+row.period,row.paidAt,row.transactionNo&&'KNET '+row.transactionNo,row.receiptNo&&'وصل '+row.receiptNo,row.accountant&&'المحاسب '+row.accountant,receipts].filter(Boolean).join(' • ');
      return '<button type="button" class="v267-today-payment-row" data-v210-property="'+esc(row.property)+'"><span dir="auto">'+esc(row.property)+'</span><strong>'+esc(money(row.amount))+'</strong><small>'+esc(meta)+'</small></button>';
    }).join(''):'<div class="v210-clear"><strong>لا توجد عمليات KNET اليوم</strong><span>لا توجد عملية KNET مؤرخة ومربوطة بمرجع صالح ضمن العقارات المخولة.</span></div>';
    const difference=Math.max(0,knet.count-knet.receiptCount);
    const warning=knet.reviewCount||difference?' • يحتاج مراجعة: '+(knet.reviewCount+difference):'';
    return '<section id="v267TodayKnetDetails" class="v267-today-knet" aria-labelledby="v267TodayKnetTitle"><div class="v210-title"><div><span>إقفال اليوم</span><h3 id="v267TodayKnetTitle">KNET اليوم</h3></div><strong>'+knet.count+' عملية • '+esc(money(knet.total/1000))+'</strong></div><div class="v210-clear"><strong>'+knet.receiptCount+' وصل مرتبط</strong><span>فرق العمليات/الوصولات '+difference+warning+'</span></div><div class="v267-knet-range-controls" role="group" aria-label="فلتر عمليات KNET"><button type="button" data-v267-knet-range="today">اليوم</button><button type="button" data-v267-knet-range="yesterday">أمس</button><button type="button" data-v267-knet-range="month">الشهر الحالي</button><label>من <input id="v267KnetFrom" type="date" dir="ltr"></label><label>إلى <input id="v267KnetTo" type="date" dir="ltr"></label><button type="button" data-v267-knet-range="custom">عرض الفترة</button></div><div id="v267KnetRangeResult" aria-live="polite"></div><div class="v267-today-payment-list">'+detail+'</div></section>';
  }

  function markup(state){
    const summary=state.summary;
    const rate=summary.due>0?Math.min(100,Math.max(0,summary.collected/summary.due*100)):0;
    const critical=summary.dueProperties+summary.pendingApprovals+summary.setup;
    return '<section id="v210DailyCommandCenter" class="v210-command" data-period="'+esc(state.period)+'" aria-labelledby="v210Title">'+
      '<header class="v210-head"><div><span>ملخص التحصيل</span><h2 id="v210Title">التحصيل والمتابعة</h2><p>أرقام دفتر الإيجارات للفترة المختارة.</p></div><label for="v210Period"><span>شهر التحصيل</span><input id="v210Period" type="month" value="'+esc(period)+'" required pattern="[0-9]{4}-(0[1-9]|1[0-2])" placeholder="YYYY-MM" dir="ltr" aria-describedby="v210PeriodHint"><small id="v210PeriodHint" hidden>أدخل السنة ثم الشهر، مثال: '+esc(period)+'</small></label></header>'+
      '<div class="v267-collection-hero v210-kpis" aria-live="polite">'+
        '<button type="button" data-v210-route="collectionProPage" class="is-today"><span>دفعات اليوم</span><strong>'+(state.daily?esc(money(state.daily.paid/1000)):'—')+'</strong><small>'+(state.daily?(state.daily.count+' عملية مسجلة اليوم'+(state.daily.undated?'؛ توجد دفعات بلا تاريخ':' — الكويت')):'لا يتوفر سجل دفعات مؤرخ')+'</small></button>'+
        '<button type="button" data-v210-route="collectionProPage" class="is-green"><span>تحصيل الشهر</span><strong>'+esc(money(summary.collected))+'</strong><small>'+(summary.unreviewed?'النسبة معلقة حتى اعتماد العقود':rate.toFixed(0)+'٪ من المستحق')+'</small></button>'+
      '</div>'+todayPaymentsMarkup(state.daily)+todayKnetMarkup(state.knet)+'<details class="v267-financial-detail"><summary>المستحقات وحالة المحفظة</summary><div class="v210-kpis v267-secondary-kpis">'+
        '<button type="button" data-v210-route="collectionProPage" class="is-gold"><span>المستحق</span><strong>'+esc(summary.unreviewed?'معلّق':money(summary.due))+'</strong><small>'+summary.dueProperties+' عقار يحتاج متابعة</small></button>'+
        '<button type="button" data-v210-route="collectionProPage" class="is-red"><span>متأخرون</span><strong>'+(summary.unreviewed?'معلّق':summary.lateTenants)+'</strong><small>'+esc(summary.unreviewed?'معلّق':money(summary.balance))+' متبقي</small></button>'+
        '<button type="button" data-v210-route="collectionProPage" class="is-amber"><span>بانتظار المراجعة</span><strong>'+summary.pendingApprovals+'</strong><small>دفعات أو سجلات معلّقة</small></button>'+
        '<button type="button" data-v210-route="documentsHub"><span>مستندات جاهزة</span><strong>'+summary.readyDocuments+'</strong><small>عقود أو وصولات متاحة</small></button>'+
        '<div class="is-dark"><span>مهام حرجة</span><strong>'+critical+'</strong><small>'+summary.properties+' عقار في '+esc(periodLabel(period))+'</small></div>'+
      '</div>'+
      '</details><div class="v210-body"><div class="v210-priorities"><div class="v210-title"><div><span>ترتيب تلقائي</span><h3>أولوية المتابعة</h3></div><button type="button" data-v210-route="collectionProPage">عرض الكل</button></div>'+priorityMarkup(summary.priorities)+'</div>'+
      '</div>'+ 
    '</section>';
  }

  function clear(){document.getElementById('v210DailyCommandCenter')?.remove();lastSignature='';lastSnapshot=null;lastSnapshotKey=''}

  function render(){
    // Do not rebuild portfolio summaries behind an active entry or document dialog.
    if(document.querySelector?.('#modal.on,#v202PaymentDialog.on,#v202PropertyWorkspace.on,#v202DocumentDialog.on'))return;
    const state=snapshot();
    const home=document.getElementById('v205SimpleHome');
    if(!state||!home){clear();return}
    const signature=JSON.stringify([state.scope,state.period,state.summary,state.day,state.daily,state.knet]);
    const current=document.getElementById('v210DailyCommandCenter');
    if(current&&signature===lastSignature)return;
    const holder=document.createElement('div');
    holder.innerHTML=markup(state);
    const next=holder.firstElementChild;
    if(!next)return;
    const monthInput=next.querySelector('#v210Period');
    const monthHint=next.querySelector('#v210PeriodHint');
    if(monthInput&&monthHint)monthHint.hidden=monthInput.type==='month';
    if(current)current.replaceWith(next);
    else{
      const anchor=home.querySelector('.v205-welcome');
      if(anchor?.nextSibling)home.insertBefore(next,anchor.nextSibling);else home.prepend(next);
    }
    lastSignature=signature;
  }

  function schedule(records){
    if(records?.length&&records.every(r=>r.type==='attributes'&&!['home','collectionProPage','modal','v202PaymentDialog','v202PropertyWorkspace','v202DocumentDialog'].includes(r.target?.id)))return;
    if(document.querySelector?.('#modal.on,#v202PaymentDialog.on,#v202PropertyWorkspace.on,#v202DocumentDialog.on'))return;
    if(document.visibilityState==='hidden')return;
    const homePage=document.getElementById('home');
    if(homePage&&!homePage.classList.contains('on'))return;
    if(records?.length&&records.every(function(r){return r.target?.closest?.('#v210DailyCommandCenter,#v202PropertyWorkspace,#v199MoreMenu')}))return;
    // Keep the first deadline: ongoing DOM updates must not starve the summary.
    if(timer)return;
    timer=setTimeout(function(){timer=0;if(document.visibilityState==='hidden')return;const h=document.getElementById('home');if(h&&!h.classList.contains('on'))return;render()},160);
  }

  function syncPeriod(value){
    if(!PERIOD.test(value)||value===period)return false;
    period=value;lastSignature='';render();
    const input=document.getElementById('v208PortfolioPeriod');
    if(input instanceof HTMLInputElement&&input.value!==value){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}))}
    return true;
  }

  function openProperty(name,trigger){
    const scope=scopeKey();
    if(!scope||typeof window.AQARI_V202?.openProperty!=='function')return false;
    const safeName=propertyNames(scope).find(function(item){return norm(item)===norm(name)});
    if(!safeName||scopeKey()!==scope)return false;
    return window.AQARI_V202.openProperty(safeName,period,trigger)!==false;
  }

  document.addEventListener('input',function(event){
    if(event.target?.id==='v210Period'){
      const value=text(event.target.value);
      event.target.setCustomValidity(PERIOD.test(value)?'':'أدخل شهراً صحيحاً بصيغة السنة ثم الشهر، مثل 2026-09.');
      if(event.target.validity.valid)syncPeriod(value);
    }
  });

  document.addEventListener('click',function(event){
    const range=event.target?.closest?.('[data-v267-knet-range]');
    if(range){event.preventDefault();v267RunKnetFilter(range.getAttribute('data-v267-knet-range')||'today');return}
    const property=event.target?.closest?.('[data-v210-property]');
    if(property){event.preventDefault();openProperty(property.getAttribute('data-v210-property')||'',property);return}
    const route=event.target?.closest?.('[data-v210-route]');
    if(route){event.preventDefault();window.go?.(route.getAttribute('data-v210-route'));return}
    if(event.target?.closest?.('[data-v210-action="search"]')){event.preventDefault();window.AQARI_V209?.open?.()}
  });

  function seal(){authSuspended=true;clearTimeout(timer);timer=0;clear()}
  function resume(context){
    const expected=authAccess(context),live=authAccess(window.AQARI_SUPABASE?.context);
    if(!sameAccess(expected,live)||!dataScopesReady(live))return false;
    authSuspended=false;lastSignature='';render();return true;
  }

  function installAuthListener(){
    if(authListenerInstalled||typeof window.AQARI_SUPABASE?.onAuthStateChange!=='function')return;
    authListenerInstalled=true;
    Promise.resolve(window.AQARI_SUPABASE.onAuthStateChange(function(event){
      if(['SIGNED_OUT','TOKEN_REFRESH_FAILED','USER_DELETED','PASSWORD_RECOVERY'].includes(event))seal();
      else setTimeout(function(){resume(window.AQARI_SUPABASE?.context)},0);
    })).catch(function(){authListenerInstalled=false});
  }

  const observer=new MutationObserver(schedule);
  function boot(){
    document.body.classList.add('aq-v210');
    window.AQARI_V210=Object.freeze({version:DESIGN,seal:seal,resume:resume,refresh:function(){lastSignature='';render()},testing:Object.freeze({aggregate:aggregate})});
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    const homePage=document.getElementById('home');
    if(homePage)observer.observe(homePage,{attributes:true,attributeFilter:['class']});
    installAuthListener();render();
    [600,1800,5000].forEach(function(delay){setTimeout(function(){installAuthListener();schedule()},delay)});
    let meta=document.querySelector('meta[name="aqari-daily-command-center"]');
    if(!meta){meta=document.createElement('meta');meta.name='aqari-daily-command-center';document.head.appendChild(meta)}
    meta.content=DESIGN;
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
