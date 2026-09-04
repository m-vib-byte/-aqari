(function(){
  'use strict';

  const DESIGN='V207-smart-collections';
  const PROTECTED_SOURCE='protected-rent-import-v202';
  let query='';
  let filter='action';

  function esc(v){return String(v==null?'':v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function norm(v){return String(v==null?'':v).trim().toLowerCase()}
  function app(){try{return typeof db!=='undefined'&&db?db:{}}catch(_){return {}}}
  function contracts(){const value=app().contractsV202;return Array.isArray(value)?value:[]}
  function activeProperty(){
    const ledger=document.querySelector('#v202DocumentBody [data-v206-ledger]');
    const documentProperty=String(ledger?.querySelector('.v206-ledger-title h2')?.textContent||'').trim();
    if(documentProperty&&documentProperty!=='عقار غير مسجل')return documentProperty;
    try{return String(sessionStorage.getItem('aqari_v202_property')||sessionStorage.getItem('aqari_v201_property')||'').trim()}catch(_){return ''}
  }
  function contractId(contract){return String(contract?.id||contract?.contract_no||'').trim()}
  function contractWritable(contract){return Boolean(contract)&&norm(contract?.source)!==norm(PROTECTED_SOURCE)}

  function statusKey(status){
    const value=String(status||'').trim();
    if(/مسدد/.test(value))return 'paid';
    if(/جزئي/.test(value))return 'partial';
    if(/قيد المراجعة/.test(value))return 'pending';
    return 'due';
  }

  function rowsFromOfficialLedger(){
    const ledger=document.querySelector('#v202DocumentBody [data-v206-ledger]');
    if(!ledger)return [];
    return Array.from(ledger.querySelectorAll('.v206-ledger-table tbody tr[data-v206-payment-status]')).map((row,index)=>{
      const cells=Array.from(row.querySelectorAll('td'));
      const status=String(row.getAttribute('data-v206-payment-status')||'مستحق');
      return {
        index,
        status,
        key:statusKey(status),
        unit:String(cells[0]?.textContent||'').trim(),
        tenant:String(cells[1]?.textContent||'').trim(),
        contractNo:String(cells[2]?.textContent||'').trim()
      };
    });
  }

  function resolveContract(item){
    const property=activeProperty();
    const matches=contracts().filter(contract=>{
      if(norm(contract?.property)!==norm(property))return false;
      if(item.contractNo&&item.contractNo!=='—'&&norm(contract?.contract_no)===norm(item.contractNo))return true;
      return norm(contract?.unit)===norm(item.unit)&&norm(contract?.tenant)===norm(item.tenant);
    });
    return matches.length===1?matches[0]:null;
  }

  function prioritySort(a,b){
    const priority={due:0,partial:1,pending:2,paid:3};
    const pa=priority[a.key]??9,pb=priority[b.key]??9;
    if(pa!==pb)return pa-pb;
    return String(a.unit).localeCompare(String(b.unit),'ar',{numeric:true,sensitivity:'base'});
  }

  function priorityTarget(items){
    return items.filter(item=>['due','partial'].includes(item.key)).sort(prioritySort).map(item=>({item,contract:resolveContract(item)})).find(entry=>entry.contract&&contractWritable(entry.contract))||null;
  }

  function visibleRows(items){
    const q=norm(query);
    return items.filter(item=>{
      if(filter==='action'&&!['due','partial'].includes(item.key))return false;
      if(filter!=='all'&&filter!=='action'&&item.key!==filter)return false;
      if(!q)return true;
      return norm([item.tenant,item.unit,item.contractNo,item.status].join(' ')).includes(q);
    }).sort(prioritySort);
  }

  function badge(item,readOnly){
    const suffix=readOnly?' • عرض فقط':'';
    if(item.key==='paid')return '<span class="v207-status is-paid">مسدد'+suffix+'</span>';
    if(item.key==='partial')return '<span class="v207-status is-partial">سداد جزئي'+suffix+'</span>';
    if(item.key==='pending')return '<span class="v207-status is-pending">قيد المراجعة'+suffix+'</span>';
    return '<span class="v207-status is-due">مستحق'+suffix+'</span>';
  }

  function listHtml(items){
    const list=visibleRows(items);
    if(!list.length)return '<div class="v207-empty">لا توجد نتائج مطابقة.</div>';
    return list.slice(0,16).map(item=>{
      const contract=resolveContract(item);
      const readOnly=Boolean(contract)&&!contractWritable(contract);
      const actionable=['due','partial'].includes(item.key)&&contractWritable(contract);
      const detail='وحدة '+esc(item.unit)+(item.contractNo&&item.contractNo!=='—'?' • عقد '+esc(item.contractNo):'');
      const inner='<span class="v207-person"><b>'+esc(item.tenant||'—')+'</b><small>'+detail+'</small></span>'+badge(item,readOnly)+(actionable?'<span class="v207-arrow">←</span>':'');
      return actionable?'<button type="button" class="v207-item is-'+item.key+'" data-v207-contract="'+esc(contractId(contract))+'">'+inner+'</button>':'<div class="v207-item is-'+item.key+(readOnly?' is-readonly':'')+'">'+inner+'</div>';
    }).join('')+(list.length>16?'<div class="v207-more">+ '+(list.length-16)+' نتيجة أخرى</div>':'');
  }

  function counts(items){
    return items.reduce((out,item)=>{out[item.key]=(out[item.key]||0)+1;return out},{due:0,partial:0,pending:0,paid:0});
  }

  function panelHtml(items){
    const c=counts(items),priority=priorityTarget(items),required=c.due+c.partial;
    const priorityButton=priority?'<button type="button" class="v207-priority" data-v207-priority>تحصيل الأولوية <small>'+esc(priority.item.tenant||'')+' • وحدة '+esc(priority.item.unit)+'</small></button>':required?'<span class="v207-priority is-readonly">الحالات المطلوبة للعرض فقط</span>':'<span class="v207-priority is-clear">التحصيل المطلوب مكتمل</span>';
    return '<section class="v207-panel" data-v207-panel><div class="v207-head"><div><span>مركز متابعة التحصيل</span><strong>'+c.due+' مستحق • '+c.partial+' جزئي • '+c.pending+' مراجعة • '+c.paid+' مسدد</strong></div><div class="v207-head-actions"><small>الأولوية للمستحق ثم الجزئي. بيانات الاستيراد المحمي تظهر للمتابعة فقط ولا تفتح إجراء دفع.</small>'+priorityButton+'</div></div><div class="v207-tools"><label><span>بحث سريع</span><input type="search" data-v207-search value="'+esc(query)+'" placeholder="المستأجر، الوحدة أو رقم العقد"></label><div class="v207-filters" role="group" aria-label="حالة التحصيل"><button type="button" data-v207-filter="action" class="'+(filter==='action'?'is-active':'')+'">مطلوب الآن '+required+'</button><button type="button" data-v207-filter="due" class="'+(filter==='due'?'is-active':'')+'">مستحق '+c.due+'</button><button type="button" data-v207-filter="partial" class="'+(filter==='partial'?'is-active':'')+'">جزئي '+c.partial+'</button><button type="button" data-v207-filter="pending" class="'+(filter==='pending'?'is-active':'')+'">مراجعة '+c.pending+'</button><button type="button" data-v207-filter="paid" class="'+(filter==='paid'?'is-active':'')+'">مسدد '+c.paid+'</button><button type="button" data-v207-filter="all" class="'+(filter==='all'?'is-active':'')+'">الكل '+items.length+'</button></div></div><div class="v207-list" data-v207-results>'+listHtml(items)+'</div></section>';
  }

  function refresh(){
    const items=rowsFromOfficialLedger();
    const panel=document.querySelector('[data-v207-panel]');
    if(!panel)return;
    const holder=document.createElement('div');
    holder.innerHTML=panelHtml(items);
    panel.replaceWith(holder.firstElementChild);
  }

  function mount(){
    const ledger=document.querySelector('#v202DocumentBody [data-v206-ledger]');
    if(!ledger||ledger.querySelector('[data-v207-panel]'))return;
    const items=rowsFromOfficialLedger();
    const summary=ledger.querySelector('.v206-ledger-summary');
    const holder=document.createElement('div');
    holder.innerHTML=panelHtml(items);
    const panel=holder.firstElementChild;
    if(summary?.parentNode)summary.parentNode.insertBefore(panel,summary.nextSibling);
    else ledger.prepend(panel);
    ledger.setAttribute('data-v207-smart-collections','ready');
  }

  function openPayment(contract){
    const wanted=String(contract||'').trim();
    if(!wanted)return false;
    const resolved=contracts().find(item=>contractId(item)===wanted)||null;
    if(!contractWritable(resolved))return false;
    const close=document.querySelector('#v202DocumentDialog.on [data-v202-document-close]');
    if(close instanceof HTMLElement)close.click();
    let attempts=0;
    const launch=()=>{
      attempts+=1;
      const workspace=document.getElementById('v202PropertyWorkspace');
      const action=workspace?.querySelector('[data-v202-action="payment"]');
      if(action instanceof HTMLElement){
        action.click();
        let chooseAttempts=0;
        const choose=()=>{
          chooseAttempts+=1;
          const select=document.getElementById('v202PaymentContract');
          if(select instanceof HTMLSelectElement){
            const option=Array.from(select.options).find(item=>item.value===wanted);
            if(option){select.value=wanted;select.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('v202PaymentAmount')?.focus();return}
          }
          if(chooseAttempts<14)setTimeout(choose,80);
        };
        setTimeout(choose,60);
        return;
      }
      if(attempts<8)setTimeout(launch,60);
    };
    setTimeout(launch,40);
    return true;
  }

  function openPriority(){
    const target=priorityTarget(rowsFromOfficialLedger());
    if(!target?.contract)return false;
    return openPayment(contractId(target.contract));
  }

  document.addEventListener('input',event=>{
    if(event.target.matches('[data-v207-search]')){query=event.target.value;refresh()}
  });
  document.addEventListener('click',event=>{
    const priorityButton=event.target.closest('[data-v207-priority]');
    if(priorityButton){openPriority();return}
    const filterButton=event.target.closest('[data-v207-filter]');
    if(filterButton){filter=filterButton.getAttribute('data-v207-filter')||'action';refresh();return}
    const contractButton=event.target.closest('[data-v207-contract]');
    if(contractButton){openPayment(contractButton.getAttribute('data-v207-contract')||'')}
  });

  const observer=new MutationObserver(()=>mount());
  function boot(){
    document.body.classList.add('aq-v207');
    observer.observe(document.body,{subtree:true,childList:true});
    mount();
    let meta=document.querySelector('meta[name="aqari-smart-collections"]');
    if(!meta){meta=document.createElement('meta');meta.name='aqari-smart-collections';document.head.appendChild(meta)}
    meta.content=DESIGN;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();