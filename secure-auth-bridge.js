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

  function roleInfo(){
    return ROLE_MAP[context?.membership?.role] || ROLE_MAP.viewer;
  }

  function errorText(error){
    const raw = String(error?.message || error || 'خطأ غير معروف');
    if(/invalid login credentials/i.test(raw)) return 'البريد أو كلمة المرور غير صحيحة.';
    if(/email not confirmed/i.test(raw)) return 'أكد بريدك الإلكتروني أولاً ثم حاول الدخول.';
    if(/user already registered/i.test(raw)) return 'الحساب موجود؛ استخدم زر الدخول.';
    if(/not authorized|membership|workspace/i.test(raw)) return 'هذا الحساب غير مفعل في مساحة عمل عقاري.';
    if(/failed to fetch|network/i.test(raw)) return 'تعذر الاتصال بالخدمة السحابية. تحقق من الإنترنت.';
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
    context = null;
    remoteState = null;
    clearCompatibility();
    hideLegacyGates();
    byId('aqariCloudGateV168')?.classList.add('on');
    updateUI();
    notice(message || 'سجل الدخول بحساب عقاري المصرح.', kind);
  }

  function unlock(){
    hideLegacyGates();
    setCompatibility();
    byId('aqariCloudGateV168')?.classList.remove('on');
    updateUI();
  }

  async function loadProfile(){
    const client = await window.AQARI_SUPABASE.getClient();
    const userId = context?.user?.id;
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

  async function refreshContext(){
    if(!window.AQARI_SUPABASE) throw new Error('Supabase adapter unavailable');
    const next = await window.AQARI_SUPABASE.refreshContext();
    if(!next.user) return null;
    if(!next.membership?.is_active || !next.workspace?.id){
      await window.AQARI_SUPABASE.signOut().catch(() => {});
      throw new Error('Active workspace membership is required');
    }
    context = { ...next, profile:null };
    context.profile = await loadProfile();
    return context;
  }

  async function refreshRemote(){
    remoteState = await window.AQARI_SUPABASE.loadAppState();
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

  function buildPanel(){
    const home = byId('home');
    if(!home || byId('aqariV198Cloud')) return;
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
      '<button class="g" type="button" onclick="uploadLocalToCloudV198()">رفع بيانات هذا الجهاز</button>'+
      '<button type="button" onclick="restoreCloudToDeviceV198()">استرجاع السحابة</button>'+
      '<button type="button" onclick="toggleCloudAutoSyncV198()">المزامنة اليدوية فقط</button>'+
      '<button type="button" onclick="openCloudV198()">الحساب والأمان</button>'+
      '</div><div class="aq-v168-msg wait" id="cloudMsgV198">الربط جاهز.</div>';
    const anchor = byId('aqariV168Executive') || home.firstChild;
    if(anchor?.parentNode === home) anchor.insertAdjacentElement('afterend', box);
    else home.insertBefore(box, home.firstChild);
    updateUI();
  }

  function installOverrides(){
    window.login = window.cloudLoginV198;
    window.loginLocalV120 = window.cloudLoginV198;
    window.logout = window.cloudLogoutV198;
    window.lockNowV120 = () => showGate('سجل الدخول بحساب عقاري المصرح.', 'wait');
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
      const result = original.apply(this, arguments);
      setTimeout(() => { buildPanel(); updateUI(); }, 0);
      return result;
    };
    wrapped.__v198SecureCloud = true;
    window.render = wrapped;
  }

  async function bootstrap(){
    hideLegacyGates();
    buildPanel();
    installOverrides();
    try{
      const active = await refreshContext();
      if(!active){
        showGate('سجل الدخول بحساب عقاري المصرح.', 'wait');
        return;
      }
      await refreshRemote();
      unlock();
      if(payloadHasData(remoteState?.payload)){
        notice('تم الاتصال. اختر استرجاع السحابة قبل تشغيل المزامنة على هذا الجهاز.', 'wait');
      }else{
        notice('السحابة فارغة. ارفع بيانات هذا الجهاز مرة واحدة لتهيئة المزامنة.', 'wait');
      }
    }catch(error){
      showGate(errorText(error), 'bad');
    }
  }

  window.cloudLoginV198 = async function(){
    setBusy(true);
    try{
      const email = String(byId('cloudEmailV168')?.value || '').trim().toLowerCase();
      const password = byId('cloudPasswordV168')?.value || '';
      if(!email || !password) throw new Error('أدخل البريد وكلمة المرور.');
      await window.AQARI_SUPABASE.signIn(email, password);
      if(byId('cloudPasswordV168')) byId('cloudPasswordV168').value = '';
      notice('تم الدخول؛ جاري تحميل الصلاحيات…', 'wait');
      await bootstrap();
    }catch(error){
      notice(errorText(error), 'bad');
    }finally{
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
      const client = await window.AQARI_SUPABASE.getClient();
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options:{ emailRedirectTo: location.origin }
      });
      if(error) throw error;
      if(byId('cloudPasswordV168')) byId('cloudPasswordV168').value = '';
      if(data?.session) await bootstrap();
      else notice('تم إنشاء الحساب. أكد البريد ثم ارجع وسجل الدخول.', 'ready');
    }catch(error){
      notice(errorText(error), 'bad');
    }finally{
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
    await window.AQARI_SUPABASE.signOut().catch(() => {});
    showGate('تم تسجيل الخروج بأمان.', 'ready');
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

  async function installAuthListener(){
    if(authListenerInstalled) return;
    authListenerInstalled = true;
    const client = await window.AQARI_SUPABASE.getClient();
    client.auth.onAuthStateChange((event) => {
      if(event === 'SIGNED_OUT') showGate('سجل الدخول بحساب عقاري المصرح.', 'wait');
    });
  }

  async function start(){
    hideLegacyGates();
    installOverrides();
    installRenderHook();
    await installAuthListener().catch(() => {});
    await bootstrap();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', start, { once:true });
  }else{
    start();
  }
})();
