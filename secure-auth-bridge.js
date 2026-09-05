(function(){
  'use strict';

  const ROLE_MAP = {
    general_manager: { legacy:'admin', local:'مدير عام', label:'مدير عام', write:true },
    property_manager: { legacy:'property', local:'مدير عقار', label:'مدير عقار', write:true },
    accountant: { legacy:'accountant', local:'تحصيل', label:'محاسب', write:true },
    viewer: { legacy:'viewer', local:'مشاهدة فقط', label:'مشاهدة فقط', write:false }
  };
  const SYNC_READY_KEY = 'aqari_cloud_sync_initialized_v198';
  const LAST_REV_KEY = 'aqari_cloud_last_revision';
  const byId = (id) => document.getElementById(id);

  let context = null;
  let remoteState = null;
  let authListenerInstalled = false;
  let authListenerPromise = null;
  let authListenerRetryTimer = 0;
  let authListenerRetryDelay = 1000;
  let bootstrapFlight = null;
  let bootstrapFlightGeneration = 0;
  let bootstrapPending = false;
  let bootstrapPendingUserId = '';
  let authActionRunning = false;
  let authGeneration = 0;

  function safelySeal(action){
    try{ action(); }catch(_){ }
  }

  function sealData(){
    safelySeal(() => window.AQARI_STARTUP_BACKUP?.cancel?.());
    safelySeal(() => window.AQARI_V201?.seal?.());
    safelySeal(() => window.AQARI_V202?.seal?.());
    safelySeal(() => window.AQARI_V205?.seal?.());
    safelySeal(() => window.AQARI_V208?.seal?.());
    safelySeal(() => window.AQARI_V209?.seal?.());
    safelySeal(() => window.AQARI_V210?.seal?.());
    safelySeal(() => window.AQARI_V211?.seal?.());
    safelySeal(() => window.sealWorkspaceDbV198?.());
    safelySeal(() => window.closeWorkspaceIndexedDbV206?.());
    safelySeal(() => window.AQARI_DATA_GATE?.seal());
    safelySeal(() => window.AQARI_EARLY_STORAGE_GATE?.seal());
  }

  function hardResetPage(){
    const target = String(location.origin || '') + String(location.pathname || '/') + String(location.search || '');
    if(typeof location.replace === 'function') location.replace(target);
    else if(typeof location.reload === 'function') location.reload();
  }

  function accessIdentity(value){
    const userId = String(value?.user?.id || '').trim();
    const workspaceId = String(value?.workspace?.id || '').trim();
    const membership = value?.membership;
    const role = String(membership?.role || '').trim();
    if(!userId || !workspaceId || !role || membership?.is_active !== true) return null;
    if(String(membership.user_id || '') !== userId) return null;
    if(String(membership.workspace_id || '') !== workspaceId) return null;
    return { userId, workspaceId, role };
  }

  function sameIdentity(left, right){
    return Boolean(left && right && left.userId === right.userId &&
      left.workspaceId === right.workspaceId && left.role === right.role);
  }

  function requireLiveIdentity(expectedContext){
    const expected = accessIdentity(expectedContext);
    const live = accessIdentity(window.AQARI_SUPABASE?.context);
    if(!sameIdentity(expected, live)) throw new Error('Active workspace changed while loading AQARI data');
    return live;
  }

  function requireRemoteWorkspace(expectedContext, state){
    const expected = requireLiveIdentity(expectedContext);
    if(state?.workspace_id && String(state.workspace_id) !== expected.workspaceId){
      throw new Error('Cloud state does not belong to the active AQARI workspace');
    }
    return expected;
  }

  function roleInfo(){
    return ROLE_MAP[context?.membership?.role] || ROLE_MAP.viewer;
  }

  function errorText(error){
    const raw = String(error?.message || error || 'خطأ غير معروف');
    const marker = raw + ' ' + String(error?.code || '');
    if(/invalid login credentials/i.test(raw)) return 'البريد أو كلمة المرور غير صحيحة.';
    if(/email not confirmed/i.test(raw)) return 'أكد بريدك الإلكتروني أولاً ثم حاول الدخول.';
    if(/user already registered/i.test(raw)) return 'الحساب موجود؛ استخدم زر الدخول.';
    if(/not authorized|membership|workspace/i.test(raw)) return 'هذا الحساب غير مفعل في مساحة عمل عقاري.';
    if(Number(error?.status || error?.statusCode || 0) >= 500 || /unexpected_failure|internal server error|unhandled server error|context canceled|couldn't start a new transaction|database error/i.test(marker)) return 'تعثر الاتصال الآمن مؤقتاً. أعد المحاولة بعد لحظات.';
    if(/failed to fetch|failed to load supabase|supabase js unavailable|network/i.test(raw)) return 'تعذر تحميل الاتصال الآمن. تحقق من الإنترنت ثم أعد المحاولة.';
    return raw;
  }

  function setBusy(value){
    document.querySelectorAll('[data-cloud-auth-action]').forEach((button) => {
      button.disabled = Boolean(value);
    });
  }

  function notice(text, kind = 'wait'){
    for(const id of ['cloudGateMsgV168','cloudMsgV198']){
      const node = byId(id);
      if(!node) continue;
      node.textContent = text;
      node.className = 'aq-v168-msg ' + kind;
    }
  }

  function clearCompatibility(){
    sessionStorage.removeItem('aqari_session_v120');
    for(const key of ['aqari_session_v31','aqari_session_v44']){
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
  }

  function setCompatibility(){
    if(!context?.user || !context?.membership || !context?.workspace) return;
    const role = roleInfo();
    const displayName = context.profile?.display_name || context.user.email || 'مستخدم عقاري';
    sessionStorage.setItem('aqari_session_v120', JSON.stringify({
      username: displayName,
      email: context.user.email || '',
      role: role.local,
      loginAt: new Date().toISOString(),
      source: 'supabase'
    }));
    localStorage.setItem('aqari_session_v31', JSON.stringify({
      name: displayName,
      role: role.legacy,
      source: 'supabase'
    }));
    if(typeof window.applyRole === 'function') window.applyRole(role.legacy);
    const badge = byId('sessionBadge');
    if(badge) badge.textContent = displayName + ' • ' + role.label;
  }

  function hideLegacyGates(){
    for(const id of ['auth','loginGateV120']){
      const node = byId(id);
      if(node){
        node.style.setProperty('display','none','important');
        node.setAttribute('aria-hidden','true');
      }
    }
  }

  function showGate(message, kind = 'wait'){
    authGeneration += 1;
    document.documentElement?.classList.remove('aqari-auth-unlocked');
    const gate = byId('aqariCloudGateV168');
    gate?.removeAttribute('inert');
    gate?.setAttribute('aria-hidden','false');
    gate?.classList.add('on');
    sealData();
    context = null;
    remoteState = null;
    try{ clearCompatibility(); }catch(_){ }
    hideLegacyGates();
    byId('aqariCloudModalV168')?.classList.remove('on');
    updateUI();
    notice(message || 'سجل الدخول بحساب عقاري المصرح.', kind);
    try{window.dispatchEvent?.(new CustomEvent('aqari:auth-boundary',{ detail:{ state:'locked' } }))}catch(_){ }
  }

  function unlock(nextContext, nextRemoteState){
    if(typeof window.activateWorkspaceDbV198 !== 'function') throw new Error('AQARI workspace data boundary unavailable');
    requireRemoteWorkspace(nextContext, nextRemoteState);
    window.activateWorkspaceDbV198(nextContext, nextRemoteState?.payload);
    context = nextContext;
    remoteState = nextRemoteState;
    hideLegacyGates();
    setCompatibility();
    document.documentElement?.classList.add('aqari-auth-unlocked');
    const gate = byId('aqariCloudGateV168');
    gate?.classList.remove('on');
    gate?.setAttribute('aria-hidden','true');
    gate?.setAttribute('inert','');
    updateUI();
    try{window.AQARI_V208?.resume?.(nextContext)}catch(_){window.AQARI_V208?.seal?.()}
    try{window.AQARI_V209?.resume?.(nextContext)}catch(_){window.AQARI_V209?.seal?.()}
    try{window.AQARI_V210?.resume?.(nextContext)}catch(_){window.AQARI_V210?.seal?.()}
    try{window.AQARI_V211?.resume?.(nextContext)}catch(_){window.AQARI_V211?.seal?.()}
    try{ window.AQARI_STARTUP_BACKUP?.schedule?.(); }catch(_){ }
    try{window.dispatchEvent?.(new CustomEvent('aqari:auth-boundary',{ detail:{ state:'ready' } }))}catch(_){ }
  }

  async function loadProfile(expectedContext){
    const client = await window.AQARI_SUPABASE.getClient();
    const userId = expectedContext?.user?.id;
    if(!userId) return null;
    const { data, error } = await client
      .from('aqari_profiles')
      .select('display_name')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    if(error) throw error;
    return data || null;
  }

  async function loadContextCandidate(expectedAccess){
    if(!window.AQARI_SUPABASE) throw new Error('Supabase adapter unavailable');
    const next = await window.AQARI_SUPABASE.refreshContext(expectedAccess);
    if(!next.user) return null;
    if(!accessIdentity(next)){
      await window.AQARI_SUPABASE.signOut().catch(() => {});
      throw new Error('Active workspace membership is required');
    }
    const candidate = { ...next, profile:null };
    candidate.profile = await loadProfile(candidate);
    requireLiveIdentity(candidate);
    return candidate;
  }

  async function loadRemoteCandidate(expectedContext){
    const expectedAccess = requireLiveIdentity(expectedContext);
    const candidate = await window.AQARI_SUPABASE.loadAppState(expectedAccess);
    requireRemoteWorkspace(expectedContext, candidate);
    return candidate;
  }

  async function refreshRemote(){
    const expectedContext = context;
    const generation = authGeneration;
    if(!accessIdentity(expectedContext)) throw new Error('Active workspace membership is required');
    const candidate = await loadRemoteCandidate(expectedContext);
    if(generation !== authGeneration || !sameIdentity(accessIdentity(context), accessIdentity(expectedContext))){
      throw new Error('AQARI session changed while loading cloud state');
    }
    remoteState = candidate;
    updateUI();
    return remoteState;
  }

  function payloadHasData(payload){
    return Boolean(payload && typeof payload === 'object' && Object.keys(payload).length);
  }

  function updateUI(){
    const connected = Boolean(context?.user && context?.membership && context?.workspace);
    const state = byId('cloudStateV198');
    if(state){
      state.className = 'aq-v168-state ' + (connected ? 'ready' : 'wait');
      state.textContent = connected ? '● مرتبط' : '● يتطلب دخول';
    }
    const displayName = context?.profile?.display_name || context?.user?.email || 'غير مسجل';
    const auth = byId('cloudAuthV198');
    if(auth) auth.textContent = connected ? displayName + ' • ' + roleInfo().label : 'غير مسجل';
    const workspace = byId('cloudWorkspaceV198');
    if(workspace) workspace.textContent = context?.workspace?.name || '—';
    const revision = byId('cloudRevisionV198');
    if(revision) revision.textContent = remoteState ? 'مراجعة ' + remoteState.revision : 'لم تُحمّل';
    const sync = byId('cloudSyncV198');
    if(sync){
      const ready = localStorage.getItem(SYNC_READY_KEY) === '1';
      sync.textContent = ready ? 'يدوية فقط — جاهزة' : 'يدوية فقط — تتطلب اختيار نسخة';
    }
    const account = byId('cloudAccountV168');
    if(account){
      account.textContent = connected
        ? (context.user.email + ' • ' + roleInfo().label + ' • ' + context.workspace.name)
        : 'لا توجد جلسة.';
      account.className = 'aq-v168-msg ' + (connected ? 'ready' : 'wait');
    }
  }

  function bindPanelActions(){
    const actions = [
      ['aqariCloudUploadV198', () => window.uploadLocalToCloudV198?.()],
      ['aqariCloudRestoreV198', () => window.restoreCloudToDeviceV198?.()],
      ['aqariCloudAutoV198', () => window.toggleCloudAutoSyncV198?.()],
      ['aqariCloudAccountV198', () => window.openCloudV198?.()]
    ];
    actions.forEach(([id, action]) => {
      const button = byId(id);
      if(!button || button.dataset.aqariBound === '1') return;
      button.dataset.aqariBound = '1';
      button.addEventListener('click', action);
    });
  }

  function buildPanel(){
    const home = byId('home');
    if(!home) return;
    if(byId('aqariV198Cloud')){ bindPanelActions(); return; }
    const box = document.createElement('section');
    box.id = 'aqariV198Cloud';
    box.className = 'aq-v168-cloud';
    box.innerHTML =
      '<div class="aq-v168-head"><div><h3>سحابة عقاري الآمنة</h3><small>Supabase Auth + Workspace RLS + Revision CAS</small></div>'+
      '<div><span class="aq-v168-badge">V198 SUPABASE</span> <span id="cloudStateV198" class="aq-v168-state wait">● يتطلب دخول</span></div></div>'+
      '<div class="aq-v168-grid">'+
      '<div class="aq-v168-card"><b>البيئة</b><small>Supabase Production</small></div>'+
      '<div class="aq-v168-card"><b>الحساب</b><small id="cloudAuthV198">غير مسجل</small></div>'+
      '<div class="aq-v168-card"><b>مساحة العمل</b><small id="cloudWorkspaceV198">—</small></div>'+
      '<div class="aq-v168-card"><b>نسخة السحابة</b><small id="cloudRevisionV198">لم تُحمّل</small></div>'+
      '</div>'+
      '<div class="aq-v168-grid"><div class="aq-v168-card"><b>المزامنة</b><small id="cloudSyncV198">تتطلب اختيار نسخة</small></div></div>'+
      '<div class="aq-v168-actions">'+
      '<button id="aqariCloudUploadV198" class="g" type="button">رفع بيانات هذا الجهاز</button>'+
      '<button id="aqariCloudRestoreV198" type="button">استرجاع السحابة</button>'+
      '<button id="aqariCloudAutoV198" type="button">المزامنة اليدوية فقط</button>'+
      '<button id="aqariCloudAccountV198" type="button">الحساب والأمان</button>'+
      '</div><div class="aq-v168-msg wait" id="cloudMsgV198">الربط جاهز.</div>';
    const anchor = byId('aqariV168Executive') || home.firstChild;
    if(anchor?.parentNode === home) anchor.insertAdjacentElement('afterend', box);
    else home.insertBefore(box, home.firstChild);
    bindPanelActions();
    updateUI();
  }

  function legacyLockV198(){
    const expected = accessIdentity(context);
    const live = accessIdentity(window.AQARI_SUPABASE?.context);
    if(!sameIdentity(expected, live)){
      sealData();
      hideLegacyGates();
      return false;
    }
    return window.cloudLogoutV198();
  }

  function installOverrides(){
    window.login = window.cloudLoginV198;
    window.loginLocalV120 = window.cloudLoginV198;
    window.logout = window.cloudLogoutV198;
    window.lockNowV120 = legacyLockV198;
    window.lockSessionV75 = legacyLockV198;
    window.logoutProductionV75 = () => window.cloudLogoutV198();
    window.cloudLoginV168 = window.cloudLoginV198;
    window.cloudLogoutV168 = window.cloudLogoutV198;
    window.openCloudV168 = window.openCloudV198;
    window.localAccessV120 = () => ({
      username: context?.profile?.display_name || context?.user?.email || 'cloud',
      pin: '',
      role: roleInfo().local
    });
    window.usersV121 = () => context?.user ? [{
      id: context.user.id,
      username: context.profile?.display_name || context.user.email,
      pin: '',
      role: roleInfo().local,
      status: 'نشط',
      source: 'supabase'
    }] : [];
    const cloudOnly = () => notice('إدارة المستخدمين المحلية متوقفة؛ الصلاحيات من Supabase.', 'wait');
    window.saveUsersV121 = cloudOnly;
    window.saveLocalAccessV120 = cloudOnly;
    window.saveUserV121 = cloudOnly;
    if(typeof window.migratePinsV122 === 'function') window.migratePinsV122 = cloudOnly;
    for(const id of ['agUsernameV120','agPinV120','agRoleV120','ucNameV121','ucPinV121','ucRoleV121','ucStatusV121']){
      const node = byId(id);
      if(node) node.disabled = true;
    }
  }

  function installRenderHook(){
    const original = window.render;
    if(typeof original !== 'function' || original.__v198SecureCloud) return;
    const wrapped = function(){
      if(typeof window.prepareWorkspaceDbV198 === 'function') window.prepareWorkspaceDbV198();
      const result = original.apply(this, arguments);
      setTimeout(() => { buildPanel(); updateUI(); }, 0);
      return result;
    };
    wrapped.__v198SecureCloud = true;
    window.render = wrapped;
  }

  async function bootstrapOnce(generation){
    sealData();
    context = null;
    remoteState = null;
    hideLegacyGates();
    buildPanel();
    installOverrides();
    try{
      const active = await loadContextCandidate();
      if(generation !== authGeneration) return;
      if(bootstrapPendingUserId && String(active?.user?.id || '') !== bootstrapPendingUserId) return;
      if(!active){
        showGate('سجل الدخول بحساب عقاري المصرح.', 'wait');
        return;
      }
      const activeRemoteState = await loadRemoteCandidate(active);
      if(generation !== authGeneration) return;
      if(bootstrapPendingUserId && String(active?.user?.id || '') !== bootstrapPendingUserId) return;
      requireRemoteWorkspace(active, activeRemoteState);
      unlock(active, activeRemoteState);
      if(payloadHasData(activeRemoteState?.payload)){
        notice('تم الاتصال. اختر استرجاع السحابة قبل تشغيل المزامنة على هذا الجهاز.', 'wait');
      }else{
        notice('السحابة فارغة. ارفع بيانات هذا الجهاز مرة واحدة لتهيئة المزامنة.', 'wait');
      }
    }catch(error){
      if(generation !== authGeneration) return;
      if(error?.reason === 'AQARI_CONTEXT_SUPERSEDED'){
        bootstrapPending = true;
        return;
      }
      showGate(errorText(error), 'bad');
    }
  }

  function requestBootstrap(){
    if(bootstrapFlight){
      if(authGeneration !== bootstrapFlightGeneration) bootstrapPending = true;
      return bootstrapFlight;
    }

    const generation = ++authGeneration;
    bootstrapFlightGeneration = generation;
    const attempt = bootstrapOnce(generation);
    bootstrapFlight = attempt.finally(() => {
      bootstrapFlight = null;
      if(!bootstrapPending) return;
      const pendingUserId = bootstrapPendingUserId;
      bootstrapPending = false;
      bootstrapPendingUserId = '';
      const live = accessIdentity(context);
      if(live && (!pendingUserId || live.userId === pendingUserId)) return;
      return requestBootstrap();
    });
    return bootstrapFlight;
  }

  window.cloudLoginV198 = async function(){
    setBusy(true);
    try{
      showGate('جاري التحقق من الحساب…', 'wait');
      const email = String(byId('cloudEmailV168')?.value || '').trim().toLowerCase();
      const password = byId('cloudPasswordV168')?.value || '';
      if(!email || !password) throw new Error('أدخل البريد وكلمة المرور.');
      authActionRunning = true;
      await window.AQARI_SUPABASE.signIn(email, password);
      if(byId('cloudPasswordV168')) byId('cloudPasswordV168').value = '';
      notice('تم الدخول؛ جاري تحميل الصلاحيات…', 'wait');
      await requestBootstrap();
    }catch(error){
      notice(errorText(error), 'bad');
      if(error?.code === 'AQARI_ACCESS_DENIED') hardResetPage();
    }finally{
      authActionRunning = false;
      setBusy(false);
    }
  };

  window.cloudSignupV168 = async function(){
    setBusy(true);
    try{
      const email = String(byId('cloudEmailV168')?.value || '').trim().toLowerCase();
      const password = byId('cloudPasswordV168')?.value || '';
      if(!email || !password) throw new Error('أدخل البريد وكلمة المرور.');
      if(password.length < 10) throw new Error('كلمة المرور يجب أن تكون 10 أحرف على الأقل.');
      authActionRunning = true;
      const client = await window.AQARI_SUPABASE.getClient();
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options:{ emailRedirectTo: location.origin }
      });
      if(error) throw error;
      if(byId('cloudPasswordV168')) byId('cloudPasswordV168').value = '';
      if(data?.session) await requestBootstrap();
      else notice('تم إنشاء الحساب. أكد البريد ثم ارجع وسجل الدخول.', 'ready');
    }catch(error){
      notice(errorText(error), 'bad');
    }finally{
      authActionRunning = false;
      setBusy(false);
    }
  };

  window.cloudRecoveryV168 = async function(){
    setBusy(true);
    try{
      const email = String(byId('cloudEmailV168')?.value || '').trim().toLowerCase();
      if(!email) throw new Error('أدخل البريد الإلكتروني أولاً.');
      const client = await window.AQARI_SUPABASE.getClient();
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo:location.origin });
      if(error) throw error;
      notice('إذا كان الحساب موجودًا ستصل رسالة استعادة كلمة المرور.', 'ready');
    }catch(error){
      notice(errorText(error), 'bad');
    }finally{
      setBusy(false);
    }
  };

  window.cloudLogoutV198 = async function(){
    window.AQARI_AUTOSYNC?.disable();
    localStorage.removeItem(SYNC_READY_KEY);
    showGate('جاري تسجيل الخروج…', 'wait');
    try{
      await window.AQARI_SUPABASE.signOut();
    }catch(signOutError){
      try{
        if(typeof window.AQARI_SUPABASE.clearPersistedSession !== 'function' ||
           typeof window.AQARI_SUPABASE.verifySessionNull !== 'function') throw signOutError;
        window.AQARI_SUPABASE.clearPersistedSession();
        await window.AQARI_SUPABASE.verifySessionNull();
      }catch(clearError){
        showGate('تعذر إكمال تسجيل الخروج. بقيت المنصة مقفلة؛ تحقق من الاتصال ثم أعد المحاولة.', 'bad');
        return false;
      }
    }
    showGate('تم تسجيل الخروج بأمان.', 'ready');
    hardResetPage();
    return true;
  };

  window.uploadLocalToCloudV198 = async function(){
    try{
      const current = await refreshRemote();
      if(payloadHasData(current?.payload)){
        throw new Error('السحابة تحتوي بيانات. استرجعها أولاً؛ لن يتم الاستبدال تلقائيًا.');
      }
      if(!window.confirm('رفع بيانات عقاري الأساسية الموجودة على هذا الجهاز إلى السحابة؟')) return;
      notice('جاري الرفع والتحقق…', 'wait');
      const saved = await window.AQARI_CLOUD_SYNC.uploadLocal();
      remoteState = saved;
      localStorage.setItem(SYNC_READY_KEY, '1');
      localStorage.setItem(LAST_REV_KEY, String(saved.revision));
      notice('تم الرفع والتحقق • المراجعة ' + saved.revision, 'ready');
      updateUI();
    }catch(error){
      notice(errorText(error), 'bad');
    }
  };

  window.restoreCloudToDeviceV198 = async function(){
    try{
      const current = await refreshRemote();
      if(!payloadHasData(current?.payload)) throw new Error('لا توجد بيانات سحابية للاسترجاع.');
      if(!window.confirm('سيتم استبدال بيانات عقاري الأساسية على هذا الجهاز بالنسخة السحابية. متابعة؟')) return;
      notice('جاري الاسترجاع والتحقق…', 'wait');
      const result = await window.AQARI_CLOUD_SYNC.restoreCloudToLocal({ overwrite:true });
      localStorage.setItem(SYNC_READY_KEY, '1');
      localStorage.setItem(LAST_REV_KEY, String(result.revision));
      notice('تم الاسترجاع • المراجعة ' + result.revision, 'ready');
      setTimeout(() => location.reload(), 350);
    }catch(error){
      notice(errorText(error), 'bad');
    }
  };

  window.toggleCloudAutoSyncV198 = function(){
    window.AQARI_AUTOSYNC?.disable();
    notice('المزامنة التلقائية متوقفة في V198. استخدم الرفع أو الاسترجاع اليدوي الصريح.', 'wait');
    updateUI();
  };

  window.openCloudV198 = function(){
    updateUI();
    byId('aqariCloudModalV168')?.classList.add('on');
  };
  window.closeCloudV168 = function(){
    byId('aqariCloudModalV168')?.classList.remove('on');
    if(byId('cloudNewPasswordV168')) byId('cloudNewPasswordV168').value = '';
  };
  window.changeCloudPasswordV168 = async function(){
    try{
      const password = byId('cloudNewPasswordV168')?.value || '';
      if(password.length < 10) throw new Error('كلمة المرور يجب أن تكون 10 أحرف على الأقل.');
      const client = await window.AQARI_SUPABASE.getClient();
      const { error } = await client.auth.updateUser({ password });
      if(error) throw error;
      if(byId('cloudNewPasswordV168')) byId('cloudNewPasswordV168').value = '';
      notice('تم تغيير كلمة المرور.', 'ready');
    }catch(error){
      notice(errorText(error), 'bad');
    }
  };

  window.cloudLogoutV168 = window.cloudLogoutV198;
  window.uploadLocalToCloudV168 = window.uploadLocalToCloudV198;
  window.restoreCloudToDeviceV168 = window.restoreCloudToDeviceV198;
  window.toggleCloudAutoSyncV168 = window.toggleCloudAutoSyncV198;
  window.openCloudV168 = window.openCloudV198;

  function handleAuthStateChange(event, session){
    const previousIdentity = accessIdentity(context);
    if(event === 'SIGNED_OUT'){
      bootstrapPending = false;
      bootstrapPendingUserId = '';
      showGate('سجل الدخول بحساب عقاري المصرح.', 'wait');
      if(previousIdentity) hardResetPage();
      return;
    }
    if(['SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED','MFA_CHALLENGE_VERIFIED'].includes(event) && session?.user){
      if(previousIdentity){
        if(String(session.user.id || '') !== previousIdentity.userId){
          bootstrapPending = false;
          bootstrapPendingUserId = '';
          showGate('تم تغيير الحساب؛ جاري إعادة تحميل المنصة بأمان…', 'wait');
          hardResetPage();
          return;
        }
        setTimeout(() => revalidateActiveSession(), 0);
        return;
      }
      if(authActionRunning) return;
      const eventUserId = String(session.user.id || '').trim();
      if(bootstrapFlight){
        bootstrapPending = true;
        bootstrapPendingUserId = eventUserId;
        notice('جاري التحقق من مساحة العمل…', 'wait');
        return;
      }
      showGate('جاري التحقق من مساحة العمل…', 'wait');
      requestBootstrap();
    }
  }

  async function installAuthListener(){
    if(authListenerInstalled) return true;
    if(authListenerPromise) return authListenerPromise;

    const pending = (async () => {
      const client = await window.AQARI_SUPABASE.getClient();
      client.auth.onAuthStateChange((event, session) => {
        // Supabase holds its auth lock while this callback runs. Defer every
        // state transition so rendering or session checks cannot deadlock the
        // client and leave the workspace gate waiting forever.
        setTimeout(() => handleAuthStateChange(event, session), 0);
      });
      authListenerInstalled = true;
      authListenerRetryDelay = 1000;
      if(authListenerRetryTimer){
        clearTimeout(authListenerRetryTimer);
        authListenerRetryTimer = 0;
      }
      return true;
    })();

    authListenerPromise = pending;
    try{
      return await pending;
    }finally{
      if(authListenerPromise === pending) authListenerPromise = null;
    }
  }

  function scheduleAuthListenerRetry(){
    if(authListenerInstalled || authListenerRetryTimer) return;
    const delay = authListenerRetryDelay;
    authListenerRetryDelay = Math.min(authListenerRetryDelay * 2, 30000);
    authListenerRetryTimer = setTimeout(() => {
      authListenerRetryTimer = 0;
      installAuthListener().catch(scheduleAuthListenerRetry);
    }, delay);
  }

  let revalidationRunning = false;
  async function revalidateActiveSession(){
    if(revalidationRunning || !context?.user || document.hidden) return;
    revalidationRunning = true;
    const generation = authGeneration;
    const currentIdentity = accessIdentity(context);
    try{
      const candidate = await loadContextCandidate(currentIdentity);
      if(generation !== authGeneration) return;
      if(!candidate || !sameIdentity(currentIdentity, accessIdentity(candidate))){
        showGate('تم تغيير صلاحية الحساب؛ جاري إعادة تحميل المنصة بأمان…', 'wait');
        hardResetPage();
      }
    }catch(error){
      if(error?.reason === 'AQARI_CONTEXT_SUPERSEDED') return;
      if(generation === authGeneration) showGate(errorText(error), 'bad');
    }finally{
      revalidationRunning = false;
    }
  }

  function installRevalidation(){
    window.addEventListener('focus', () => {
      if(!authListenerInstalled) installAuthListener().catch(scheduleAuthListenerRetry);
      if(context?.user) try{ window.AQARI_STARTUP_BACKUP?.schedule?.(); }catch(_){ }
      setTimeout(revalidateActiveSession, 0);
    });
    document.addEventListener('visibilitychange', () => {
      if(!document.hidden){
        if(!authListenerInstalled) installAuthListener().catch(scheduleAuthListenerRetry);
        if(context?.user) try{ window.AQARI_STARTUP_BACKUP?.schedule?.(); }catch(_){ }
        setTimeout(revalidateActiveSession, 0);
      }
    });
    setInterval(revalidateActiveSession, 5 * 60 * 1000);
  }

  async function start(){
    hideLegacyGates();
    installOverrides();
    installRenderHook();
    installRevalidation();
    setBusy(true);
    const listenerReady = installAuthListener().catch(() => {
      scheduleAuthListenerRetry();
      return false;
    });
    try{
      await requestBootstrap();
    }finally{
      setBusy(false);
    }
    await listenerReady;
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', start, { once:true });
  }else{
    start();
  }
})();
