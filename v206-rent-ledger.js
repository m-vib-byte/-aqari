(function(){
  'use strict';

  const DESIGN='V206-mainline-rent-ledger';
  let lastView=null;
  let queueFilter='due';
  let queueQuery='';

  function app(){try{return typeof db!=='undefined'&&db?db:{}}catch(_){return {}}}
  function rows(key){const v=app()[key];return Array.isArray(v)?v:[]}
  function esc(v){return String(v==null?'':v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function norm(v){return String(v==null?'':v).trim().toLowerCase()}
  function num(v){const a='٠١٢٣٤٥٦٧٨٩',p='۰۱۲۳۴۵۶۷۸۹';const s=String(v==null?'':v).replace(/[٠-٩]/g,d=>a.indexOf(d)).replace(/[۰-۹]/g,d=>p.indexOf(d)).replace(/[,٬]/g,'').replace(/٫/g,'.').replace(/[^0-9.\-]/g,'');const n=parseFloat(s);return Number.isFinite(n)?n:0}
  function money(v){return Number(v||0).toLocaleString('en-US',{maximumFractionDigits:3})}
  function property(){try{return String(sessionStorage.getItem('aqari_v202_property')||sessionStorage.getItem('aqari_v201_property')||'').trim()}catch(_){return ''}}
  function currentPeriod(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
  function contractId(c){return String(c?.id||c?.contract_no||'').trim()}
  function signed(c){return /signed|approved|موق|معتمد/i.test(String(c?.status||''))}
  function covers(c,period){const start=String(c?.start_date||'').slice(0,10),end=String(c?.end_date||'').slice(0,10);return (!start||start<=period+'-31')&&(!end||end>=period+'-01')}
  function isDhahawi(name){return /(ضحاوي|dhahawi)/i.test(String(name||''))}
  function brand(name){return isDhahawi(name)?{left:['Tel: 50721277 / Tel: 51119040','Tel: 55521007 / Tel: 25640025'],right:['dhahawi.kw.com','dhahawitower@gmail.com'],footer:"Salmiy'a - Block (10) - Street Essa Al Qutami - Bldg. (28)"}:{left:['AQARI PROPERTY MANAGEMENT','إدارة الأملاك'],right:['كشف إيجار رسمي','OFFICIAL RENT LEDGER'],footer:'صادر من منصة عقاري وفق البيانات المسجلة وقت الإصدار'}}
  function latest(list){return list.slice().sort((a,b)=>String(a?.paidAt||'').localeCompare(String(b?.paidAt||''))).pop()||null}
  function periodLabel(period){try{const d=new Date(period+'-01T12:00:00');return new Intl.DateTimeFormat('ar-KW',{month:'long',year:'numeric'}).format(d)}catch(_){return period}}

  function model(name,period){
    const contracts=rows('contractsV202').filter(c=>c&&typeof c==='object'&&norm(c.property)===norm(name)&&signed(c)&&covers(c,period));
    const ledger=rows('rentLedgerV202').filter(r=>r&&typeof r==='object'&&norm(r.property)===norm(name)&&String(r.period||'')===period);
    const items=contracts.map((c,index)=>{
      const rawId=contractId(c),id=norm(rawId);
      const pays=ledger.filter(r=>{const rid=norm(r.contractId||r.contract_id||r.contractNo||r.contract_no);if(id&&rid)return id===rid;return norm(r.unit)===norm(c.unit)&&norm(r.tenant)===norm(c.tenant)});
      const last=latest(pays),rent=num(c.rent||c.contractRent),paid=pays.reduce((t,r)=>t+num(r.paid),0),balance=Math.max(0,rent-paid);
      return {contractId:rawId,unit:String(c.unit||index+1),tenant:String(c.tenant||'—'),contractNo:String(c.contract_no||rawId||''),rent,insurance:num(c.insurance||c.deposit||0),advance:num(c.advance||c.advancePayment||0),cleaning:num(c.cleaning||c.cleaningFees||0),paid,balance,date:String(last?.paidAt||''),method:String(last?.method||''),knet:String(last?.knetNo||last?.knetOperationNo||last?.knet_operation_no||''),receipt:String(last?.receiptNo||last?.voucherNo||''),accountant:String(last?.accountant||'')};
    });
    const totalRent=items.reduce((t,i)=>t+i.rent,0),totalPaid=items.reduce((t,i)=>t+i.paid,0),totalBalance=items.reduce((t,i)=>t+i.balance,0);
    return {items,totalRent,totalPaid,totalBalance,totalInsurance:items.reduce((t,i)=>t+i.insurance,0),totalAdvance:items.reduce((t,i)=>t+i.advance,0),totalCleaning:items.reduce((t,i)=>t+i.cleaning,0),paidCount:items.filter(i=>i.rent>0&&i.balance<=0).length,dueCount:items.filter(i=>i.balance>0).length,collectionRate:totalRent>0?Math.min(100,Math.round((totalPaid/totalRent)*100)):0};
  }

  function bi(ar,en){return '<span class="v206-bi"><b>'+esc(ar)+'</b><small>'+esc(en)+'</small></span>'}
  function td(v,cls){return '<td'+(cls?' class="'+cls+'"':'')+'>'+esc(v==null?'':v)+'</td>'}
  function stat(label,value,sub,cls){return '<article class="v206-stat '+(cls||'')+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(sub||'')+'</small></article>'}
  function csvCell(v){const s=String(v==null?'':v).replace(/"/g,'""');return '"'+s+'"'}

  function exportCsv(){
    if(!lastView)return;
    const headers=['FLAT NO.','NAME OF THE TENANT','CONTRACT NO','RENT CONTRACT','INSURANCE','ADVANCE','CLEANING FEES','CURRENT RENT','PAYMENT DATE','PAYMENT METHOD','KNET OPERATION NUMBER','VOUCHER NO','RECEIPT CONTRACT','ACCOUNTANT'];
    const lines=[headers.map(csvCell).join(',')];
    lastView.model.items.forEach(i=>lines.push([i.unit,i.tenant,i.contractNo,i.rent,i.insurance,i.advance,i.cleaning,i.rent,i.date,i.method,i.knet,i.receipt,'',i.accountant].map(csvCell).join(',')));
    const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='AQARI-'+lastView.property+'-'+lastView.period+'-rent-ledger.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
  }

  function openPayment(){
    const name=lastView?.property||property();
    if(!name)return;
    const clickPayment=()=>{const button=document.querySelector('#v202PropertyWorkspace [data-v202-action="payment"]');if(button instanceof HTMLElement){button.click();return true}return false};
    if(clickPayment())return;
    if(typeof window.AQARI_V202?.openProperty==='function'){
      window.AQARI_V202.openProperty(name);
      setTimeout(clickPayment,100);
      return;
    }
    window.go?.('collectionProPage');
  }

  function openPaymentFor(id,balance){
    const wanted=String(id||'').trim();
    openPayment();
    if(!wanted)return;
    let attempts=0;
    const choose=()=>{
      attempts+=1;
      const select=document.getElementById('v202PaymentContract');
      if(select instanceof HTMLSelectElement){
        const option=Array.from(select.options).find(o=>o.value===wanted);
        if(option){
          select.value=wanted;
          select.dispatchEvent(new Event('change',{bubbles:true}));
          const amount=document.getElementById('v202PaymentAmount');
          if(amount instanceof HTMLInputElement){
            const remaining=num(balance);
            if(remaining>0&&!num(amount.value))amount.value=String(remaining);
            amount.focus();amount.select?.();amount.dispatchEvent(new Event('input',{bubbles:true}));
          }
          return;
        }
      }
      if(attempts<12)setTimeout(choose,75);
    };
    setTimeout(choose,60);
  }

  function queueItems(model){
    const q=norm(queueQuery);
    return model.items.filter(i=>{
      if(queueFilter==='due'&&!(i.balance>0))return false;
      if(queueFilter==='paid'&&!(i.rent>0&&i.balance<=0))return false;
      if(!q)return true;
      return norm([i.tenant,i.unit,i.contractNo,i.contractId].join(' ')).includes(q);
    }).sort((a,b)=>{
      if(a.balance>0||b.balance>0)return b.balance-a.balance;
      return String(a.unit).localeCompare(String(b.unit),'ar',{numeric:true});
    });
  }

  function queueRows(model){
    const list=queueItems(model);
    if(!list.length){
      const text=queueQuery?'لا توجد نتيجة مطابقة للبحث.':(queueFilter==='due'?'لا يوجد أي إيجار متبقي لهذا الشهر.':queueFilter==='paid'?'لا توجد وحدات مكتملة السداد بعد.':'لا توجد عقود فعالة لهذا الشهر.');
      return '<div class="v206-queue-empty">'+esc(text)+'</div>';
    }
    return list.slice(0,12).map(i=>{
      const due=i.balance>0;
      const tag=due?'<span class="v206-queue-status is-due">متبقي '+money(i.balance)+' د.ك</span>':'<span class="v206-queue-status is-paid">تم السداد</span>';
      const inner='<span class="v206-due-person"><b>'+esc(i.tenant)+'</b><small>وحدة '+esc(i.unit)+(i.contractNo?' • عقد '+esc(i.contractNo):'')+'</small></span>'+tag+(due?'<span class="v206-due-arrow">←</span>':'');
      return due?'<button type="button" class="v206-due-item" data-v206-due-contract="'+esc(i.contractId)+'" data-v206-due-balance="'+esc(i.balance)+'">'+inner+'</button>':'<div class="v206-due-item is-paid">'+inner+'</div>';
    }).join('')+(list.length>12?'<div class="v206-due-more">+ '+(list.length-12)+' نتيجة أخرى</div>':'');
  }

  function collectionQueue(model){
    const due=model.items.filter(i=>i.balance>0).length,paid=model.items.filter(i=>i.rent>0&&i.balance<=0).length;
    return '<section class="v206-due-panel"><div class="v206-due-head"><div><span>قائمة التحصيل السريعة</span><strong>'+due+' مطلوب • '+paid+' مكتمل</strong></div><small>ابحث ثم افتح تسجيل الدفعة على العقد الصحيح مباشرة</small></div><div class="v206-queue-tools"><label class="v206-search"><span>بحث</span><input type="search" data-v206-search value="'+esc(queueQuery)+'" placeholder="المستأجر، الوحدة أو رقم العقد"></label><div class="v206-filters" role="group" aria-label="فلترة التحصيل"><button type="button" data-v206-filter="due" class="'+(queueFilter==='due'?'is-active':'')+'">المتبقي '+due+'</button><button type="button" data-v206-filter="paid" class="'+(queueFilter==='paid'?'is-active':'')+'">المحصل '+paid+'</button><button type="button" data-v206-filter="all" class="'+(queueFilter==='all'?'is-active':'')+'">الكل '+model.items.length+'</button></div></div><div class="v206-due-list" data-v206-queue-results>'+queueRows(model)+'</div></section>';
  }

  function refreshQueue(){
    if(!lastView)return;
    const box=document.querySelector('[data-v206-queue-results]');
    if(box)box.innerHTML=queueRows(lastView.model);
    document.querySelectorAll('[data-v206-filter]').forEach(button=>button.classList.toggle('is-active',button.getAttribute('data-v206-filter')===queueFilter));
  }

  function render(period){
    const overlay=document.getElementById('v201RentStatement'),body=document.getElementById('v201StatementBody'),name=property();
    if(!overlay?.classList.contains('on')||!body||!name)return;
    const selected=period||currentPeriod(),m=model(name,selected),b=brand(name);
    lastView={property:name,period:selected,model:m};
    const rowsHtml=m.items.length?m.items.map((i,n)=>'<tr class="'+(i.balance>0?'v206-due':'v206-paid')+'">'+td(i.unit||n+1)+td(i.tenant,'v206-name')+td(i.contractNo)+td(i.rent?money(i.rent):'')+td(i.insurance?money(i.insurance):'')+td(i.advance?money(i.advance):'')+td(i.cleaning?money(i.cleaning):'')+td(i.rent?money(i.rent):'')+td(i.date)+td(i.method)+td(i.knet)+td(i.receipt)+td('')+td(i.accountant)+'</tr>').join(''):'<tr><td colspan="14" class="v206-empty">لا توجد عقود فعالة مرتبطة بهذا العقار في الشهر المحدد.</td></tr>';
    const filler=Math.max(0,14-m.items.length),blanks=Array.from({length:filler},()=>'<tr class="v206-filler">'+Array.from({length:14},()=>'<td>&nbsp;</td>').join('')+'</tr>').join('');
    const controls='<section class="v206-command" data-v206-command><div class="v206-command-head"><div><span>مركز تحصيل الإيجارات</span><h3>'+esc(name)+'</h3><small>'+esc(periodLabel(selected))+'</small></div><div class="v206-command-actions"><button type="button" class="is-primary" data-v206-action="payment">تسجيل إيجار</button><button type="button" data-v206-action="print">طباعة</button><button type="button" data-v206-action="csv">CSV</button></div></div><div class="v206-stats">'+stat('المتوقع',money(m.totalRent)+' د.ك',m.items.length+' عقد','')+stat('المحصل',money(m.totalPaid)+' د.ك',m.paidCount+' مكتمل','is-good')+stat('المتبقي',money(m.totalBalance)+' د.ك',m.dueCount+' مطلوب','is-due')+stat('نسبة التحصيل',m.collectionRate+'%',m.totalRent?'من إجمالي الشهر':'لا توجد استحقاقات','is-rate')+'</div>'+collectionQueue(m)+'</section>';
    const paper='<section class="v206-paper" data-v206-ledger><header class="v206-letterhead"><div><strong>'+esc(name.toUpperCase())+'</strong><span>'+esc(b.left[0])+'</span><span>'+esc(b.left[1])+'</span></div><div class="v206-mark"><span>▥</span><b>'+esc(name)+'</b><small>'+(isDhahawi(name)?'TOWER':'AQARI')+'</small></div><div class="v206-right"><strong>'+esc(name)+'</strong><span>'+esc(b.right[0])+'</span><span>'+esc(b.right[1])+'</span></div></header><div class="v206-period"><label>الشهر / MONTH <input type="month" data-v206-month value="'+esc(selected)+'"></label></div><div class="v206-wrap"><table class="v206-ledger"><thead><tr><th>'+bi('رقم الوحدة','FLAT NO.')+'</th><th>'+bi('اسم المستأجر','NAME OF THE TENANT')+'</th><th>'+bi('رقم العقد','CONTRACT NO')+'</th><th>'+bi('عقد إيجار','RENT CONTRACT')+'</th><th>'+bi('تأمين','INSURANCE')+'</th><th>'+bi('عربون','ADVANCE')+'</th><th>'+bi('رسوم النظافة','CLEANING FEES')+'</th><th>'+bi('الإيجار الحالي','CURRENT RENT')+'</th><th>'+bi('تاريخ الدفع','PAYMENT DATE')+'</th><th>'+bi('طريقة الدفع','PAYMENT METHOD')+'</th><th>'+bi('رقم عملية كي نت','KNET OPERATION NUMBER')+'</th><th>'+bi('رقم الوصل','VOUCHER NO')+'</th><th>'+bi('استلام العقد','RECEIPT CONTRACT')+'</th><th>'+bi('المحاسب','ACCOUNTANT')+'</th></tr></thead><tbody>'+rowsHtml+blanks+'<tr class="v206-total"><td colspan="3">الإجمالي / TOTAL</td><td>'+money(m.totalRent)+'</td><td>'+money(m.totalInsurance)+'</td><td>'+money(m.totalAdvance)+'</td><td>'+money(m.totalCleaning)+'</td><td>'+money(m.totalRent)+'</td><td colspan="6"></td></tr></tbody></table></div><footer><span>AQARI • '+esc(name)+'</span><span>'+esc(b.footer)+'</span></footer></section>';
    body.innerHTML=controls+paper;
    overlay.dataset.v206='ready';
  }

  function enhance(){setTimeout(()=>render(),50)}
  document.addEventListener('change',e=>{if(e.target.matches('[data-v206-month]')){queueQuery='';queueFilter='due';render(e.target.value)}});
  document.addEventListener('input',e=>{if(e.target.matches('[data-v206-search]')){queueQuery=e.target.value;refreshQueue()}});
  document.addEventListener('click',e=>{
    const filter=e.target.closest('[data-v206-filter]');
    if(filter){queueFilter=filter.getAttribute('data-v206-filter')||'due';refreshQueue();return}
    const due=e.target.closest('[data-v206-due-contract]');
    if(due){openPaymentFor(due.getAttribute('data-v206-due-contract'),due.getAttribute('data-v206-due-balance'));return}
    const action=e.target.closest('[data-v206-action]')?.getAttribute('data-v206-action');
    if(action==='payment')openPayment();
    if(action==='print')window.print();
    if(action==='csv')exportCsv();
  });
  const observer=new MutationObserver(()=>{const o=document.getElementById('v201RentStatement');if(o?.classList.contains('on')&&o.dataset.v206!=='ready')enhance();if(o&&!o.classList.contains('on')){delete o.dataset.v206;lastView=null;queueQuery='';queueFilter='due'}});
  function boot(){document.body.classList.add('aq-v206');let meta=document.querySelector('meta[name="aqari-rent-ledger"]');if(!meta){meta=document.createElement('meta');meta.name='aqari-rent-ledger';document.head.appendChild(meta)}meta.content=DESIGN;observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();