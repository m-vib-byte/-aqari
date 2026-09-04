(function(){
  'use strict';

  const DESIGN='V211-follow-up-center';
  const REVISION='V211.1-cloud-follow-up-journal';
  const EVENT_ACTION=Object.freeze({statement:'statement_opened',contract:'contract_opened',receipt:'receipt_opened',payment:'collection_opened',reminder:'reminder_copied'});
  const PERIOD=/^\d{4}-(0[1-9]|1[0-2])$/;
  const FILTERS=new Set(['all','due','pending','readonly','unlinked']);
  let period=currentPeriod();
  let filter='due';
  let propertyFilter='';
  let authSuspended=false;
  let authListenerInstalled=false;
  let interactionEpoch=0;
  let lastRows=[];
  let lastScope='';

  function currentPeriod(){
    const date=new Date();
    return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');
  }
  function text(value){return String(value==null?'':value).trim()}
  function number(value){const result=Number(value);return Number.isFinite(result)?result:0}
  function esc(value){
    return String(value==null?'':value).replace(/[&<>'"]/g,function(char){
      return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char];
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
  function periodLabel(value,locale){
    try{return new Intl.DateTimeFormat(locale||'ar-KW',{month:'long',year:'numeric'}).format(new Date(value+'-01T12:00:00'))}
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
  function statusOf(row){
    if(row.pending>0||['قيد المراجعة','يحتاج مراجعة'].includes(row.paymentStatus))return 'pending';
    if(!row.hasContract)return 'unlinked';
    if(row.balance>0&&row.billable&&row.collectible&&row.canRecordPayment)return 'due';
    if(row.balance>0)return 'readonly';
    return 'clear';
  }
  function snapshot(){
    const scope=scopeKey();
    if(!scope)return null;
    const rows=[];
    propertyNames(scope).forEach(function(property){
      const data=officeData(property,scope);
      if(!data||!Array.isArray(data.records))return;
      data.records.forEach(function(record){
        const key=text(record?.key);
        if(!key)return;
        const row={
          scope:scope,period:period,property:property,key:key,
          tenant:text(record?.tenant)||'—',unit:text(record?.unit)||'—',
          contractNo:text(record?.contractNo),hasContract:record?.hasContract===true,
          receiptNo:text(record?.receiptNo),paymentStatus:text(record?.paymentStatus),
          balance:Math.max(0,number(record?.balance)),pending:Math.max(0,number(record?.pending)),
          billable:record?.billable===true,collectible:record?.collectible===true,
          canRecordPayment:data.canRecordPayment===true
        };
        row.status=statusOf(row);
        if(row.status!=='clear')rows.push(Object.freeze(row));
      });
    });
    if(scopeKey()!==scope)return null;
    rows.sort(function(left,right){
      const order={pending:0,due:1,readonly:2,unlinked:3};
      if((order[left.status]??9)!==(order[right.status]??9))return (order[left.status]??9)-(order[right.status]??9);
      if(left.balance!==right.balance)return right.balance-left.balance;
      return left.tenant.localeCompare(right.tenant,'ar',{numeric:true,sensitivity:'base'});
    });
    return {scope:scope,period:period,rows:rows};
  }

  function visibleRows(state){
    return state.rows.filter(function(row){
      if(propertyFilter&&norm(row.property)!==norm(propertyFilter))return false;
      return filter==='all'||row.status===filter;
    });
  }
  function counts(rows){
    return rows.reduce(function(out,row){out.all+=1;out[row.status]=(out[row.status]||0)+1;return out},
      {all:0,due:0,pending:0,readonly:0,unlinked:0});
  }
  function badge(row){
    if(row.status==='pending')return '<span class="is-pending">قيد المراجعة</span>';
    if(row.status==='due')return '<span class="is-due">يحتاج تذكير</span>';
    if(row.status==='readonly')return '<span class="is-readonly">عرض فقط</span>';
    return '<span class="is-unlinked">يحتاج ربط</span>';
  }
  function actionMarkup(row,index){
    const paymentLabel=row.status==='due'?'تحصيل':'عرض التحصيل';
    return '<div class="v211-actions">'+
      '<button type="button" data-v211-index="'+index+'" data-v211-action="statement">كشف المستأجر</button>'+
      (row.hasContract?'<button type="button" data-v211-index="'+index+'" data-v211-action="contract">العقد</button>':'')+
      (row.receiptNo?'<button type="button" data-v211-index="'+index+'" data-v211-action="receipt">آخر وصل</button>':'')+
      '<button type="button" data-v211-index="'+index+'" data-v211-action="payment" class="is-primary">'+paymentLabel+'</button>'+
      (row.balance>0?'<button type="button" data-v211-index="'+index+'" data-v211-action="reminder">نسخ تذكير</button>':'')+
      '</div>';
  }
  function rowsMarkup(rows){
    if(!rows.length)return '<div class="v211-empty"><strong>لا توجد حالات مطابقة</strong><span>غيّر العقار أو الحالة أو الفترة.</span></div>';
    return rows.map(function(row,index){
      const detail=row.pending>0?money(row.pending)+' قيد المراجعة':row.balance>0?money(row.balance)+' متبقي':'';
      return '<article class="v211-row" data-v211-record="'+esc(row.key)+'" data-v211-period="'+esc(row.period)+'">'+
        '<div class="v211-person"><span>'+esc(row.property)+'</span><strong dir="auto">'+esc(row.tenant)+'</strong><small>وحدة '+esc(row.unit)+' • '+esc(row.contractNo||'بدون رقم عقد')+'</small></div>'+
        '<div class="v211-state">'+badge(row)+'<b>'+esc(detail)+'</b><small class="v211-timeline" data-v211-timeline>لا توجد متابعة مسجلة</small></div>'+
        actionMarkup(row,index)+
      '</article>';
    }).join('');
  }
  function shellMarkup(state){
    const allCounts=counts(state.rows);
    const properties=propertyNames(state.scope);
    const options=['<option value="">كل العقارات</option>'].concat(properties.map(function(name){
      return '<option value="'+esc(name)+'"'+(norm(name)===norm(propertyFilter)?' selected':'')+'>'+esc(name)+'</option>';
    })).join('');
    const rows=visibleRows(state);
    return '<section id="v211FollowUpCenter" class="v211-shell" role="dialog" aria-modal="true" aria-labelledby="v211Title">'+
      '<div class="v211-backdrop" data-v211-close></div>'+
      '<div class="v211-card">'+
        '<header><div><span>مركز المتابعة • V211.1</span><h2 id="v211Title">المستحقات والمراجعات في مسار واحد</h2><p>البيانات من دفتر الإيجارات المحمي فقط، بدون افتراضات قانونية عن تاريخ التأخر.</p></div><button type="button" class="v211-close" data-v211-close aria-label="إغلاق">×</button></header>'+
        '<div class="v211-controls"><label><span>الفترة</span><input id="v211Period" type="month" value="'+esc(period)+'"></label><label><span>العقار</span><select id="v211Property">'+options+'</select></label></div>'+
        '<nav class="v211-filters" aria-label="فلترة المتابعة">'+
          '<button type="button" data-v211-filter="all" class="'+(filter==='all'?'is-active':'')+'">الكل '+allCounts.all+'</button>'+
          '<button type="button" data-v211-filter="due" class="'+(filter==='due'?'is-active':'')+'">يحتاج تذكير '+allCounts.due+'</button>'+
          '<button type="button" data-v211-filter="pending" class="'+(filter==='pending'?'is-active':'')+'">مراجعة '+allCounts.pending+'</button>'+
          '<button type="button" data-v211-filter="readonly" class="'+(filter==='readonly'?'is-active':'')+'">عرض فقط '+allCounts.readonly+'</button>'+
          '<button type="button" data-v211-filter="unlinked" class="'+(filter==='unlinked'?'is-active':'')+'">يحتاج ربط '+allCounts.unlinked+'</button>'+
        '</nav>'+
        '<div id="v211Rows" class="v211-rows" aria-live="polite">'+rowsMarkup(rows)+'</div>'+
      '</div>'+
    '</section>';
  }

  function close(){
    interactionEpoch+=1;
    lastRows=[];
    lastScope='';
    document.getElementById('v211FollowUpCenter')?.remove();
    document.body.classList.remove('v211-open');
  }
  function render(){
    const state=snapshot();
    if(!state){close();return false}
    lastRows=visibleRows(state);
    lastScope=state.scope;
    const holder=document.createElement('div');
    holder.innerHTML=shellMarkup(state);
    const next=holder.firstElementChild;
    if(!next)return false;
    const current=document.getElementById('v211FollowUpCenter');
    if(current)current.replaceWith(next);else document.body.appendChild(next);
    document.body.classList.add('v211-open');
    next.querySelector('[data-v211-close]')?.focus?.({preventScroll:true});
    hydrateTimeline(state.scope);
    return true;
  }
  function open(options){
    const scope=scopeKey();
    if(!scope)return false;
    const inputPeriod=text(options?.period);
    if(PERIOD.test(inputPeriod))period=inputPeriod;
    const inputFilter=text(options?.filter);
    filter=FILTERS.has(inputFilter)?inputFilter:'due';
    propertyFilter=text(options?.property);
    if(propertyFilter&&!propertyNames(scope).some(function(name){return norm(name)===norm(propertyFilter)}))propertyFilter='';
    return render();
  }

  function liveRow(item){
    if(!item||scopeKey()!==item.scope||lastScope!==item.scope||period!==item.period)return null;
    const data=officeData(item.property,item.scope);
    if(!data||!Array.isArray(data.records))return null;
    const matches=data.records.filter(function(record){return text(record?.key)===item.key});
    if(matches.length!==1)return null;
    const record=matches[0];
    return {
      data:data,record:record,
      writeAllowed:data.canRecordPayment===true&&record?.billable===true&&record?.collectible===true
    };
  }
  function exactAccess(){
    const access=authAccess(window.AQARI_SUPABASE?.context);
    return access&&dataScopesReady(access)?access:null;
  }
  async function recordFollowUp(item,action){
    const access=exactAccess();
    const scope=scopeKey();
    const actionKind=EVENT_ACTION[action];
    if(!access||!scope||scope!==item?.scope||!actionKind||
       typeof window.AQARI_SUPABASE?.appStateRevision!=='function'||
       typeof window.AQARI_SUPABASE?.appendFollowUpEvent!=='function')return false;
    try{
      const revision=await window.AQARI_SUPABASE.appStateRevision(access);
      if(scopeKey()!==scope)return false;
      await window.AQARI_SUPABASE.appendFollowUpEvent({
        recordKey:item.key,
        property:item.property,
        period:item.period,
        actionKind:actionKind,
        state:item.status
      },access,revision);
      if(scopeKey()!==scope)return false;
      hydrateTimeline(scope);
      return true;
    }catch(_){return false}
  }
  async function hydrateTimeline(expectedScope){
    const access=exactAccess();
    const token=interactionEpoch;
    if(!access||!expectedScope||scopeKey()!==expectedScope||
       typeof window.AQARI_SUPABASE?.listFollowUpEvents!=='function'||
       typeof window.AQARI_SUPABASE?.followUpRecordHash!=='function')return false;
    try{
      const rowHashes=await Promise.all(lastRows.map(function(row){
        return window.AQARI_SUPABASE.followUpRecordHash(row.key);
      }));
      if(token!==interactionEpoch||scopeKey()!==expectedScope)return false;
      const events=await window.AQARI_SUPABASE.listFollowUpEvents({
        period:period,
        property:propertyFilter||undefined,
        limit:100
      },access);
      if(token!==interactionEpoch||scopeKey()!==expectedScope||lastScope!==expectedScope)return false;
      const latest=new Map();
      events.forEach(function(event){
        const key=text(event?.record_key)+'\u0000'+text(event?.period);
        if(!latest.has(key))latest.set(key,event);
      });
      document.querySelectorAll('#v211Rows .v211-row').forEach(function(node,index){
        const row=lastRows[index];
        const event=row?latest.get(rowHashes[index]+'\u0000'+row.period):null;
        const target=node.querySelector('[data-v211-timeline]');
        if(!target||!event)return;
        const labels={
          reminder_copied:'نُسخ تذكير',
          statement_opened:'فُتح الكشف',
          contract_opened:'فُتح العقد',
          receipt_opened:'فُتح الوصل',
          collection_opened:'فُتح التحصيل',
          reviewed:'تمت المراجعة'
        };
        const stamp=new Date(event.created_at);
        target.textContent=(labels[event.action_kind]||'متابعة مسجلة')+
          (Number.isNaN(stamp.getTime())?'':' • '+stamp.toLocaleString('ar-KW',{dateStyle:'short',timeStyle:'short'}));
      });
      return true;
    }catch(_){return false}
  }

  function runAction(item,action,trigger){
    const scope=scopeKey();
    if(!scope||scope!==item?.scope||typeof window.AQARI_V202?.openProperty!=='function'||typeof window.AQARI_V202?.rentOfficeAction!=='function')return false;
    const live=liveRow(item);
    if(!live)return false;
    const token=++interactionEpoch;
    const opened=window.AQARI_V202.openProperty(item.property,item.period);
    if(opened===false)return false;
    let attempts=0;
    const follow=function(){
      if(token!==interactionEpoch||scopeKey()!==scope)return;
      attempts+=1;
      const current=liveRow(item);
      if(!current)return;
      const workspace=document.getElementById('v202PropertyWorkspace');
      const title=document.getElementById('v202PropertyTitle');
      if(workspace?.classList.contains('on')&&(!title||norm(title.textContent)===norm(item.property))){
        Promise.resolve(window.AQARI_V202.rentOfficeAction(item.property,item.key,item.period,action,trigger))
          .then(function(ok){if(ok===true)return recordFollowUp(item,action)})
          .catch(function(){});
        close();
        return;
      }
      if(attempts<14)setTimeout(follow,70);else close();
    };
    setTimeout(follow,70);
    return true;
  }
  function reminderText(item){
    const arPeriod=periodLabel(item.period,'ar-KW');
    const enPeriod=periodLabel(item.period,'en-GB');
    return [
      'السلام عليكم،',
      'نذكّركم بمراجعة إيجار '+arPeriod+' للعقار '+item.property+' – الوحدة '+item.unit+'.',
      'المبلغ المتبقي حسب السجل الحالي: '+money(item.balance)+'.',
      'يرجى مراجعة إدارة العقار لإتمام المتابعة. شكرًا لتعاونكم.',
      '',
      'Hello,',
      'This is a reminder to review the rent for '+enPeriod+' at '+item.property+' – unit '+item.unit+'.',
      'Current outstanding balance shown in the property record: KD '+number(item.balance).toLocaleString('en-KW',{maximumFractionDigits:3})+'.',
      'Please contact property management to complete the follow-up. Thank you.'
    ].join('\n');
  }
  async function copyReminder(item,button){
    const live=liveRow(item);
    if(!live||item.balance<=0||typeof navigator?.clipboard?.writeText!=='function')return false;
    try{
      await navigator.clipboard.writeText(reminderText(item));
      await recordFollowUp(item,'reminder');
      const old=button.textContent;
      button.textContent='تم النسخ';
      setTimeout(function(){if(button?.isConnected)button.textContent=old},1400);
      return true;
    }catch(_){return false}
  }

  document.addEventListener('click',function(event){
    const v210=event.target?.closest?.('#v210DailyCommandCenter');
    if(v210){
      const due=event.target?.closest?.('.v210-kpis .is-red');
      const pending=event.target?.closest?.('.v210-kpis .is-amber');
      const priority=event.target?.closest?.('[data-v210-property]');
      if(due||pending||priority){
        event.preventDefault();event.stopImmediatePropagation();
        const selected=document.getElementById('v210Period')?.value||period;
        open({period:selected,filter:pending?'pending':'due',property:priority?.getAttribute('data-v210-property')||''});
        return;
      }
    }
    if(event.target?.closest?.('[data-v211-close]')){event.preventDefault();close();return}
    const filterButton=event.target?.closest?.('[data-v211-filter]');
    if(filterButton){event.preventDefault();const next=text(filterButton.getAttribute('data-v211-filter'));if(FILTERS.has(next)){filter=next;render()}return}
    const actionButton=event.target?.closest?.('[data-v211-action]');
    if(actionButton){
      event.preventDefault();
      const index=Number(actionButton.getAttribute('data-v211-index'));
      const action=text(actionButton.getAttribute('data-v211-action'));
      const item=lastRows[index];
      if(!item)return;
      if(action==='reminder'){copyReminder(item,actionButton);return}
      if(['statement','contract','receipt','payment'].includes(action))runAction(item,action,actionButton);
    }
  },true);
  document.addEventListener('input',function(event){
    if(event.target?.id==='v211Period'){
      const next=text(event.target.value);
      if(PERIOD.test(next)){period=next;render()}
    }
  });
  document.addEventListener('change',function(event){
    if(event.target?.id==='v211Property'){propertyFilter=text(event.target.value);render()}
  });
  document.addEventListener('keydown',function(event){
    if(event.key==='Escape'&&document.getElementById('v211FollowUpCenter')){event.preventDefault();close()}
  });

  function seal(){authSuspended=true;close()}
  function resume(context){
    const expected=authAccess(context),live=authAccess(window.AQARI_SUPABASE?.context);
    if(!expected||!live||expected.userId!==live.userId||expected.workspaceId!==live.workspaceId||expected.role!==live.role||!dataScopesReady(live))return false;
    authSuspended=false;return true;
  }
  function installAuthListener(){
    if(authListenerInstalled||typeof window.AQARI_SUPABASE?.onAuthStateChange!=='function')return;
    authListenerInstalled=true;
    Promise.resolve(window.AQARI_SUPABASE.onAuthStateChange(function(event){
      if(['SIGNED_OUT','TOKEN_REFRESH_FAILED','USER_DELETED','PASSWORD_RECOVERY'].includes(event))seal();
      else setTimeout(function(){resume(window.AQARI_SUPABASE?.context)},0);
    })).catch(function(){authListenerInstalled=false;seal()});
  }
  function boot(){
    document.body.classList.add('aq-v211');
    installAuthListener();
    window.AQARI_V211=Object.freeze({
      version:DESIGN,revision:REVISION,open:open,close:close,seal:seal,resume:resume,
      testing:Object.freeze({statusOf:statusOf,reminderText:reminderText,recordFollowUp:recordFollowUp})
    });
    let meta=document.querySelector('meta[name="aqari-follow-up-center"]');
    if(!meta){meta=document.createElement('meta');meta.name='aqari-follow-up-center';document.head.appendChild(meta)}
    meta.content=DESIGN;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
