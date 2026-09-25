(function(){
  'use strict';

  const RELEASE='V266-headless-scheduler-control';
  const MANAGER_ROLE='general_manager';
  const KUWAIT_TIME_ZONE='Asia/Kuwait';
  const state={ access:null, config:null, runs:[], epoch:0, loading:false };

  const byId=(id)=>document.getElementById(id);

  function validAccess(context){
    const userId=String(context?.user?.id||'').trim();
    const membership=context?.membership;
    const workspaceId=String(context?.workspace?.id||'').trim();
    const role=String(membership?.role||'').trim();
    if(!userId||!workspaceId||role!==MANAGER_ROLE||membership?.is_active!==true)return null;
    if(String(membership.user_id||'')!==userId)return null;
    if(String(membership.workspace_id||'')!==workspaceId)return null;
    return Object.freeze({userId,workspaceId,role});
  }

  function sameAccess(left,right){
    return Boolean(left&&right&&left.userId===right.userId&&
      left.workspaceId===right.workspaceId&&left.role===right.role);
  }

  function assertEpoch(epoch){
    if(epoch!==state.epoch)throw Object.assign(new Error('Scheduler request superseded'),{code:'AQARI_V266_SUPERSEDED'});
  }

  async function recheck(expected,{write=false}={}){
    const api=window.AQARI_SUPABASE;
    if(!api?.refreshContext)throw new Error('AQARI secure session is unavailable');
    const context=await api.refreshContext(expected);
    const live=validAccess(context);
    if(!sameAccess(expected,live))throw Object.assign(new Error('AQARI access changed'),{code:'AQARI_ACCESS_CHANGED'});
    if(write&&live.role!==MANAGER_ROLE)throw Object.assign(new Error('AQARI manager access is required'),{code:'AQARI_WRITE_FORBIDDEN'});
    return live;
  }

  function missingSchedulerBackend(error){
    const code=String(error?.code||''),raw=String(error?.message||error||'');
    return ['PGRST205','42P01'].includes(code)&&/\baqari_scheduler_(?:config|runs)\b/i.test(raw);
  }

  function friendlyError(error){
    const raw=String(error?.message||error||'');
    if(error?.code==='AQARI_V266_SUPERSEDED')return '';
    if(/access changed|membership|workspace|jwt|session|not authorized|permission denied|row-level security/i.test(raw)){
      return 'تغيّرت صلاحية الحساب. أعد تسجيل الدخول ثم جرّب مرة أخرى.';
    }
    if(/failed to fetch|network|timeout|load/i.test(raw)){
      return 'تعذر الاتصال بالسحابة الآن. تحقق من الإنترنت ثم أعد المحاولة.';
    }
    return 'تعذر تحديث حالة التشغيل الآن. حاول مرة أخرى بعد قليل.';
  }

  function numberValue(value){
    const parsed=Number(value);
    return Number.isFinite(parsed)?parsed:0;
  }

  function statusLabel(value){
    const labels={completed:'مكتمل',running:'قيد التشغيل',failed:'متعثر',disabled:'متوقف',idle:'بانتظار التشغيل'};
    return labels[String(value||'').toLowerCase()]||'بانتظار التشغيل';
  }

  function channelLabel(value){
    return String(value||'').toLowerCase()==='portal'?'داخل المنصة':'غير مهيأة';
  }

  function formatDateTime(value){
    if(!value)return '—';
    try{
      return new Intl.DateTimeFormat('ar-KW',{
        timeZone:KUWAIT_TIME_ZONE,day:'numeric',month:'short',year:'numeric',
        hour:'2-digit',minute:'2-digit'
      }).format(new Date(value));
    }catch(_){return '—'}
  }

  function formatRunDate(value){
    if(!value)return '—';
    try{
      return new Intl.DateTimeFormat('ar-KW',{
        timeZone:KUWAIT_TIME_ZONE,weekday:'short',day:'numeric',month:'short'
      }).format(new Date(String(value)+'T12:00:00+03:00'));
    }catch(_){return String(value)}
  }

  function setText(id,value){
    const node=byId(id);
    if(node)node.textContent=String(value==null?'—':value);
  }

  function setMessage(text,kind='wait'){
    const node=byId('v266Message');
    if(!node)return;
    node.textContent=text;
    node.dataset.kind=kind;
  }

  function setBusy(value){
    state.loading=Boolean(value);
    const panel=byId('aqariV266Scheduler');
    panel?.setAttribute('aria-busy',String(state.loading));
    for(const id of ['v266Save','v266Refresh']){
      const button=byId(id);
      if(button)button.disabled=state.loading||(id==='v266Save'&&!state.config);
    }
  }

  function schedulerIcon(){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path><path d="M8 2v3M16 2v3"></path></svg>';
  }

  function injectMenuAction(){
    if(byId('v266MenuAction')||!state.access)return;
    const menu=byId('v199MoreMenu');
    if(!menu)return;
    const button=document.createElement('button');
    button.id='v266MenuAction';
    button.type='button';
    button.className='v199-menu-action';
    button.setAttribute('role','menuitem');
    button.setAttribute('data-v266-open','');
    button.innerHTML=schedulerIcon()+' التشغيل الآلي';
    const before=menu.querySelector('[data-v199-go="settingsCenterPage"],.danger');
    menu.insertBefore(button,before||null);
    button.addEventListener('click',function(){
      menu.classList.remove('on');
      document.querySelectorAll('[data-v199-action="more"]').forEach(function(trigger){
        trigger.setAttribute('aria-expanded','false');
      });
      open();
    });
  }

  function buildPanel(){
    let panel=byId('aqariV266Scheduler');
    if(panel)return panel;
    const home=byId('home');
    if(!home)return null;
    panel=document.createElement('section');
    panel.id='aqariV266Scheduler';
    panel.className='v266-shell';
    panel.hidden=true;
    panel.setAttribute('aria-labelledby','v266Title');
    panel.setAttribute('aria-busy','false');
    panel.innerHTML=
      '<div class="v266-head">'+
        '<div><p class="v266-eyebrow">AQARI V267</p><h2 id="v266Title" tabindex="-1">التشغيل الآلي اليومي</h2><p>إنشاء الاستحقاقات والتذكيرات يعمل من السحابة كل يوم، حتى لو كانت المنصة مغلقة.</p></div>'+
        '<span class="v266-state" id="v266State" data-state="idle">بانتظار التشغيل</span>'+
      '</div>'+
      '<div class="v266-status-grid">'+
        '<article><span>حالة الجدولة</span><strong id="v266Enabled">—</strong><small>تشغيل سحابي مستقل</small></article>'+
        '<article><span>وقت التشغيل</span><strong>06:05</strong><small>بتوقيت الكويت</small></article>'+
        '<article><span>يوم الاستحقاق</span><strong id="v266DueDay">—</strong><small>من كل شهر</small></article>'+
        '<article><span>آخر تشغيل</span><strong id="v266LastRun">—</strong><small id="v266TimeZone">Asia/Kuwait</small></article>'+
      '</div>'+
      '<div class="v266-layout">'+
        '<article class="v266-card v266-settings">'+
          '<div class="v266-card-head"><div><h3>إعداد الجدولة</h3><p>متاح للمدير العام فقط.</p></div><span class="v266-secure">صلاحية محمية</span></div>'+
          '<div class="v266-form">'+
            '<label class="v266-switch-row" for="v266EnabledInput"><span><b>التشغيل اليومي</b><small>إيقافه يمنع التشغيلات القادمة.</small></span><input id="v266EnabledInput" type="checkbox" role="switch"><i aria-hidden="true"></i></label>'+
            '<label for="v266DueDayInput"><span>يوم الاستحقاق الشهري</span><input id="v266DueDayInput" type="number" inputmode="numeric" min="1" max="28" step="1"></label>'+
            '<div class="v266-fixed"><span>قناة التذكير</span><strong id="v266Channel">داخل المنصة</strong><small>البريد وواتساب لا يظهران قبل تهيئة مزود إرسال فعلي.</small></div>'+
          '</div>'+
          '<div class="v266-actions"><button id="v266Save" type="button" class="v266-primary" disabled>حفظ الإعداد</button><button id="v266Refresh" type="button">تحديث الحالة</button></div>'+
          '<p class="v266-message" id="v266Message" role="status" aria-live="polite" data-kind="wait">جاري قراءة حالة التشغيل…</p>'+
        '</article>'+
        '<article class="v266-card">'+
          '<div class="v266-card-head"><div><h3>نتيجة آخر تشغيل</h3><p id="v266RunStatus">لم تُقرأ بعد</p></div></div>'+
          '<div class="v266-summary">'+
            '<div><span>فواتير جديدة</span><strong id="v266BillsInserted">0</strong></div>'+
            '<div><span>فواتير محدّثة</span><strong id="v266BillsUpdated">0</strong></div>'+
            '<div><span>تذكيرات أُضيفت</span><strong id="v266RemindersQueued">0</strong></div>'+
            '<div><span>تذكيرات متجاوزة</span><strong id="v266RemindersSkipped">0</strong></div>'+
          '</div>'+
          '<p class="v266-error" id="v266LastError" hidden></p>'+
        '</article>'+
      '</div>'+
      '<article class="v266-card v266-history">'+
        '<div class="v266-card-head"><div><h3>آخر التشغيلات</h3><p>سجل موثّق حسب مساحة العمل الحالية.</p></div></div>'+
        '<div class="v266-table-wrap"><table><thead><tr><th>اليوم</th><th>الحالة</th><th>فواتير جديدة</th><th>محدّثة</th><th>تذكيرات</th><th>وقت البدء</th></tr></thead><tbody id="v266Runs"><tr><td colspan="6">جاري التحميل…</td></tr></tbody></table></div>'+
      '</article>';
    home.appendChild(panel);
    byId('v266Refresh')?.addEventListener('click',function(){refresh({announce:true})});
    byId('v266Save')?.addEventListener('click',save);
    return panel;
  }

  function renderConfig(config){
    state.config=config||null;
    const enabled=Boolean(config?.enabled);
    const dueDay=Math.min(28,Math.max(1,numberValue(config?.due_day)||5));
    setText('v266Enabled',enabled?'مفعّل':'متوقف');
    setText('v266DueDay',dueDay);
    setText('v266LastRun',formatDateTime(config?.last_run_at));
    setText('v266TimeZone',config?.timezone||KUWAIT_TIME_ZONE);
    setText('v266Channel',channelLabel(config?.reminder_channel));
    setText('v266RunStatus',statusLabel(config?.last_status));
    const enabledInput=byId('v266EnabledInput');
    const dueDayInput=byId('v266DueDayInput');
    if(enabledInput)enabledInput.checked=enabled;
    if(dueDayInput)dueDayInput.value=String(dueDay);
    const stateNode=byId('v266State');
    if(stateNode){
      stateNode.textContent=enabled?statusLabel(config?.last_status):'الجدولة متوقفة';
      stateNode.dataset.state=enabled?(String(config?.last_status||'idle').toLowerCase()):'disabled';
    }
    const summary=config?.last_summary&&typeof config.last_summary==='object'?config.last_summary:{};
    setText('v266BillsInserted',numberValue(summary.bills_inserted));
    setText('v266BillsUpdated',numberValue(summary.bills_updated));
    setText('v266RemindersQueued',numberValue(summary.reminders_queued));
    setText('v266RemindersSkipped',numberValue(summary.reminders_skipped));
    const errorNode=byId('v266LastError');
    if(errorNode){
      const error=String(config?.last_error||'').trim();
      errorNode.hidden=!error;
      errorNode.textContent=error?'آخر خطأ مسجل: '+error:'';
    }
  }

  function appendCell(row,value){
    const cell=document.createElement('td');
    cell.textContent=String(value==null?'—':value);
    row.appendChild(cell);
  }

  function renderRuns(runs){
    state.runs=Array.isArray(runs)?runs:[];
    const body=byId('v266Runs');
    if(!body)return;
    body.replaceChildren();
    if(!state.runs.length){
      const row=document.createElement('tr');
      const cell=document.createElement('td');
      cell.colSpan=6;
      cell.textContent='لا توجد تشغيلات مسجلة حتى الآن.';
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }
    state.runs.forEach(function(run){
      const summary=run?.summary&&typeof run.summary==='object'?run.summary:{};
      const row=document.createElement('tr');
      appendCell(row,formatRunDate(run?.run_date));
      appendCell(row,statusLabel(run?.status));
      appendCell(row,numberValue(summary.bills_inserted));
      appendCell(row,numberValue(summary.bills_updated));
      appendCell(row,numberValue(summary.reminders_queued));
      appendCell(row,formatDateTime(run?.started_at));
      body.appendChild(row);
    });
  }

  async function refresh({announce=false}={}){
    if(state.loading)return null;
    const initial=validAccess(window.AQARI_SUPABASE?.context);
    if(!initial){seal();return null}
    const epoch=state.epoch;
    setBusy(true);
    if(announce)setMessage('جاري تحديث حالة التشغيل…','wait');
    try{
      const access=await recheck(initial);
      assertEpoch(epoch);
      const client=await window.AQARI_SUPABASE.getClient();
      const [configResult,runsResult]=await Promise.all([
        client.from('aqari_scheduler_config')
          .select('workspace_id,enabled,due_day,reminder_channel,timezone,last_status,last_run_at,last_summary,last_error')
          .eq('workspace_id',access.workspaceId).limit(1).maybeSingle(),
        client.from('aqari_scheduler_runs')
          .select('workspace_id,run_date,status,summary,error_text,started_at,completed_at')
          .eq('workspace_id',access.workspaceId).order('run_date',{ascending:false}).limit(8)
      ]);
      assertEpoch(epoch);
      if(configResult.error)throw configResult.error;
      if(runsResult.error)throw runsResult.error;
      if(configResult.data&&String(configResult.data.workspace_id)!==access.workspaceId)throw new Error('AQARI workspace mismatch');
      if((runsResult.data||[]).some(function(run){return String(run.workspace_id)!==access.workspaceId}))throw new Error('AQARI workspace mismatch');
      await recheck(access);
      assertEpoch(epoch);
      state.access=access;
      renderConfig(configResult.data);
      renderRuns(runsResult.data||[]);
      setMessage(configResult.data?'الحالة محدثة من السحابة.':'لم تُهيأ الجدولة لمساحة العمل الحالية.','ready');
      return {config:configResult.data,runs:runsResult.data||[]};
    }catch(error){
      if(missingSchedulerBackend(error)&&epoch===state.epoch){
        state.config=null;state.runs=[];renderConfig(null);renderRuns([]);
        setMessage('التشغيل الآلي غير مهيأ لبيئة البيانات الحالية.','wait');
        return null;
      }
      const message=friendlyError(error);
      if(message&&epoch===state.epoch)setMessage(message,'bad');
      return null;
    }finally{
      if(epoch===state.epoch)setBusy(false);
    }
  }

  async function save(){
    if(state.loading)return;
    if(!state.config){
      setMessage('لم تُهيأ الجدولة لمساحة العمل الحالية.','bad');
      return;
    }
    const initial=validAccess(window.AQARI_SUPABASE?.context);
    if(!initial){seal();return}
    const dueDay=Math.trunc(Number(byId('v266DueDayInput')?.value));
    if(!Number.isInteger(dueDay)||dueDay<1||dueDay>28){
      setMessage('اختر يوم استحقاق من 1 إلى 28.','bad');
      byId('v266DueDayInput')?.focus();
      return;
    }
    const enabled=Boolean(byId('v266EnabledInput')?.checked);
    const epoch=state.epoch;
    setBusy(true);
    setMessage('جاري حفظ الإعداد والتحقق من الصلاحية…','wait');
    try{
      const access=await recheck(initial,{write:true});
      assertEpoch(epoch);
      const client=await window.AQARI_SUPABASE.getClient();
      const {data,error}=await client.from('aqari_scheduler_config')
        .update({enabled,due_day:dueDay})
        .eq('workspace_id',access.workspaceId)
        .select('workspace_id,enabled,due_day,reminder_channel,timezone,last_status,last_run_at,last_summary,last_error')
        .maybeSingle();
      assertEpoch(epoch);
      if(error)throw error;
      if(!data||String(data.workspace_id)!==access.workspaceId)throw new Error('AQARI scheduler setting was not updated');
      await recheck(access,{write:true});
      assertEpoch(epoch);
      state.access=access;
      renderConfig(data);
      setMessage('تم حفظ إعداد التشغيل الآلي بأمان.','ready');
    }catch(error){
      const message=friendlyError(error);
      if(message&&epoch===state.epoch)setMessage(message,'bad');
    }finally{
      if(epoch===state.epoch)setBusy(false);
    }
  }

  async function resume(){
    const access=validAccess(window.AQARI_SUPABASE?.context);
    if(!access){seal();return false}
    if(sameAccess(state.access,access)){
      const currentPanel=buildPanel();
      if(!currentPanel)return false;
      currentPanel.hidden=false;
      document.body?.classList.add('aq-v266');
      document.body?.setAttribute('data-v266-ready','true');
      injectMenuAction();
      if(!state.loading&&!state.config)await refresh();
      return true;
    }
    state.epoch+=1;
    state.access=access;
    const panel=buildPanel();
    if(!panel)return false;
    panel.hidden=false;
    document.body?.classList.add('aq-v266');
    document.body?.setAttribute('data-v266-ready','true');
    injectMenuAction();
    setTimeout(injectMenuAction,0);
    setTimeout(injectMenuAction,500);
    await refresh();
    return true;
  }

  function seal(){
    state.epoch+=1;
    state.access=null;
    state.config=null;
    state.runs=[];
    state.loading=false;
    const panel=byId('aqariV266Scheduler');
    if(panel){
      panel.hidden=true;
      panel.setAttribute('aria-busy','false');
      renderConfig(null);
      renderRuns([]);
      setMessage('يلزم تسجيل دخول المدير العام.','wait');
    }
    byId('v266MenuAction')?.remove();
    document.body?.removeAttribute('data-v266-ready');
    return true;
  }

  function open(){
    if(!state.access)return false;
    try{if(typeof window.go==='function')window.go('home')}catch(_){ }
    const panel=buildPanel();
    if(!panel)return false;
    panel.hidden=false;
    requestAnimationFrame(function(){
      panel.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
      byId('v266Title')?.focus?.({preventScroll:true});
    });
    refresh({announce:true});
    return true;
  }

  function onBoundary(event){
    if(event?.detail?.state==='ready')resume();
    else if(event?.detail?.state==='locked')seal();
  }

  window.AQARI_V266=Object.freeze({version:RELEASE,refresh,open,resume,seal});
  window.addEventListener('aqari:auth-boundary',onBoundary);

  const start=function(){
    buildPanel();
    if(document.documentElement?.classList.contains('aqari-auth-unlocked'))resume();
    else seal();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
