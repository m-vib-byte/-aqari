(function(){
  'use strict';

  const DESIGN='V208-portfolio-collections';
  let query='';
  let filter='action';
  let scheduled=0;
  let lastSignature='';

  function esc(value){return String(value==null?'':value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
  function norm(value){return String(value==null?'':value).trim().toLocaleLowerCase('ar')}
  function number(value){const result=Number(value);return Number.isFinite(result)?result:0}
  function money(value){try{return number(value).toLocaleString('ar-KW',{minimumFractionDigits:0,maximumFractionDigits:3})+' د.ك'}catch(_){return String(number(value))+' د.ك'}}
  function monthLabel(){try{return new Intl.DateTimeFormat('ar-KW',{month:'long',year:'numeric'}).format(new Date())}catch(_){return new Date().toLocaleDateString('ar-KW',{month:'long',year:'numeric'})}}

  function isAuthenticated(){
    try{
      const context=window.AQARI_SUPABASE?.context;
      const userId=String(context?.user?.id||'').trim();
      const workspaceId=String(context?.workspace?.id||'').trim();
      const membership=context?.membership;
      if(!userId||!workspaceId||!membership?.is_active)return false;
      if(membership.user_id&&String(membership.user_id)!==userId)return false;
      if(membership.workspace_id&&String(membership.workspace_id)!==workspaceId)return false;
      return true;
    }catch(_){return false}
  }

  function propertyNames(){
    const seen=new Set();
    const names=[];
    document.querySelectorAll('[data-v201-property]').forEach(node=>{
      const name=String(node.getAttribute('data-v201-property')||'').trim();
      const key=norm(name);
      if(name&&!seen.has(key)){seen.add(key);names.push(name)}
    });
    return names;
  }

  function propertySummary(name){
    let context=null;
    try{context=typeof window.AQARI_V202?.propertyContext==='function'?window.AQARI_V202.propertyContext(name):null}catch(_){context=null}
    if(!context)return {name,state:'review',due:0,contracts:0,context:null};
    const due=Math.max(0,number(context.due));
    const contracts=Math.max(0,number(context.contracts));
    const state=contracts===0?'setup':due>0?'due':'settled';
    return {name,state,due,contracts,context};
  }

  function summaries(){return propertyNames().map(propertySummary)}

  function stats(items){
    return items.reduce((out,item)=>{
      out.total+=1;
      out.totalDue+=item.state==='due'?item.due:0;
      if(item.state==='due')out.due+=1;
      else if(item.state==='settled')out.settled+=1;
      else if(item.state==='setup')out.setup+=1;
      else out.review+=1;
      return out;
    },{total:0,totalDue:0,due:0,settled:0,setup:0,review:0});
  }

  function prioritySort(left,right){
    const order={due:0,review:1,setup:2,settled:3};
    const a=order[left.state]??9,b=order[right.state]??9;
    if(a!==b)return a-b;
    if(left.state==='due'&&right.state==='due'&&left.due!==right.due)return right.due-left.due;
    return left.name.localeCompare(right.name,'ar',{numeric:true,sensitivity:'base'});
  }

  function visible(items){
    const needle=norm(query);
    return items.filter(item=>{
      if(filter==='action'&&!['due','review'].includes(item.state))return false;
      if(filter!=='all'&&filter!=='action'&&item.state!==filter)return false;
      return !needle||norm(item.name).includes(needle);
    }).sort(prioritySort);
  }

  function stateLabel(item){
    if(item.state==='due')return '<span class="v208-state is-due">يحتاج تحصيل</span>';
    if(item.state==='settled')return '<span class="v208-state is-settled">منتظم</span>';
    if(item.state==='setup')return '<span class="v208-state is-setup">يحتاج ربط عقد</span>';
    return '<span class="v208-state is-review">يحتاج مراجعة</span>';
  }

  function propertyCards(items){
    const list=visible(items);
    if(!list.length)return '<div class="v208-empty">لا توجد عقارات مطابقة لهذا العرض.</div>';
    return list.map(item=>{
      const amount=item.state==='due'?'<strong>'+esc(money(item.due))+'</strong>':'<strong>—</strong>';
      const note=item.state==='due'?'مستحق حالي يحتاج متابعة':item.state==='settled'?'لا يوجد مستحق حالي':item.state==='setup'?'لا توجد عقود مرتبطة حالياً':'تعذر تحديد ملف العقار بشكل فريد';
      const open=item.context?'<button type="button" data-v208-open="'+esc(item.name)+'">فتح التحصيل</button>':'';
      const statement=item.context&&item.contracts>0?'<button type="button" class="is-secondary" data-v208-statement="'+esc(item.name)+'">كشف الإيجار</button>':'';
      return '<article class="v208-property is-'+item.state+'"><div class="v208-property-main"><div><span>العقار</span><h3>'+esc(item.name)+'</h3><small>'+esc(note)+'</small></div>'+stateLabel(item)+'</div><div class="v208-property-data"><div><span>المستحق الآن</span>'+amount+'</div><div><span>العقود المرتبطة</span><strong>'+item.contracts+'</strong></div></div><footer>'+open+statement+'</footer></article>';
    }).join('');
  }

  function priority(items){return items.filter(item=>item.state==='due'&&item.context).sort(prioritySort)[0]||null}

  function portfolioMarkup(items){
    const summary=stats(items);
    const top=priority(items);
    const priorityButton=top?'<button type="button" class="v208-priority" data-v208-open="'+esc(top.name)+'"><span>أعلى أولوية</span><strong>'+esc(top.name)+'</strong><small>'+esc(money(top.due))+' مستحق</small></button>':'<span class="v208-priority is-clear">لا يوجد مستحق حالي على العقارات المرتبطة</span>';
    return '<section class="v208-board" id="v208PortfolioCollections" aria-labelledby="v208PortfolioTitle"><header class="v208-board-head"><div><span>لوحة التحصيل الشاملة</span><h2 id="v208PortfolioTitle">كل العقارات في شاشة واحدة</h2><p>'+esc(monthLabel())+' • الأرقام من ملف العقار الرسمي بدون إعادة حساب داخل V208.</p></div>'+priorityButton+'</header><div class="v208-kpis" aria-live="polite"><div class="is-gold"><span>إجمالي المستحق الآن</span><strong>'+esc(money(summary.totalDue))+'</strong><small>من العقارات المرتبطة</small></div><div class="is-due"><span>تحتاج تحصيل</span><strong>'+summary.due+'</strong><small>عقار</small></div><div class="is-settled"><span>منتظمة</span><strong>'+summary.settled+'</strong><small>لا يوجد مستحق حالي</small></div><div><span>تحتاج ربط/مراجعة</span><strong>'+(summary.setup+summary.review)+'</strong><small>قبل متابعة التحصيل</small></div></div><div class="v208-tools"><label><span>بحث بالعقار</span><input type="search" data-v208-search value="'+esc(query)+'" placeholder="اكتب اسم العقار"></label><div class="v208-filters" role="group" aria-label="فلترة العقارات"><button type="button" data-v208-filter="action" class="'+(filter==='action'?'is-active':'')+'">مطلوب الآن '+(summary.due+summary.review)+'</button><button type="button" data-v208-filter="due" class="'+(filter==='due'?'is-active':'')+'">مستحق '+summary.due+'</button><button type="button" data-v208-filter="settled" class="'+(filter==='settled'?'is-active':'')+'">منتظم '+summary.settled+'</button><button type="button" data-v208-filter="setup" class="'+(filter==='setup'?'is-active':'')+'">يحتاج ربط '+summary.setup+'</button><button type="button" data-v208-filter="all" class="'+(filter==='all'?'is-active':'')+'">الكل '+summary.total+'</button></div></div><div class="v208-grid" data-v208-results>'+propertyCards(items)+'</div></section>';
  }

  function homeMarkup(items){
    const summary=stats(items);
    const top=priority(items);
    const headline=summary.totalDue>0?money(summary.totalDue)+' مستحق الآن':'التحصيل الحالي منتظم';
    const detail=summary.due?summary.due+' عقار يحتاج متابعة':(summary.total?'لا توجد عقارات عليها مستحق حالي':'لا توجد عقارات مرتبطة');
    return '<section class="v208-home-card" id="v208HomeCollections" aria-label="ملخص التحصيل"><div><span>التحصيل اليوم</span><strong>'+esc(headline)+'</strong><small>'+esc(detail)+(top?' • الأعلى: '+esc(top.name):'')+'</small></div><button type="button" data-v208-route>فتح لوحة التحصيل</button></section>';
  }

  function signature(items){return JSON.stringify({auth:isAuthenticated(),query,filter,items:items.map(item=>[item.name,item.state,item.due,item.contracts])})}

  function render(){
    if(!isAuthenticated()){
      document.getElementById('v208PortfolioCollections')?.remove();
      document.getElementById('v208HomeCollections')?.remove();
      lastSignature='';
      return;
    }
    const items=summaries();
    const nextSignature=signature(items);
    if(nextSignature===lastSignature&&document.getElementById('v208PortfolioCollections')&&document.getElementById('v208HomeCollections'))return;
    lastSignature=nextSignature;

    const page=document.getElementById('collectionProPage');
    if(page){
      const holder=document.createElement('div');
      holder.innerHTML=portfolioMarkup(items);
      const next=holder.firstElementChild;
      const current=document.getElementById('v208PortfolioCollections');
      if(current)current.replaceWith(next);else page.insertBefore(next,page.firstChild);
    }

    const home=document.getElementById('v205SimpleHome');
    if(home){
      const holder=document.createElement('div');
      holder.innerHTML=homeMarkup(items);
      const next=holder.firstElementChild;
      const current=document.getElementById('v208HomeCollections');
      if(current)current.replaceWith(next);
      else{
        const anchor=home.querySelector('.v205-workflow');
        if(anchor)home.insertBefore(next,anchor);else home.appendChild(next);
      }
    }
  }

  function schedule(){clearTimeout(scheduled);scheduled=setTimeout(render,90)}

  function openProperty(name,mode){
    if(!isAuthenticated()||typeof window.AQARI_V202?.openProperty!=='function')return false;
    let context=null;
    try{context=window.AQARI_V202.propertyContext(name)}catch(_){context=null}
    if(!context)return false;
    window.AQARI_V202.openProperty(name);
    let attempts=0;
    const follow=()=>{
      attempts+=1;
      const workspace=document.getElementById('v202PropertyWorkspace');
      if(workspace?.classList.contains('on')){
        if(mode==='statement'){
          const action=workspace.querySelector('[data-v202-action="statement"]');
          if(action instanceof HTMLElement){action.click();return}
        }else{
          const tab=document.getElementById('v202TabCollections');
          if(tab instanceof HTMLElement){tab.click();return}
        }
      }
      if(attempts<12)setTimeout(follow,70);
    };
    setTimeout(follow,70);
    return true;
  }

  document.addEventListener('input',event=>{
    if(event.target.matches('[data-v208-search]')){query=event.target.value;lastSignature='';render()}
  });

  document.addEventListener('click',event=>{
    const filterButton=event.target.closest('[data-v208-filter]');
    if(filterButton){filter=filterButton.getAttribute('data-v208-filter')||'action';lastSignature='';render();return}
    const statement=event.target.closest('[data-v208-statement]');
    if(statement){openProperty(statement.getAttribute('data-v208-statement')||'','statement');return}
    const open=event.target.closest('[data-v208-open]');
    if(open){openProperty(open.getAttribute('data-v208-open')||'','collections');return}
    if(event.target.closest('[data-v208-route]'))window.go?.('collectionProPage');
  });

  const observer=new MutationObserver(schedule);
  function boot(){
    document.body.classList.add('aq-v208');
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','aria-hidden']});
    render();
    let meta=document.querySelector('meta[name="aqari-portfolio-collections"]');
    if(!meta){meta=document.createElement('meta');meta.name='aqari-portfolio-collections';document.head.appendChild(meta)}
    meta.content=DESIGN;
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();