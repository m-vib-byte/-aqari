(function(){
  'use strict';

  const DESIGN='V203-dhahawi-ledger';
  const root=typeof window!=='undefined'?window:globalThis;
  const existingRuntime=root.__AQARI_DHAHAWI_RUNTIME__;
  if(existingRuntime?.api){
    root.AQARI_DHAHAWI=existingRuntime.api;
    root.AQARI_V202_RENT=existingRuntime.api;
    return;
  }
  const HEADERS=[
    ['رقم الوحدة','FLAT NO.'],['اسم المستأجر','NAME OF THE TENANT'],['رقم العقد','CONTRACT NO.'],['عقد الإيجار','RENT CONTRACT'],
    ['تأمين','INSURANCE'],['عربون','ADVANCE'],['رسوم النظافة','CLEANING FEES'],['الإيجار الحالي','CURRENT RENT'],
    ['تاريخ الدفع','PAYMENT DATE'],['طريقة الدفع','PAYMENT METHOD'],['رقم عملية كي نت','KNET OPERATION NO.'],['رقم الوصل','VOUCHER NO.'],
    ['استلام العقد','RECEIPT CONTRACT'],['المحاسب','ACCOUNTANT']
  ];

  let activeTrigger=null;
  let backgroundInertState=null;
  let printCleanupTimer=0;
  let printActive=false;

  function text(value){return String(value==null?'':value).trim()}
  function validPeriod(value){return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value||''))}
  function fallbackPeriod(){const now=new Date();return now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')}
  function v202(){const api=root.AQARI_V202;return api&&typeof api==='object'?api:null}

  function currentProperty(){
    const api=v202();
    try{return text(typeof api?.currentProperty==='function'?api.currentProperty():'')}
    catch(_){return ''}
  }

  function currentPeriod(){
    const api=v202();
    try{const period=typeof api?.currentPeriod==='function'?api.currentPeriod():'';return validPeriod(period)?period:fallbackPeriod()}
    catch(_){return fallbackPeriod()}
  }

  function escapeHtml(value){
    return String(value==null?'':value).replace(/[&<>'"]/g,function(character){
      return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character];
    });
  }

  function first(record,names){
    for(let index=0;index<names.length;index+=1){
      const value=record&&record[names[index]];
      if(value!=null&&String(value).trim()!=='')return value;
    }
    return '';
  }

  function unique(values){
    const seen=new Set();
    return values.map(text).filter(function(value){
      const normalized=value.normalize('NFKC').toLocaleLowerCase('ar');
      if(!normalized||seen.has(normalized))return false;
      seen.add(normalized);
      return true;
    });
  }

  function settledPayments(item){
    if(Array.isArray(item?.settledPayments))return item.settledPayments.filter(Boolean);
    if(!Array.isArray(item?.payments))return [];
    return item.payments.filter(function(payment){return Boolean(payment&&payment.settled)});
  }

  function presentationItem(item){
    const payments=settledPayments(item);
    const details=item&&typeof item.tenantDetails==='object'&&item.tenantDetails?item.tenantDetails:{};
    const receipts=unique((Array.isArray(item?.receipts)?item.receipts:[]).concat(payments.map(function(payment){return payment?.receiptNo})));
    return {
      contractId:text(item?.contractId),unit:text(item?.unit),tenant:text(item?.tenant),name:text(item?.tenant),
      contractNo:text(item?.contractNo),rent:first(item,['rent','contractRent','due']),contractRent:first(item,['contractRent','rent','due']),
      insurance:item?.insurance,advance:item?.advance,cleaning:item?.cleaning,
      currentRent:first(item,['currentRent','rent','due']),
      civilId:text(item?.civilId||details.civilId),nationality:text(item?.nationality||details.nationality),
      phone:text(item?.phone||details.phone),email:text(item?.email||details.email),
      due:item?.due,paid:item?.paid,pending:item?.pending,balance:item?.balance,status:text(item?.status),
      paymentDate:unique(payments.map(function(payment){return first(payment,['paidAt','paymentDate','date'])})).join('، '),
      paymentMethod:unique(payments.map(function(payment){return first(payment,['method','paymentMethod'])})).join('، '),
      receiptNo:receipts.join('، '),receipts,
      knetNo:unique(payments.map(function(payment){return first(payment,['knetOperationNo','knetOperationNumber','knetNo'])})).join('، '),
      voucherNo:unique(payments.map(function(payment){return first(payment,['voucherNo','receiptNo'])})).join('، '),
      accountant:unique([text(item?.accountant)].concat(payments.map(function(payment){return payment?.accountant}))).join('، '),
      receiptContract:unique([text(item?.receiptContract)].concat(payments.map(function(payment){return payment?.receiptContract}))).join('، '),
      tenantDetails:{
        phone:text(item?.phone||details.phone),email:text(item?.email||details.email),
        civilId:text(item?.civilId||details.civilId),nationality:text(item?.nationality||details.nationality),
        verified:Boolean(item?.verified||details.verified)
      },
      payments
    };
  }

  function unavailableModel(property,period,reason){
    return {
      available:false,reason,property:text(property),period:validPeriod(period)?period:currentPeriod(),items:[],
      totals:{due:0,paid:0,balance:0,pending:0,delta:0},official:null,receipts:[],propertyDetails:null
    };
  }

  function statementModel(property,period){
    const api=v202();
    const propertyName=text(property)||currentProperty();
    const selectedPeriod=validPeriod(period)?period:currentPeriod();
    if(!api||typeof api.rentSnapshot!=='function')return unavailableModel(propertyName,selectedPeriod,'V202 rentSnapshot غير متاح');
    let snapshot;
    try{snapshot=api.rentSnapshot(propertyName,selectedPeriod)}
    catch(_){return unavailableModel(propertyName,selectedPeriod,'تعذر قراءة لقطة V202')}
    if(!snapshot||typeof snapshot!=='object')return unavailableModel(propertyName,selectedPeriod,'لا توجد لقطة مرتبطة بالعقار والفترة');
    return {
      available:true,reason:'',property:text(snapshot.property)||propertyName,
      period:validPeriod(snapshot.period)?snapshot.period:selectedPeriod,
      items:(Array.isArray(snapshot.items)?snapshot.items:[]).map(presentationItem),
      totals:snapshot.totals&&typeof snapshot.totals==='object'?snapshot.totals:{due:0,paid:0,balance:0,pending:0,delta:0},
      official:snapshot.official&&typeof snapshot.official==='object'?snapshot.official:null,
      receipts:Array.isArray(snapshot.receipts)?snapshot.receipts:[],
      propertyDetails:snapshot.propertyDetails&&typeof snapshot.propertyDetails==='object'?snapshot.propertyDetails:null,
      diagnostics:snapshot.diagnostics&&typeof snapshot.diagnostics==='object'?snapshot.diagnostics:null,
      contracts:snapshot.contracts,paidUnits:snapshot.paidUnits,receiptCount:snapshot.receiptCount,
      latestReceiptIndex:snapshot.latestReceiptIndex
    };
  }

  function display(value){return value==null||String(value).trim()===''?'—':String(value)}

  function money(value){
    if(value==null||String(value).trim()==='')return '—';
    const amount=Number(value);
    return Number.isFinite(amount)?amount.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:3}):display(value);
  }

  function periodLabel(period){
    if(!validPeriod(period))return period;
    const date=new Date(period+'-01T12:00:00');
    try{return date.toLocaleDateString('ar-KW',{year:'numeric',month:'long'})}
    catch(_){return period}
  }

  function bilingual(arabic,english){return '<span class="v202-bi"><b>'+escapeHtml(arabic)+'</b><small>'+escapeHtml(english)+'</small></span>'}
  function cell(value,className){return '<td'+(className?' class="'+className+'"':'')+'>'+escapeHtml(display(value))+'</td>'}
  function numericCell(value){return cell(money(value),'v203-rent-num')}

  function identityMarkup(model){
    const details=model.propertyDetails||{};
    const contacts=unique([details.phone,details.email]).join(' • ');
    const address=text(details.address);
    return '<header class="v202-letterhead">'+
      '<div class="v202-contact v202-contact-left"><strong>'+escapeHtml(model.property.toLocaleUpperCase('en'))+'</strong><span>'+escapeHtml(display(contacts))+'</span></div>'+
      '<div class="v202-tower-mark"><span class="v202-building">▥</span><b>'+escapeHtml(model.property)+'</b><small>RENT LEDGER</small></div>'+
      '<div class="v202-contact v202-contact-right"><strong>'+escapeHtml(model.property)+'</strong><span>'+escapeHtml(display(address))+'</span></div>'+
    '</header>';
  }

  function summaryMarkup(model){
    const totals=model.totals||{};
    const official=model.official;
    const chips=[
      ['المستحق / DUE',money(totals.due)],['المدفوع / PAID',money(totals.paid)],
      ['المتبقي / BALANCE',money(totals.balance)],['قيد المراجعة / PENDING',money(totals.pending)]
    ];
    if(official){
      chips.push(['التأمين / INSURANCE',money(official.insurance)]);
      chips.push(['العربون / ADVANCE',money(official.advance)]);
      chips.push(['النظافة / CLEANING',money(official.cleaning)]);
    }
    return '<div class="v203-ledger-summary">'+chips.map(function(chip){
      return '<div><span>'+escapeHtml(chip[0])+'</span><strong>'+escapeHtml(chip[1])+'</strong></div>';
    }).join('')+'</div>';
  }

  function noticeMarkup(model){
    const notes=[];
    const pending=Number(model.totals?.pending||0);
    const dueDelta=Number(model.totals?.deltas?.due??model.official?.delta?.due??0);
    const paidDelta=Number(model.totals?.deltas?.paid??model.official?.delta?.paid??model.totals?.delta??0);
    const diagnostics=model.diagnostics||{};
    const conflicts=Array.isArray(diagnostics.conflicts)?diagnostics.conflicts.length:0;
    const invalid=(Array.isArray(diagnostics.invalidContracts)?diagnostics.invalidContracts.length:0)+
      (Array.isArray(diagnostics.invalidIdentityContracts)?diagnostics.invalidIdentityContracts.length:0);
    const unmatched=Array.isArray(diagnostics.unmatchedPayments)?diagnostics.unmatchedPayments.length:0;
    const ignored=Array.isArray(diagnostics.ignoredPayments)?diagnostics.ignoredPayments.length:0;
    const duplicates=Array.isArray(diagnostics.duplicateReceipts)?diagnostics.duplicateReceipts.length:0;
    const invalidPayments=Array.isArray(diagnostics.invalidPayments)?diagnostics.invalidPayments.length:0;
    const overpayments=Array.isArray(diagnostics.overpayments)?diagnostics.overpayments.length:0;
    if(pending>0)notes.push('الدفعات قيد المراجعة ظاهرة للمعلومة ولم تدخل ضمن المدفوع');
    if(conflicts)notes.push('تم استبعاد '+conflicts+' تعارض عقود حتى تصحيحه');
    if(invalid)notes.push('تم استبعاد '+invalid+' عقد ناقص الهوية أو التاريخ');
    if(unmatched)notes.push('توجد '+unmatched+' دفعة غير مطابقة للعقد والوحدة والمستأجر');
    if(ignored)notes.push('تم تجاهل '+ignored+' دفعة ملغاة أو مرفوضة أو مستردة');
    if(duplicates)notes.push('تم استبعاد '+duplicates+' رقم وصل مكرر');
    if(invalidPayments)notes.push('تم استبعاد '+invalidPayments+' دفعة بمبلغ غير صالح');
    if(overpayments)notes.push('توجد '+overpayments+' دفعة زائدة معزولة ولم تُخصم من أرصدة الوحدات الأخرى');
    if(Math.abs(dueDelta)>0.0005)notes.push('فرق المستحق عن المرجع الرسمي '+money(dueDelta)+' د.ك');
    if(Math.abs(paidDelta)>0.0005)notes.push('فرق المحصّل عن المرجع الرسمي '+money(paidDelta)+' د.ك');
    if(model.official?.sourcePages)notes.push('مرجع الكشف: '+text(model.official.sourcePages));
    return notes.length?'<aside class="v203-ledger-warning" role="status" aria-live="polite">'+escapeHtml(notes.join(' • '))+'</aside>':'';
  }

  function rowMarkup(item){
    const tenantDetails=unique([item.civilId,item.nationality,item.phone,item.email]);
    const tenantCell='<td class="v203-rent-name"><strong>'+escapeHtml(display(item.tenant))+'</strong>'+
      (tenantDetails.length?'<small>'+tenantDetails.map(escapeHtml).join(' • ')+'</small>':'')+'</td>';
    return '<tr class="v203-rent-row" data-contract="'+escapeHtml(item.contractId)+'" data-status="'+escapeHtml(item.status)+'">'+
      cell(item.unit,'v203-rent-unit')+tenantCell+cell(item.contractNo,'')+numericCell(item.contractRent)+
      numericCell(item.insurance)+numericCell(item.advance)+numericCell(item.cleaning)+numericCell(item.currentRent)+
      cell(item.paymentDate,'')+cell(item.paymentMethod,'')+cell(item.knetNo,'')+cell(item.voucherNo||item.receiptNo,'')+
      cell(item.receiptContract,'')+cell(item.accountant,'')+
    '</tr>';
  }

  function optionalTotal(items,key,officialValue){
    const values=items.map(function(item){return item?.[key]});
    if(values.length&&values.every(function(value){return value!=null&&String(value).trim()!==''})){
      return values.reduce(function(total,value){return total+Number(value||0)},0);
    }
    return officialValue!=null&&String(officialValue).trim()!==''?Number(officialValue):null;
  }

  function statementMarkup(model){
    if(!model.available){
      return '<section class="v202-paper" data-v202-dhahawi><div class="v203-ledger-empty"><strong>تعذر فتح كشف الإيجار</strong><p>'+escapeHtml(model.reason)+'</p></div></section>';
    }
    const bodyRows=model.items.length?model.items.map(rowMarkup).join(''):'<tr><td colspan="14" class="v203-ledger-empty">لا توجد عقود موقعة وسارية لهذه الفترة.</td></tr>';
    const fillerRows=Array.from({length:Math.max(0,12-model.items.length)}).map(function(){
      return '<tr class="v203-rent-row v203-rent-filler" aria-hidden="true">'+Array.from({length:14}).map(function(){return '<td>&nbsp;</td>'}).join('')+'</tr>';
    }).join('');
    const totals=model.totals||{};
    const insuranceTotal=optionalTotal(model.items,'insurance',model.official?.insurance);
    const advanceTotal=optionalTotal(model.items,'advance',model.official?.advance);
    const cleaningTotal=optionalTotal(model.items,'cleaning',model.official?.cleaning);
    return '<section class="v202-paper" data-v202-dhahawi data-property="'+escapeHtml(model.property)+'" data-period="'+escapeHtml(model.period)+'">'+
      identityMarkup(model)+
      '<div class="v202-period-row"><span>كشف مرتبط ببيانات V202 وقت الإصدار</span><label>الشهر / MONTH <input type="month" data-dhahawi-period value="'+escapeHtml(model.period)+'"></label><strong>'+escapeHtml(periodLabel(model.period))+'</strong></div>'+
      summaryMarkup(model)+noticeMarkup(model)+
      '<div class="v203-rent-ledger-wrap" role="region" aria-label="جدول كشف الإيجار" tabindex="0"><table class="v203-rent-ledger"><caption class="v203-visually-hidden">كشف إيجار '+escapeHtml(model.property)+' عن '+escapeHtml(periodLabel(model.period))+'</caption><thead><tr>'+HEADERS.map(function(header){return '<th scope="col">'+bilingual(header[0],header[1])+'</th>'}).join('')+'</tr></thead><tbody>'+bodyRows+fillerRows+
        '<tr class="v203-rent-total"><td colspan="3">الإجمالي / TOTAL</td><td>'+escapeHtml(money(model.items.reduce(function(total,item){return total+Number(item.contractRent||0)},0)))+'</td><td>'+escapeHtml(money(insuranceTotal))+'</td><td>'+escapeHtml(money(advanceTotal))+'</td><td>'+escapeHtml(money(cleaningTotal))+'</td><td>'+escapeHtml(money(model.items.reduce(function(total,item){return total+Number(item.currentRent||0)},0)))+'</td><td colspan="6"></td></tr>'+
      '</tbody></table></div>'+
      '<footer class="v202-paper-footer"><div>AQARI • '+escapeHtml(model.period)+'</div><div>مصدر الحساب: V202 RENT SNAPSHOT</div></footer>'+
    '</section>';
  }

  function csvSafeValue(value){
    let result=String(value==null?'':value).replace(/\u0000/g,'');
    if(/^[\s\u0009\u000d\u000a]*[=+\-@]/.test(result))result="'"+result;
    return result;
  }

  function csvCell(value){return '"'+csvSafeValue(value).replace(/"/g,'""')+'"'}
  function csvDisplay(value,numeric){if(value==null||String(value).trim()==='')return '—';return numeric?money(value):display(value)}

  function toCsv(property,period){
    const model=statementModel(property,period);
    const lines=[HEADERS.map(function(header){return header[0]+' / '+header[1]})];
    model.items.forEach(function(item){
      lines.push([
        csvDisplay(item.unit),csvDisplay(unique([item.tenant,item.civilId,item.nationality,item.phone,item.email]).join(' | ')),
        csvDisplay(item.contractNo),csvDisplay(item.contractRent,true),csvDisplay(item.insurance,true),csvDisplay(item.advance,true),
        csvDisplay(item.cleaning,true),csvDisplay(item.currentRent,true),csvDisplay(item.paymentDate),csvDisplay(item.paymentMethod),
        csvDisplay(item.knetNo),csvDisplay(item.voucherNo||item.receiptNo),csvDisplay(item.receiptContract),csvDisplay(item.accountant)
      ]);
    });
    return '\uFEFF'+lines.map(function(line){return line.map(csvCell).join(',')}).join('\r\n');
  }

  function safeFilename(value){return text(value).replace(/[\u0000-\u001f<>:"/\\|?*]+/g,'-').replace(/\s+/g,' ').slice(0,80)||'العقار'}

  function downloadCsv(property,period){
    if(typeof document==='undefined'||!document.body||typeof Blob==='undefined'||!root.URL||typeof root.URL.createObjectURL!=='function')return false;
    const selectedPeriod=validPeriod(period)?period:currentPeriod();
    const blob=new Blob([toCsv(property,selectedPeriod)],{type:'text/csv;charset=utf-8'});
    const url=root.URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;
    anchor.download='كشف-إيجار-'+safeFilename(property)+'-'+selectedPeriod+'.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function(){root.URL.revokeObjectURL(url)},0);
    return true;
  }

  function ensureDialog(){
    let overlay=document.getElementById('aqariDhahawiDialog');
    if(overlay)return overlay;
    if(!document.body)return null;
    overlay=document.createElement('div');
    overlay.id='aqariDhahawiDialog';
    overlay.className='v202-dialog-overlay v202-document-overlay';
    overlay.setAttribute('aria-hidden','true');
    overlay.setAttribute('inert','');
    overlay.hidden=true;
    overlay.innerHTML='<section class="v202-document-shell" role="dialog" aria-modal="true" aria-labelledby="aqariDhahawiTitle">'+
      '<header class="v202-document-toolbar"><button type="button" data-dhahawi-close aria-label="إغلاق كشف الإيجار والرجوع">رجوع</button><h2 id="aqariDhahawiTitle">كشف إيجار العقار</h2><div class="v203-dhahawi-tools"><button type="button" data-dhahawi-csv>تنزيل CSV</button><button type="button" class="is-primary" data-dhahawi-print>طباعة / PDF</button></div></header>'+
      '<div id="aqariDhahawiBody"></div></section>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function suspendBackground(dialog){
    if(!document.body)return;
    if(!backgroundInertState)backgroundInertState=new Map();
    Array.from(document.body.children).forEach(function(node){
      if(node===dialog||backgroundInertState.has(node))return;
      backgroundInertState.set(node,node.hasAttribute('inert'));
      node.setAttribute('inert','');
    });
  }

  function restoreBackground(){
    if(!backgroundInertState)return;
    backgroundInertState.forEach(function(wasInert,node){
      if(!node.isConnected)return;
      if(wasInert)node.setAttribute('inert','');else node.removeAttribute('inert');
    });
    backgroundInertState=null;
  }

  function render(model){
    const dialog=ensureDialog();
    if(!dialog)return null;
    const body=dialog.querySelector('#aqariDhahawiBody');
    if(body)body.innerHTML=statementMarkup(model);
    dialog.dataset.property=model.property;
    dialog.dataset.period=model.period;
    return dialog;
  }

  function open(options){
    if(typeof document==='undefined'||!document.body)return false;
    const request=options&&typeof options==='object'?options:{};
    const property=text(request.property)||currentProperty();
    const period=validPeriod(request.period)?request.period:currentPeriod();
    if(!property)return false;
    const model=statementModel(property,period);
    if(!model.available)return false;
    const existing=document.getElementById('aqariDhahawiDialog');
    const wasOpen=Boolean(existing?.classList.contains('on'));
    const dialog=render(model);
    if(!dialog)return false;
    if(!wasOpen)activeTrigger=typeof HTMLElement!=='undefined'&&request.trigger instanceof HTMLElement?request.trigger:document.activeElement;
    suspendBackground(dialog);
    dialog.hidden=false;
    dialog.classList.add('on');
    dialog.removeAttribute('inert');
    dialog.setAttribute('aria-hidden','false');
    document.body.classList.add('aqari-dhahawi-open');
    const focusClose=function(){dialog.querySelector('[data-dhahawi-close]')?.focus()};
    if(typeof root.requestAnimationFrame==='function')root.requestAnimationFrame(focusClose);else setTimeout(focusClose,0);
    return true;
  }

  function close(){
    if(typeof document==='undefined')return;
    const dialog=document.getElementById('aqariDhahawiDialog');
    const wasOpen=Boolean(dialog?.classList.contains('on'));
    if(dialog){
      dialog.classList.remove('on');
      dialog.setAttribute('inert','');
      dialog.setAttribute('aria-hidden','true');
      dialog.hidden=true;
    }
    finishPrint();
    document.body?.classList.remove('aqari-dhahawi-open');
    restoreBackground();
    const target=activeTrigger;
    activeTrigger=null;
    if(wasOpen&&typeof HTMLElement!=='undefined'&&target instanceof HTMLElement&&target.isConnected)setTimeout(function(){target.focus()},0);
  }

  function refresh(period){
    const dialog=document.getElementById('aqariDhahawiDialog');
    if(!dialog?.classList.contains('on'))return false;
    const restorePeriodFocus=Boolean(document.activeElement&&typeof document.activeElement.matches==='function'&&document.activeElement.matches('#aqariDhahawiDialog [data-dhahawi-period]'));
    const property=text(dialog.dataset.property)||currentProperty();
    const selected=validPeriod(period)?period:text(dialog.dataset.period)||currentPeriod();
    const model=statementModel(property,selected);
    if(!model.available)return false;
    const refreshed=render(model);
    if(!refreshed)return false;
    if(restorePeriodFocus){
      const periodInput=refreshed.querySelector('[data-dhahawi-period]');
      if(typeof periodInput?.focus==='function'){
        try{periodInput.focus({preventScroll:true})}catch(_){periodInput.focus()}
      }
    }
    return true;
  }

  function dialogIsOpen(){return Boolean(document.getElementById('aqariDhahawiDialog')?.classList.contains('on'))}

  function preparePrint(){
    if(typeof document==='undefined'||!document.body||!dialogIsOpen())return false;
    if(printCleanupTimer)root.clearTimeout(printCleanupTimer);
    printActive=true;
    document.body.classList.add('v203-print-dhahawi');
    printCleanupTimer=root.setTimeout(finishPrint,60000);
    return true;
  }

  function finishPrint(){
    if(printCleanupTimer)root.clearTimeout(printCleanupTimer);
    printCleanupTimer=0;
    printActive=false;
    document.body?.classList.remove('v203-print-dhahawi');
  }

  function printStatement(){
    if(typeof document==='undefined'||typeof root.print!=='function'||!preparePrint())return false;
    try{
      root.print();
      root.setTimeout(finishPrint,1000);
    }
    catch(error){finishPrint();throw error}
    return true;
  }

  function focusable(dialog){
    return Array.from(dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')).filter(function(element){
      return !element.hasAttribute('hidden')&&element.getAttribute('aria-hidden')!=='true';
    });
  }

  function trapTab(event,dialog){
    if(event.key!=='Tab')return false;
    const elements=focusable(dialog);
    if(!elements.length){event.preventDefault();return true}
    const firstElement=elements[0];
    const lastElement=elements[elements.length-1];
    if(event.shiftKey&&document.activeElement===firstElement){event.preventDefault();lastElement.focus();return true}
    if(!event.shiftKey&&document.activeElement===lastElement){event.preventDefault();firstElement.focus();return true}
    return false;
  }

  const api=Object.freeze({version:DESIGN,open,openStatement:open,close,refresh,statementModel,toCsv,downloadCsv,printStatement});
  root.AQARI_DHAHAWI=api;
  root.AQARI_V202_RENT=api;
  root.__AQARI_DHAHAWI_RUNTIME__={version:DESIGN,api:api};

  function boot(){
    if(!document.body)return false;
    ensureDialog();
    let meta=document.querySelector('meta[name="aqari-operations"]');
    if(!meta&&document.head){meta=document.createElement('meta');meta.name='aqari-operations';document.head.appendChild(meta)}
    if(!meta)return false;
    meta.content=DESIGN;
    return true;
  }

  if(typeof document!=='undefined'){
    if(typeof root.addEventListener==='function'){
      root.addEventListener('click',function(event){
        const target=typeof Element!=='undefined'&&event.target instanceof Element?event.target:null;
        const statement=target?.closest('[data-v202-action="statement"]');
        if(!statement)return;
        if(open({property:currentProperty(),period:currentPeriod(),trigger:statement})){
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },true);
      root.addEventListener('keydown',function(event){
        const dialog=document.getElementById('aqariDhahawiDialog');
        if(!dialog?.classList.contains('on'))return;
        if((event.ctrlKey||event.metaKey)&&!event.altKey&&String(event.key).toLowerCase()==='p'){
          preparePrint();
          return;
        }
        if(event.key==='Escape'){
          event.preventDefault();event.stopImmediatePropagation();close();return;
        }
        if(trapTab(event,dialog))event.stopImmediatePropagation();
      },true);
      root.addEventListener('beforeprint',preparePrint);
      root.addEventListener('afterprint',finishPrint);
      root.addEventListener('focus',function(){if(printActive)root.setTimeout(finishPrint,250)},true);
    }
    if(typeof root.matchMedia==='function'){
      const printMedia=root.matchMedia('print');
      const onPrintMedia=function(event){if(event.matches)preparePrint();else finishPrint()};
      if(typeof printMedia.addEventListener==='function')printMedia.addEventListener('change',onPrintMedia);
      else if(typeof printMedia.addListener==='function')printMedia.addListener(onPrintMedia);
    }
    document.addEventListener('click',function(event){
      const target=typeof Element!=='undefined'&&event.target instanceof Element?event.target:null;
      if(!target)return;
      if(target.closest('[data-dhahawi-close]')){event.preventDefault();return close()}
      if(target.closest('[data-dhahawi-print]')){event.preventDefault();return printStatement()}
      if(target.closest('#aqariDhahawiDialog [data-dhahawi-csv]')){
        event.preventDefault();
        const dialog=document.getElementById('aqariDhahawiDialog');
        return downloadCsv(text(dialog?.dataset.property),text(dialog?.dataset.period));
      }
      const dialog=document.getElementById('aqariDhahawiDialog');
      if(target===dialog){event.preventDefault();close()}
    });
    document.addEventListener('change',function(event){
      const target=typeof Element!=='undefined'&&event.target instanceof Element?event.target:null;
      if(target?.matches('#aqariDhahawiDialog [data-dhahawi-period]'))refresh(target.value);
    });
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  }
})();
