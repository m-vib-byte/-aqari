(function(){
  'use strict';

  function activeProperty(){try{return String(sessionStorage.getItem('aqari_v201_property')||'').trim()}catch(_){return ''}}
  function data(){try{return typeof db!=='undefined'&&db?db:{}}catch(_){return {}}}
  function rows(key){return Array.isArray(data()[key])?data()[key]:[]}
  function norm(value){return String(value==null?'':value).trim().toLowerCase()}
  function esc(value){return String(value==null?'':value).replace(/[&<>'"]/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]})}
  function amount(value){
    const arabic='٠١٢٣٤٥٦٧٨٩',persian='۰۱۲۳۴۵۶۷۸۹';
    const raw=String(value==null?'':value).replace(/[٠-٩]/g,d=>arabic.indexOf(d)).replace(/[۰-۹]/g,d=>persian.indexOf(d)).replace(/[,٬]/g,'').replace(/٫/g,'.').replace(/[^0-9.\-]/g,'');
    const n=parseFloat(raw);return Number.isFinite(n)?n:0;
  }
  function money(value){try{return Number(value||0).toLocaleString('ar-KW',{maximumFractionDigits:3})+' د.ك'}catch(_){return String(value||0)+' د.ك'}}
  function period(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
  function periodLabel(){try{return new Intl.DateTimeFormat('ar-KW',{month:'long',year:'numeric'}).format(new Date())}catch(_){return period()}}
  function contractId(contract){return String(contract?.id||contract?.contract_no||'').trim()}

  function propertyContracts(property){return rows('contractsV202').filter(c=>c&&typeof c==='object'&&norm(c.property)===norm(property))}
  function activeContracts(property){return propertyContracts(property).filter(c=>/signed|approved|موق|معتمد/i.test(String(c.status||'')))}
  function ledger(property){return rows('rentLedgerV202').filter(r=>r&&typeof r==='object'&&norm(r.property)===norm(property))}
  function currentLedger(property){const p=period();return ledger(property).filter(r=>String(r.period||'')===p)}

  function latestReceiptIndex(property){
    const collections=rows('collections');let found=-1;
    collections.forEach(function(row,index){if(!Array.isArray(row))return;const text=row.map(v=>String(v==null?'':v)).join(' | ');if(text.includes(property))found=index});
    return found;
  }

  function contractPaid(contract,entries){
    const id=norm(contractId(contract));
    const unit=norm(contract.unit);
    return entries.filter(function(entry){
      const entryId=norm(entry.contractId||entry.contract_id||entry.contractNo||entry.contract_no);
      if(id&&entryId)return entryId===id;
      return unit&&norm(entry.unit)===unit;
    }).reduce((total,entry)=>total+amount(entry.paid),0);
  }

  function dueContracts(property){
    const entries=currentLedger(property);
    return activeContracts(property).map(function(contract){
      const rent=amount(contract.rent||contract.contractRent);
      const paid=contractPaid(contract,entries);
      return {contract,rent,paid,due:Math.max(0,rent-paid)};
    }).filter(item=>item.due>0).sort((a,b)=>b.due-a.due);
  }

  function monthlySummary(property){
    const contracts=activeContracts(property);
    const entries=currentLedger(property);
    const expected=contracts.reduce((t,c)=>t+amount(c.rent||c.contractRent),0);
    const paid=entries.reduce((t,r)=>t+amount(r.paid),0);
    const balance=Math.max(0,expected-paid);
    const paidUnits=new Set(entries.filter(r=>amount(r.paid)>0).map(r=>norm(r.unit)).filter(Boolean));
    return {contracts:contracts.length,paidUnits:paidUnits.size,expected,paid,balance};
  }

  function icon(path){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>'}
  const icons={
    contract:'<path d="M6 2h9l4 4v16H6zM14 2v5h5M9 12h7M9 16h7"/>',
    wallet:'<path d="M3 6h16a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2V6M16 11h5v4h-5a2 2 0 0 1 0-4z"/>',
    receipt:'<path d="M5 2v20l3-2 3 2 2-2 3 2 3-2V2l-3 2-3-2-2 2-3-2-3 2zM8 9h8M8 13h6"/>',
    chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'
  };

  function actionButton(action,title,copy,iconName,primary){return '<button type="button" class="v203-simple-action'+(primary?' is-primary':'')+'" data-v203-action="'+action+'">'+icon(icons[iconName])+'<span><strong>'+title+'</strong><small>'+copy+'</small></span></button>'}

  function dueMarkup(property){
    const due=dueContracts(property);
    if(!activeContracts(property).length)return '';
    if(!due.length)return '<div class="v203-due-box is-clear"><div><span>المطلوب الآن</span><strong>ممتاز — لا يوجد إيجار متبقٍ مسجل لهذا الشهر</strong></div></div>';
    const visible=due.slice(0,6);
    return '<section class="v203-due-box"><div class="v203-due-head"><div><span>المطلوب الآن</span><strong>'+due.length+' مستأجر / وحدة عليها متبقي</strong></div><small>اضغط على الاسم لتسجيل الإيجار مباشرة</small></div><div class="v203-due-list">'+visible.map(function(item){
      const c=item.contract;
      return '<button type="button" data-v203-due-contract="'+esc(contractId(c))+'"><span><strong>'+esc(c.tenant||'مستأجر غير محدد')+'</strong><small>وحدة '+esc(c.unit||'—')+(c.contract_no?' • عقد '+esc(c.contract_no):'')+'</small></span><em>'+money(item.due)+'</em></button>';
    }).join('')+'</div>'+(due.length>visible.length?'<small class="v203-due-more">+'+(due.length-visible.length)+' أخرى تظهر في كشف الشهر</small>':'')+'</section>';
  }

  function install(){
    const hub=document.querySelector('.v202-property-hub');if(!hub)return;
    const property=activeProperty();if(!property)return;
    let strip=hub.querySelector('.v203-simple-strip');
    if(!strip){strip=document.createElement('section');strip.className='v203-simple-strip';strip.setAttribute('aria-label','الإجراءات السريعة');const hero=hub.querySelector('.v202-property-hero');if(hero?.nextSibling)hub.insertBefore(strip,hero.nextSibling);else hub.prepend(strip)}

    const hasActive=activeContracts(property).length>0;
    const latest=latestReceiptIndex(property);
    const summary=monthlySummary(property);
    const collectionTone=summary.balance<=0&&summary.expected>0?'is-good':summary.paid>0?'is-progress':'is-due';
    const collectionText=summary.expected?money(summary.paid)+' من '+money(summary.expected):'لا توجد عقود فعالة';

    strip.innerHTML=
      '<div class="v203-simple-title"><div><span>'+periodLabel()+'</span><strong>إدارة '+esc(property)+'</strong></div><small>'+(hasActive?'كل عمليات الشهر أمامك — سجّل الإيجار وافتح الوصل والكشف من نفس المكان':'ابدأ بالعقد، وبعدها التحصيل والوصل والكشف يصيرون من نفس الشاشة')+'</small></div>'+ 
      '<div class="v203-month-glance">'+
        '<div><span>العقود الفعالة</span><strong>'+summary.contracts+'</strong></div>'+ 
        '<div><span>تم تحصيل وحدات</span><strong>'+summary.paidUnits+'</strong></div>'+ 
        '<div class="'+collectionTone+'"><span>تحصيل الشهر</span><strong>'+collectionText+'</strong></div>'+ 
        '<div class="'+(summary.balance>0?'is-due':'is-good')+'"><span>المتبقي</span><strong>'+money(summary.balance)+'</strong></div>'+ 
      '</div>'+dueMarkup(property)+
      '<div class="v203-simple-actions">'+
        actionButton('contract','عقد جديد','إنشاء وربط العقد','contract',!hasActive)+
        actionButton('payment','تسجيل إيجار','تحصيل + وصل مباشرة','wallet',hasActive)+
        actionButton('receipt','آخر وصل',latest>=0?'فتح آخر إيصال مسجل':'لا يوجد وصل حتى الآن','receipt',false)+
        actionButton('statement','كشف الشهر','كشف ضحاوي للطباعة','chart',false)+
      '</div>';
    strip.dataset.latestReceipt=String(latest);
    const original=hub.querySelector('.v202-actions');if(original)original.classList.add('v203-original-actions');
  }

  function openPaymentFor(contract){
    const hub=document.querySelector('.v202-property-hub');
    const target=hub?.querySelector('[data-v202-action="payment"]');
    if(!target)return;
    target.click();
    let tries=0;
    const selectContract=function(){
      const select=document.getElementById('v202PaymentContract');
      if(!select&&tries++<12){setTimeout(selectContract,35);return}
      if(!select)return;
      select.value=contract;
      select.dispatchEvent(new Event('change',{bubbles:true}));
      select.focus();
    };
    setTimeout(selectContract,20);
  }

  function forward(action,source){
    const hub=document.querySelector('.v202-property-hub');if(!hub)return;
    if(action==='receipt'){
      const index=Number(source.closest('.v203-simple-strip')?.dataset.latestReceipt||-1);
      if(index>=0){const receipt=hub.querySelector('[data-v202-receipt-index="'+index+'"]');if(receipt){receipt.click();return}}
      const collectionsTab=hub.querySelector('[data-v202-tab="collections"],[data-v202-tab="collection"]');collectionsTab?.click();return;
    }
    const target=hub.querySelector('[data-v202-action="'+action+'"]');target?.click();
  }

  document.addEventListener('click',function(event){
    const due=event.target.closest('[data-v203-due-contract]');
    if(due){openPaymentFor(due.getAttribute('data-v203-due-contract'));return}
    const button=event.target.closest('[data-v203-action]');if(button)forward(button.getAttribute('data-v203-action'),button);
  });
  const observer=new MutationObserver(function(){clearTimeout(window.__aqariV203SimpleTimer);window.__aqariV203SimpleTimer=setTimeout(install,40)});
  function boot(){document.body.classList.add('aq-v203-simple');observer.observe(document.body,{subtree:true,childList:true});install()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();