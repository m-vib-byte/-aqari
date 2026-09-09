(function(){
  'use strict';

  const DESIGN='V206-mainline-rent-ledger';
  const PERIOD=/^\d{4}-(0[1-9]|1[0-2])$/;
  let lastView=null;
  let renderTimer=0;
  let authListenerInstalled=false;

  function esc(value){
    return String(value==null?'':value).replace(/[&<>'"]/g,function(character){
      return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character];
    });
  }

  function numberFrom(value){
    const arabic='٠١٢٣٤٥٦٧٨٩';
    const persian='۰۱۲۳۴۵۶۷۸۹';
    const normalized=String(value==null?'':value)
      .replace(/[٠-٩]/g,function(digit){return arabic.indexOf(digit)})
      .replace(/[۰-۹]/g,function(digit){return persian.indexOf(digit)})
      .replace(/[,٬]/g,'').replace(/٫/g,'.').replace(/[^0-9.\-]/g,'');
    const parsed=parseFloat(normalized);
    return Number.isFinite(parsed)?parsed:0;
  }

  function money(value){
    return Number(numberFrom(value)).toLocaleString('ar-KW',{minimumFractionDigits:0,maximumFractionDigits:3});
  }

  function accessScope(){
    try{
      const context=window.AQARI_SUPABASE?.context;
      const userId=String(context?.user?.id||'').trim();
      const workspaceId=String(context?.workspace?.id||'').trim();
      const membership=context?.membership;
      const membershipUserId=String((membership&&membership.user_id)||'').trim();
      const membershipWorkspaceId=String((membership&&membership.workspace_id)||'').trim();
      if(!userId||!workspaceId||membership?.is_active!==true||!membershipUserId||!membershipWorkspaceId)return null;
      if(membershipUserId!==userId||membershipWorkspaceId!==workspaceId)return null;
      return {userId,workspaceId};
    }catch(_){return null}
  }

  function accessReady(){return Boolean(accessScope())}

  function validEmail(value){
    const email=String(value||'').trim();
    if(!email||/[\r\n]/.test(email)||email.length>254)return false;
    return /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i.test(email);
  }

  function periodLabel(period){
    if(!PERIOD.test(String(period||'')))return String(period||'');
    try{
      const date=new Date(period+'-01T12:00:00');
      const ar=new Intl.DateTimeFormat('ar-KW',{month:'long',year:'numeric'}).format(date);
      const en=new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric'}).format(date);
      return ar+' / '+en;
    }catch(_){return period}
  }

  function displayDate(value){
    const raw=String(value||'').trim();
    if(!raw)return '';
    const date=new Date(raw.length===10?raw+'T12:00:00':raw);
    if(Number.isNaN(date.getTime()))return raw;
    try{return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'}).format(date)}catch(_){return raw}
  }

  function isDhahawi(name){return /(ضحاوي|dhahawi)/i.test(String(name||''))}

  function brand(name){
    if(isDhahawi(name))return {
      left:['Tel: 50721277 / Tel: 51119040','Tel: 55521007 / Tel: 25640025'],
      right:['dhahawikw.com','dhahawitower@gmail.com'],
      footer:'Salmiya - Block (10) - Essa Al Qatami St. - Bldg. (28)'
    };
    return {
      left:['AQARI PROPERTY MANAGEMENT','إدارة الأملاك'],
      right:['كشف إيجار رسمي','OFFICIAL RENT LEDGER'],
      footer:'صادر من منصة عقاري وفق البيانات المسجلة وقت الإصدار'
    };
  }

  function activeProperty(){
    const title=document.getElementById('v202PropertyTitle');
    const name=String(title?.textContent||'').trim();
    if(!name)return '';
    const context=typeof window.AQARI_V202?.propertyContext==='function'?window.AQARI_V202.propertyContext(name):null;
    return context&&String(context.name||'').trim()===name?name:'';
  }

  function officeData(name,period){
    if(!accessReady()||typeof window.AQARI_V202?.rentOfficeData!=='function')return null;
    const data=window.AQARI_V202.rentOfficeData(name,PERIOD.test(String(period||''))?period:undefined);
    if(!data||String(data.property||'').trim()!==String(name||'').trim()||!PERIOD.test(String(data.period||'')))return null;
    return data;
  }

  function viewModel(data){
    const items=(Array.isArray(data?.records)?data.records:[]).map(function(record){
      const rent=numberFrom(record?.rent);
      const contractRent=numberFrom(record?.contractRent)||rent;
      const currentRent=numberFrom(record?.currentRent)||rent;
      return {
        insuranceDateRaw:String(record?.insuranceDateRaw||''),freeMonth:String(record?.freeMonth||''),nameAr:String(record?.nameAr||''),nameEn:String(record?.nameEn||''),floor:String(record?.floor||''),phone:String(record?.phone||''),nationality:String(record?.nationality||''),civilId:String(record?.civilId||''),passportNo:String(record?.passportNo||''),startDate:String(record?.startDate||''),endDate:String(record?.endDate||''),receivedAt:String(record?.receivedAt||''),evictionNotice:String(record?.evictionNotice||''),
        key:String(record?.key||''),unit:String(record?.unit||'—'),tenant:String(record?.tenant||'—'),
        contractNo:String(record?.contractNo||''),contractId:String(record?.contractId||''),hasContract:Boolean(record?.hasContract),
        contractRent,currentRent,rent,insurance:record?.insurance==null?null:numberFrom(record.insurance),advance:record?.advance==null?null:numberFrom(record.advance),
        cleaning:record?.cleaningFee==null?null:numberFrom(record.cleaningFee),paid:numberFrom(record?.paid),pending:numberFrom(record?.pending),
        balance:Math.max(0,numberFrom(record?.balance)),status:String(record?.paymentStatus||''),
        date:displayDate(record?.paidAt),method:String(record?.method||''),knet:String(record?.transactionNo||''),
        receipt:String(record?.receiptNo||''),contractReceived:String(record?.contractReceived||''),
        accountant:String(record?.accountant||''),email:validEmail(record?.email)?String(record.email).trim():''
      };
    }).sort(function(left,right){return left.unit.localeCompare(right.unit,'ar',{numeric:true,sensitivity:'base'})});
    const totalRent=numberFrom(data?.totalRent);
    const totalPaid=numberFrom(data?.totalCollected);
    const totalBalance=Math.max(0,numberFrom(data?.totalBalance));
    return {
      items,totalRent,totalPaid,totalBalance,obligationsVerified:data?.obligationsVerified!==false,
      totalContractRent:items.reduce(function(total,item){return total+item.contractRent},0),
      totalCurrentRent:totalRent||items.reduce(function(total,item){return total+item.currentRent},0),
      totalInsurance:numberFrom(data?.totalInsurance),totalAdvance:numberFrom(data?.totalAdvance),totalCleaning:numberFrom(data?.totalCleaning),
      totalPending:items.reduce(function(total,item){return total+item.pending},0),
      paidCount:items.filter(function(item){return item.rent>0&&item.balance<=0}).length,
      dueCount:items.filter(function(item){return item.balance>0}).length,
      collectionRate:totalRent>0?Math.min(100,Math.round(totalPaid/totalRent*100)):0,
      official:Boolean(data?.official),sourcePages:String(data?.sourcePages||''),unitCount:numberFrom(data?.unitCount)||items.length,
      canRecordPayment:Boolean(data?.canRecordPayment)
    };
  }

  function bilingual(ar,en){return '<span class="v206-bi"><b>'+esc(ar)+'</b><small lang="en">'+esc(en)+'</small></span>'}
  function tableCell(value,className,dir){
    return '<td'+(className?' class="'+className+'"':'')+'><bdi dir="'+(dir==='ltr'?'ltr':'auto')+'">'+esc(value==null?'':value)+'</bdi></td>';
  }
  function headerCell(ar,en){return '<th scope="col">'+bilingual(ar,en)+'</th>'}
  function stat(label,value,detail,className){return '<article class="v206-stat '+(className||'')+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(detail||'')+'</small></article>'}

  function csvCell(value){
    let text=String(value==null?'':value);
    if(/^[=+\-@]/.test(text))text="'"+text;
    return '"'+text.replace(/"/g,'""')+'"';
  }

  function tenantMailto(item,period,property){
    if(!validEmail(item?.email))return '';
    const subject='كشف إيجار '+property+' - '+period+' / Rent statement';
    const body=[
      'السيد/ة '+item.tenant+'،',
      'مرفق لكم كشف إيجار الوحدة '+item.unit+' في '+property+' عن '+period+'.',
      'المتبقي: '+money(item.balance)+' د.ك.',
      '',
      'Dear '+item.tenant+',',
      'Your rent statement for unit '+item.unit+' at '+property+' for '+period+' is ready.',
      'Balance: KWD '+money(item.balance)+'.'
    ].join('\n');
    return 'mailto:'+item.email+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
  }

  function safeFilename(value){
    const clean=String(value||'AQARI').normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu,'-').replace(/^[.\-]+|[.\-]+$/g,'').slice(0,80);
    return clean||'AQARI';
  }

  function exportCsv(){
    if(!accessReady()||!lastView||activeProperty()!==lastView.property)return false;
    const current=officeData(lastView.property,lastView.period);
    if(!current)return false;
    const model=viewModel(current);
    const headers=[
      'رقم الوحدة / FLAT NO.','اسم المستأجر / NAME OF THE TENANT','رقم العقد / CONTRACT NO.',
      'إيجار العقد / RENT CONTRACT','التأمين / INSURANCE','العربون / ADVANCE','رسوم النظافة / CLEANING FEES',
      'الإيجار الحالي / CURRENT RENT','تاريخ الدفع / PAYMENT DATE','طريقة الدفع / PAYMENT METHOD',
      'رقم العملية / TRANSACTION NUMBER','رقم الوصل / VOUCHER NO.','استلام العقد / CONTRACT RECEIVED','المحاسب / ACCOUNTANT',
      'الدور','الاسم بالعربي','الاسم بالإنجليزي','الهاتف','الجنسية','الرقم المدني','رقم الجواز','البريد الإلكتروني','بداية العقد','نهاية العقد','وقت استلام العقد — الكويت','تبليغ الإخلاء','تاريخ استلام التأمين','الشهر المجاني المعتمد'
    ];
    const lines=[headers.map(csvCell).join(',')];
    model.items.forEach(function(item){
      lines.push([
        item.unit,item.tenant,item.contractNo,item.contractRent,item.insurance,item.advance,item.cleaning,item.currentRent,
        item.date,item.method,item.knet,item.receipt,item.contractReceived,item.accountant,item.floor,item.nameAr,item.nameEn,item.phone,item.nationality,item.civilId,item.passportNo,item.email,item.startDate,item.endDate,item.receivedAt,item.evictionNotice,item.insuranceDateRaw,item.freeMonth
      ].map(csvCell).join(','));
    });
    const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;
    anchor.download='AQARI-'+safeFilename(lastView.property)+'-'+lastView.period+'-rent-ledger.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function(){URL.revokeObjectURL(url)},0);
    return true;
  }

  function tenantAction(item,action,trigger){
    if(!accessReady()||!lastView||activeProperty()!==lastView.property)return false;
    if(typeof window.AQARI_V202?.rentOfficeAction!=='function')return false;
    return window.AQARI_V202.rentOfficeAction(lastView.property,item.key,lastView.period,action,trigger)===true;
  }

  function dueList(model,property,period){
    if(model.obligationsVerified===false)return '<p>المستحقات والمتأخرات معلقة حتى اعتماد عقود المصدر. لا تعني القيم الصفرية اكتمال السداد.</p>';
    const due=model.items.filter(function(item){return item.balance>0}).sort(function(left,right){return right.balance-left.balance});
    if(!due.length)return '<section class="v206-due-panel is-clear"><div><span>المطلوب تحصيله الآن / DUE NOW</span><strong>تم تحصيل جميع الإيجارات المستحقة لهذا الشهر</strong></div><span class="v206-clear-mark" aria-hidden="true">✓</span></section>';
    const paymentLabel=model.canRecordPayment?'تسجيل دفعة':'عرض التحصيل';
    function card(item){
      const email=tenantMailto(item,period,property);
      return '<article class="v206-due-item">'+
        '<button type="button" class="v206-due-main" data-v206-tenant-action="payment" data-v206-key="'+esc(item.key)+'" aria-label="'+paymentLabel+' للمستأجر '+esc(item.tenant)+'"><span class="v206-due-person"><b><bdi dir="auto">'+esc(item.tenant)+'</bdi></b><small>وحدة <bdi dir="ltr">'+esc(item.unit)+'</bdi>'+(item.contractNo?' • عقد <bdi dir="ltr">'+esc(item.contractNo)+'</bdi>':'')+'</small></span><span class="v206-due-money"><b>'+money(item.balance)+' د.ك</b><small>متبقي'+(item.pending?' • '+money(item.pending)+' قيد المراجعة':'')+'</small></span><span class="v206-due-arrow" aria-hidden="true">←</span></button>'+
        '<div class="v206-record-actions" role="group" aria-label="مستندات '+esc(item.tenant)+'">'+
          '<button type="button" data-v206-tenant-action="statement" data-v206-key="'+esc(item.key)+'">كشف المستأجر</button>'+
          (item.receipt?'<button type="button" data-v206-tenant-action="receipt" data-v206-key="'+esc(item.key)+'">وصل الإيجار</button>':'')+
          (item.hasContract?'<button type="button" data-v206-tenant-action="contract" data-v206-key="'+esc(item.key)+'">عقد الإيجار</button>':'')+
          (email?'<a href="'+esc(email)+'">إرسال بالبريد</a>':'')+
        '</div>'+ 
      '</article>';
    }
    const visible=due.slice(0,5);
    const remaining=due.slice(5);
    const more=remaining.length?'<details class="v206-due-more"><summary>عرض كل المتأخرين / SHOW ALL <b>+'+remaining.length+'</b></summary><div class="v206-due-list">'+remaining.map(card).join('')+'</div></details>':'';
    return '<section class="v206-due-panel"><div class="v206-due-head"><div><span>المطلوب تحصيله الآن / DUE NOW</span><strong>'+due.length+' مستأجر عليهم متبقي</strong></div><small>التحصيل، الكشف، العقد، الوصل والبريد من نفس البطاقة</small></div><div class="v206-due-list">'+visible.map(card).join('')+'</div>'+more+'</section>';
  }

  function lockedMarkup(){
    return '<section class="v206-locked" role="status"><span aria-hidden="true">🔒</span><div><strong>سجّل الدخول لعرض كشف الإيجار</strong><p>أسماء المستأجرين، الدفعات والمستندات لا تظهر إلا لعضو فعّال داخل مساحة العمل.</p></div></section>';
  }

  function tenantDetails(item){
    return '<dl>'+[['تاريخ استلام التأمين',item.insuranceDateRaw],['الشهر المجاني المعتمد',item.freeMonth],['الدور',item.floor],['الاسم بالعربي',item.nameAr],['الاسم بالإنجليزي',item.nameEn],['الهاتف',item.phone],['الجنسية',item.nationality],['الرقم المدني',item.civilId],['رقم الجواز',item.passportNo],['البريد الإلكتروني',item.email],['بداية العقد',item.startDate],['نهاية العقد',item.endDate],['حالة تبليغ الإخلاء',item.evictionNotice]].map(([label,value])=>'<dt>'+esc(label)+'</dt><dd><bdi>'+esc(value||'غير مدون')+'</bdi></dd>').join('')+'</dl>';
  }
  function rowMarkup(item,index){
    return '<tr class="'+(item.balance>0?'v206-due':'v206-paid')+'" data-v206-row-key="'+esc(item.key)+'" title="فتح كشف المستأجر">'+
      tableCell(item.unit||index+1,'','ltr')+'<td class="v206-name"><button type="button" class="v206-tenant-link" data-v206-tenant-action="statement" data-v206-key="'+esc(item.key)+'" aria-label="فتح كشف المستأجر '+esc(item.tenant)+'"><bdi dir="auto">'+esc(item.tenant)+'</bdi></button>'+tenantDetails(item)+'</td>'+tableCell(item.contractNo,'','ltr')+
      tableCell(item.contractRent?money(item.contractRent):'')+tableCell(item.insurance==null?'غير مدون':money(item.insurance))+
      tableCell(item.advance==null?'غير مدون':money(item.advance))+tableCell(item.cleaning==null?'غير مدون':money(item.cleaning))+
      tableCell(item.currentRent?money(item.currentRent):'')+tableCell(item.date,'','ltr')+tableCell(item.method)+
      tableCell(item.knet,'','ltr')+tableCell(item.receipt,'','ltr')+'<td>'+esc(item.contractReceived||'غير مدون')+'<br><bdi dir="ltr">'+esc(item.receivedAt||'')+'</bdi></td>'+'<td><strong>'+esc(item.accountant||'غير مدون')+'</strong></td>'+'</tr>';
  }

  function render(periodValue){
    const overlay=document.getElementById('v202DocumentDialog');
    const body=document.getElementById('v202DocumentBody');
    const heading=document.getElementById('v202DocumentDialogTitle');
    if(!overlay?.classList.contains('on')||overlay.getAttribute('aria-hidden')==='true'||!body||!heading)return false;
    if(overlay.dataset.v202Document!=='rent-office'||!String(heading.textContent||'').includes('كشف إيجار العقار'))return false;
    if(!accessReady()){
      lastView=null;
      body.innerHTML=lockedMarkup();
      overlay.dataset.v206='locked';
      return false;
    }
    const property=activeProperty();
    if(!property){lastView=null;body.innerHTML=lockedMarkup();return false}
    const nativePeriod=document.getElementById('v202StatementPeriod')?.value||'';
    const requested=PERIOD.test(String(periodValue||''))?String(periodValue):(PERIOD.test(nativePeriod)?nativePeriod:'');
    const data=officeData(property,requested);
    if(!data){lastView=null;body.innerHTML=lockedMarkup();return false}
    const period=String(data.period);
    const model=viewModel(data);
    const identity=brand(property);
    lastView={property,period,model,scope:accessScope()};
    const rows=model.items.length?model.items.map(rowMarkup).join(''):'<tr><td colspan="14" class="v206-empty">لا توجد وحدات أو عقود مرتبطة بهذا العقار في الشهر المحدد.</td></tr>';
    const source=model.official?'مطابق للكشف الرسمي المخزن'+(model.sourcePages?' • الصفحات '+model.sourcePages:''):'محسوب من العقود والدفعات المعتمدة';
    const paymentLabel=model.canRecordPayment?'تسجيل إيجار':'عرض التحصيل';
    const command='<section class="v206-command v202-no-print" data-v206-command><div class="v206-command-head"><div><span>مكتب الإيجارات / RENT OFFICE</span><h3>'+esc(property)+'</h3><small>'+esc(periodLabel(period))+' • '+esc(source)+'</small></div><div class="v206-command-actions"><button type="button" class="is-primary" data-v206-action="payment">'+paymentLabel+'</button><button type="button" data-v206-action="print">طباعة / PDF</button><button type="button" data-v206-action="csv">Excel CSV</button></div></div><div class="v206-stats">'+
      stat('المتوقع / EXPECTED',(model.obligationsVerified===false?'معلّق':money(model.totalRent)+' د.ك'),model.unitCount+' وحدة','')+
      stat('المحصل / COLLECTED',money(model.totalPaid)+' د.ك',model.paidCount+' مكتمل','is-good')+
      stat('المتبقي / BALANCE',(model.obligationsVerified===false?'معلّق':money(model.totalBalance)+' د.ك'),model.dueCount+' مطلوب','is-due')+
      stat('نسبة التحصيل / RATE',model.collectionRate+'%',model.totalPending?money(model.totalPending)+' د.ك قيد المراجعة':'لا توجد دفعات معلقة','is-rate')+
      '</div>'+dueList(model,property,period)+'</section>';
    const columns='<colgroup><col class="v206-col-unit"><col class="v206-col-tenant"><col class="v206-col-contract"><col span="4" class="v206-col-money"><col class="v206-col-money"><col class="v206-col-date"><col class="v206-col-method"><col class="v206-col-knet"><col class="v206-col-voucher"><col class="v206-col-received"><col class="v206-col-accountant"></colgroup>';
    const paper='<section class="v206-paper" data-v206-ledger><header class="v206-letterhead"><div><strong>'+esc(property.toUpperCase())+'</strong><span>'+esc(identity.left[0])+'</span><span>'+esc(identity.left[1])+'</span></div><div class="v206-mark"><span class="v206-monogram" aria-hidden="true">'+(isDhahawi(property)?'ض':'ع')+'</span><b>'+esc(property)+'</b><small>'+(isDhahawi(property)?'TOWER':'AQARI')+'</small></div><div class="v206-right"><strong>'+esc(property)+'</strong><span>'+esc(identity.right[0])+'</span><span>'+esc(identity.right[1])+'</span></div></header><div class="v206-period"><label>الشهر / MONTH <input type="month" data-v206-month value="'+esc(period)+'" aria-label="شهر كشف الإيجار"></label><p>مرّر الجدول أفقياً لرؤية جميع الأعمدة • اضغط اسم المستأجر لفتح كشفه</p><span class="v206-update-status" role="status" aria-live="polite">تم تحديث الكشف إلى '+esc(periodLabel(period))+'</span></div><div class="v206-print-summary"><span>المتوقع / EXPECTED <b>'+money(model.totalRent)+' د.ك</b></span><span>المحصل / COLLECTED <b>'+money(model.totalPaid)+' د.ك</b></span><span>المتبقي / BALANCE <b>'+money(model.totalBalance)+' د.ك</b></span></div><div class="v206-wrap" role="region" tabindex="0" aria-label="جدول كشف الإيجار، قابل للتمرير أفقياً"><table class="v206-ledger"><caption class="v206-caption">كشف إيجار '+esc(property)+' — '+esc(periodLabel(period))+'</caption>'+columns+'<thead><tr class="v206-repeat-head"><th colspan="14">'+esc(property)+' • '+esc(periodLabel(period))+'</th></tr><tr>'+headerCell('رقم الوحدة','FLAT NO.')+headerCell('اسم المستأجر','NAME OF THE TENANT')+headerCell('رقم العقد','CONTRACT NO.')+headerCell('إيجار العقد','RENT CONTRACT')+headerCell('تأمين','INSURANCE')+headerCell('عربون','ADVANCE')+headerCell('رسوم النظافة','CLEANING FEES')+headerCell('الإيجار الحالي','CURRENT RENT')+headerCell('تاريخ الدفع','PAYMENT DATE')+headerCell('طريقة الدفع','PAYMENT METHOD')+headerCell('رقم عملية كي نت','KNET OPERATION NUMBER')+headerCell('رقم الوصل','VOUCHER NO.')+headerCell('استلام العقد','CONTRACT RECEIVED')+headerCell('المحاسب','ACCOUNTANT')+'</tr></thead><tbody>'+rows+'<tr class="v206-total"><th scope="row" colspan="3">الإجمالي / TOTAL</th><td>'+money(model.totalContractRent)+'</td><td>'+money(model.totalInsurance)+'</td><td>'+money(model.totalAdvance)+'</td><td>'+money(model.totalCleaning)+'</td><td>'+money(model.totalCurrentRent)+'</td><td colspan="6"></td></tr></tbody></table></div><footer><span>AQARI • '+esc(property)+'</span><span>'+esc(identity.footer)+'</span></footer></section>';
    body.innerHTML=command+paper;
    heading.textContent='كشف إيجار العقار / Property Rent Ledger';
    overlay.dataset.v206='ready';
    return true;
  }

  function scheduleRender(){
    clearTimeout(renderTimer);
    renderTimer=setTimeout(function(){
      const body=document.getElementById('v202DocumentBody');
      if(body?.querySelector('[data-v206-ledger]'))return;
      render();
    },45);
  }

  function findItem(key){return lastView?.model?.items?.find(function(item){return item.key===String(key||'')})||null}

  function installEvents(){
    document.addEventListener('change',function(event){
      const target=event.target instanceof Element?event.target:null;
      if(target?.matches('[data-v206-month]')&&render(target.value)){
        setTimeout(function(){document.querySelector('[data-v206-month]')?.focus()},0);
      }
    });
    document.addEventListener('click',function(event){
      const target=event.target instanceof Element?event.target:null;
      if(!target)return;
      const tenantButton=target.closest('[data-v206-tenant-action]');
      if(tenantButton){
        event.preventDefault();
        const item=findItem(tenantButton.getAttribute('data-v206-key'));
        if(item)tenantAction(item,tenantButton.getAttribute('data-v206-tenant-action'),tenantButton);
        return;
      }
      const row=target.closest('[data-v206-row-key]');
      if(row){
        const item=findItem(row.getAttribute('data-v206-row-key'));
        if(item)tenantAction(item,'statement',row);
        return;
      }
      const action=target.closest('[data-v206-action]')?.getAttribute('data-v206-action');
      if(action==='payment'){
        const item=lastView?.model?.items?.filter(function(entry){return entry.balance>0}).sort(function(left,right){return right.balance-left.balance})[0]||lastView?.model?.items?.[0];
        if(item)tenantAction(item,'payment',target);
      }
      if(action==='print')document.querySelector('#v202DocumentDialog [data-v202-print]')?.click();
      if(action==='csv')exportCsv();
    });
  }

  function clearProtectedView(){
    lastView=null;
    const body=document.getElementById('v202DocumentBody');
    if(body?.querySelector('[data-v206-ledger],[data-v206-command]'))body.innerHTML=lockedMarkup();
  }

  function installAuthListener(){
    const bridge=window.AQARI_SUPABASE;
    if(authListenerInstalled||typeof bridge?.onAuthStateChange!=='function')return;
    authListenerInstalled=true;
    Promise.resolve(bridge.onAuthStateChange(function(event){
      if(event==='SIGNED_OUT')clearProtectedView();
    })).catch(function(){authListenerInstalled=false});
  }

  function boot(){
    document.body.classList.add('aq-v206');
    let meta=document.querySelector('meta[name="aqari-rent-ledger"]');
    if(!meta){meta=document.createElement('meta');meta.name='aqari-rent-ledger';document.head.appendChild(meta)}
    meta.content=DESIGN;
    installEvents();
    installAuthListener();
    const observer=new MutationObserver(function(){
      const overlay=document.getElementById('v202DocumentDialog');
      const heading=document.getElementById('v202DocumentDialogTitle');
      if(overlay?.classList.contains('on')&&overlay.getAttribute('aria-hidden')!=='true'&&overlay.dataset.v202Document==='rent-office'&&String(heading?.textContent||'').includes('كشف إيجار العقار'))scheduleRender();
      if(overlay&&!overlay.classList.contains('on'))lastView=null;
    });
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','aria-hidden']});
    window.AQARI_V206=Object.freeze({
      version:DESIGN,
      render:function(period){return render(period)},
      testing:Object.freeze({
        accessReady:function(){return accessReady()},
        viewModel:function(data){return viewModel(data)},
        validEmail:function(value){return validEmail(value)},
        safeFilename:function(value){return safeFilename(value)}
      })
    });
    scheduleRender();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
