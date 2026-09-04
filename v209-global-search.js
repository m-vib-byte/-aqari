(function(){
  'use strict';

  const DESIGN='V209-global-search';
  const REVISION='V209.1-self-heal';
  if(window.AQARI_V209?.version===DESIGN)return;
  const PERIOD=/^\d{4}-(0[1-9]|1[0-2])$/;
  const RESULT_LIMIT=30;
  let period=currentPeriod();
  let query='';
  let lastResults=[];
  let renderTimer=0;
  let authListenerInstalled=false;
  let authSuspended=false;
  let authEpoch=0;
  let interactionEpoch=0;
  let renderedScope='';

  function esc(value){
    return String(value==null?'':value).replace(/[&<>'"]/g,function(char){
      return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char];
    });
  }

  function currentPeriod(){
    const date=new Date();
    return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');
  }

  function normalizeSearch(value){
    const arabic='٠١٢٣٤٥٦٧٨٩';
    const persian='۰۱۲۳۴۵۶۷۸۹';
    return String(value==null?'':value)
      .replace(/[٠-٩]/g,function(digit){return String(arabic.indexOf(digit))})
      .replace(/[۰-۹]/g,function(digit){return String(persian.indexOf(digit))})
      .normalize('NFKD')
      .replace(/[\u064B-\u065F\u0670]/g,'')
      .replace(/\s+/g,' ')
      .trim()
      .toLocaleLowerCase('ar');
  }

  function number(value){
    const result=Number(value);
    return Number.isFinite(result)?result:0;
  }

  function money(value){
    try{return number(value).toLocaleString('ar-KW',{minimumFractionDigits:0,maximumFractionDigits:3})+' د.ك'}
    catch(_){return String(number(value))+' د.ك'}
  }

  function accessIdentity(value){
    if(typeof value!=='string'||value!==value.trim()||/(?:\p{Cc}|\p{Cf}|\p{Zl}|\p{Zp}|\p{Default_Ignorable_Code_Point})/u.test(value))return '';
    return value;
  }

  function accessContextReady(context){
    const userId=accessIdentity(context?.user?.id);
    const workspaceId=accessIdentity(context?.workspace?.id);
    const membership=context?.membership;
    const membershipUserId=accessIdentity(membership?.user_id);
    const membershipWorkspaceId=accessIdentity(membership?.workspace_id);
    const role=accessIdentity(membership?.role);
    return Boolean(
      userId&&workspaceId&&role&&
      membership?.is_active===true&&
      membershipUserId&&membershipWorkspaceId&&
      membershipUserId===userId&&membershipWorkspaceId===workspaceId
    );
  }

  function contextAccess(context){
    if(!accessContextReady(context))return null;
    return Object.freeze({
      userId:accessIdentity(context.user.id),
      workspaceId:accessIdentity(context.workspace.id),
      role:accessIdentity(context.membership.role)
    });
  }

  function sameAccess(left,right){
    return Boolean(left&&right&&left.userId===right.userId&&left.workspaceId===right.workspaceId&&left.role===right.role);
  }

  function dataScopesReady(access){
    if(!access)return false;
    const dataScope=window.AQARI_DATA_GATE?.scope;
    const storageScope=window.AQARI_EARLY_STORAGE_GATE?.scope;
    return Boolean(
      dataScope&&storageScope&&
      accessIdentity(dataScope.userId)===access.userId&&accessIdentity(dataScope.workspaceId)===access.workspaceId&&
      accessIdentity(storageScope.userId)===access.userId&&accessIdentity(storageScope.workspaceId)===access.workspaceId
    );
  }

  function scopeKey(){
    try{
      const access=contextAccess(window.AQARI_SUPABASE?.context);
      return authSuspended||!dataScopesReady(access)?'':access.userId+'\u0000'+access.workspaceId+'\u0000'+access.role;
    }catch(_){return ''}
  }

  function propertyNames(){
    const scope=scopeKey();
    if(!scope||typeof window.AQARI_V202?.rentOfficeProperties!=='function')return [];
    let names=[];
    try{names=window.AQARI_V202.rentOfficeProperties()}catch(_){names=[]}
    if(scopeKey()!==scope||!Array.isArray(names))return [];
    const seen=new Set();
    return names.map(function(name){return String(name||'').trim()}).filter(function(name){
      const key=normalizeSearch(name);
      if(!name||!key||seen.has(key))return false;
      seen.add(key);
      return true;
    });
  }

  function officeData(name,selectedPeriod,expectedScope){
    const scope=scopeKey();
    const requestedPeriod=String(selectedPeriod||'');
    if(!scope||(expectedScope&&scope!==expectedScope)||!PERIOD.test(requestedPeriod)||typeof window.AQARI_V202?.rentOfficeData!=='function')return null;
    let data=null;
    try{data=window.AQARI_V202.rentOfficeData(name,requestedPeriod)}catch(_){data=null}
    if(scopeKey()!==scope||!data||normalizeSearch(data.property)!==normalizeSearch(name)||String(data.period||'')!==requestedPeriod)return null;
    return data;
  }

  function safeRows(){
    const scope=scopeKey();
    if(!scope)return [];
    const rows=[];
    propertyNames().forEach(function(property){
      const data=officeData(property,period,scope);
      if(!data||!Array.isArray(data.records))return;
      data.records.forEach(function(record){
        const key=String(record?.key||'').trim();
        if(!key)return;
        rows.push(Object.freeze({
          scope:scope,
          property:String(property),
          period:String(period),
          key:key,
          tenant:String(record?.tenant||'—'),
          unit:String(record?.unit||'—'),
          contractNo:String(record?.contractNo||''),
          hasContract:Boolean(record?.hasContract),
          receiptNo:String(record?.receiptNo||''),
          paymentStatus:String(record?.paymentStatus||''),
          balance:Math.max(0,number(record?.balance)),
          pending:Math.max(0,number(record?.pending)),
          canRecordPayment:data.canRecordPayment===true&&record?.billable===true&&record?.collectible===true
        }));
      });
    });
    return scopeKey()===scope?rows:[];
  }

  function relevance(item,needle){
    const property=normalizeSearch(item.property);
    const tenant=normalizeSearch(item.tenant);
    const unit=normalizeSearch(item.unit);
    const contract=normalizeSearch(item.contractNo);
    if(contract===needle||unit===needle)return 0;
    if(tenant===needle)return 1;
    if(tenant.startsWith(needle)||contract.startsWith(needle)||property.startsWith(needle))return 2;
    if(unit.startsWith(needle))return 3;
    return 4;
  }

  function searchRows(value){
    const needle=normalizeSearch(value);
    if(!needle||(needle.length<2&&!/^\d+$/.test(needle)))return [];
    return safeRows()
      .filter(function(item){
        return [item.property,item.tenant,item.unit,item.contractNo].some(function(field){
          return normalizeSearch(field).includes(needle);
        });
      })
      .sort(function(left,right){
        const score=relevance(left,needle)-relevance(right,needle);
        if(score)return score;
        const due=(right.balance>0?1:0)-(left.balance>0?1:0);
        if(due)return due;
        return left.tenant.localeCompare(right.tenant,'ar',{numeric:true,sensitivity:'base'});
      })
      .slice(0,RESULT_LIMIT);
  }

  function periodLabel(){
    try{return new Intl.DateTimeFormat('ar-KW',{month:'long',year:'numeric'}).format(new Date(period+'-01T12:00:00'))}
    catch(_){return period}
  }

  function statusLabel(item){
    if(item.pending>0)return 'قيد المراجعة';
    if(item.balance>0)return 'متبقي '+money(item.balance);
    return item.paymentStatus||'مسدد';
  }

  function ensureUi(){
    let panel=document.getElementById('v199SearchPanel');
    if(!panel){
      panel=document.createElement('div');
      panel.id='v199SearchPanel';
      panel.className='v199-search-panel';
      panel.setAttribute('aria-hidden','true');
      document.body.appendChild(panel);
    }

    let input=document.getElementById('v199SearchInput');
    if(!(input instanceof HTMLInputElement)){
      const label=document.createElement('label');
      label.setAttribute('for','v199SearchInput');
      label.textContent='البحث الشامل';
      const field=document.createElement('div');
      field.className='v199-search-field';
      input=document.createElement('input');
      input.id='v199SearchInput';
      input.type='search';
      input.setAttribute('autocomplete','off');
      const escapeKey=document.createElement('kbd');
      escapeKey.textContent='Esc';
      field.appendChild(input);
      field.appendChild(escapeKey);
      panel.appendChild(label);
      panel.appendChild(field);
    }
    panel.classList.add('v209-search-panel');
    panel.setAttribute('role','search');
    panel.setAttribute('aria-label','البحث الشامل في عقاري');
    panel.setAttribute('dir','rtl');
    panel.setAttribute('lang','ar');
    const label=panel.querySelector('label[for="v199SearchInput"]');
    if(label&&label.textContent!=='البحث الشامل')label.textContent='البحث الشامل';
    input.placeholder='اسم المستأجر، الوحدة، العقد أو العقار…';
    input.setAttribute('dir','auto');
    input.setAttribute('aria-controls','v209SearchResults');
    input.setAttribute('aria-describedby','v209SearchHint');

    let controls=document.getElementById('v209SearchControls');
    if(!controls){
      controls=document.createElement('div');
      controls.id='v209SearchControls';
      controls.className='v209-search-controls';
      controls.innerHTML='<label for="v209SearchPeriod"><span>الفترة</span><input id="v209SearchPeriod" type="month" value="'+esc(period)+'"></label><small id="v209SearchHint">بحث آمن داخل العقارات المرتبطة بحسابك فقط</small>';
      panel.appendChild(controls);
    }

    let results=document.getElementById('v209SearchResults');
    if(!results){
      results=document.createElement('div');
      results.id='v209SearchResults';
      results.className='v209-search-results';
      results.setAttribute('aria-live','polite');
      panel.appendChild(results);
    }

    const legacy=document.getElementById('searchBox');
    if(legacy)legacy.style.display='none';

    if(!input.dataset.v209Bound){
      input.dataset.v209Bound='true';
      input.addEventListener('input',function(event){
        query=input.value;
        scheduleRender();
      },{capture:true});
    }

    let searchTriggers=Array.from(document.querySelectorAll('[data-v199-action="search"]'));
    if(!searchTriggers.length){
      const toolbar=document.querySelector('#aqariV199Topbar .v199-toolbar');
      if(toolbar){
        const fallback=document.createElement('button');
        fallback.type='button';
        fallback.className='v199-icon-button v199-search-trigger';
        fallback.setAttribute('data-v199-action','search');
        fallback.setAttribute('aria-label','فتح البحث الشامل');
        fallback.setAttribute('aria-controls','v199SearchPanel');
        fallback.setAttribute('aria-expanded','false');
        fallback.textContent='بحث';
        toolbar.appendChild(fallback);
        searchTriggers=[fallback];
      }
    }
    searchTriggers.forEach(function(trigger){
      if(trigger.dataset.v209ToggleBound==='true')return;
      trigger.dataset.v209ToggleBound='true';
      trigger.addEventListener('click',function(){
        const shouldOpen=!panel.classList.contains('on');
        setTimeout(function(){setSearchExpanded(shouldOpen,trigger)},0);
      },{capture:true});
    });
    return {panel:panel,input:input,results:results};
  }

  function clearSearch(resetInput){
    lastResults=[];
    const results=document.getElementById('v209SearchResults');
    if(results)results.replaceChildren();
    if(resetInput){
      query='';
      renderedScope='';
      const input=document.getElementById('v199SearchInput');
      if(input instanceof HTMLInputElement)input.value='';
    }
    const legacy=document.getElementById('searchBox');
    if(legacy)legacy.style.display='none';
  }

  function seal(){
    authEpoch+=1;
    interactionEpoch+=1;
    authSuspended=true;
    clearTimeout(renderTimer);
    renderTimer=0;
    clearSearch(true);
  }

  function resume(context){
    const expectedAccess=contextAccess(context);
    const liveAccess=contextAccess(window.AQARI_SUPABASE?.context);
    if(!sameAccess(expectedAccess,liveAccess)||!dataScopesReady(liveAccess))return false;
    authEpoch+=1;
    interactionEpoch+=1;
    authSuspended=false;
    clearSearch(true);
    render();
    return true;
  }

  function resultMarkup(item,index){
    const contract=item.contractNo||'بدون رقم عقد';
    const payment=item.canRecordPayment?'تحصيل':'عرض التحصيل';
    const contractButton=item.hasContract?'<button type="button" data-v209-index="'+index+'" data-v209-action="contract">العقد</button>':'';
    const receiptButton=item.receiptNo?'<button type="button" data-v209-index="'+index+'" data-v209-action="receipt">الوصل</button>':'';
    return '<article class="v209-result">'+
      '<button type="button" class="v209-result-main" data-v209-index="'+index+'" data-v209-action="statement">'+
        '<span class="v209-result-property" dir="auto">'+esc(item.property)+'</span>'+
        '<strong dir="auto">'+esc(item.tenant)+'</strong>'+
        '<small>وحدة <bdi dir="auto">'+esc(item.unit)+'</bdi> • <bdi dir="auto">'+esc(contract)+'</bdi></small>'+
        '<b class="'+(item.balance>0?'is-due':'is-clear')+'">'+esc(statusLabel(item))+'</b>'+
      '</button>'+
      '<div class="v209-result-actions">'+
        '<button type="button" data-v209-index="'+index+'" data-v209-action="statement">كشف المستأجر</button>'+
        contractButton+receiptButton+
        '<button type="button" class="is-primary" data-v209-index="'+index+'" data-v209-action="payment">'+esc(payment)+'</button>'+
      '</div>'+
    '</article>';
  }

  function render(){
    const ui=ensureUi();
    if(!ui)return;
    const scope=scopeKey();
    if(!scope){
      clearSearch(true);
      ui.results.innerHTML='<div class="v209-search-empty">سجّل الدخول بحساب فعال لاستخدام البحث الشامل.</div>';
      return;
    }
    if(renderedScope&&renderedScope!==scope)clearSearch(true);
    renderedScope=scope;
    const needle=normalizeSearch(query);
    if(!needle||(needle.length<2&&!/^\d+$/.test(needle))){
      lastResults=[];
      ui.results.innerHTML='<div class="v209-search-empty"><strong>ابحث بسرعة</strong><span>اكتب اسم المستأجر أو رقم الوحدة أو العقد أو العقار.</span><small>'+esc(periodLabel())+'</small></div>';
      return;
    }
    lastResults=searchRows(query);
    if(!lastResults.length){
      ui.results.innerHTML='<div class="v209-search-empty"><strong>ما لقينا نتيجة</strong><span>جرّب الاسم أو رقم الوحدة أو العقد.</span></div>';
      return;
    }
    ui.results.innerHTML='<div class="v209-search-summary" role="status" aria-atomic="true"><span>'+lastResults.length+' نتيجة</span><small>'+esc(periodLabel())+'</small></div>'+lastResults.map(resultMarkup).join('');
  }

  function scheduleRender(){
    clearTimeout(renderTimer);
    renderTimer=setTimeout(render,100);
  }

  function setSearchExpanded(expanded,trigger){
    const ui=ensureUi();
    if(!ui)return false;
    const open=expanded===true;
    if(open)ui.panel.classList.add('on');
    else ui.panel.classList.remove('on');
    ui.panel.setAttribute('aria-hidden',String(!open));
    document.querySelectorAll('[data-v199-action="search"]').forEach(function(button){
      button.setAttribute('aria-expanded',String(open));
    });
    if(open){
      render();
      setTimeout(function(){ui.input.focus({preventScroll:true})},0);
    }else if(trigger instanceof HTMLElement){
      trigger.focus();
    }
    return true;
  }

  function closePanel(){
    if(!document.getElementById('v199SearchPanel')?.classList.contains('on'))return;
    setSearchExpanded(false);
  }

  function liveRecord(item){
    if(!item||item.scope!==scopeKey()||item.period!==period)return null;
    const data=officeData(item.property,item.period,item.scope);
    if(!data||!Array.isArray(data.records))return null;
    const records=data.records.filter(function(candidate){return String(candidate?.key||'')===item.key});
    return records.length===1?{data:data,record:records[0]}:null;
  }

  function openResult(item,action,trigger){
    const scope=scopeKey();
    if(!scope||!item||item.scope!==scope||item.period!==period||typeof window.AQARI_V202?.openProperty!=='function'||typeof window.AQARI_V202?.rentOfficeAction!=='function')return false;
    if(!liveRecord(item))return false;
    const actionToken=++interactionEpoch;
    closePanel();
    const opened=window.AQARI_V202.openProperty(item.property,item.period);
    if(opened===false)return false;
    let attempts=0;
    const follow=function(){
      if(actionToken!==interactionEpoch||scopeKey()!==scope)return;
      attempts+=1;
      const live=liveRecord(item);
      if(!live)return;
      const workspace=document.getElementById('v202PropertyWorkspace');
      const title=document.getElementById('v202PropertyTitle');
      if(workspace?.classList.contains('on')&&(!title||normalizeSearch(title.textContent)===normalizeSearch(item.property))){
        window.AQARI_V202.rentOfficeAction(item.property,item.key,item.period,action,null);
        return;
      }
      if(attempts<14)setTimeout(follow,70);
    };
    setTimeout(follow,70);
    return true;
  }

  document.addEventListener('change',function(event){
    if(event.target?.id!=='v209SearchPeriod')return;
    const next=String(event.target.value||'');
    if(!PERIOD.test(next)){event.target.value=period;return}
    interactionEpoch+=1;
    period=next;
    lastResults=[];
    render();
  });

  document.addEventListener('click',function(event){
    const searchTrigger=event.target?.closest?.('[data-v199-action="search"]');
    if(searchTrigger){
      const shouldOpen=!document.getElementById('v199SearchPanel')?.classList.contains('on');
      setTimeout(function(){setSearchExpanded(shouldOpen,searchTrigger)},0);
      return;
    }
    const actionButton=event.target?.closest?.('#v209SearchResults [data-v209-action]');
    if(!actionButton)return;
    event.preventDefault();
    const index=Number(actionButton.getAttribute('data-v209-index'));
    const action=String(actionButton.getAttribute('data-v209-action')||'statement');
    const item=lastResults[index];
    if(item)openResult(item,action,actionButton);
  },{capture:true});

  document.addEventListener('keydown',function(event){
    const target=event.target;
    const typing=target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target instanceof HTMLSelectElement||target?.isContentEditable;
    const commandK=(event.ctrlKey||event.metaKey)&&(event.code==='KeyK'||event.key.toLowerCase()==='k');
    const shortcut=commandK||(event.key==='/'&&!typing);
    if(!shortcut)return;
    event.preventDefault();
    const trigger=document.querySelector('[data-v199-action="search"]');
    setSearchExpanded(true,trigger);
  });

  const observer=new MutationObserver(function(){
    const panel=document.getElementById('v199SearchPanel');
    const input=document.getElementById('v199SearchInput');
    if(!panel||!(input instanceof HTMLInputElement)||input.dataset.v209Bound!=='true'||!document.getElementById('v209SearchResults'))ensureUi();
  });

  function installAuthListener(){
    if(authListenerInstalled||typeof window.AQARI_SUPABASE?.onAuthStateChange!=='function')return;
    authListenerInstalled=true;
    Promise.resolve(window.AQARI_SUPABASE.onAuthStateChange(function(event){
      const expected=contextAccess(window.AQARI_SUPABASE?.context);
      const epoch=++authEpoch;
      interactionEpoch+=1;
      authSuspended=true;
      clearSearch(true);
      if(event==='SIGNED_OUT'||!expected||typeof window.AQARI_SUPABASE?.refreshContext!=='function'){render();return}
      Promise.resolve(window.AQARI_SUPABASE.refreshContext(expected)).then(function(context){
        if(epoch!==authEpoch)return;
        const returned=contextAccess(context);
        const live=contextAccess(window.AQARI_SUPABASE?.context);
        if(!sameAccess(expected,returned)||!sameAccess(expected,live)){render();return}
        authSuspended=false;
        render();
      }).catch(function(){
        if(epoch!==authEpoch)return;
        authSuspended=true;
        clearSearch(true);
        render();
      });
    })).catch(function(){
      authListenerInstalled=false;
      authSuspended=true;
      clearSearch(true);
    });
  }

  function boot(){
    document.body.classList.add('aq-v209');
    observer.observe(document.documentElement,{subtree:true,childList:true});
    ensureUi();
    installAuthListener();
    render();
    [500,1500,4000].forEach(function(delay){
      setTimeout(function(){ensureUi();installAuthListener()},delay);
    });
    let meta=document.querySelector('meta[name="aqari-global-search"]');
    if(!meta){
      meta=document.createElement('meta');
      meta.name='aqari-global-search';
      document.head.appendChild(meta);
    }
    meta.content=DESIGN;
    window.AQARI_V209=Object.freeze({
      version:DESIGN,
      revision:REVISION,
      seal:seal,
      resume:resume,
      open:function(){
        return setSearchExpanded(true,document.querySelector('[data-v199-action="search"]'));
      }
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
