(function(){
  'use strict';

  const DESIGN='V210-daily-command-center';
  const PERIOD=/^\d{4}-(0[1-9]|1[0-2])$/;
  let period=currentPeriod();
  let authSuspended=false;
  let authListenerInstalled=false;
  let timer=0;
  let lastSignature='';

  function currentPeriod(){
    const date=new Date();
    return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');
  }

  function text(value){return String(value==null?'':value).trim()}
  function number(value){const result=Number(value);return Number.isFinite(result)?result:0}
  function esc(value){
    return String(value==null?'':value).replace(/[&<>'\"]/g,function(char){
      return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[char];
    });
  }
  function identity(value){
    if(typeof value!=='string'||value!==value.trim()||/(?:\p{Cc}|\p{Cf}|\p{Zl}|\p{Zp}|\p{Default_Ignorable_Code_Point})/u.test(value))return '';
    return value;
  }
  function norm(value){
    return text(value).normalize('NFKD').replace(/[\u064B-\u065F\u0670]/g,'').replace(/\s+/g,' ').toLocaleLowerCase('ar');
  }
  function money(value){
    try{return number(value).toLocaleString('ar-KW',{maximumFractionDigits:3})+' د.ك'}
    catch(_){return String(number(value))+' د.ك'}
  }
  function periodLabel(value){
    try{return new Intl.DateTimeFormat('ar-KW',{month:'long',year:'numeric'}).format(new Date(value+'-01T12:00:00'))}
    catch(_){return value}
  }

  function authAccess(context){
    const userId=identity(context?.user?.id);
    const workspaceId=identity(context?.workspace?.id);
    const membership=context?.membership;
    const membershipUserId=identity(membership?.user_id);
    const membershipWorkspaceId=identity(membership?.workspace_id);
    const role=identity(membership?.role);
    if(!userId||!workspaceId||!role||membership?.is_active!==true||membershipUserId!==userId||membershipWorkspaceId!==workspaceId)return null;
    return Object.freeze({userId:userId,workspaceId:workspaceId,role:role});
  }

  function sameAccess(left,right){
    return Boolean(left&&right&&left.userId===right.userId&&left.workspaceId===right.workspaceId&&left.role===right.role);
  }

  function dataScopesReady(access){
    const dataScope=window.AQARI_DATA_GATE?.scope;
    const storageScope=window.AQARI_EARLY_STORAGE_GATE?.scope;
    return Boolean(access&&dataScope&&storageScope&&
      identity(dataScope.userId)===access.userId&&identity(dataScope.workspaceId)===access.workspaceId&&
      identity(storageScope.userId)===access.userId&&identity(storageScope.workspaceId)===access.workspaceId);
  }

  function scopeKey(){
    try{
      const access=authAccess(window.AQARI_SUPABASE?.context);
      return authSuspended||!dataScopesReady(access)?'':access.userId+'\u0000'+access.workspaceId+'\u0000'+access.role;
    }catch(_){return ''}
  }

  function propertyNames(expectedScope){
    const scope=scopeKey();
    if(!scope||(expectedScope&&scope!==expectedScope)||typeof window.AQARI_V202?.rentOfficeProperties!=='function')return [];
    let names=[];
    try{names=window.AQARI_V202.rentOfficeProperties()}catch(_){names=[]}
    if(scopeKey()!==scope||!Array.isArray(names))return [];
    const seen=new Set();
    return names.map(text).filter(function(name){
      const key=norm(name);
      if(!name||!key||seen.has(key))return false;
      seen.add(key);return true;
    });
  }

  function officeData(name,expectedScope){
    const scope=scopeKey();
    if(!scope||scope!==expectedScope||!PERIOD.test(period)||typeof window.AQARI_V202?.rentOfficeData!=='function')return null;
    let data=null;
    try{data=window.AQARI_V202.rentOfficeData(name,period)}catch(_){data=null}
    if(scopeKey()!==scope||!data||norm(data.property)!==norm(name)||text(data.period)!==period)return null;
    return data;
  }

  function aggregate(items){
    const output={properties:0,due:0,collected:0,balance:0,dueProperties:0,lateTenants:0,pendingApprovals:0,readyDocuments:0,setup:0,priorities:[]};
    (Array.isArray(items)?items:[]).forEach(function(item){
      if(!item||item.valid!==true)return;
      output.properties+=1;
      output.due+=Math.max(0,number(item.due));
      output.collected+=Math.max(0,number(item.collected));
      output.balance+=Math.max(0,number(item.balance));
      if(number(item.balance)>0)output.dueProperties+=1;
      if(number(item.units)===0)output.setup+=1;
      const records=Array.isArray(item.records)?item.records:[];
      records.forEach(function(record){
        const balance=Math.max(0,number(record?.balance));
        const pending=Math.max(0,number(record?.pending));
        if(record?.billable===true&&balance>0&&pending===0)output.lateTenants+=1;
        if(pending>0||['قيد المراجعة','يحتاج مراجعة'].includes(text(record?.paymentStatus)))output.pendingApprovals+=1;
        if(record?.hasContract===true||text(record?.receiptNo))output.readyDocuments+=1;
      });
      if(number(item.balance)>0||number(item.pending)>0||number(item.units)===0){
        output.priorities.push({name:text(item.name),balance:Math.max(0,number(item.balance)),pending:Math.max(0,number(item.pending)),setup:number(item.units)===0,canRecordPayment:item.canRecordPayment===true});
      }
    });
    output.priorities.sort(function(left,right){
      if(left.balance!==right.balance)return right.balance-left.balance;
      if(left.pending!==right.pending)return right.pending-left.pending;
      if(left.setup!==right.setup)return left.setup?1:-1;
      return left.name.localeCompare(right.name,'ar',{numeric:true,sensitivity:'base'});
    });
    output.priorities=output.priorities.slice(0,4);
    return output;
  }

  function snapshot(){
    const scope=scopeKey();
    if(!scope)return null;
    const items=propertyNames(scope).map(function(name){
      const data=officeData(name,scope);
      if(!data)return {name:name,valid:false};
      const records=Array.isArray(data.records)?data.records:[];
      return {
        name:name,valid:true,due:number(data.totalRent),collected:number(data.totalCollected),balance:number(data.totalBalance),units:number(data.unitCount),
        pending:records.reduce(function(sum,row){return sum+Math.max(0,number(row?.pending))},0),
        canRecordPayment:data.canRecordPayment===true,
        records:records.map(function(row){return {billable:row?.billable===true,balance:number(row?.balance),pending:number(row?.pending),paymentStatus:text(row?.paymentStatus),hasContract:row?.hasContract===true,receiptNo:text(row?.receiptNo)}})
      };
    });
    if(scopeKey()!==scope)return null;
    return {scope:scope,period:period,summary:aggregate(items)};
  }

  function priorityMarkup(items){
    if(!items.length)return '<div class="v210-clear"><strong>يومك منتظم</strong><span>لا توجد أولويات تحصيل معلّقة لهذه الفترة.</span></div>';
    return items.map(function(item,index){
      const detail=item.balance>0?money(item.balance)+' متبقي':item.pending>0?money(item.pending)+' قيد المراجعة':'يحتاج ربط بيانات الإيجار';
      return '<button type="button" class="v210-priority" data-v210-property="'+esc(item.name)+'"><b>'+(index+1)+'</b><span><strong dir="auto">'+esc(item.name)+'</strong><small>'+esc(detail)+(item.balance>0&&!item.canRecordPayment?' • عرض فقط':'')+'</small></span><i aria-hidden="true">←</i></button>';
    }).join('');
  }

  function markup(state){
    const summary=state.summary;
    const rate=summary.due>0?Math.min(100,Math.max(0,summary.collected/summary.due*100)):0;
    const critical=summary.dueProperties+summary.pendingApprovals+summary.setup;
    return '<section id="v210DailyCommandCenter" class="v210-command" aria-labelledby="v210Title">'+
      '<header class="v210-head"><div><span>لوحة التنفيذ اليومية • V210</span><h2 id="v210Title">الأهم اليوم، في نظرة واحدة</h2><p>أرقام مباشرة من دفتر الإيجارات المحمي ضمن مساحة عملك.</p></div><label for="v210Period"><span>الفترة</span><input id="v210Period" type="month" value="'+esc(period)+'"></label></header>'+
      '<div class="v210-kpis" aria-live="polite">'+
        '<button type="button" data-v210-route="collectionProPage" class="is-gold"><span>المستحق</span><strong>'+esc(money(summary.due))+'</strong><small>'+summary.dueProperties+' عقار يحتاج متابعة</small></button>'+
        '<button type="button" data-v210-route="collectionProPage" class="is-green"><span>المحصّل</span><strong>'+esc(money(summary.collected))+'</strong><small>'+rate.toFixed(0)+'٪ من المستحق</small></button>'+
        '<button type="button" data-v210-route="collectionProPage" class="is-red"><span>متأخرون</span><strong>'+summary.lateTenants+'</strong><small>'+esc(money(summary.balance))+' متبقي</small></button>'+
        '<button type="button" data-v210-route="collectionProPage" class="is-amber"><span>بانتظار المراجعة</span><strong>'+summary.pendingApprovals+'</strong><small>دفعات أو سجلات معلّقة</small></button>'+
        '<button type="button" data-v210-route="documentsHub"><span>مستندات جاهزة</span><strong>'+summary.readyDocuments+'</strong><small>عقود أو وصولات متاحة</small></button>'+
        '<div class="is-dark"><span>مهام حرجة</span><strong>'+critical+'</strong><small>'+summary.properties+' عقار في '+esc(periodLabel(period))+'</small></div>'+
      '</div>'+
      '<div class="v210-body"><div class="v210-priorities"><div class="v210-title"><div><span>ترتيب تلقائي</span><h3>أولوية المتابعة</h3></div><button type="button" data-v210-route="collectionProPage">عرض الكل</button></div>'+priorityMarkup(summary.priorities)+'</div>'+
      '<aside class="v210-actions" aria-label="إجراءات سريعة"><span>نفّذ الآن</span><button type="button" data-v210-route="collectionProPage"><strong>تسجيل تحصيل</strong><small>دفعة ووصل</small></button><button type="button" data-v210-action="search"><strong>بحث شامل</strong><small>مستأجر أو عقد أو وحدة</small></button><button type="button" data-v210-route="documentsHub"><strong>مركز المستندات</strong><small>العقود والوصولات</small></button><button type="button" data-v210-route="maintenanceProPage"><strong>متابعة الصيانة</strong><small>الطلبات المفتوحة</small></button></aside></div>'+
    '</section>';
  }

  function clear(){document.getElementById('v210DailyCommandCenter')?.remove();lastSignature=''}

  function render(){
    const state=snapshot();
    const home=document.getElementById('v205SimpleHome');
    if(!state||!home){clear();return}
    const signature=JSON.stringify([state.scope,state.period,state.summary]);
    const current=document.getElementById('v210DailyCommandCenter');
    if(current&&signature===lastSignature)return;
    const holder=document.createElement('div');
    holder.innerHTML=markup(state);
    const next=holder.firstElementChild;
    if(!next)return;
    if(current)current.replaceWith(next);
    else{
      const anchor=home.querySelector('.v205-welcome');
      if(anchor?.nextSibling)home.insertBefore(next,anchor.nextSibling);else home.prepend(next);
    }
    lastSignature=signature;
  }

  function schedule(){clearTimeout(timer);timer=setTimeout(render,120)}

  function syncPeriod(value){
    if(!PERIOD.test(value)||value===period)return false;
    period=value;lastSignature='';render();
    const input=document.getElementById('v208PortfolioPeriod');
    if(input instanceof HTMLInputElement&&input.value!==value){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}))}
    return true;
  }

  function openProperty(name,trigger){
    const scope=scopeKey();
    if(!scope||typeof window.AQARI_V202?.openProperty!=='function')return false;
    const safeName=propertyNames(scope).find(function(item){return norm(item)===norm(name)});
    if(!safeName||scopeKey()!==scope)return false;
    return window.AQARI_V202.openProperty(safeName,period,trigger)!==false;
  }

  document.addEventListener('input',function(event){
    if(event.target?.id==='v210Period')syncPeriod(text(event.target.value));
  });

  document.addEventListener('click',function(event){
    const property=event.target?.closest?.('[data-v210-property]');
    if(property){event.preventDefault();openProperty(property.getAttribute('data-v210-property')||'',property);return}
    const route=event.target?.closest?.('[data-v210-route]');
    if(route){event.preventDefault();window.go?.(route.getAttribute('data-v210-route'));return}
    if(event.target?.closest?.('[data-v210-action="search"]')){event.preventDefault();window.AQARI_V209?.open?.()}
  });

  function seal(){authSuspended=true;clearTimeout(timer);timer=0;clear()}
  function resume(context){
    const expected=authAccess(context),live=authAccess(window.AQARI_SUPABASE?.context);
    if(!sameAccess(expected,live)||!dataScopesReady(live))return false;
    authSuspended=false;lastSignature='';render();return true;
  }

  function installAuthListener(){
    if(authListenerInstalled||typeof window.AQARI_SUPABASE?.onAuthStateChange!=='function')return;
    authListenerInstalled=true;
    Promise.resolve(window.AQARI_SUPABASE.onAuthStateChange(function(event){
      if(['SIGNED_OUT','TOKEN_REFRESH_FAILED','USER_DELETED','PASSWORD_RECOVERY'].includes(event))seal();
      else setTimeout(function(){resume(window.AQARI_SUPABASE?.context)},0);
    })).catch(function(){authListenerInstalled=false});
  }

  const observer=new MutationObserver(schedule);
  function boot(){
    document.body.classList.add('aq-v210');
    window.AQARI_V210=Object.freeze({version:DESIGN,seal:seal,resume:resume,refresh:function(){lastSignature='';render()},testing:Object.freeze({aggregate:aggregate})});
    observer.observe(document.body,{subtree:true,childList:true});
    installAuthListener();render();
    [600,1800,5000].forEach(function(delay){setTimeout(function(){installAuthListener();schedule()},delay)});
    let meta=document.querySelector('meta[name="aqari-daily-command-center"]');
    if(!meta){meta=document.createElement('meta');meta.name='aqari-daily-command-center';document.head.appendChild(meta)}
    meta.content=DESIGN;
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
