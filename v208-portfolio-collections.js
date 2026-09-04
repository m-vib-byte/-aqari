(function(){
  'use strict';

  const DESIGN='V208-mainline-portfolio-collections';
  const PERIOD=/^\d{4}-(0[1-9]|1[0-2])$/;
  let period=currentPeriod();
  let query='';
  let filter='action';
  let timer=0;
  let lastSignature='';
  let authListenerInstalled=false;

  function esc(value){return String(value==null?'':value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
  function norm(value){return String(value==null?'':value).trim().toLocaleLowerCase('ar')}
  function number(value){const result=Number(value);return Number.isFinite(result)?result:0}
  function currentPeriod(){const date=new Date();return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')}
  function money(value){try{return number(value).toLocaleString('ar-KW',{minimumFractionDigits:0,maximumFractionDigits:3})+' د.ك'}catch(_){return String(number(value))+' د.ك'}}
  function periodLabel(value){
    if(!PERIOD.test(String(value||'')))return String(value||'');
    try{return new Intl.DateTimeFormat('ar-KW',{month:'long',year:'numeric'}).format(new Date(value+'-01T12:00:00'))}
    catch(_){return value}
  }

  function accessReady(){
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

  function officeSummary(name){
    if(!accessReady()||typeof window.AQARI_V202?.rentOfficeData!=='function')return {name,state:'review',period,due:0,collected:0,balance:0,units:0,canRecordPayment:false,official:false,valid:false};
    let data=null;
    try{data=window.AQARI_V202.rentOfficeData(name,period)}catch(_){data=null}
    const valid=Boolean(data&&String(data.property||'').trim()===String(name||'').trim()&&String(data.period||'')===period);
    if(!valid)return {name,state:'review',period,due:0,collected:0,balance:0,units:0,canRecordPayment:false,official:false,valid:false};
    const due=Math.max(0,number(data.totalRent));
    const collected=Math.max(0,number(data.totalCollected));
    const balance=Math.max(0,number(data.totalBalance));
    const units=Math.max(0,number(data.unitCount));
    const state=due>0?(balance>0?'due':'settled'):(units>0?'review':'setup');
    return {name,state,period,due,collected,balance,units,canRecordPayment:Boolean(data.canRecordPayment),official:Boolean(data.official),valid:true};
  }

  function summaries(){return propertyNames().map(officeSummary)}

  function stats(items){
    return items.reduce((out,item)=>{
      out.total+=1;
      if(item.valid){out.dueTotal+=item.due;out.collectedTotal+=item.collected;out.balanceTotal+=item.balance}
      if(item.state==='due'){out.due+=1;if(!item.canRecordPayment)out.readOnlyDue+=1}
      else if(item.state==='settled')out.settled+=1;
      else if(item.state==='setup')out.setup+=1;
      else out.review+=1;
      return out;
    },{total:0,dueTotal:0,collectedTotal:0,balanceTotal:0,due:0,settled:0,setup:0,review:0,readOnlyDue:0});
  }

  function collectionRate(summary){return summary.dueTotal>0?Math.min(100,Math.max(0,summary.collectedTotal/summary.dueTotal*100)):0}

  function prioritySort(left,right){
    const order={due:0,review:1,setup:2,settled:3};
    const a=order[left.state]??9,b=order[right.state]??9;
    if(a!==b)return a-b;
    if(left.state==='due'&&right.state==='due'&&left.balance!==right.balance)return right.balance-left.balance;
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

  function priority(items){return items.filter(item=>item.state==='due'&&item.valid).sort(prioritySort)[0]||null}

  function stateBadge(item){
    if(item.state==='due')return '<span class="v208-state is-due">'+(item.canRecordPayment?'يحتاج تحصيل':'يحتاج تحصيل • عرض فقط')+'</span>';
    if(item.state==='settled')return '<span class="v208-state is-settled">منتظم</span>';
    if(item.state==='setup')return '<span class="v208-state is-setup">يحتاج ربط</span>';
    return '<span class="v208-state is-review">يحتاج مراجعة</span>';
  }

  function propertyCards(items){
    const list=visible(items);
    if(!list.length)return '<div class="v208-empty">لا توجد عقارات مطابقة لهذا العرض.</div>';
    return list.map(item=>{
      const mode=item.canRecordPayment?'تسجيل متاح':'عرض فقط';
      const note=item.state==='due'?'يوجد رصيد مستحق لهذه الفترة':item.state==='settled'?'تحصيل الفترة مكتمل':item.state==='setup'?'لا توجد بيانات إيجار للفترة':'بيانات الفترة تحتاج مراجعة';
      const actions=item.valid?'<button type="button" data-v208-open="'+esc(item.name)+'">فتح التحصيل</button><button type="button" class="is-secondary" data-v208-statement="'+esc(item.name)+'">كشف الشهر</button>':'';
      return '<article class="v208-property is-'+item.state+'"><div class="v208-property-main"><div><span>العقار</span><h3>'+esc(item.name)+'</h3><small>'+esc(note)+(item.state==='due'?' • '+esc(mode):'')+'</small></div>'+stateBadge(item)+'</div><div class="v208-property-data"><div><span>المستحق</span><strong>'+esc(item.valid?money(item.due):'—')+'</strong></div><div><span>المحصّل</span><strong>'+esc(item.valid?money(item.collected):'—')+'</strong></div><div><span>المتبقي</span><strong>'+esc(item.valid?money(item.balance):'—')+'</strong></div><div><span>الوحدات</span><strong>'+esc(item.valid?String(item.units):'—')+'</strong></div></div><footer>'+actions+'</footer></article>';
    }).join('');
  }

  function boardMarkup(items){
    const summary=stats(items);
    const rate=collectionRate(summary);
    const top=priority(items);
    const priorityButton=top?'<button type="button" class="v208-priority" data-v208-open="'+esc(top.name)+'"><span>أعلى أولوية</span><strong>'+esc(top.name)+'</strong><small>'+esc(money(top.balance))+' متبقي'+(top.canRecordPayment?'':' • عرض فقط')+'</small></button>':'<span class="v208-priority is-clear">لا يوجد رصيد مستحق في هذه الفترة</span>';
    return '<section class="v208-board" id="v208PortfolioCollections" aria-labelledby="v208PortfolioTitle"><header class="v208-board-head"><div><span>لوحة التحصيل الشاملة</span><h2 id="v208PortfolioTitle">كل العقارات في شاشة واحدة</h2><p>فترة موحّدة لكل العقارات، والأرقام مأخوذة من `rentOfficeData` الرسمي بدون قراءة Ledger مباشرة.</p></div>'+priorityButton+'</header><div class="v208-period"><label for="v208PortfolioPeriod"><span>شهر التحصيل</span><input id="v208PortfolioPeriod" type="month" value="'+esc(period)+'"></label><strong>'+esc(periodLabel(period))+'</strong></div><div class="v208-kpis" aria-live="polite"><div class="is-gold"><span>المستحق</span><strong>'+esc(money(summary.dueTotal))+'</strong><small>'+summary.total+' عقار</small></div><div class="is-collected"><span>المحصّل</span><strong>'+esc(money(summary.collectedTotal))+'</strong><small>'+rate.toFixed(0)+'٪ نسبة التحصيل</small></div><div class="is-due"><span>المتبقي</span><strong>'+esc(money(summary.balanceTotal))+'</strong><small>'+summary.due+' عقار يحتاج متابعة</small></div><div class="is-settled"><span>منتظمة</span><strong>'+summary.settled+'</strong><small>'+(summary.readOnlyDue?summary.readOnlyDue+' مستحق للعرض فقط':'لا يوجد تنبيه صلاحيات')+'</small></div></div><div class="v208-tools"><label><span>بحث بالعقار</span><input type="search" data-v208-search value="'+esc(query)+'" placeholder="اكتب اسم العقار"></label><div class="v208-filters" role="group" aria-label="فلترة العقارات"><button type="button" data-v208-filter="action" class="'+(filter==='action'?'is-active':'')+'">مطلوب الآن '+(summary.due+summary.review)+'</button><button type="button" data-v208-filter="due" class="'+(filter==='due'?'is-active':'')+'">مستحق '+summary.due+'</button><button type="button" data-v208-filter="settled" class="'+(filter==='settled'?'is-active':'')+'">منتظم '+summary.settled+'</button><button type="button" data-v208-filter="setup" class="'+(filter==='setup'?'is-active':'')+'">يحتاج ربط '+summary.setup+'</button><button type="button" data-v208-filter="all" class="'+(filter==='all'?'is-active':'')+'">الكل '+summary.total+'</button></div></div><div class="v208-grid" data-v208-results>'+propertyCards(items)+'</div></section>';
  }

  function homeMarkup(items){
    const summary=stats(items);
    const top=priority(items);
    const headline=summary.balanceTotal>0?money(summary.balanceTotal)+' متبقي':'تحصيل '+periodLabel(period)+' منتظم';
    const detail=summary.due?summary.due+' عقار يحتاج متابعة':(summary.total?'لا يوجد رصيد مستحق حالي':'لا توجد عقارات مرتبطة');
    return '<section class="v208-home-card" id="v208HomeCollections" aria-label="ملخص التحصيل"><div><span>التحصيل • '+esc(periodLabel(period))+'</span><strong>'+esc(headline)+'</strong><small>'+esc(detail)+(top?' • الأعلى: '+esc(top.name):'')+'</small></div><button type="button" data-v208-route>فتح لوحة التحصيل</button></section>';
  }

  function signature(items){return JSON.stringify({access:accessReady(),period,query,filter,items:items.map(item=>[item.name,item.state,item.due,item.collected,item.balance,item.units,item.canRecordPayment,item.official])})}

  function render(){
    if(!accessReady()){
      document.getElementById('v208PortfolioCollections')?.remove();
      document.getElementById('v208HomeCollections')?.remove();
      lastSignature='';
      return;
    }
    const items=summaries();
    const page=document.getElementById('collectionProPage');
    const home=document.getElementById('v205SimpleHome');
    const nextSignature=signature(items);
    const boardMissing=Boolean(page&&!document.getElementById('v208PortfolioCollections'));
    const homeMissing=Boolean(home&&!document.getElementById('v208HomeCollections'));
    if(nextSignature===lastSignature&&!boardMissing&&!homeMissing)return;
    lastSignature=nextSignature;

    if(page){
      const holder=document.createElement('div');
      holder.innerHTML=boardMarkup(items);
      const next=holder.firstElementChild;
      const current=document.getElementById('v208PortfolioCollections');
      if(current)current.replaceWith(next);else page.insertBefore(next,page.firstChild);
    }

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

  function schedule(){clearTimeout(timer);timer=setTimeout(render,120)}

  function setStatementPeriod(){
    let attempts=0;
    const apply=()=>{
      attempts+=1;
      const input=document.getElementById('v202StatementPeriod');
      if(input instanceof HTMLInputElement){
        input.value=period;
        input.dispatchEvent(new Event('change',{bubbles:true}));
        return;
      }
      if(attempts<12)setTimeout(apply,70);
    };
    setTimeout(apply,60);
  }

  function openProperty(name,mode){
    if(!accessReady()||typeof window.AQARI_V202?.openProperty!=='function')return false;
    const check=officeSummary(name);
    if(!check.valid)return false;
    const opened=window.AQARI_V202.openProperty(name);
    if(opened===false)return false;
    let attempts=0;
    const follow=()=>{
      attempts+=1;
      const workspace=document.getElementById('v202PropertyWorkspace');
      if(workspace?.classList.contains('on')){
        if(mode==='statement'){
          const action=workspace.querySelector('[data-v202-action="statement"]');
          if(action instanceof HTMLElement){action.click();setStatementPeriod();return}
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

  document.addEventListener('change',event=>{
    if(event.target?.id==='v208PortfolioPeriod'){
      const next=String(event.target.value||'');
      if(PERIOD.test(next)){period=next;lastSignature='';render()}
    }
  });

  document.addEventListener('input',event=>{
    if(event.target?.matches?.('[data-v208-search]')){query=event.target.value;lastSignature='';render()}
  });

  document.addEventListener('click',event=>{
    const filterButton=event.target?.closest?.('[data-v208-filter]');
    if(filterButton){filter=filterButton.getAttribute('data-v208-filter')||'action';lastSignature='';render();return}
    const statement=event.target?.closest?.('[data-v208-statement]');
    if(statement){openProperty(statement.getAttribute('data-v208-statement')||'','statement');return}
    const open=event.target?.closest?.('[data-v208-open]');
    if(open){openProperty(open.getAttribute('data-v208-open')||'','collections');return}
    if(event.target?.closest?.('[data-v208-route]'))window.go?.('collectionProPage');
  });

  const observer=new MutationObserver(schedule);
  function installAuthListener(){
    if(authListenerInstalled||typeof window.AQARI_SUPABASE?.onAuthStateChange!=='function')return;
    authListenerInstalled=true;
    Promise.resolve(window.AQARI_SUPABASE.onAuthStateChange(function(){lastSignature='';schedule()})).catch(function(){authListenerInstalled=false});
  }

  function boot(){
    document.body.classList.add('aq-v208');
    observer.observe(document.body,{subtree:true,childList:true});
    installAuthListener();
    render();
    [600,1800,5000].forEach(delay=>setTimeout(function(){installAuthListener();schedule()},delay));
    let meta=document.querySelector('meta[name="aqari-portfolio-collections"]');
    if(!meta){meta=document.createElement('meta');meta.name='aqari-portfolio-collections';document.head.appendChild(meta)}
    meta.content=DESIGN;
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();