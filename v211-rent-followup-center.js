(function(){
  'use strict';

  const DESIGN='V211-rent-followup-center';
  const PERIOD=/^\d{4}-(0[1-9]|1[0-2])$/;
  const FILTERS=new Set(['all','reminder','pending','readonly','uncollectible','setup']);
  let period=currentPeriod();
  let filter='all';
  let propertyFilter='';
  let visible=[];
  let authSuspended=false;
  let authListenerInstalled=false;
  let interactionEpoch=0;
  let returnFocus=null;

  function currentPeriod(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
  function text(value){return String(value==null?'':value).trim()}
  function number(value){const n=Number(value);return Number.isFinite(n)?n:0}
  function esc(value){return String(value==null?'':value).replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]))}
  function norm(value){return text(value).normalize('NFKD').replace(/[\u064B-\u065F\u0670]/g,'').replace(/\s+/g,' ').toLocaleLowerCase('ar')}
  function identity(value){if(typeof value!=='string'||value!==value.trim()||/(?:\p{Cc}|\p{Cf}|\p{Zl}|\p{Zp}|\p{Default_Ignorable_Code_Point})/u.test(value))return '';return value}
  function money(value){try{return number(value).toLocaleString('ar-KW',{maximumFractionDigits:3})+' د.ك'}catch(_){return number(value)+' د.ك'}}
  function periodLabel(value,locale){try{return new Intl.DateTimeFormat(locale||'ar-KW',{month:'long',year:'numeric'}).format(new Date(value+'-01T12:00:00'))}catch(_){return value}}
  function safeEmail(value){const email=text(value);return email.length<=254&&!/[\r\n\s,;،?&#%]/.test(email)&&/^[^@<>]+@[^@<>.]+(?:\.[^@<>.]+)+$/.test(email)?email:''}

  function authAccess(context){
    const userId=identity(context?.user?.id),workspaceId=identity(context?.workspace?.id),membership=context?.membership;
    const membershipUserId=identity(membership?.user_id),membershipWorkspaceId=identity(membership?.workspace_id),role=identity(membership?.role);
    if(!userId||!workspaceId||!role||membership?.is_active!==true||membershipUserId!==userId||membershipWorkspaceId!==workspaceId)return null;
    return Object.freeze({userId,workspaceId,role});
  }
  function sameAccess(a,b){return Boolean(a&&b&&a.userId===b.userId&&a.workspaceId===b.workspaceId&&a.role===b.role)}
  function dataScopesReady(access){const d=window.AQARI_DATA_GATE?.scope,s=window.AQARI_EARLY_STORAGE_GATE?.scope;return Boolean(access&&d&&s&&identity(d.userId)===access.userId&&identity(d.workspaceId)===access.workspaceId&&identity(s.userId)===access.userId&&identity(s.workspaceId)===access.workspaceId)}
  function scopeKey(){try{const a=authAccess(window.AQARI_SUPABASE?.context);return authSuspended||!dataScopesReady(a)?'':a.userId+'\u0000'+a.workspaceId+'\u0000'+a.role}catch(_){return ''}}

  function classify(record,canRecordPayment){
    const balance=Math.max(0,number(record?.balance)),pending=Math.max(0,number(record?.pending)),status=text(record?.paymentStatus);
    if(pending>0||['قيد المراجعة','يحتاج مراجعة'].includes(status))return 'pending';
    if(balance>0&&record?.billable===true&&record?.collectible===true&&canRecordPayment===true)return 'reminder';
    if(balance>0&&record?.collectible===false)return 'uncollectible';
    if(balance>0)return 'readonly';
    if(record?.hasContract!==true)return 'setup';
    return 'clear';
  }

  function followupHistory(property,key,selectedPeriod,expectedScope){
    if(scopeKey()!==expectedScope||typeof window.AQARI_V202?.rentFollowups!=='function')return [];
    let records=[];try{records=window.AQARI_V202.rentFollowups(property,key,selectedPeriod)}catch(_){records=[]}
    if(scopeKey()!==expectedScope||!Array.isArray(records))return [];
    return records.filter(item=>item&&item.scope===expectedScope&&item.property===property&&item.key===key&&item.period===selectedPeriod);
  }
  function contractAlert(value){
    const end=text(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(end))return '';
    const days=Math.ceil((new Date(end+'T12:00:00').getTime()-Date.now())/86400000);
    return days>=0&&days<=45?'العقد ينتهي خلال '+days+' يوم':days<0?'انتهت مدة العقد المسجلة':'';
  }

  function reminder(record,selectedPeriod){
    const tenant=text(record?.tenant)||'المستأجر الكريم';
    const balance=money(Math.max(0,number(record?.balance)));
    const ar='السلام عليكم ورحمة الله وبركاته، '+tenant+'،\nنذكّركم بأن كشف إيجار '+periodLabel(selectedPeriod,'ar-KW')+' يظهر رصيداً متبقياً قدره '+balance+'. يرجى مراجعة السداد أو التواصل معنا عند وجود دفعة قيد المعالجة.\nشاكرين لكم تعاونكم — إدارة عقاري.';
    const en='Dear '+tenant+',\nYour rent statement for '+periodLabel(selectedPeriod,'en-GB')+' shows an outstanding balance of '+balance+'. Please review the payment or contact us if a payment is being processed.\nThank you — Aqari Management.';
    return ar+'\n\n'+en;
  }

  function propertyNames(expectedScope){
    const scope=scopeKey();if(!scope||scope!==expectedScope||typeof window.AQARI_V202?.rentOfficeProperties!=='function')return [];
    let names=[];try{names=window.AQARI_V202.rentOfficeProperties()}catch(_){names=[]}
    if(scopeKey()!==scope||!Array.isArray(names))return [];
    const seen=new Set();return names.map(text).filter(name=>{const key=norm(name);if(!key||seen.has(key))return false;seen.add(key);return true});
  }

  function buildTasks(){
    const scope=scopeKey();if(!scope||!PERIOD.test(period))return null;
    const tasks=[];
    propertyNames(scope).forEach(property=>{
      let data=null;try{data=window.AQARI_V202?.rentOfficeData?.(property,period)}catch(_){data=null}
      if(scopeKey()!==scope||!data||norm(data.property)!==norm(property)||text(data.period)!==period)return;
      const records=Array.isArray(data.records)?data.records:[];
      if(!records.length&&number(data.unitCount)===0)tasks.push(Object.freeze({scope,property,period,key:'setup:'+norm(property),state:'setup',tenant:'',unit:'',contractNo:'',balance:0,pending:0,email:'',hasContract:false,receiptNo:'',billable:false,collectible:false,canRecordPayment:false}));
      records.forEach(record=>{
        const key=text(record?.key);if(!key)return;
        const state=classify(record,data.canRecordPayment===true);if(state==='clear')return;
        const history=followupHistory(property,key,period,scope),last=history[history.length-1];
        tasks.push(Object.freeze({scope,property,period,key,state,tenant:text(record?.tenant),unit:text(record?.unit),contractNo:text(record?.contractNo),contractEnd:text(record?.contractEnd),lastFollowupAt:text(last?.at),balance:Math.max(0,number(record?.balance)),pending:Math.max(0,number(record?.pending)),email:safeEmail(record?.email),hasContract:record?.hasContract===true,receiptNo:text(record?.receiptNo),billable:record?.billable===true,collectible:record?.collectible===true,canRecordPayment:data.canRecordPayment===true}));
      });
    });
    if(scopeKey()!==scope)return null;
    return tasks.sort((a,b)=>b.balance-a.balance||b.pending-a.pending||String(a.lastFollowupAt||'').localeCompare(String(b.lastFollowupAt||''))||a.property.localeCompare(b.property,'ar',{numeric:true,sensitivity:'base'})||a.unit.localeCompare(b.unit,'ar',{numeric:true,sensitivity:'base'}));
  }

  function stateLabel(state){return {reminder:'يحتاج تذكيراً',pending:'قيد المراجعة',readonly:'عرض فقط',uncollectible:'غير قابل للتحصيل',setup:'يحتاج ربط'}[state]||state}
  function statusCounts(tasks){return tasks.reduce((out,item)=>{out.all+=1;out[item.state]=(out[item.state]||0)+1;return out},{all:0,reminder:0,pending:0,readonly:0,uncollectible:0,setup:0})}
  function filtered(tasks){return tasks.filter(item=>(filter==='all'||item.state===filter)&&(!propertyFilter||norm(item.property)===norm(propertyFilter)))}

  function ensureDialog(){
    let dialog=document.getElementById('v211FollowupDialog');if(dialog)return dialog;
    dialog=document.createElement('div');dialog.id='v211FollowupDialog';dialog.className='v211-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','v211Title');dialog.setAttribute('aria-hidden','true');dialog.innerHTML='<div class="v211-sheet"><button type="button" class="v211-close" data-v211-close aria-label="إغلاق">×</button><div id="v211FollowupContent"></div></div>';
    document.body.appendChild(dialog);return dialog;
  }

  function filtersMarkup(counts){return ['all','reminder','pending','readonly','uncollectible','setup'].map(key=>'<button type="button" data-v211-filter="'+key+'" class="'+(filter===key?'is-active':'')+'">'+({all:'الكل',reminder:'يحتاج تذكيراً',pending:'قيد المراجعة',readonly:'عرض فقط',uncollectible:'غير قابل للتحصيل',setup:'يحتاج ربط'}[key])+' <b>'+counts[key]+'</b></button>').join('')}
  function propertiesMarkup(tasks){const names=Array.from(new Set(tasks.map(x=>x.property)));return '<option value="">كل العقارات</option>'+names.map(name=>'<option value="'+esc(name)+'" '+(norm(name)===norm(propertyFilter)?'selected':'')+'>'+esc(name)+'</option>').join('')}
  function actionButton(action,label,enabled){return enabled?'<button type="button" data-v211-action="'+action+'">'+label+'</button>':''}
  function cardsMarkup(tasks){
    if(!tasks.length)return '<div class="v211-empty"><strong>لا توجد سجلات مطابقة</strong><span>غيّر الفلتر أو الفترة لعرض مهام أخرى.</span></div>';
    return tasks.map((item,index)=>{
      if(item.state==='setup')return '<article class="v211-card is-setup"><header><div><span>'+esc(item.property)+'</span><h3>ملف الإيجار يحتاج ربطاً</h3><small>'+esc(periodLabel(period))+'</small></div><b>'+stateLabel(item.state)+'</b></header><footer>'+actionButton('view','فتح العقار',true)+'</footer></article>';
      const amount=item.pending>0?money(item.pending)+' قيد المراجعة':money(item.balance)+' متبقي';
      const writable=item.balance>0&&item.billable&&item.collectible&&item.canRecordPayment;
      const expiry=contractAlert(item.contractEnd);
      return '<article class="v211-card is-'+item.state+'"><header><div><span>'+esc(item.property)+' • وحدة '+esc(item.unit||'—')+'</span><h3 dir="auto">'+esc(item.tenant||'مستأجر غير مسجل')+'</h3><small>'+esc(item.contractNo?'عقد '+item.contractNo:'عقد غير مربوط')+' • '+esc(amount)+(expiry?' • '+esc(expiry):'')+'</small></div><b>'+stateLabel(item.state)+'</b></header><div class="v211-card-actions">'+actionButton('statement','كشف المستأجر',true)+actionButton('contract','العقد',item.hasContract)+actionButton('receipt','آخر وصل',Boolean(item.receiptNo))+actionButton('payment','تسجيل التحصيل',writable)+actionButton('view','عرض الملف',!writable)+actionButton('search','فتح البحث',Boolean(item.tenant||item.contractNo))+actionButton('copy','نسخ التذكير',item.balance>0)+actionButton('email','فتح البريد',Boolean(item.email))+'</div><small class="v211-send-note">لا يتم إرسال أي رسالة تلقائياً.</small></article>';
    }).join('');
  }

  function render(){
    const tasks=buildTasks(),dialog=document.getElementById('v211FollowupDialog');if(!tasks||!dialog||dialog.getAttribute('aria-hidden')!=='false'){if(!tasks)seal();return}
    const content=document.getElementById('v211FollowupContent');if(!content)return;
    visible=filtered(tasks);const counts=statusCounts(tasks);
    content.innerHTML='<header class="v211-head"><div><span>V211 • مركز المتابعة الآمن</span><h2 id="v211Title">الإيجارات التي تحتاج إجراء</h2><p>«يحتاج تذكيراً» تعني وجود رصيد ظاهر في الكشف، ولا تمثل حكماً قانونياً بالتأخر دون تاريخ استحقاق موثق.</p></div><label><span>الفترة</span><input id="v211Period" type="month" value="'+esc(period)+'"></label></header><div class="v211-toolbar"><div class="v211-filters" role="group" aria-label="فلترة المتابعة">'+filtersMarkup(counts)+'</div><label><span>العقار</span><select id="v211PropertyFilter">'+propertiesMarkup(tasks)+'</select></label></div><div class="v211-list" aria-live="polite">'+cardsMarkup(visible)+'</div>';
  }

  function journal(item,action,state){
    if(item.scope!==scopeKey()||typeof window.AQARI_V202?.recordRentFollowup!=='function')return false;
    try{return window.AQARI_V202.recordRentFollowup(item.property,item.key,item.period,action,state)===true}catch(_){return false}
  }

  function openRecord(item,action,trigger){
    const scope=scopeKey(),token=++interactionEpoch;if(!scope||item.scope!==scope||typeof window.AQARI_V202?.openProperty!=='function')return false;
    if(item.state==='setup'||action==='view'){const opened=window.AQARI_V202.openProperty(item.property,item.period)!==false;if(opened)journal(item,'view','completed');return opened}
    if(window.AQARI_V202.openProperty(item.property,item.period)===false)return false;
    setTimeout(()=>{if(token!==interactionEpoch||scopeKey()!==scope)return;const done=window.AQARI_V202?.rentOfficeAction?.(item.property,item.key,item.period,action,trigger)===true;if(done)journal(item,action,'completed')},80);
    return true;
  }

  async function handleAction(item,action,trigger){
    if(!item||item.scope!==scopeKey())return false;
    if(['statement','contract','receipt','payment','view'].includes(action))return openRecord(item,action,trigger);
    if(action==='search'&&typeof window.AQARI_V209?.open==='function'){
      if(window.AQARI_V209.open()===false||item.scope!==scopeKey())return false;
      const input=document.getElementById('v199SearchInput');if(!input)return false;
      input.value=item.contractNo||item.tenant;input.dispatchEvent(new Event('input',{bubbles:true}));journal(item,'search','completed');return true;
    }
    const message=reminder(item,item.period);
    if(action==='copy'){
      try{await navigator.clipboard.writeText(message);if(item.scope!==scopeKey())return false;journal(item,'copy','completed');trigger.textContent='تم النسخ';setTimeout(()=>{if(trigger?.isConnected)trigger.textContent='نسخ التذكير'},1400);return true}catch(_){return false}
    }
    if(action==='email'&&item.email){
      const subject='متابعة إيجار '+periodLabel(item.period,'ar-KW')+' / Rent follow-up';
      journal(item,'email','prepared');window.location.href='mailto:'+encodeURIComponent(item.email)+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(message);return true;
    }
    return false;
  }

  function open(nextFilter,nextProperty,nextPeriod,trigger){
    if(!scopeKey())return false;
    const mapped=nextFilter==='overdue'?'reminder':text(nextFilter);filter=FILTERS.has(mapped)?mapped:'all';propertyFilter=text(nextProperty);if(PERIOD.test(text(nextPeriod)))period=text(nextPeriod);
    returnFocus=trigger instanceof HTMLElement?trigger:document.activeElement;const dialog=ensureDialog();dialog.setAttribute('aria-hidden','false');dialog.classList.add('on');document.body.classList.add('v211-open');render();setTimeout(()=>dialog.querySelector('[data-v211-close]')?.focus(),0);return true;
  }
  function close(){interactionEpoch+=1;visible=[];const dialog=document.getElementById('v211FollowupDialog');if(dialog){dialog.classList.remove('on');dialog.setAttribute('aria-hidden','true');dialog.remove()}document.body.classList.remove('v211-open');if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});returnFocus=null;return true}
  function seal(){authSuspended=true;interactionEpoch+=1;close()}
  function resume(context){const expected=authAccess(context),live=authAccess(window.AQARI_SUPABASE?.context);if(!sameAccess(expected,live)||!dataScopesReady(live))return false;authSuspended=false;if(document.getElementById('v211FollowupDialog'))render();return true}

  document.addEventListener('click',event=>{
    const closeButton=event.target?.closest?.('[data-v211-close]');if(closeButton){event.preventDefault();close();return}
    const filterButton=event.target?.closest?.('[data-v211-filter]');if(filterButton){filter=filterButton.getAttribute('data-v211-filter')||'all';render();return}
    const action=event.target?.closest?.('[data-v211-action]');if(action){const item=visible[Array.from(document.querySelectorAll('.v211-list .v211-card')).indexOf(action.closest('.v211-card'))];handleAction(item,action.getAttribute('data-v211-action')||'',action)}
  });
  document.addEventListener('input',event=>{if(event.target?.id==='v211Period'&&PERIOD.test(event.target.value)){period=event.target.value;render()}});
  document.addEventListener('change',event=>{if(event.target?.id==='v211PropertyFilter'){propertyFilter=event.target.value;render()}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.getElementById('v211FollowupDialog')?.classList.contains('on')){event.preventDefault();close()}},true);

  function installAuthListener(){if(authListenerInstalled||typeof window.AQARI_SUPABASE?.onAuthStateChange!=='function')return;authListenerInstalled=true;Promise.resolve(window.AQARI_SUPABASE.onAuthStateChange(event=>{if(['SIGNED_OUT','TOKEN_REFRESH_FAILED','USER_DELETED','PASSWORD_RECOVERY'].includes(event))seal();else setTimeout(()=>resume(window.AQARI_SUPABASE?.context),0)})).catch(()=>{authListenerInstalled=false})}
  function boot(){window.AQARI_V211=Object.freeze({version:DESIGN,open,close,seal,resume,testing:Object.freeze({classify,reminder,statusCounts})});installAuthListener();let meta=document.querySelector('meta[name="aqari-rent-followup-center"]');if(!meta){meta=document.createElement('meta');meta.name='aqari-rent-followup-center';document.head.appendChild(meta)}meta.content=DESIGN}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
