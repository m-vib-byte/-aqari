(function(){
  'use strict';

  const DESIGN='V205-preview';
  let rentalRecordsPromise;
  function rentalRecords(action,...args){
    if(!rentalRecordsPromise)rentalRecordsPromise=new Promise((resolve,reject)=>{
      if(window.AQARI_RENTAL_RECORDS)return resolve(window.AQARI_RENTAL_RECORDS);
      const script=document.createElement('script');script.src='/v267-rental-records.js?release=V267';
      script.onload=()=>resolve(window.AQARI_RENTAL_RECORDS);
      script.onerror=()=>{rentalRecordsPromise=null;script.remove();reject(Error('تعذر تحميل نموذج الحفظ. أعد المحاولة.'))};document.head.appendChild(script);
    });
    return rentalRecordsPromise.then(api=>api[action](...args)).catch(e=>window.alert(e.message));
  }
  const PRIMARY_SECTIONS=[
    ['home','home','الرئيسية'],
    ['properties','properties','العقارات'],
    ['tenants','tenants','المستأجرون'],
    ['collectionProPage','collectionProPage','التحصيل'],
    ['maintenanceProPage','maintenanceProPage','الصيانة']
  ];
  const DAILY_ACTIONS=[
    ['contract','smartContractsPage','file','إبرام عقد','عقد مرتبط بعقار ووحدة'],
    ['payment','collectionProPage','wallet','تسجيل إيجار','تحصيل وإصدار وصل'],
    ['statement','properties','statement','كشف الإيجار','كشف العقار أو المستأجر'],
    ['maintenance','maintenanceProPage','tool','طلب صيانة','فتح الطلب ومتابعته']
  ];
  const ICONS={
    search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    home:'<path d="m3 11 9-8 9 8M5 10v10h14V10M9 20v-6h6v6"/>',
    building:'<path d="M4 21h16M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h6"/>',
    users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87"/>',
    wallet:'<path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v10a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V6M16 13h2"/>',
    file:'<path d="M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h6"/>',
    statement:'<path d="M4 19V5M4 19h16M8 16v-5M13 16V8M18 16v-8"/>',
    tool:'<path d="M14.7 6.3a4 4 0 0 0-5-5L7 4l3 3 2.7-2.7a4 4 0 0 0 2 5L5.9 18.1a2.1 2.1 0 1 0 3 3l8.8-8.8a4 4 0 0 0 5-5L20 10l-3-3 2.7-2.7"/>',
    arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    close:'<path d="M18 6 6 18M6 6l12 12"/>'
  };

  let activeRoute='home';
  let chooserAction='';
  let chooserProperties=[];
  let chooserTrigger=null;
  let chooserInertState=null;
  let dashboardObserver=null;
  let enhanceTimer=0;

  function icon(name){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(ICONS[name]||ICONS.home)+'</svg>';
  }

  function isAuthenticated(){
    try{
      const context=window.AQARI_SUPABASE?.context;
      const userId=String(context?.user?.id||'').trim();
      const workspaceId=String(context?.workspace?.id||'').trim();
      const membership=context?.membership;
      const membershipUserId=String((membership&&membership.user_id)||'').trim();
      const membershipWorkspaceId=String((membership&&membership.workspace_id)||'').trim();
      if(!userId||!workspaceId||membership?.is_active!==true||!membershipUserId||!membershipWorkspaceId)return false;
      if(membershipUserId!==userId||membershipWorkspaceId!==workspaceId)return false;
      return true;
    }catch(_){return false}
  }

  function todayLabel(){
    try{return new Intl.DateTimeFormat('ar-KW',{weekday:'long',day:'numeric',month:'long',timeZone:'Asia/Kuwait'}).format(new Date())}
    catch(_){return new Date().toLocaleDateString('ar-KW')}
  }

  function primaryMarkup(){
    const icons=['home','building','users','wallet','tool'];
    return PRIMARY_SECTIONS.map(function(item,index){
      return '<button type="button" data-v205-section="'+item[0]+'" data-v199-go="'+item[1]+'"'+(index===0?' aria-current="page"':'')+'>'+icon(icons[index])+'<span>'+item[2]+'</span></button>';
    }).join('');
  }

  function actionsMarkup(){
    return DAILY_ACTIONS.map(function(item){
      const dialog=item[0]==='maintenance'?'':' aria-haspopup="dialog" aria-controls="v205PropertyChooser"';
      return '<button type="button" data-v205-daily-action="'+item[0]+'" data-v199-go="'+item[1]+'"'+dialog+'>'+
        '<span class="v205-action-icon">'+icon(item[2])+'</span><span><strong>'+item[3]+'</strong><small>'+item[4]+'</small></span><b>'+icon('arrow')+'</b></button>';
    }).join('');
  }

  function workflowMarkup(){
    const stages=[
      ['01','العقار','Property','ابدأ بملف مستقل لكل عقار'],
      ['02','الوحدة','Unit','كل شقة أو محل بسجل واضح'],
      ['03','المستأجر','Tenant','البيانات والتواصل في مكان واحد'],
      ['04','العقد','Contract','العقد مربوط بالعقار والوحدة'],
      ['05','التحصيل','Collection','دفعة ووصل وكشف قابل للطباعة']
    ];
    return stages.map(function(stage){
      return '<li data-v205-stage><span>'+stage[0]+'</span><div><strong>'+stage[1]+'</strong><small lang="en">'+stage[2]+'</small><p>'+stage[3]+'</p></div></li>';
    }).join('');
  }

  function createHome(){
    const home=document.getElementById('home');
    if(!home)return null;
    let root=document.getElementById('v205SimpleHome');
    if(root)return root;
    root=document.createElement('section');
    root.id='v205SimpleHome';
    root.className='v205-home';
    root.setAttribute('aria-label','مساحة العمل اليومية في عقاري');
    root.innerHTML=
      '<header class="v205-welcome">'+
        '<div><p class="v205-kicker">إدارة الأملاك في الكويت</p><h1>لوحة المدير العام</h1><span class="v205-date">'+todayLabel()+'</span></div>'+
        '<div class="v205-welcome-actions"><button type="button" data-v205-command="search">'+icon('search')+' بحث</button><button type="button" class="is-primary" data-v205-command="quick" aria-haspopup="dialog" aria-controls="v201CreateMenu">'+icon('plus')+' إجراء سريع</button></div>'+ 
      '</header>'+ 
      '<nav id="v205PrimarySections" class="v205-primary-sections" aria-label="أقسام المنصة الرئيسية" hidden>'+primaryMarkup()+'</nav>'+ 
      '<section class="v205-section v205-daily"><div class="v205-section-head"><div><span>المهام اليومية</span><h2>إجراءات سريعة</h2></div></div><div id="v205DailyActions" class="v205-daily-actions">'+actionsMarkup()+'</div></section>'+
      '<details class="v205-section v267-details"><summary>تفاصيل المحفظة والأداء المالي</summary><div id="v205LegacyDashboardSlot" class="v205-dashboard-slot"></div></details>'+ 
      '<details class="v205-section v205-workflow"><summary>دليل ترتيب ملف العقار</summary><ol>'+workflowMarkup()+'</ol></details>'+
      '<footer class="v205-home-footer"><span>عقاري</span><small>إدارة الأملاك • V267</small></footer>';
    home.insertBefore(root,home.firstChild);
    return root;
  }

  function createChooser(){
    let overlay=document.getElementById('v205PropertyChooser');
    if(overlay)return overlay;
    overlay=document.createElement('div');
    overlay.id='v205PropertyChooser';
    overlay.className='v205-chooser-overlay';
    overlay.setAttribute('aria-hidden','true');
    overlay.setAttribute('inert','');
    overlay.innerHTML=
      '<section class="v205-chooser" role="dialog" aria-modal="true" aria-labelledby="v205ChooserTitle" aria-describedby="v205ChooserDescription">'+
        '<header><div><span>خطوة واحدة فقط</span><h2 id="v205ChooserTitle">اختر العقار</h2><p id="v205ChooserDescription">بنفتح لك الإجراء داخل ملف العقار مباشرة.</p></div><button type="button" data-v205-chooser-close aria-label="إغلاق">'+icon('close')+'</button></header>'+ 
        '<div id="v205ChooserList" class="v205-chooser-list"></div>'+ 
        '<button type="button" class="v205-chooser-all" data-v205-route="properties">عرض كل العقارات</button>'+ 
      '</section>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function propertyNames(){
    const seen=new Set();
    const names=[];
    document.querySelectorAll('[data-v201-property]').forEach(function(node){
      const name=String(node.getAttribute('data-v201-property')||'').trim();
      const key=name.toLocaleLowerCase('ar');
      if(name&&!seen.has(key)){seen.add(key);names.push(name)}
    });
    return names;
  }

  function actionLabel(action){
    const row=DAILY_ACTIONS.find(function(item){return item[0]===action});
    return row?row[3]:'فتح ملف العقار';
  }

  function setChooserBackgroundInert(open,overlay){
    if(open&&!chooserInertState){
      chooserInertState=new Map(Array.from(document.body.children).map(function(node){
        return [node,node.hasAttribute('inert')];
      }));
      Array.from(document.body.children).forEach(function(node){
        if(node===overlay)node.removeAttribute('inert');
        else node.setAttribute('inert','');
      });
      return;
    }
    if(!open&&chooserInertState){
      chooserInertState.forEach(function(wasInert,node){
        if(!node.isConnected)return;
        if(wasInert)node.setAttribute('inert','');
        else node.removeAttribute('inert');
      });
      chooserInertState=null;
    }
  }

  function openChooser(action,trigger){
    if(!isAuthenticated())return;
    const overlay=createChooser();
    const list=document.getElementById('v205ChooserList');
    chooserAction=action;
    chooserTrigger=trigger||document.activeElement;
    chooserProperties=propertyNames();
    list.replaceChildren();
    chooserProperties.forEach(function(name,index){
      const button=document.createElement('button');
      button.type='button';
      button.setAttribute('data-v205-property-index',String(index));
      const mark=document.createElement('span');
      mark.className='v205-property-mark';
      mark.innerHTML=icon('building');
      const copy=document.createElement('span');
      const strong=document.createElement('strong');
      strong.textContent=name;
      const small=document.createElement('small');
      small.textContent=actionLabel(action)+' • '+(action==='statement'?'Statement':'Open');
      copy.append(strong,small);
      const arrow=document.createElement('b');
      arrow.innerHTML=icon('arrow');
      button.append(mark,copy,arrow);
      list.appendChild(button);
    });
    if(!chooserProperties.length){
      const empty=document.createElement('p');
      empty.className='v205-chooser-empty';
      empty.textContent='أضف أول عقار، وبعدها نربط به الوحدة والمستأجر والعقد.';
      list.appendChild(empty);
    }
    document.getElementById('v205ChooserTitle').textContent=actionLabel(action)+' — اختر العقار';
    overlay.classList.add('on');
    overlay.removeAttribute('inert');
    overlay.setAttribute('aria-hidden','false');
    setChooserBackgroundInert(true,overlay);
    document.body.classList.add('v205-chooser-open');
    requestAnimationFrame(function(){overlay.querySelector('button')?.focus()});
  }

  function closeChooser(restoreFocus){
    const overlay=document.getElementById('v205PropertyChooser');
    if(!overlay?.classList.contains('on'))return;
    overlay.classList.remove('on');
    overlay.setAttribute('aria-hidden','true');
    document.body.classList.remove('v205-chooser-open');
    setChooserBackgroundInert(false,overlay);
    overlay.setAttribute('inert','');
    const focusTarget=chooserTrigger;
    if(restoreFocus&&focusTarget instanceof HTMLElement)setTimeout(function(){if(focusTarget.isConnected)focusTarget.focus()},0);
    chooserTrigger=null;
  }

  function openPropertyAction(name,action){
    const originalTrigger=chooserTrigger;
    const context=typeof window.AQARI_V202?.propertyContext==='function'?window.AQARI_V202.propertyContext(name):null;
    closeChooser(false);
    if(!name)return;
    if(!context){window.go?.('properties');return}
    if(originalTrigger instanceof HTMLElement&&originalTrigger.isConnected){
      try{originalTrigger.focus({preventScroll:true})}catch(_error){originalTrigger.focus()}
    }
    if(typeof window.AQARI_V202?.openProperty==='function'){
      window.AQARI_V202.openProperty(name);
      setTimeout(function(){
        const workspace=document.getElementById('v202PropertyWorkspace');
        const title=document.getElementById('v202PropertyTitle');
        const opened=workspace?.classList.contains('on')&&workspace.getAttribute('aria-hidden')==='false';
        const matches=String(title?.textContent||'').trim()===String(name||'').trim();
        if(!opened||!matches)return;
        const actionButton=workspace.querySelector('[data-v202-action="'+action+'"]');
        if(actionButton instanceof HTMLElement)actionButton.click();
      },80);
      return;
    }
    const fallback=action==='contract'?'smartContractsPage':(action==='payment'?'collectionProPage':'properties');
    window.go?.(fallback);
  }

  function openQuickCreate(){
    const trigger=document.querySelector('#aqariV199Topbar [data-v201-quick],#v201MobileCreate,[data-v201-quick]');
    if(trigger instanceof HTMLElement)trigger.click();
  }

  function openSearch(){
    if(typeof window.AQARI_V209?.open==='function')return window.AQARI_V209.open();
    const trigger=document.querySelector('#aqariV199Topbar [data-v199-action="search"]');
    if(trigger instanceof HTMLElement)trigger.click();
  }

  function tagDashboard(dashboard){
    dashboard.querySelector('.v199-overview-head')?.setAttribute('data-v205-block','legacy-heading');
    dashboard.querySelector('.v199-kpi-grid')?.setAttribute('data-v205-block','kpis');
    dashboard.querySelectorAll('.v199-panel').forEach(function(panel){
      let block='';
      if(panel.querySelector('.v199-priority-list'))block='today';
      else if(panel.querySelector('.v199-properties'))block='properties';
      else if(panel.querySelector('.v199-finance-summary'))block='finance';
      else if(panel.querySelector('.v199-quick-grid'))block='legacy-actions';
      if(block)panel.setAttribute('data-v205-block',block);
    });
    const properties=dashboard.querySelector('[data-v205-block="properties"]');
    const propertyTitle=properties?.querySelector('.v199-panel-title h2');
    if(propertyTitle)propertyTitle.textContent='عقاراتي';
    const propertyCopy=properties?.querySelector('.v199-panel-title p');
    if(propertyCopy)propertyCopy.textContent='افتح العقار للوحدات والمستأجرين والعقود والتحصيل';
    const finance=dashboard.querySelector('[data-v205-block="finance"]');
    if(finance&&!finance.querySelector('[data-v205-finance-toggle]')){
      finance.classList.add('is-v205-collapsed');
      const button=document.createElement('button');
      button.type='button';
      button.className='v205-finance-toggle';
      button.setAttribute('data-v205-finance-toggle','');
      button.setAttribute('aria-expanded','false');
      button.textContent='عرض الملخص';
      finance.querySelector('.v199-panel-head')?.appendChild(button);
    }
  }

  function simplifyCreateMenu(){
    const grid=document.querySelector('#v201CreateMenu .v201-create-grid');
    if(grid){
      const ordered=['collections','tenants','maintenance','properties'].map(function(key){
        return grid.querySelector('[data-v201-create="'+key+'"]');
      }).filter(Boolean);
      const current=Array.from(grid.children).filter(function(node){return ordered.includes(node)});
      if(ordered.some(function(node,index){return current[index]!==node})){
        ordered.forEach(function(node){grid.appendChild(node)});
      }
    }
    const kicker=document.querySelector('#v201CreateMenu header p');
    const title=document.getElementById('v201CreateTitle');
    const description=document.getElementById('v201CreateDescription');
    if(kicker&&kicker.textContent!=='إجراء سريع')kicker.textContent='إجراء سريع';
    if(title&&title.textContent!=='شنو تبي تنجز؟')title.textContent='شنو تبي تنجز؟';
    if(description&&description.textContent!=='اختر المهمة وبنفتح النموذج المناسب مباشرة.')description.textContent='اختر المهمة وبنفتح النموذج المناسب مباشرة.';
    const brand=document.querySelector('.v199-brand-copy small');
    if(brand&&brand.textContent!=='إدارة الأملاك')brand.textContent='إدارة الأملاك';
    const addLabel=document.querySelector('.v199-add-button span');
    if(addLabel&&addLabel.textContent!=='إجراء سريع')addLabel.textContent='إجراء سريع';
  }

  function syncDashboard(){
    const root=createHome();
    const home=document.getElementById('home');
    const dashboard=document.getElementById('aqariV199Dashboard');
    if(!root||!home||!dashboard)return;
    const authenticated=isAuthenticated();
    root.setAttribute('data-authenticated',String(authenticated));
    const slot=document.getElementById('v205LegacyDashboardSlot');
    if(authenticated&&slot&&dashboard.parentElement!==slot)slot.appendChild(dashboard);
    if(!authenticated&&dashboard.parentElement===slot)root.insertAdjacentElement('afterend',dashboard);
    tagDashboard(dashboard);
    simplifyCreateMenu();
  }

  function scheduleEnhance(){
    clearTimeout(enhanceTimer);
    enhanceTimer=setTimeout(syncDashboard,80);
  }

  function normalizedRoute(route){
    if(['collections','collectionProPage','rentSchedule','receivablesAgingPage'].includes(route))return 'collectionProPage';
    if(['maintenance','workOrders','maintenanceProPage','workOrderCreatePage'].includes(route))return 'maintenanceProPage';
    if(['property360Page','portfolioCommandPage'].includes(route))return 'properties';
    return route||'home';
  }

  function syncPrimaryNavigation(route){
    activeRoute=normalizedRoute(route);
    document.body.setAttribute('data-v205-route',activeRoute);
    document.querySelectorAll('#v205PrimarySections [data-v205-section]').forEach(function(button){
      const selected=normalizedRoute(button.getAttribute('data-v199-go'))===activeRoute;
      if(selected)button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
  }

  function handleClick(event){
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;
    const daily=target.closest('[data-v205-daily-action]');
    if(daily){
      event.preventDefault();event.stopImmediatePropagation();
      const action=daily.getAttribute('data-v205-daily-action');
      if(action==='maintenance')return window.go?.('maintenanceProPage');
      return openChooser(action,daily);
    }
    const command=target.closest('[data-v205-command]');
    if(command){
      event.preventDefault();event.stopImmediatePropagation();
      return command.getAttribute('data-v205-command')==='search'?openSearch():openQuickCreate();
    }
    const selected=target.closest('[data-v205-property-index]');
    if(selected){
      event.preventDefault();event.stopImmediatePropagation();
      return openPropertyAction(chooserProperties[Number(selected.getAttribute('data-v205-property-index'))],chooserAction);
    }
    const finance=target.closest('[data-v205-finance-toggle]');
    if(finance){
      event.preventDefault();event.stopImmediatePropagation();
      const panel=finance.closest('[data-v205-block="finance"]');
      const collapsed=panel?.classList.toggle('is-v205-collapsed');
      finance.setAttribute('aria-expanded',String(!collapsed));
      finance.textContent=collapsed?'عرض الملخص':'إخفاء الملخص';
      return;
    }
    if(target.closest('[data-v205-chooser-close]')){
      event.preventDefault();event.stopImmediatePropagation();return closeChooser(true);
    }
    const route=target.closest('button[data-v205-route],a[data-v205-route]');
    if(route){
      event.preventDefault();event.stopImmediatePropagation();closeChooser(false);return window.go?.(route.getAttribute('data-v205-route'));
    }
    if(target===document.getElementById('v205PropertyChooser')){
      event.preventDefault();event.stopImmediatePropagation();return closeChooser(true);
    }
    const section=target.closest('#v205PrimarySections [data-v205-section]');
    if(section){
      event.preventDefault();event.stopImmediatePropagation();
      const route=section.getAttribute('data-v199-go')||'home';
      syncPrimaryNavigation(route);
      window.go?.(route);
      return;
    }
    const legacyRoute=target.closest('[data-v199-go]');
    if(legacyRoute)setTimeout(function(){syncPrimaryNavigation(legacyRoute.getAttribute('data-v199-go'))},0);
  }

  function handleKeydown(event){
    const overlay=document.getElementById('v205PropertyChooser');
    if(event.key==='Escape'&&overlay?.classList.contains('on')){
      event.preventDefault();event.stopImmediatePropagation();return closeChooser(true);
    }
    if(event.key!=='Tab'||!overlay?.classList.contains('on'))return;
    const focusable=Array.from(overlay.querySelectorAll('button:not([disabled])'));
    if(!focusable.length)return;
    const first=focusable[0];
    const last=focusable[focusable.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }

  function installObservers(){
    const dashboard=document.getElementById('aqariV199Dashboard');
    if(dashboard&&!dashboardObserver){
      dashboardObserver=new MutationObserver(scheduleEnhance);
      dashboardObserver.observe(dashboard,{childList:true});
    }
    const gate=document.getElementById('aqariCloudGateV168');
    if(gate)new MutationObserver(scheduleEnhance).observe(gate,{attributes:true,attributeFilter:['class']});
    const session=document.getElementById('sessionBadge');
    if(session)new MutationObserver(scheduleEnhance).observe(session,{childList:true,subtree:true,characterData:true});
  }

  function boot(){
    if(document.body.getAttribute('data-v205-ready')==='true'&&window.AQARI_V205?.version===DESIGN)return;
    document.documentElement.lang='ar';
    document.documentElement.dir='rtl';
    document.body.classList.add('aq-v205');
    const productRelease=String(document.querySelector('meta[name="aqari-release"]')?.content||'V267');
    document.title='عقاري '+productRelease+' • إدارة الأملاك بسهولة';
    createHome();
    syncPrimaryNavigation('home');
    createChooser();
    simplifyCreateMenu();
    syncDashboard();
    installObservers();
    document.addEventListener('click',handleClick,true);
    document.addEventListener('keydown',handleKeydown,true);
    window.addEventListener('storage',scheduleEnhance);
    window.addEventListener('focus',scheduleEnhance);
    document.body.setAttribute('data-v205-ready','true');
    const legacyAdd=window.add;
    if(typeof legacyAdd==='function'&&!legacyAdd.__v267Payment){
      const guardedAdd=function(){
        if(typeof cur!=='undefined'&&['collections','collectionProPage'].includes(cur))return openChooser('payment',document.activeElement);
        if(typeof cur!=='undefined'&&cur==='tenants')return rentalRecords('openTenant');
        if(typeof cur!=='undefined'&&cur==='leases')return window.go?.('smartContractsPage');
        if(typeof cur!=='undefined'&&['properties','employees','payroll','maintenance','expenses','services'].includes(cur))return rentalRecords('openRecord',cur);
        return legacyAdd.apply(this,arguments);
      };
      guardedAdd.__v267Payment=true;window.add=guardedAdd;
    }
    const legacyEdit=window.edit;
    if(typeof legacyEdit==='function')window.edit=function(index){
      if(typeof cur!=='undefined'&&['collections','collectionProPage'].includes(cur))return window.alert('الوصل المحفوظ لا يُعدّل مباشرة. راجع الدفعة من ملف العقار.');
      if(typeof cur!=='undefined'&&cur==='tenants')return rentalRecords('openTenant',index);
      if(typeof cur!=='undefined'&&cur==='leases')return window.go?.('smartContractsPage');
      if(typeof cur!=='undefined'&&['properties','employees','payroll','maintenance','expenses','services'].includes(cur))return rentalRecords('openRecord',cur,index);
      return legacyEdit.apply(this,arguments);
    };
    const legacyDelete=window.del;
    if(typeof legacyDelete==='function')window.del=function(index){
      if(typeof cur!=='undefined'&&['collections','collectionProPage','leases','tenants','properties','employees','payroll','maintenance','expenses','services'].includes(cur))return window.alert('هذا السجل مرتبط بمستندات وعقود محفوظة. لا يمكن حذفه من القائمة العامة.');
      return legacyDelete.apply(this,arguments);
    };
    const legacyContracts=window.localContractsV55;
    window.localContractsV55=function(){
      const data=typeof db!=='undefined'&&db&&typeof db==='object'?db:{};
      const cloud=Array.isArray(data.contractsV202)?data.contractsV202.filter(c=>c.source==='v267-cloud'):[];
      const local=typeof legacyContracts==='function'?legacyContracts():[];
      return JSON.parse(JSON.stringify(cloud.concat(local.filter(c=>!cloud.some(x=>String(x.id)===String(c.id))))));
    };
    const previousContractList=window.loadContractsV55;
    window.loadContractsV55=function(){
      if(window.AQARI_PUBLIC_CONFIG?.supabaseUrl==='https://ofgmcsmxmdswlovsckqs.supabase.co')return rentalRecords('loadSavedContracts');
      return previousContractList?.apply(this,arguments);
    };
    window.generateContractV55=()=>rentalRecords('generate');
    window.previewContractV55=c=>rentalRecords('preview',c);
    window.readyContractV55=id=>rentalRecords('status',id,'ready');
    window.updateContractStatusV56=(id,status)=>rentalRecords('status',id,status);
    const serviceHost=document.querySelector('#maintenanceProPage > .c');
    if(serviceHost&&!document.getElementById('v267ServiceDeskLinks')){
      const links=document.createElement('div');links.id='v267ServiceDeskLinks';links.className='r';
      for(const [mode,label] of [['maintenance','متابعة طلبات المستأجرين'],['notifications','سجل التنبيهات']]){
        const button=document.createElement('button');button.type='button';button.textContent=label;
        button.onclick=()=>import('/v267-service-desk.js').then(api=>api.openDesk(mode)).catch(e=>window.alert(e.message));links.append(button);
      }
      serviceHost.prepend(links);
    }
    window.AQARI_V205=Object.freeze({
      version:DESIGN,
      seal:function(){closeChooser(false)},
      refresh:scheduleEnhance,
      startPayment:function(trigger){return openChooser('payment',trigger)},
      navigate:function(route){syncPrimaryNavigation(route);return window.go?.(route)},
      openProperty:function(name){return window.AQARI_V202?.openProperty(name)},
      testing:Object.freeze({
        primarySections:function(){return PRIMARY_SECTIONS.map(function(item){return item[0]})},
        dailyActions:function(){return DAILY_ACTIONS.map(function(item){return item[0]})},
        authenticated:isAuthenticated
      })
    });
    import('/src/v267/workspace.js?release=V267').then(api=>api.install()).catch(function(){
      const menu=document.getElementById('v199MoreMenu');
      if(menu&&!document.getElementById('aq267-tools-error')){const message=document.createElement('p');message.id='aq267-tools-error';message.textContent='تعذر تحميل أدوات مساحة العمل. حدّث الصفحة لإعادة المحاولة.';menu.append(message);}
    });
    setTimeout(scheduleEnhance,500);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
