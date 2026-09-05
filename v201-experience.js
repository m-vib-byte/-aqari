(function(){
  'use strict';

  const V201_DESIGN='V201-preview';
  const CREATE_OPTIONS={
    properties:{title:'إضافة عقار',description:'سجّل عقاراً أو مبنى جديداً',icon:'building'},
    tenants:{title:'إضافة مستأجر',description:'أضف بيانات مستأجر جديد',icon:'users'},
    collections:{title:'تسجيل دفعة',description:'سجّل إيصال تحصيل جديد',icon:'receipt'},
    maintenance:{title:'طلب صيانة',description:'افتح طلباً للمتابعة',icon:'tool'}
  };
  const ICONS={
    plus:'<path d="M12 5v14M5 12h14"/>',
    building:'<path d="M4 21h16M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h6"/>',
    users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    receipt:'<path d="M4 2v20l3-2 3 2 2-2 3 2 2-2 3 2V2l-3 2-3-2-2 2-3-2-2 2zM8 9h8M8 13h6"/>',
    tool:'<path d="M14.7 6.3a4 4 0 0 0-5-5L7 4l3 3 2.7-2.7a4 4 0 0 0 2 5L5.9 18.1a2.1 2.1 0 1 0 3 3l8.8-8.8a4 4 0 0 0 5-5L20 10l-3-3 2.7-2.7"/>',
    close:'<path d="M18 6 6 18M6 6l12 12"/>',
    arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
    home:'<path d="m3 11 9-8 9 8M5 10v10h14V10M9 20v-6h6v6"/>'
  };

  let createTrigger=null;
  let modalTrigger=null;
  let propertyTrigger=null;
  let activeProperty='';
  let createOpen=false;
  let pendingReceipt=false;
  let enhancementTimer=0;

  function icon(name){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(ICONS[name]||ICONS.plus)+'</svg>';
  }

  function escapeHtml(value){
    return String(value==null?'':value).replace(/[&<>'"]/g,function(char){
      return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char];
    });
  }

  function numberFrom(value){
    const arabic='٠١٢٣٤٥٦٧٨٩';
    const normalized=String(value==null?'':value)
      .replace(/[٠-٩]/g,function(digit){return arabic.indexOf(digit)})
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
    try{return typeof db!=='undefined'&&db?db:{}}
    catch(_){return {}}
  }

  function releasePresentation(){
    document.body.classList.add('aq-v199','aq-v200','aq-v201');
    const productRelease=String(document.querySelector('meta[name="aqari-release"]')?.content||'V211.1.2');
    document.title='عقاري '+productRelease+' • إدارة الأملاك بسهولة';
    const theme=document.querySelector('meta[name="theme-color"]');
    if(theme)theme.content='#fbfaf7';
    let meta=document.querySelector('meta[name="aqari-design"]');
    if(!meta){
      meta=document.createElement('meta');
      meta.name='aqari-design';
      document.head.appendChild(meta);
    }
    meta.content=V201_DESIGN;
  }

  function businessMenu(){
    const menu=document.getElementById('v199MoreMenu');
    if(!menu||menu.querySelector('[data-v201-business]'))return;
    menu.removeAttribute('role');
    menu.setAttribute('aria-label','الحساب والمزيد');
    const accountHead=menu.querySelector('.v199-menu-head');
    const section=document.createElement('div');
    section.className='v201-menu-business';
    section.setAttribute('data-v201-business','');
    section.innerHTML=
      '<p>إدارة الأملاك</p>'+ 
      '<button type="button" class="v199-menu-action" data-v199-go="tenants">'+icon('users')+' المستأجرون</button>'+ 
      '<button type="button" class="v199-menu-action" data-v199-go="reports">'+icon('receipt')+' التقارير</button>'+ 
      '<button type="button" class="v199-menu-action" data-v199-go="documentsHub">'+icon('building')+' المستندات والعقود</button>';
    if(accountHead?.nextSibling)menu.insertBefore(section,accountHead.nextSibling);
    else menu.prepend(section);
    const duplicateDocuments=Array.from(menu.querySelectorAll('[data-v199-go="documentsHub"]')).slice(1);
    duplicateDocuments.forEach(function(node){node.remove()});
    document.querySelectorAll('[data-v199-action="more"]').forEach(function(button){
      button.setAttribute('aria-haspopup','true');
      button.setAttribute('aria-controls','v199MoreMenu');
      if(!button.hasAttribute('aria-expanded'))button.setAttribute('aria-expanded','false');
    });
  }

  function createMenu(){
    if(document.getElementById('v201CreateMenu'))return;
    const overlay=document.createElement('div');
    overlay.id='v201CreateMenu';
    overlay.className='v201-create-overlay';
    overlay.setAttribute('aria-hidden','true');
    const optionMarkup=Object.entries(CREATE_OPTIONS).map(function(entry){
      const key=entry[0];
      const option=entry[1];
      return '<button type="button" class="v201-create-option" data-v201-create="'+key+'">'+
        '<span class="v201-create-icon">'+icon(option.icon)+'</span><span><strong>'+option.title+'</strong><small>'+option.description+'</small></span><span class="v201-create-arrow">'+icon('arrow')+'</span></button>';
    }).join('');
    overlay.innerHTML=
      '<section class="v201-create-sheet" role="dialog" aria-modal="true" aria-labelledby="v201CreateTitle" aria-describedby="v201CreateDescription">'+
        '<header><div><p>إضافة سريعة</p><h2 id="v201CreateTitle">شنو تبي تضيف؟</h2><span id="v201CreateDescription">اختر العملية وبنفتح لك النموذج مباشرة.</span></div><button type="button" class="v201-create-close" data-v201-create-close aria-label="إغلاق">'+icon('close')+'</button></header>'+ 
        '<div class="v201-create-grid">'+optionMarkup+'</div>'+ 
      '</section>';
    document.body.appendChild(overlay);
  }

  function propertyCenter(){
    if(document.getElementById('v201PropertyCenter'))return;
    const overlay=document.createElement('div');
    overlay.id='v201PropertyCenter';
    overlay.className='v201-property-overlay';
    overlay.setAttribute('aria-hidden','true');
    overlay.innerHTML=
      '<section class="v201-property-sheet" role="dialog" aria-modal="true" aria-labelledby="v201PropertyTitle" aria-describedby="v201PropertyDescription">'+
        '<header><div><p>مساحة العقار</p><h2 id="v201PropertyTitle">إدارة العقار</h2><span id="v201PropertyDescription">كل عمليات العقار بمكان واحد.</span></div><button type="button" class="v201-create-close" data-v201-property-close aria-label="إغلاق">'+icon('close')+'</button></header>'+ 
        '<div class="v201-property-summary" id="v201PropertySummary"></div>'+ 
        '<div class="v201-property-actions">'+
          '<button type="button" data-v201-property-action="contract"><span class="v201-create-icon">'+icon('receipt')+'</span><span><strong>إبرام عقد</strong><small>إنشاء عقد واختيار العقار تلقائياً</small></span></button>'+ 
          '<button type="button" data-v201-property-action="receipt"><span class="v201-create-icon">'+icon('plus')+'</span><span><strong>وصل إيجار</strong><small>تسجيل دفعة وإصدار إيصال</small></span></button>'+ 
          '<button type="button" data-v201-property-action="statement"><span class="v201-create-icon">'+icon('building')+'</span><span><strong>كشف الإيجار</strong><small>عرض كشف العقار وطباعته PDF</small></span></button>'+ 
          '<button type="button" data-v201-property-action="profile"><span class="v201-create-icon">'+icon('users')+'</span><span><strong>ملف العقار</strong><small>الوحدات والمصروفات والصيانة</small></span></button>'+ 
        '</div>'+ 
      '</section>';
    document.body.appendChild(overlay);

    const statement=document.createElement('div');
    statement.id='v201RentStatement';
    statement.className='v201-statement-overlay';
    statement.setAttribute('aria-hidden','true');
    statement.innerHTML='<section class="v201-statement" role="dialog" aria-modal="true" aria-labelledby="v201StatementTitle"><div class="v201-statement-toolbar"><button type="button" data-v201-statement-close>رجوع</button><button type="button" class="g" data-v201-statement-print>طباعة / PDF</button></div><div id="v201StatementBody"></div></section>';
    document.body.appendChild(statement);
  }

  function propertyRecord(name){
    return (Array.isArray(appData().properties)?appData().properties:[]).find(function(row){return String(row?.[0]||'').trim()===String(name||'').trim()});
  }

  function openProperty(name,trigger){
    const overlay=document.getElementById('v201PropertyCenter');
    const property=propertyRecord(name);
    if(!overlay||!property)return;
    closeShellLayers(false);
    closeCreate(false);
    propertyTrigger=trigger||document.activeElement;
    activeProperty=String(property[0]||name);
    try{sessionStorage.setItem('aqari_v201_property',activeProperty)}catch(_){}
    const expenses=(Array.isArray(appData().expenses)?appData().expenses:[]).filter(function(row){return String(row?.[0]||'')===activeProperty});
    const expenseTotal=expenses.reduce(function(total,row){return total+numberFrom(row?.[2])},0);
    const income=numberFrom(property[3]);
    const summary=document.getElementById('v201PropertySummary');
    if(summary)summary.innerHTML=
      '<div><span>العقار</span><strong>'+escapeHtml(activeProperty)+'</strong></div>'+ 
      '<div><span>الوحدات</span><strong>'+escapeHtml(property[2]||'0')+'</strong></div>'+ 
      '<div><span>الإيجار المسجل</span><strong>'+escapeHtml(money(income))+'</strong></div>'+ 
      '<div><span>الصافي المسجل</span><strong>'+escapeHtml(money(income-expenseTotal))+'</strong></div>';
    const title=document.getElementById('v201PropertyTitle');
    if(title)title.textContent=activeProperty;
    overlay.classList.add('on');
    overlay.setAttribute('aria-hidden','false');
    document.body.classList.add('v201-layer-open');
    requestAnimationFrame(function(){overlay.querySelector('[data-v201-property-action]')?.focus()});
  }

  function closeProperty(restore){
    const overlay=document.getElementById('v201PropertyCenter');
    if(!overlay?.classList.contains('on'))return;
    overlay.classList.remove('on');
    overlay.setAttribute('aria-hidden','true');
    document.body.classList.remove('v201-layer-open');
    if(restore!==false&&propertyTrigger instanceof HTMLElement)setTimeout(function(){propertyTrigger.focus()},0);
  }

  function selectPropertyOnPage(selectId,renderName){
    setTimeout(function(){
      const select=document.getElementById(selectId);
      if(!select)return;
      const option=Array.from(select.options).find(function(item){return item.textContent.trim()===activeProperty});
      if(option)select.value=option.value;
      if(typeof window[renderName]==='function')window[renderName]();
      select.focus({preventScroll:true});
    },120);
  }

  function propertyAction(action){
    if(!activeProperty)return;
    if(action==='statement')return openStatement();
    closeProperty(false);
    if(action==='contract'){
      window.go?.('smartContractsPage');
      return selectPropertyOnPage('contractPropertyV55','loadContractsV55');
    }
    if(action==='receipt'){
      pendingReceipt=true;
      window.go?.('collections');
      setTimeout(function(){modalTrigger=propertyTrigger;if(typeof window.add==='function')window.add()},80);
      return;
    }
    if(action==='profile'){
      window.go?.('property360Page');
      return selectPropertyOnPage('property360SelectV58','renderProperty360V58');
    }
  }

  function openStatement(){
    const property=propertyRecord(activeProperty);
    const overlay=document.getElementById('v201RentStatement');
    const body=document.getElementById('v201StatementBody');
    if(!property||!overlay||!body)return;
    const expenses=(Array.isArray(appData().expenses)?appData().expenses:[]).filter(function(row){return String(row?.[0]||'')===activeProperty});
    const expenseTotal=expenses.reduce(function(total,row){return total+numberFrom(row?.[2])},0);
    const income=numberFrom(property[3]);
    body.innerHTML=
      '<div class="v201-statement-brand"><strong>عقاري</strong><span>كشف إيجار العقار</span></div>'+ 
      '<div class="v201-statement-heading"><div><small>العقار</small><h2 id="v201StatementTitle">'+escapeHtml(activeProperty)+'</h2></div><span>'+escapeHtml(new Date().toLocaleDateString('ar-KW'))+'</span></div>'+ 
      '<div class="v201-statement-meta"><p><span>المالك</span><strong>'+escapeHtml(property[1]&&property[1]!=='—'?property[1]:'غير محدد')+'</strong></p><p><span>عدد الوحدات</span><strong>'+escapeHtml(property[2]||'0')+'</strong></p></div>'+ 
      '<div class="v201-statement-totals"><div><span>الإيجار المسجل</span><strong>'+escapeHtml(money(income))+'</strong></div><div><span>المصروفات المسجلة</span><strong>'+escapeHtml(money(expenseTotal))+'</strong></div><div><span>الصافي المسجل</span><strong>'+escapeHtml(money(income-expenseTotal))+'</strong></div></div>'+ 
      '<div class="v201-statement-note"><strong>ملاحظة</strong><p>هذا الكشف مبني على البيانات المسجلة في المنصة حتى تاريخ الإصدار.</p></div>';
    closeProperty(false);
    overlay.classList.add('on');
    overlay.setAttribute('aria-hidden','false');
    document.body.classList.add('v201-layer-open');
    setTimeout(function(){overlay.querySelector('[data-v201-statement-close]')?.focus()},0);
  }

  function closeStatement(){
    const overlay=document.getElementById('v201RentStatement');
    if(!overlay?.classList.contains('on'))return;
    overlay.classList.remove('on');
    overlay.setAttribute('aria-hidden','true');
    document.body.classList.remove('v201-layer-open');
    openProperty(activeProperty,propertyTrigger);
  }

  function installCreateTriggers(root){
    (root||document).querySelectorAll('.v199-add-button,.v199-overview-head .v199-primary-button').forEach(function(button){
      if(button.hasAttribute('data-v201-quick'))return;
      button.removeAttribute('data-v199-add');
      button.setAttribute('data-v201-quick','');
      button.setAttribute('aria-haspopup','dialog');
      button.setAttribute('aria-controls','v201CreateMenu');
      button.textContent='';
      button.insertAdjacentHTML('beforeend',icon('plus')+'<span>إضافة جديدة</span>');
    });
  }

  function mobileCreateTrigger(){
    if(document.getElementById('v201MobileCreate'))return;
    const button=document.createElement('button');
    button.type='button';
    button.id='v201MobileCreate';
    button.className='v201-mobile-create';
    button.setAttribute('data-v201-quick','');
    button.setAttribute('aria-haspopup','dialog');
    button.setAttribute('aria-controls','v201CreateMenu');
    button.setAttribute('aria-label','إضافة جديدة');
    button.innerHTML=icon('plus');
    document.body.appendChild(button);
  }

  function focusable(container){
    return Array.from(container.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(function(node){
      return !node.hidden&&node.getAttribute('aria-hidden')!=='true';
    });
  }

  function openCreate(trigger){
    const overlay=document.getElementById('v201CreateMenu');
    if(!overlay)return;
    closeShellLayers(false);
    createTrigger=trigger||document.activeElement;
    createOpen=true;
    overlay.classList.add('on');
    overlay.setAttribute('aria-hidden','false');
    document.body.classList.add('v201-layer-open');
    requestAnimationFrame(function(){overlay.querySelector('.v201-create-option')?.focus()});
  }

  function closeCreate(restore){
    const overlay=document.getElementById('v201CreateMenu');
    if(!overlay||!createOpen)return;
    createOpen=false;
    overlay.classList.remove('on');
    overlay.setAttribute('aria-hidden','true');
    document.body.classList.remove('v201-layer-open');
    const trigger=createTrigger;
    if(restore!==false&&trigger instanceof HTMLElement)setTimeout(function(){trigger.focus()},0);
    createTrigger=null;
  }

  function startCreate(target){
    const origin=createTrigger;
    closeCreate(false);
    if(typeof window.go==='function')window.go(target);
    setTimeout(function(){
      modalTrigger=origin instanceof HTMLElement?origin:document.activeElement;
      if(typeof window.add==='function')window.add();
    },60);
  }

  function closeShellLayers(restore){
    const active=document.activeElement;
    const menu=document.getElementById('v199MoreMenu');
    const search=document.getElementById('v199SearchPanel');
    menu?.classList.remove('on');
    search?.classList.remove('on');
    search?.setAttribute('aria-hidden','true');
    document.querySelectorAll('[data-v199-action="more"],[data-v199-action="search"]').forEach(function(button){button.setAttribute('aria-expanded','false')});
    const results=document.getElementById('searchBox');
    if(results)results.style.display='none';
    if(restore&&active instanceof HTMLElement)setTimeout(function(){active.focus()},0);
  }

  function dashboard(){
    const root=document.getElementById('aqariV199Dashboard');
    if(!root)return;
    installCreateTriggers(root);

    const labels=['الدخل المسجل','المقبوضات المسجلة','إيجار مستحق','طلبات صيانة مفتوحة'];
    const targets=['properties','collectionProPage','collectionProPage','maintenanceProPage'];
    root.querySelectorAll('.v199-kpi').forEach(function(card,index){
      const label=card.querySelector('.v199-kpi-label');
      if(label&&labels[index]&&label.textContent!==labels[index])label.textContent=labels[index];
      card.setAttribute('data-v199-go',targets[index]||'home');
      card.setAttribute('role','link');
      card.setAttribute('tabindex','0');
      card.setAttribute('aria-label',(labels[index]||'عرض التفاصيل')+' — فتح التفاصيل');
    });

    root.querySelectorAll('.v199-mini-bars').forEach(function(node){node.remove()});
    const progress=root.querySelector('.v199-progress');
    if(progress){
      const matched=(progress.getAttribute('aria-label')||'').match(/[0-9]+/);
      const value=Math.max(0,Math.min(100,matched?parseInt(matched[0],10):0));
      progress.setAttribute('role','progressbar');
      progress.setAttribute('aria-valuemin','0');
      progress.setAttribute('aria-valuemax','100');
      progress.setAttribute('aria-valuenow',String(value));
    }

    root.querySelectorAll('.v199-panel-title h2').forEach(function(heading){
      if(heading.textContent.trim()==='الأداء المالي')heading.textContent='الملخص المالي';
      if(heading.textContent.trim()==='أولوية اليوم')heading.textContent='المطلوب اليوم';
    });
    root.querySelectorAll('.v199-panel-title p').forEach(function(copy){
      if(copy.textContent.includes('أعلى العقارات'))copy.textContent='العقارات المسجلة في محفظتك';
      if(copy.textContent.includes('الأعمال التي تحتاج قرارك'))copy.textContent='المهام التي تحتاج متابعتك الآن';
    });
    root.querySelectorAll('.v199-collection-number small').forEach(function(copy){
      copy.textContent=copy.textContent.replace(' محصّل',' مقبوضات مسجلة');
    });
    root.querySelectorAll('.v199-property-row').forEach(function(row){
      if(row.querySelector('[data-v201-property]'))return;
      const name=row.querySelector('.v199-property-copy strong')?.textContent.trim();
      if(!name)return;
      const button=document.createElement('button');
      button.type='button';
      button.className='v201-property-manage';
      button.setAttribute('data-v201-property',name);
      button.innerHTML='إدارة العقار '+icon('arrow');
      row.appendChild(button);
    });

    const quickPanel=Array.from(root.querySelectorAll('.v199-panel')).find(function(panel){return panel.querySelector('.v199-quick-grid')});
    quickPanel?.remove();

    const priority=Array.from(root.querySelectorAll('.v199-panel')).find(function(panel){return panel.querySelector('.v199-priority-list')});
    if(priority&&!priority.classList.contains('v201-priority-panel')){
      priority.classList.add('v201-priority-panel');
      const list=priority.querySelector('.v199-priority-list');
      let visible=0;
      list?.querySelectorAll('.v199-priority-item').forEach(function(item){
        const count=parseInt(item.querySelector('.v199-priority-value')?.textContent||'0',10)||0;
        item.hidden=count===0;
        if(count>0)visible+=1;
      });
      if(list&&visible===0){
        list.insertAdjacentHTML('beforeend','<div class="v201-all-done"><span>'+icon('home')+'</span><div><strong>كل شيء منجز</strong><small>ما عندك مهام عاجلة حالياً.</small></div></div>');
      }
      const kpis=root.querySelector('.v199-kpi-grid');
      if(kpis)root.insertBefore(priority,kpis);
    }

    const firstGrid=root.querySelector('.v199-dashboard-grid');
    if(firstGrid&&!firstGrid.querySelector('.v199-priority-list'))firstGrid.classList.add('v201-finance-grid');
    root.setAttribute('data-v201-enhanced','true');
  }

  function modalLabels(){
    const modal=document.getElementById('modal');
    const fields=document.getElementById('fields');
    if(!modal||!fields)return;
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('aria-labelledby','mt');
    modal.querySelector('.r button')?.setAttribute('aria-label','إغلاق النافذة');

    Array.from(fields.children).forEach(function(control,index){
      if(!control.matches('input,select,textarea')||control.closest('.v201-field'))return;
      const labelText=control.getAttribute('placeholder')||control.getAttribute('aria-label')||('الحقل '+(index+1));
      const label=document.createElement('label');
      label.className='v201-field';
      const text=document.createElement('span');
      text.textContent=labelText;
      control.setAttribute('aria-label',labelText);
      control.parentNode.insertBefore(label,control);
      label.append(text,control);
    });
  }

  function modalState(){
    const modal=document.getElementById('modal');
    if(!modal)return;
    const opened=modal.classList.contains('on');
    if(opened){
      modalLabels();
      if(!modal.hasAttribute('data-v201-open')){
        modal.setAttribute('data-v201-open','true');
        document.body.classList.add('v201-modal-open');
        const first=focusable(modal)[0];
        setTimeout(function(){first?.focus()},30);
      }
    }else if(modal.hasAttribute('data-v201-open')){
      modal.removeAttribute('data-v201-open');
      document.body.classList.remove('v201-modal-open');
      const trigger=modalTrigger;
      if(trigger instanceof HTMLElement)setTimeout(function(){trigger.focus()},0);
      modalTrigger=null;
      setTimeout(function(){if(!modal.classList.contains('on'))pendingReceipt=false},0);
    }
  }

  function hookReceiptSave(){
    const original=window.saveItem;
    if(typeof original!=='function'||original.__v201ReceiptFlow)return;
    const wrapped=function(){
      const before=Array.isArray(appData().collections)?appData().collections.length:0;
      const result=original.apply(this,arguments);
      const after=Array.isArray(appData().collections)?appData().collections.length:0;
      if(pendingReceipt&&after>before){
        pendingReceipt=false;
        setTimeout(function(){
          window.go?.('print');
          if(typeof window.receiptDoc==='function')window.receiptDoc();
          document.getElementById('preview')?.scrollIntoView({behavior:'smooth',block:'start'});
        },100);
      }
      return result;
    };
    wrapped.__v201ReceiptFlow=true;
    window.saveItem=wrapped;
  }

  function enhanceTable(table){
    if(table.hasAttribute('data-v201-table'))return;
    table.setAttribute('data-v201-table','true');
    const labels=Array.from(table.querySelectorAll('thead th')).map(function(cell){return cell.textContent.trim()});
    table.querySelectorAll('tbody tr').forEach(function(row){
      Array.from(row.children).forEach(function(cell,index){if(labels[index])cell.setAttribute('data-label',labels[index])});
    });
    if(!table.parentElement?.classList.contains('v201-table-scroll')){
      const wrapper=document.createElement('div');
      wrapper.className='v201-table-scroll';
      wrapper.setAttribute('role','region');
      wrapper.setAttribute('tabindex','0');
      wrapper.setAttribute('aria-label','جدول بيانات قابل للتمرير');
      table.parentNode.insertBefore(wrapper,table);
      wrapper.appendChild(table);
    }
    const section=table.closest('.p');
    if(section&&['list','collectionProPage','maintenanceProPage'].includes(section.id))table.classList.add('v201-card-table');
  }

  function enhanceActivePage(){
    const active=document.querySelector('.p.on');
    if(!active)return;
    active.querySelectorAll('table').forEach(enhanceTable);
    if(active.id==='list'&&document.getElementById('title')?.textContent.includes('العقارات')){
      active.querySelectorAll('tbody tr').forEach(function(row){
        const name=row.cells?.[0]?.textContent.trim();
        const actions=row.cells?.[row.cells.length-1];
        if(!name||!actions||actions.querySelector('[data-v201-property]'))return;
        const button=document.createElement('button');
        button.type='button';
        button.className='v201-inline-manage';
        button.setAttribute('data-v201-property',name);
        button.textContent='إدارة العقار';
        actions.prepend(button);
      });
    }
    const title=active.querySelector('h1,h2,h3');
    if(title&&!title.id)title.id='v201PageTitle-'+active.id;
    if(title){title.setAttribute('tabindex','-1')}
  }

  function groupedTarget(value){
    if(['collections','collectionProPage','rentSchedule','receivablesAgingPage','collectionPromisesPage'].includes(value))return 'collectionProPage';
    if(['maintenance','workOrders','maintenanceProPage','workOrderCreatePage'].includes(value))return 'maintenanceProPage';
    if(['property360Page','portfolioCommandPage'].includes(value))return 'properties';
    if(['tenant360Page','tenantPortalPage','tenantRiskPage'].includes(value))return 'tenants';
    if(['reportStudio','reportBuilderPage','savedReportsPage','biExecutivePage'].includes(value))return 'reports';
    return value;
  }

  function markNavigation(target){
    const normalized=groupedTarget(target);
    document.querySelectorAll('.v199-nav-button,.v199-bottom-button[data-v199-go]').forEach(function(button){
      const match=groupedTarget(button.getAttribute('data-v199-go'))===normalized;
      button.classList.toggle('is-active',match);
      if(match)button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
  }

  function hookNavigation(){
    const original=window.go;
    if(typeof original!=='function'||original.__v201Experience)return;
    const wrapped=function(target){
      const result=original.apply(this,arguments);
      markNavigation(target);
      setTimeout(function(){
        enhanceActivePage();
        if(target!=='home')document.querySelector('.p.on h1,.p.on h2,.p.on h3')?.focus({preventScroll:true});
      },80);
      return result;
    };
    wrapped.__v201Experience=true;
    window.go=wrapped;
  }

  function searchExperience(){
    const panel=document.getElementById('v199SearchPanel');
    const results=document.getElementById('searchBox');
    if(!panel||!results)return;
    document.querySelectorAll('[data-v199-action="search"]').forEach(function(button){
      button.setAttribute('aria-controls','v199SearchPanel');
      if(!button.hasAttribute('aria-expanded'))button.setAttribute('aria-expanded','false');
    });
    const input=document.getElementById('v199SearchInput');
    if(input)input.placeholder='ابحث باسم العقار، المستأجر أو الوحدة';
    if(results.parentElement!==panel){
      results.classList.add('v201-search-results');
      results.setAttribute('role','region');
      results.setAttribute('aria-live','polite');
      panel.appendChild(results);
    }
  }

  function skipLink(){
    const main=document.querySelector('main');
    if(!main)return;
    main.id='mainContentV103';
    main.setAttribute('tabindex','-1');
    const link=document.querySelector('.skipLinkV103');
    if(link&&document.body.firstElementChild!==link)document.body.insertBefore(link,document.body.firstElementChild);
  }

  function scheduleEnhance(){
    clearTimeout(enhancementTimer);
    enhancementTimer=setTimeout(function(){
      releasePresentation();
      businessMenu();
      installCreateTriggers(document);
      dashboard();
      modalLabels();
      enhanceActivePage();
    },45);
  }

  function installEvents(){
    document.addEventListener('click',function(event){
      const trigger=event.target.closest('[data-v201-quick]');
      if(trigger){event.preventDefault();return openCreate(trigger)}
      const option=event.target.closest('[data-v201-create]');
      if(option){event.preventDefault();return startCreate(option.getAttribute('data-v201-create'))}
      if(event.target.closest('[data-v201-create-close]')){event.preventDefault();return closeCreate(true)}
      const property=event.target.closest('[data-v201-property]');
      if(property){event.preventDefault();return openProperty(property.getAttribute('data-v201-property'),property)}
      const propertyActionButton=event.target.closest('[data-v201-property-action]');
      if(propertyActionButton){event.preventDefault();return propertyAction(propertyActionButton.getAttribute('data-v201-property-action'))}
      if(event.target.closest('[data-v201-property-close]')){event.preventDefault();return closeProperty(true)}
      if(event.target.closest('[data-v201-statement-close]')){event.preventDefault();return closeStatement()}
      if(event.target.closest('[data-v201-statement-print]')){event.preventDefault();return window.print()}
      const overlay=document.getElementById('v201CreateMenu');
      if(event.target===overlay)return closeCreate(true);
      if(event.target===document.getElementById('v201PropertyCenter'))return closeProperty(true);
      if(event.target.closest('#searchBox button'))setTimeout(function(){
        const input=document.getElementById('v199SearchInput');
        if(input)input.value='';
        closeShellLayers(false);
      },0);
      if(!event.target.closest('#v199MoreMenu')&&!event.target.closest('[data-v199-action="more"]')&&!event.target.closest('#v199SearchPanel')&&!event.target.closest('[data-v199-action="search"]'))closeShellLayers(false);
      if(event.target.closest('[data-v199-go],[data-v199-add]'))setTimeout(scheduleEnhance,90);
    });

    document.addEventListener('keydown',function(event){
      const overlay=document.getElementById('v201CreateMenu');
      const modal=document.getElementById('modal');
      if(event.key==='Escape'&&createOpen){event.preventDefault();return closeCreate(true)}
      if(event.key==='Escape'&&document.getElementById('v201RentStatement')?.classList.contains('on')){event.preventDefault();return closeStatement()}
      if(event.key==='Escape'&&document.getElementById('v201PropertyCenter')?.classList.contains('on')){event.preventDefault();return closeProperty(true)}
      if(event.key==='Escape'&&modal?.classList.contains('on')){
        modal.classList.remove('on');
        return;
      }
      if((event.key==='Enter'||event.key===' ')&&event.target.matches('.v199-kpi[role="link"]')){
        event.preventDefault();
        event.target.click();
      }
      const trap=createOpen?overlay:(document.getElementById('v201RentStatement')?.classList.contains('on')?document.getElementById('v201RentStatement'):(document.getElementById('v201PropertyCenter')?.classList.contains('on')?document.getElementById('v201PropertyCenter'):(modal?.classList.contains('on')?modal:null)));
      if(event.key==='Tab'&&trap){
        const items=focusable(trap);
        if(!items.length)return;
        const first=items[0];
        const last=items[items.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
      }
    });
  }

  function observers(){
    const dashboardRoot=document.getElementById('aqariV199Dashboard');
    if(dashboardRoot)new MutationObserver(scheduleEnhance).observe(dashboardRoot,{childList:true});
    const modal=document.getElementById('modal');
    if(modal)new MutationObserver(modalState).observe(modal,{attributes:true,attributeFilter:['class']});
    const fields=document.getElementById('fields');
    if(fields)new MutationObserver(modalLabels).observe(fields,{childList:true});
    const rows=document.getElementById('rows');
    if(rows)new MutationObserver(function(){setTimeout(enhanceActivePage,0)}).observe(rows,{childList:true,subtree:true});
  }

  function sealExperience(){
    clearTimeout(enhancementTimer);
    enhancementTimer=0;
    createTrigger=null;modalTrigger=null;propertyTrigger=null;
    activeProperty='';createOpen=false;pendingReceipt=false;
    for(const id of ['v201CreateMenu','v201PropertyCenter','v201RentStatement']){
      const layer=document.getElementById(id);
      if(layer){layer.classList.remove('on');layer.setAttribute('aria-hidden','true')}
    }
    for(const id of ['v201PropertySummary','v201StatementBody'])document.getElementById(id)?.replaceChildren();
    document.body.classList.remove('v201-layer-open');
  }

  function boot(){
    releasePresentation();
    document.querySelector('.v199-brand-copy small')?.replaceChildren(document.createTextNode('إدارة الأملاك'));
    const gateBadge=document.querySelector('.v199-gate-version');
    if(gateBadge)gateBadge.textContent='إدارة الأملاك';
    createMenu();
    propertyCenter();
    businessMenu();
    mobileCreateTrigger();
    installCreateTriggers(document);
    searchExperience();
    skipLink();
    dashboard();
    modalLabels();
    hookNavigation();
    hookReceiptSave();
    enhanceActivePage();
    installEvents();
    observers();
    setTimeout(scheduleEnhance,500);
  }

  window.AQARI_V201=Object.freeze({version:V201_DESIGN,seal:sealExperience});

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
