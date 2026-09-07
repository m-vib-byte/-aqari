(function(){
  'use strict';

  document.body?.classList.add('aq-v199','aq-v200');

  let activeLayerTrigger=null;

  const icons = {
    brand:'<path d="M4 20V9.5L12 3l8 6.5V20"/><path d="M2.5 21h19M8 20v-6h8v6M7 10h.01M17 10h.01"/>',
    home:'<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/>',
    building:'<path d="M4 21h16M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h6"/>',
    users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    wallet:'<path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v12H5a3 3 0 0 1-3-3V6"/><path d="M16 13h.01"/>',
    tool:'<path d="M14.7 6.3a4 4 0 0 0-5-5L7 4l3 3 2.7-2.7a4 4 0 0 0 2 5L5.9 18.1a2.1 2.1 0 1 0 3 3l8.8-8.8a4 4 0 0 0 5-5L20 10l-3-3 2.7-2.7"/>',
    file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
    chart:'<path d="M3 3v18h18M7 16l4-5 3 3 5-7"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    cloud:'<path d="M17.5 19H7a5 5 0 1 1 1.4-9.8A7 7 0 0 1 22 11.5 3.5 3.5 0 0 1 17.5 19z"/>',
    download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    receipt:'<path d="M4 2v20l3-2 3 2 2-2 3 2 2-2 3 2V2l-3 2-3-2-2 2-3-2-2 2z"/><path d="M8 9h8M8 13h6"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    check:'<path d="m20 6-11 11-5-5"/>',
    alert:'<path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
    arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
    lock:'<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
  };

  function icon(name){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(icons[name]||icons.more)+'</svg>';
  }

  function escapeHtml(value){
    return String(value == null ? '' : value).replace(/[&<>'"]/g, function(char){
      return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char];
    });
  }

  function currentRelease(){
    const value=String(document.querySelector('meta[name="aqari-release"]')?.content||window.AQARI_RELEASE||'V267').trim();
    return /^V\d+(?:\.\d+){0,3}$/.test(value)?value:'V267';
  }

  function numberFrom(value){
    const arabic='٠١٢٣٤٥٦٧٨٩';
    const normalized=String(value == null ? '' : value)
      .replace(/[٠-٩]/g,function(d){return arabic.indexOf(d)})
      .replace(/,/g,'')
      .replace(/[^0-9.\-]/g,'');
    const parsed=parseFloat(normalized);
    return Number.isFinite(parsed)?parsed:0;
  }

  function money(value){
    try{return Number(value||0).toLocaleString('ar-KW',{maximumFractionDigits:3})+' د.ك'}
    catch(_){return String(value||0)+' د.ك'}
  }

  function appData(){
    try{return typeof db!=='undefined' && db ? db : {}}
    catch(_){return {}}
  }

  function rows(data,key){return Array.isArray(data[key])?data[key]:[]}
  function sumAt(list,index){return list.reduce(function(total,row){return total+numberFrom(Array.isArray(row)?row[index]:0)},0)}
  function openCount(list){
    return list.filter(function(row){
      const text=(Array.isArray(row)?row:[]).join(' ').toLowerCase();
      return !/(مدفوع|مغلق|مكتمل|منجز|معتمد|فعال|paid|closed|done|approved)/.test(text);
    }).length;
  }

  function greeting(){
    const hour=new Date().getHours();
    if(hour<12)return 'صباح الخير';
    if(hour<18)return 'مساء الخير';
    return 'مساء النور';
  }

  function currentDate(){
    try{return new Intl.DateTimeFormat('ar-KW',{weekday:'long',day:'numeric',month:'long'}).format(new Date())}
    catch(_){return new Date().toLocaleDateString('ar-KW')}
  }

  function sessionLabel(){
    const source=document.getElementById('sessionBadge')?.textContent?.trim();
    if(source && source!=='غير مسجل')return source;
    const context=window.AQARI_SUPABASE?.context;
    return context?.profile?.display_name || context?.user?.email || 'حسابي';
  }

  function buildHeader(){
    const header=document.querySelector('header');
    if(!header || document.getElementById('aqariV199Topbar'))return;
    const shell=document.createElement('div');
    shell.id='aqariV199Topbar';
    shell.className='v199-topbar';
    shell.innerHTML=
      '<button type="button" class="v199-brand" data-v199-go="home" aria-label="الذهاب إلى الرئيسية">'+
        '<span class="v199-brand-mark">'+icon('brand')+'</span><span class="v199-brand-copy"><strong>عقاري</strong><small>'+escapeHtml(currentRelease())+'</small></span>'+
      '</button>'+
      '<nav class="v199-primary-nav" aria-label="التنقل الرئيسي">'+
        '<button type="button" class="v199-nav-button is-active" data-v199-go="home" aria-current="page">'+icon('home')+'<span>الرئيسية</span></button>'+
        '<button type="button" class="v199-nav-button" data-v199-go="properties">'+icon('building')+'<span>العقارات</span></button>'+
        '<button type="button" class="v199-nav-button" data-v199-go="tenants">'+icon('users')+'<span>المستأجرون</span></button>'+
        '<button type="button" class="v199-nav-button" data-v199-go="collectionProPage">'+icon('wallet')+'<span>التحصيل</span></button>'+
        '<button type="button" class="v199-nav-button" data-v199-go="maintenanceProPage">'+icon('tool')+'<span>الصيانة</span></button>'+
        '<button type="button" class="v199-nav-button" data-v199-go="reports">'+icon('chart')+'<span>التقارير</span></button>'+
        '<button type="button" class="v199-nav-button" data-v199-go="documentsHub">'+icon('file')+'<span>العقود والمستندات</span></button>'+
      '</nav>'+
      '<div class="v199-toolbar">'+
        '<button type="button" class="v199-icon-button v199-search-trigger" data-v199-action="search" aria-label="فتح البحث" aria-controls="v199SearchPanel" aria-expanded="false">'+icon('search')+'</button>'+
        '<button type="button" class="v199-icon-button" data-v199-action="notifications" aria-label="عرض التنبيهات">'+icon('bell')+'<span class="v199-notification-count" id="v199NotificationCount">0</span></button>'+
        '<button type="button" class="v199-add-button" data-v199-add="properties">'+icon('plus')+'<span>إضافة جديدة</span></button>'+
        '<button type="button" class="v199-account" data-v199-action="more" aria-haspopup="menu" aria-expanded="false"><span class="v199-account-avatar">ع</span><span class="v199-account-name" id="v199AccountName">حسابي</span></button>'+
      '</div>';
    header.insertBefore(shell,header.firstChild);
  }

  function buildMoreMenu(){
    if(document.getElementById('v199MoreMenu'))return;
    const menu=document.createElement('div');
    menu.id='v199MoreMenu';
    menu.className='v199-more-menu';
    menu.setAttribute('role','menu');
    menu.setAttribute('aria-label','الحساب والمزيد');
    menu.innerHTML=
      '<div class="v199-menu-head"><strong>حساب عقاري</strong><span id="v199MenuAccount">'+escapeHtml(sessionLabel())+'</span></div>'+
      '<button type="button" class="v199-menu-action" role="menuitem" data-v199-action="cloud">'+icon('cloud')+' الحساب والنسخة السحابية</button>'+
      '<button type="button" class="v199-menu-action" role="menuitem" data-v199-action="backup">'+icon('download')+' تنزيل نسخة احتياطية</button>'+
      '<button type="button" class="v199-menu-action" role="menuitem" data-v199-action="restore">'+icon('upload')+' استعادة نسخة</button>'+
      '<button type="button" class="v199-menu-action" role="menuitem" data-v199-go="documentsHub">'+icon('file')+' المستندات والعقود</button>'+
      '<button type="button" class="v199-menu-action" role="menuitem" data-v199-go="settingsCenterPage">'+icon('tool')+' الإعدادات</button>'+
      '<button type="button" class="v199-menu-action danger" role="menuitem" data-v199-action="logout">'+icon('logout')+' تسجيل الخروج</button>';
    document.body.appendChild(menu);
  }

  function buildSearch(){
    if(document.getElementById('v199SearchPanel'))return;
    const panel=document.createElement('div');
    panel.id='v199SearchPanel';
    panel.className='v199-search-panel';
    panel.setAttribute('role','search');
    panel.setAttribute('aria-hidden','true');
    panel.innerHTML='<label for="v199SearchInput">بحث في عقاري</label><div class="v199-search-field">'+icon('search')+'<input id="v199SearchInput" type="search" autocomplete="off" placeholder="ابحث عن عقار، مستأجر، إيصال أو طلب صيانة…"><kbd>Esc</kbd></div>';
    document.body.appendChild(panel);
    const input=document.getElementById('v199SearchInput');
    input?.addEventListener('input',function(){
      if(window.AQARI_V209?.version)return;
      const original=document.getElementById('search');
      if(original)original.value=this.value;
      if(typeof window.aqariV168Search==='function')window.aqariV168Search(this.value);
    });
  }

  function buildMobileNav(){
    const bar=document.querySelector('.mobilebar');
    if(!bar)return;
    bar.setAttribute('role','navigation');
    bar.setAttribute('aria-label','التنقل السريع');
    bar.innerHTML=
      '<button type="button" class="v199-bottom-button is-active" data-v199-go="home" aria-current="page">'+icon('home')+'<span>الرئيسية</span></button>'+
      '<button type="button" class="v199-bottom-button" data-v199-go="collectionProPage">'+icon('wallet')+'<span>التحصيل</span></button>'+
      '<button type="button" class="v199-bottom-button" data-v199-go="properties">'+icon('building')+'<span>العقارات</span></button>'+
      '<button type="button" class="v199-bottom-button" data-v199-go="maintenanceProPage">'+icon('tool')+'<span>الصيانة</span></button>'+
      '<button type="button" class="v199-bottom-button" data-v199-action="more">'+icon('more')+'<span>المزيد</span></button>';
  }

  function buildLogin(){
    const gate=document.getElementById('aqariCloudGateV168');
    const card=gate?.querySelector('.aq-v168-login');
    if(!gate || !card || document.getElementById('v199LoginIntro'))return;

    const intro=document.createElement('section');
    intro.id='v199LoginIntro';
    intro.className='v199-login-intro';
    intro.setAttribute('aria-hidden','true');
    intro.innerHTML='<span class="v199-brand-mark">'+icon('brand')+'</span><p class="v199-eyebrow">منصة إدارة الأملاك الراقية</p><h2>محفظتك العقارية.<br>بالمستوى الذي يليق بها.</h2><p>تجربة هادئة تجمع الدخل والتحصيل والصيانة في مساحة واحدة مصممة بعناية.</p><div class="v199-login-points"><span class="v199-login-point">خصوصية موثوقة</span><span class="v199-login-point">صلاحيات آمنة</span><span class="v199-login-point">نسخ سحابية</span></div>';
    gate.insertBefore(intro,card);

    const logo=card.querySelector('.aq-v168-logo');
    if(logo){
      const version=document.createElement('span');
      version.className='v199-gate-version';
      version.textContent='AQARI '+currentRelease();
      logo.insertBefore(version,logo.firstChild);
      const subtitle=logo.querySelector('p');
      if(subtitle)subtitle.textContent='سجّل الدخول إلى مساحة عملك';
    }

    const email=document.getElementById('cloudEmailV168');
    const password=document.getElementById('cloudPasswordV168');
    email?.setAttribute('dir','ltr');
    email?.setAttribute('aria-required','true');
    password?.setAttribute('aria-required','true');
    const passwordLabel=password?.closest('label');
    if(passwordLabel && !passwordLabel.querySelector('.v199-password-toggle')){
      passwordLabel.classList.add('v199-password-field');
      const toggle=document.createElement('button');
      toggle.type='button';
      toggle.className='v199-password-toggle';
      toggle.textContent='إظهار';
      toggle.setAttribute('aria-label','إظهار كلمة المرور');
      toggle.addEventListener('click',function(){
        const show=password.type==='password';
        password.type=show?'text':'password';
        toggle.textContent=show?'إخفاء':'إظهار';
        toggle.setAttribute('aria-label',show?'إخفاء كلمة المرور':'إظهار كلمة المرور');
      });
      passwordLabel.appendChild(toggle);
    }

    [email,password].forEach(function(input){
      input?.addEventListener('keydown',function(event){
        if(event.key==='Enter'){
          event.preventDefault();
          if(typeof window.cloudLoginV198==='function')window.cloudLoginV198();
        }
      });
    });

    const signup=card.querySelector('[onclick="cloudSignupV168()"]');
    if(signup)signup.textContent='إنشاء حساب المدير لأول مرة';
    const recovery=card.querySelector('[onclick="cloudRecoveryV168()"]');
    if(recovery)recovery.textContent='نسيت كلمة المرور؟';
    const message=document.getElementById('cloudGateMsgV168');
    if(message){
      message.setAttribute('role','status');
      message.setAttribute('aria-live','polite');
      message.setAttribute('aria-atomic','true');
      gate.setAttribute('aria-describedby','cloudGateMsgV168');
      const cleanRawError=function(){
        if(!message.classList.contains('bad'))return;
        if(/column |does not exist|relation |postgres|schema cache|syntax error|stack| at /i.test(message.textContent||'')){
          message.textContent='تعذر إكمال الطلب الآن. حاول مرة أخرى بعد قليل.';
        }
      };
      new MutationObserver(cleanRawError).observe(message,{childList:true,characterData:true,subtree:true,attributes:true});
    }
    const footer=document.createElement('p');
    footer.className='v199-login-footer';
    footer.innerHTML=icon('lock')+' دخول محمي ومخصص للحسابات المصرح بها';
    card.appendChild(footer);

    let focused=false;
    const focusGate=function(){
      if(gate.classList.contains('on')&&!focused){
        focused=true;
        if(!window.matchMedia?.('(pointer:coarse)').matches)setTimeout(function(){email?.focus({preventScroll:true})},120);
      }
      if(!gate.classList.contains('on'))focused=false;
    };
    new MutationObserver(focusGate).observe(gate,{attributes:true,attributeFilter:['class']});
    focusGate();
  }

  function dashboardMarkup(){
    const data=appData();
    const properties=rows(data,'properties');
    const tenants=rows(data,'tenants');
    const collections=rows(data,'collections');
    const expenses=rows(data,'expenses');
    const employees=rows(data,'employees');
    const maintenance=rows(data,'maintenance').concat(rows(data,'workOrders'));
    const approvals=rows(data,'approvals');

    const income=sumAt(properties,3);
    const expenseTotal=sumAt(expenses,2);
    const payroll=sumAt(employees,2);
    const expected=sumAt(tenants,2);
    const collected=collections.reduce(function(total,row){
      return total+(/مدفوع|paid|تم/i.test(String(row?.[3]||''))?numberFrom(row?.[2]):0);
    },0);
    const overdueRows=tenants.filter(function(row){return /مستحق|متأخر|overdue|due/i.test(String(row?.[3]||''))});
    const overdue=sumAt(overdueRows,2);
    const units=sumAt(properties,2);
    const maintenanceOpen=openCount(maintenance);
    const approvalsOpen=openCount(approvals);
    const rate=Math.max(0,Math.min(100,expected?Math.round(collected/expected*100):0));
    const net=income-expenseTotal-payroll;
    const propertyHtml=properties.slice(0,4).map(function(row,index){
      const name=escapeHtml(row?.[0]||'عقار بدون اسم');
      const owner=escapeHtml(row?.[1]&&row[1]!=='—'?row[1]:'محفظة عقاري');
      const count=numberFrom(row?.[2]);
      const revenue=numberFrom(row?.[3]);
      return '<div class="v199-property-row"><span class="v199-property-mark">'+icon('building')+'</span><span class="v199-property-copy"><strong>'+name+'</strong><small>'+owner+'</small></span><span class="v199-property-units">'+count+' وحدة</span><span class="v199-property-income">'+money(revenue)+'</span></div>';
    }).join('') || '<div class="v199-empty">أضف أول عقار لتظهر تفاصيل المحفظة هنا.</div>';
    const bars=[34,48,43,61,55,72,68,76,64,82,78,Math.max(12,rate)].map(function(height){return '<span style="height:'+height+'%"></span>'}).join('');

    return '<div class="v199-overview-head">'+
      '<div><p class="v199-eyebrow">'+escapeHtml(currentDate())+'</p><h1>'+greeting()+'، <span id="v199GreetingName">'+escapeHtml(sessionLabel().split('•')[0].trim())+'</span></h1><p>هذه أهم أرقام محفظتك وما يحتاج متابعتك اليوم.</p></div>'+
      '<div class="v199-head-actions"><span class="v199-live-badge">متصل وآمن</span><button type="button" class="v199-secondary-button" data-v199-action="search">'+icon('search')+' بحث سريع</button><button type="button" class="v199-primary-button" data-v199-add="properties">'+icon('plus')+' إضافة جديدة</button></div>'+
    '</div>'+
    '<div class="v199-kpi-grid">'+
      '<article class="v199-kpi featured"><div class="v199-kpi-top"><span class="v199-kpi-label">إجمالي الدخل</span><span class="v199-kpi-icon">'+icon('chart')+'</span></div><strong class="v199-kpi-value">'+money(income)+'</strong><div class="v199-kpi-meta"><span class="v199-kpi-trend">المحفظة</span><span>'+properties.length+' عقار مسجل</span></div></article>'+
      '<article class="v199-kpi"><div class="v199-kpi-top"><span class="v199-kpi-label">المحصّل</span><span class="v199-kpi-icon">'+icon('wallet')+'</span></div><strong class="v199-kpi-value">'+money(collected)+'</strong><div class="v199-kpi-meta"><span class="v199-kpi-trend">'+rate+'%</span><span>من المستحق الحالي</span></div></article>'+
      '<article class="v199-kpi"><div class="v199-kpi-top"><span class="v199-kpi-label">المتأخرات</span><span class="v199-kpi-icon">'+icon('alert')+'</span></div><strong class="v199-kpi-value">'+money(overdue)+'</strong><div class="v199-kpi-meta"><span>'+overdueRows.length+' حالة تحتاج متابعة</span></div></article>'+
      '<article class="v199-kpi"><div class="v199-kpi-top"><span class="v199-kpi-label">الصيانة المفتوحة</span><span class="v199-kpi-icon">'+icon('tool')+'</span></div><strong class="v199-kpi-value">'+maintenanceOpen+'</strong><div class="v199-kpi-meta"><span>عبر '+units+' وحدة في المحفظة</span></div></article>'+
    '</div>'+
    '<div class="v199-dashboard-grid">'+
      '<article class="v199-panel"><div class="v199-panel-head"><div class="v199-panel-title"><h2>الأداء المالي</h2><p>ملخص الدخل والتحصيل والمصروفات</p></div><button type="button" class="v199-link-button" data-v199-go="financeSuitePage">عرض التفاصيل</button></div><div class="v199-finance-summary"><div class="v199-collection-card"><span>نسبة التحصيل</span><div class="v199-collection-number"><strong>'+rate+'%</strong><small>'+money(collected)+' محصّل</small></div><div class="v199-progress" aria-label="نسبة التحصيل '+rate+' بالمئة"><span style="width:'+rate+'%"></span></div><div class="v199-mini-bars" aria-hidden="true">'+bars+'</div></div><div class="v199-finance-stat"><span>الإيرادات</span><strong>'+money(income)+'</strong><small>إجمالي المحفظة</small></div><div class="v199-finance-stat"><span>المصروفات</span><strong>'+money(expenseTotal)+'</strong><small>مصروفات مسجلة</small></div><div class="v199-finance-stat"><span>صافي التشغيل</span><strong>'+money(net)+'</strong><small>بعد المصروف والرواتب</small></div></div></article>'+
      '<article class="v199-panel"><div class="v199-panel-head"><div class="v199-panel-title"><h2>أولوية اليوم</h2><p>الأعمال التي تحتاج قرارك</p></div></div><div class="v199-priority-list">'+
        '<button type="button" class="v199-priority-item" data-v199-go="collectionProPage"><span class="v199-priority-icon red">'+icon('alert')+'</span><span class="v199-priority-copy"><strong>متابعة المتأخرات</strong><small>'+money(overdue)+' غير محصّل</small></span><span class="v199-priority-value">'+overdueRows.length+'</span></button>'+
        '<button type="button" class="v199-priority-item" data-v199-go="maintenanceProPage"><span class="v199-priority-icon">'+icon('tool')+'</span><span class="v199-priority-copy"><strong>طلبات الصيانة</strong><small>طلبات مفتوحة بانتظار المتابعة</small></span><span class="v199-priority-value">'+maintenanceOpen+'</span></button>'+
        '<button type="button" class="v199-priority-item" data-v199-go="approvalHubPage"><span class="v199-priority-icon green">'+icon('check')+'</span><span class="v199-priority-copy"><strong>الموافقات</strong><small>معاملات قيد الإجراء</small></span><span class="v199-priority-value">'+approvalsOpen+'</span></button>'+
      '</div></article>'+
    '</div>'+
    '<div class="v199-dashboard-grid">'+
      '<article class="v199-panel"><div class="v199-panel-head"><div class="v199-panel-title"><h2>محفظة العقارات</h2><p>أعلى العقارات المسجلة في النظام</p></div><button type="button" class="v199-link-button" data-v199-go="properties">كل العقارات</button></div><div class="v199-properties">'+propertyHtml+'</div></article>'+
      '<article class="v199-panel"><div class="v199-panel-head"><div class="v199-panel-title"><h2>إجراءات سريعة</h2><p>ابدأ أكثر العمليات استخداماً</p></div></div><div class="v199-quick-grid">'+
        '<button type="button" class="v199-quick-action" data-v199-add="collections">'+icon('receipt')+'<strong>تسجيل دفعة</strong><small>إيصال تحصيل جديد</small></button>'+
        '<button type="button" class="v199-quick-action" data-v199-add="maintenance">'+icon('tool')+'<strong>طلب صيانة</strong><small>فتح ومتابعة طلب</small></button>'+
        '<button type="button" class="v199-quick-action" data-v199-add="tenants">'+icon('users')+'<strong>مستأجر جديد</strong><small>إضافة بيانات المستأجر</small></button>'+
        '<button type="button" class="v199-quick-action" data-v199-go="documentsHub">'+icon('file')+'<strong>المستندات</strong><small>العقود والأوراق</small></button>'+
      '</div></article>'+
    '</div><p class="v199-updated">آخر تحديث '+escapeHtml(new Date().toLocaleTimeString('ar-KW',{hour:'2-digit',minute:'2-digit'}))+'</p>';
  }

  function updateDashboard(){
    const home=document.getElementById('home');
    if(!home)return;
    let dashboard=document.getElementById('aqariV199Dashboard');
    if(!dashboard){
      dashboard=document.createElement('section');
      dashboard.id='aqariV199Dashboard';
      dashboard.setAttribute('aria-label','لوحة عقاري الرئيسية');
      home.insertBefore(dashboard,home.firstChild);
    }
    dashboard.innerHTML=dashboardMarkup();
    mirrorAccount();
  }

  function mirrorAccount(){
    const label=sessionLabel();
    const account=document.getElementById('v199AccountName');
    const menuAccount=document.getElementById('v199MenuAccount');
    const greetingName=document.getElementById('v199GreetingName');
    if(account)account.textContent=label.split('•')[0].trim();
    if(menuAccount)menuAccount.textContent=label;
    if(greetingName)greetingName.textContent=label.split('•')[0].trim();
    const value=numberFrom(document.getElementById('notifCount')?.textContent||0);
    const count=document.getElementById('v199NotificationCount');
    if(count){count.textContent=String(value);count.classList.toggle('has-items',value>0)}
  }

  function closeLayers(restoreFocus){
    const previousTrigger=activeLayerTrigger;
    activeLayerTrigger=null;
    document.getElementById('v199MoreMenu')?.classList.remove('on');
    document.querySelectorAll('[data-v199-action="more"]').forEach(function(button){button.setAttribute('aria-expanded','false')});
    const panel=document.getElementById('v199SearchPanel');
    panel?.classList.remove('on');
    panel?.setAttribute('aria-hidden','true');
    document.querySelectorAll('[data-v199-action="search"]').forEach(function(button){button.setAttribute('aria-expanded','false')});
    const results=document.getElementById('searchBox');
    if(results)results.style.display='none';
    setTimeout(function(){
      if(!panel?.classList.contains('on')&&results)results.style.display='none';
    },240);
    if(restoreFocus&&previousTrigger)setTimeout(function(){previousTrigger.focus()},0);
  }

  function toggleMore(trigger){
    const menu=document.getElementById('v199MoreMenu');
    if(!menu)return;
    const next=!menu.classList.contains('on');
    closeLayers(false);
    menu.classList.toggle('on',next);
    document.querySelectorAll('[data-v199-action="more"]').forEach(function(button){button.setAttribute('aria-expanded',String(next))});
    if(next){activeLayerTrigger=trigger;setTimeout(function(){menu.querySelector('button')?.focus()},0)}
    else trigger?.focus();
  }

  function openSearch(trigger){
    const panel=document.getElementById('v199SearchPanel');
    if(!panel)return;
    const next=!panel.classList.contains('on');
    closeLayers(false);
    panel.classList.toggle('on',next);
    panel.setAttribute('aria-hidden',String(!next));
    document.querySelectorAll('[data-v199-action="search"]').forEach(function(button){button.setAttribute('aria-expanded',String(next))});
    if(next){activeLayerTrigger=trigger;setTimeout(function(){document.getElementById('v199SearchInput')?.focus()},0)}
    else trigger?.focus();
  }

  function markActive(target){
    const group=function(value){
      if(['collections','collectionProPage','rentSchedule','receivablesAgingPage'].includes(value))return 'collectionProPage';
      if(['maintenance','workOrders','maintenanceProPage','workOrderCreatePage'].includes(value))return 'maintenanceProPage';
      if(['property360Page','portfolioCommandPage'].includes(value))return 'properties';
      return value;
    };
    const normalized=group(target);
    document.querySelectorAll('.v199-nav-button,.v199-bottom-button[data-v199-go]').forEach(function(button){
      const match=group(button.getAttribute('data-v199-go'))===normalized;
      button.classList.toggle('is-active',match);
      if(match)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    });
  }

  function installNavigationHook(){
    const original=window.go;
    if(typeof original!=='function'||original.__v199Presentation)return;
    const wrapped=function(target){
      const result=original.apply(this,arguments);
      markActive(target);
      return result;
    };
    wrapped.__v199Presentation=true;
    window.go=wrapped;
  }

  function navigate(target){
    closeLayers(false);
    if(typeof window.go==='function')window.go(target);
    markActive(target);
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({top:0,behavior:reduced?'auto':'smooth'});
  }

  function quickAdd(target){
    navigate(target);
    setTimeout(function(){if(typeof window.add==='function')window.add()},0);
  }

  function handleAction(action,trigger){
    if(action==='search')return openSearch(trigger);
    if(action==='more')return toggleMore(trigger);
    closeLayers();
    if(action==='notifications'&&typeof window.showNotifications==='function')return window.showNotifications();
    if(action==='cloud'&&typeof window.openCloudV198==='function')return window.openCloudV198();
    if(action==='backup'&&typeof window.backup==='function')return window.backup();
    if(action==='restore')return document.getElementById('restoreFile')?.click();
    if(action==='logout'&&typeof window.logout==='function')return window.logout();
  }

  function installEvents(){
    document.addEventListener('click',function(event){
      const goButton=event.target.closest('[data-v199-go]');
      if(goButton){event.preventDefault();return navigate(goButton.getAttribute('data-v199-go'))}
      const addButton=event.target.closest('[data-v199-add]');
      if(addButton){event.preventDefault();return quickAdd(addButton.getAttribute('data-v199-add'))}
      const actionButton=event.target.closest('[data-v199-action]');
      if(actionButton){event.preventDefault();return handleAction(actionButton.getAttribute('data-v199-action'),actionButton)}
      if(!event.target.closest('#v199MoreMenu')&&!event.target.closest('[data-v199-action="more"]'))document.getElementById('v199MoreMenu')?.classList.remove('on');
      if(!event.target.closest('#v199SearchPanel')&&!event.target.closest('#searchBox')){
        const panel=document.getElementById('v199SearchPanel');
        const results=document.getElementById('searchBox');
        panel?.classList.remove('on');
        if(results)results.style.display='none';
      }
    });
    document.addEventListener('keydown',function(event){
      if(event.key==='Escape')closeLayers(true);
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){
        event.preventDefault();openSearch(document.querySelector('.v199-search-trigger'));
      }
    });
  }

  function installObservers(){
    const source=document.getElementById('sessionBadge');
    if(source)new MutationObserver(mirrorAccount).observe(source,{childList:true,characterData:true,subtree:true});
    const notification=document.getElementById('notifCount');
    if(notification)new MutationObserver(mirrorAccount).observe(notification,{childList:true,characterData:true,subtree:true});
    const kpis=document.getElementById('kpis');
    const ops=document.getElementById('ops');
    let timer=0;
    const refresh=function(){clearTimeout(timer);timer=setTimeout(updateDashboard,40)};
    if(kpis)new MutationObserver(refresh).observe(kpis,{childList:true,characterData:true,subtree:true});
    if(ops)new MutationObserver(refresh).observe(ops,{childList:true,characterData:true,subtree:true});
    window.addEventListener('storage',refresh);
  }

  function setReleasePresentation(){
    const productRelease=currentRelease();
    document.title='عقاري '+productRelease+' • إدارة أملاك بفخامة';
    const viewport=document.querySelector('meta[name="viewport"]');
    if(viewport)viewport.content='width=device-width,initial-scale=1,viewport-fit=cover';
    const theme=document.querySelector('meta[name="theme-color"]');
    if(theme)theme.content='#fffdf8';
    let meta=document.querySelector('meta[name="aqari-design"]');
    if(!meta){meta=document.createElement('meta');meta.name='aqari-design';document.head.appendChild(meta)}
    meta.content=productRelease+'-live';
  }

  function boot(){
    document.body.classList.add('aq-v199','aq-v200');
    setReleasePresentation();
    buildHeader();
    buildMoreMenu();
    buildSearch();
    buildMobileNav();
    buildLogin();
    updateDashboard();
    installNavigationHook();
    installEvents();
    installObservers();
    mirrorAccount();
    setTimeout(updateDashboard,450);
    setTimeout(mirrorAccount,900);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
