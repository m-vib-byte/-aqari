(function(){
  'use strict';

  const cfg = window.AQARI_PUBLIC_CONFIG || {};
  const AUTH_STORAGE_KEY = String(
    cfg.supabaseAuthStorageKey || cfg.supabaseStorageKey || 'aqari-supabase-auth-v198'
  ).trim() || 'aqari-supabase-auth-v198';
  const WRITE_ROLES = new Set(['general_manager', 'property_manager', 'accountant']);
  const state = { client:null, user:null, membership:null, workspace:null, profile:null };
  let clientPromise = null;
  let clientEpoch = 0;
  let contextEpoch = 0;
  let contextRefresh = null;
  let contextVerifiedAt = 0;

  // The startup snapshot avoids repeated SDK auth-lock acquisition between
  // table reads. All requests still carry this user's JWT and obey server RLS.
  const startupFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
  let startupSnapshot = null;

  function startupProgress(stage){
    const gate = document.getElementById?.('aqariCloudGateV168');
    gate?.setAttribute('data-auth-stage', stage);
  }

  function startupJson(path, session, deadlineAt, body){
    let timer;
    const controller = new AbortController();
    const request = startupFetch(String(cfg.supabaseUrl).replace(/\/$/,'') + path, {
      method:body === undefined ? 'GET' : 'POST',
      headers:{ apikey:cfg.supabasePublishableKey, Authorization:'Bearer ' + session.access_token,
        Accept:'application/json', ...(body === undefined ? {} : {'Content-Type':'application/json'}) },
      body:body === undefined ? undefined : JSON.stringify(body),
      signal:controller.signal, cache:'no-store', credentials:'omit', redirect:'error'
    }).then(async response => {
      if(!response.ok){
        const error = accessError(response.status === 401 || response.status === 403
          ? 'AQARI workspace access could not be verified' : 'AQARI startup connection failed');
        error.status = response.status;
        throw error;
      }
      return response.json();
    });
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error('تعذر إكمال تحميل الحساب. أعد المحاولة.');
        error.code = 'AQARI_STARTUP_TIMEOUT';
        reject(error);
        controller.abort();
      }, Math.max(0, deadlineAt - Date.now()));
    });
    return Promise.race([request, timeout]).finally(() => clearTimeout(timer));
  }

  function snapshotContext(client, user, snapshot, expected){
    if(!snapshot || snapshot.user_id !== user?.id) throw accessError();
    const next = {client,user,membership:snapshot.membership,workspace:snapshot.workspace,profile:snapshot.profile};
    requireExactAccess(next, expected);
    if(next.profile?.user_id !== user.id) throw accessError();
    if(snapshot.app_state && snapshot.app_state.workspace_id !== next.workspace.id) throw accessError();
    return next;
  }

  async function fastStartupContext(client, session, refreshEpoch){
    const deadlineAt = Date.now() + 10000;
    startupProgress('verify-user');
    const user = await startupJson('/auth/v1/user', session, deadlineAt);
    assertContextEpoch(refreshEpoch);
    if(user?.id !== session.user.id) throw accessError();
    startupProgress('workspace-snapshot');
    const snapshot = await startupJson('/rest/v1/rpc/aqari_startup_snapshot_v266', session, deadlineAt,
      {p_workspace_id:null,p_expected_role:null,p_include_payload:true});
    assertContextEpoch(refreshEpoch);
    const next = snapshotContext(client, user, snapshot, {userId:user.id});
    const {data:finalData,error:finalError} = await client.auth.getSession();
    assertContextEpoch(refreshEpoch);
    if(finalError) throw finalError;
    if(finalData.session?.user?.id !== user.id) throw accessError();
    Object.assign(state, next);
    contextVerifiedAt = Date.now();
    startupSnapshot = {epoch:refreshEpoch, session, data:snapshot.app_state || null};
    return {...state};
  }

  async function consumeStartupSnapshot(expected){
    const snapshot = startupSnapshot;
    startupSnapshot = null; // one-shot, in-memory only; never persisted
    const bound = requireExactAccess(state, expected);
    const client = state.client;
    const deadlineAt = Date.now() + 10000;
    startupProgress('confirm-access');
    // Server-side revalidation AFTER fetching the payload remains mandatory.
    // A revoked membership, disabled account, or role/workspace change discards it.
    const [user, confirmation] = await Promise.all([
      startupJson('/auth/v1/user', snapshot.session, deadlineAt),
      startupJson('/rest/v1/rpc/aqari_startup_snapshot_v266', snapshot.session, deadlineAt,
        {p_workspace_id:bound.workspaceId,p_expected_role:bound.role,p_include_payload:false})
    ]);
    assertContextEpoch(snapshot.epoch);
    snapshotContext(client, user, confirmation, bound);
    const {data:finalData,error:finalError} = await client.auth.getSession();
    assertContextEpoch(snapshot.epoch);
    if(finalError) throw finalError;
    if(finalData.session?.user?.id !== bound.userId) throw accessError();
    requireExactAccess(state, bound);
    return snapshot.data;
  }

  function resetContext(){
    startupSnapshot = null;
    contextVerifiedAt = 0;
    state.user = null;
    state.membership = null;
    state.workspace = null;
    state.profile = null;
  }

  function revisionConflict(currentRevision){
    const error = new Error('Revision conflict');
    error.code = 'AQARI_REVISION_CONFLICT';
    error.currentRevision = currentRevision;
    return error;
  }

  function accessError(message = 'AQARI account or workspace access changed'){
    const error = new Error(message);
    error.code = 'AQARI_ACCESS_CHANGED';
    return error;
  }

  function assertContextEpoch(epoch){
    if(epoch === contextEpoch) return;
    const error = accessError('AQARI authentication context refresh was superseded');
    error.reason = 'AQARI_CONTEXT_SUPERSEDED';
    throw error;
  }

  function resetContextAt(epoch){
    assertContextEpoch(epoch);
    resetContext();
  }

  function cleanAccess(value){
    if(!value || typeof value !== 'object') return null;
    const userId = String(value.userId || value.user?.id || '').trim();
    const workspaceId = String(value.workspaceId || value.workspace?.id || value.membership?.workspace_id || '').trim();
    const role = String(value.role || value.membership?.role || '').trim();
    if(!userId && !workspaceId && !role) return null;
    return Object.freeze({ userId, workspaceId, role });
  }

  function contextAccess(context = state){
    return cleanAccess({
      userId:context?.user?.id,
      workspaceId:context?.membership?.workspace_id || context?.workspace?.id,
      role:context?.membership?.role
    });
  }

  function requireExactAccess(context, expectedAccess, { write = false } = {}){
    const live = contextAccess(context);
    if(!live?.userId || !live?.workspaceId || !live?.role ||
       context?.membership?.user_id !== live.userId ||
       context?.membership?.workspace_id !== live.workspaceId ||
       context?.workspace?.id !== live.workspaceId ||
       context?.membership?.is_active !== true){
      throw accessError('Authentication and active workspace membership are required');
    }
    const expected = cleanAccess(expectedAccess);
    if(expected && ((expected.userId && expected.userId !== live.userId) ||
       (expected.workspaceId && expected.workspaceId !== live.workspaceId) ||
       (expected.role && expected.role !== live.role))){
      throw accessError();
    }
    if(write && !WRITE_ROLES.has(live.role)){
      const error = new Error('Current role does not allow app-state writes');
      error.code = 'AQARI_WRITE_FORBIDDEN';
      throw error;
    }
    return Object.freeze({ userId:live.userId, workspaceId:live.workspaceId, role:live.role });
  }

  async function ensureLibrary(){
    if(window.supabase?.createClient) return window.supabase;
    await new Promise((resolve, reject) => {
      let script = document.querySelector('script[data-aqari-supabase]');
      if(script?.dataset?.aqariState === 'failed' || script?.dataset?.aqariState === 'loaded'){
        script.remove();
        script = null;
      }
      const created = !script;
      if(!script){
        script = document.createElement('script');
        script.src = '/vendor/supabase-js-2.114.0.js';
        script.async = true;
        script.integrity = 'sha384-0UK+HVlz5Y7F//atDpPysyocv/PjGXQoBX+XSaL/eEotARW8rPFh+lL5sO0Ljzfi';
        script.crossOrigin = 'anonymous';
        script.dataset.aqariSupabase = 'true';
        script.dataset.aqariState = 'loading';
      }

      let settled = false;
      const cleanup = () => {
        clearTimeout(timer);
        script.removeEventListener('load', loaded);
        script.removeEventListener('error', failed);
      };
      const loaded = () => {
        if(settled) return;
        settled = true;
        script.dataset.aqariState = 'loaded';
        cleanup();
        resolve();
      };
      const failed = () => {
        if(settled) return;
        settled = true;
        script.dataset.aqariState = 'failed';
        cleanup();
        script.remove();
        reject(new Error('Failed to load Supabase JS'));
      };
      const timer = setTimeout(failed, 12000);
      script.addEventListener('load', loaded, { once:true });
      script.addEventListener('error', failed, { once:true });
      if(created) document.head.appendChild(script);
    });
    if(!window.supabase?.createClient){
      document.querySelector('script[data-aqari-supabase]')?.remove();
      throw new Error('Supabase JS unavailable');
    }
    return window.supabase;
  }

  async function getClient(){
    if(state.client) return state.client;
    if(clientPromise) return clientPromise;
    if(!cfg.supabaseUrl || !cfg.supabasePublishableKey){
      throw new Error('AQARI Supabase public configuration is missing');
    }
    const epoch = clientEpoch;
    const pending = ensureLibrary()
      .then((lib) => {
        const client = lib.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: AUTH_STORAGE_KEY
          }
        });
        if(epoch !== clientEpoch){
          try{ client.auth.stopAutoRefresh(); }catch(_){ }
          throw accessError('AQARI authentication session was cleared');
        }
        state.client = client;
        return client;
      })
      .catch((error) => {
        if(clientPromise === pending) clientPromise = null;
        throw error;
      });
    clientPromise = pending;
    return clientPromise;
  }

  async function loadContextAt(expected, refreshEpoch){
    const client = await getClient();
    assertContextEpoch(refreshEpoch);
    const { data:sessionData, error:sessionError } = await client.auth.getSession();
    assertContextEpoch(refreshEpoch);
    if(sessionError) throw sessionError;
    const sessionUserId = String(sessionData.session?.user?.id || '').trim();
    if(!sessionUserId){
      resetContextAt(refreshEpoch);
      if(expected) throw accessError();
      return { ...state };
    }
    if(expected?.userId && expected.userId !== sessionUserId) throw accessError();

    if(!expected && startupFetch && sessionData.session?.access_token){
      return fastStartupContext(client, sessionData.session, refreshEpoch);
    }
    startupSnapshot = null;
    const { data:userData, error:userError } = await client.auth.getUser();
    assertContextEpoch(refreshEpoch);
    if(userError) throw userError;
    const user = userData.user || null;
    const userId = String(user?.id || '').trim();
    if(!userId || userId !== sessionUserId || (expected?.userId && expected.userId !== userId)){
      resetContextAt(refreshEpoch);
      throw accessError();
    }

    let membershipQuery = client
      .from('aqari_memberships')
      .select('workspace_id, user_id, role, is_active, created_at')
      .eq('user_id', userId)
      .eq('is_active', true);
    if(expected?.workspaceId) membershipQuery = membershipQuery.eq('workspace_id', expected.workspaceId);
    const { data:membership, error:membershipError } = await membershipQuery
      .limit(1)
      .maybeSingle();
    assertContextEpoch(refreshEpoch);
    if(membershipError) throw membershipError;
    const workspaceId = String(membership?.workspace_id || '').trim();
    const role = String(membership?.role || '').trim();
    if(!membership || membership.user_id !== userId || membership.is_active !== true || !workspaceId || !role ||
       (expected?.workspaceId && expected.workspaceId !== workspaceId) ||
       (expected?.role && expected.role !== role)){
      resetContextAt(refreshEpoch);
      if(expected) throw accessError();
    }

    // These independent RLS-protected reads do not need two network round trips.
    // Keep both results local until the final session/epoch check has succeeded.
    const [workspaceResult, profileResult] = await Promise.all([
      workspaceId ? client.from('aqari_workspaces')
        .select('id, name, slug, created_at')
        .eq('id', workspaceId).maybeSingle() : Promise.resolve({ data:null, error:null }),
      client.from('aqari_profiles')
        .select('user_id, display_name, created_at, updated_at')
        .eq('user_id', userId).maybeSingle()
    ]);
    assertContextEpoch(refreshEpoch);
    if(workspaceResult.error) throw workspaceResult.error;
    const { error:profileError } = profileResult;
    if(profileError) throw profileError;
    const workspace = workspaceResult.data || null;
    const profile = profileResult.data || null;
    if(workspaceId && (!workspace || workspace.id !== workspaceId)){
      resetContextAt(refreshEpoch);
      if(expected) throw accessError();
    }

    const { data:finalSessionData, error:finalSessionError } = await client.auth.getSession();
    assertContextEpoch(refreshEpoch);
    if(finalSessionError) throw finalSessionError;
    if(String(finalSessionData.session?.user?.id || '').trim() !== userId) {
      resetContextAt(refreshEpoch);
      throw accessError();
    }

    const nextContext = {
      client,
      user,
      membership:membership || null,
      workspace,
      profile:profile || null
    };
    if(expected) requireExactAccess(nextContext, expected);
    assertContextEpoch(refreshEpoch);
    state.user = nextContext.user;
    state.membership = nextContext.membership;
    state.workspace = nextContext.workspace;
    state.profile = nextContext.profile;
    contextVerifiedAt = Date.now();
    return { ...state };
  }

  function refreshContext(expectedAccess){
    const expected = cleanAccess(expectedAccess);
    const refreshKey = expected ? JSON.stringify(expected) : '';
    if(refreshKey && contextRefresh?.key === refreshKey) return contextRefresh.promise;

    const refreshEpoch = ++contextEpoch;
    if(!refreshKey) contextRefresh = null;
    const pending = loadContextAt(expected, refreshEpoch).finally(() => {
      if(contextRefresh?.promise === pending) contextRefresh = null;
    });
    if(refreshKey) contextRefresh = { key:refreshKey, promise:pending };
    return pending;
  }

  async function signIn(email, password){
    const client = await getClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if(error) throw error;
    const context = await refreshContext();
    if(!context.membership || !context.workspace || !context.profile){
      await client.auth.signOut().catch(() => {});
      clearPersistedSession();
      const accessError = new Error('Account is not authorized for an active AQARI workspace');
      accessError.code = 'AQARI_ACCESS_DENIED';
      throw accessError;
    }
    return data;
  }

  async function signUp(email, password, options = {}){
    const client = await getClient();
    const { data, error } = await client.auth.signUp({ email, password, options });
    if(error) throw error;
    if(data.session) await refreshContext();
    return data;
  }

  async function resetPasswordForEmail(email, redirectTo = location.origin){
    const client = await getClient();
    const { data, error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
    if(error) throw error;
    return data;
  }

  async function updatePassword(password){
    const client = await getClient();
    const { data, error } = await client.auth.updateUser({ password });
    if(error) throw error;
    return data;
  }

  async function onAuthStateChange(callback){
    const client = await getClient();
    return client.auth.onAuthStateChange(callback);
  }

  function isConfiguredAuthStorageKey(key){
    const value = String(key || '');
    return value === AUTH_STORAGE_KEY ||
      value.startsWith(AUTH_STORAGE_KEY + '-') ||
      value.startsWith(AUTH_STORAGE_KEY + '.') ||
      value.startsWith(AUTH_STORAGE_KEY + ':');
  }

  function clearPersistedSession(){
    const previousClient = state.client;
    clientEpoch += 1;
    contextEpoch += 1;
    contextRefresh = null;
    clientPromise = null;
    state.client = null;
    resetContext();
    try{ previousClient?.auth?.stopAutoRefresh?.(); }catch(_){ }

    let cleared = 0;
    try{
      // Let Supabase use its guarded localStorage detection and memory fallback.
      // Do not touch sessionStorage here: some embedded WebKit contexts can stall
      // while accessing it, including while recovering from a login timeout.
      const storage = window.localStorage;
      const keys = [];
      for(let index = 0; index < Number(storage?.length || 0); index += 1){
        const key = storage.key(index);
        if(key !== null) keys.push(String(key));
      }
      if(!keys.includes(AUTH_STORAGE_KEY)) keys.push(AUTH_STORAGE_KEY);
      for(const key of keys){
        if(!isConfiguredAuthStorageKey(key)) continue;
        try{
          if(storage.getItem(key) !== null) cleared += 1;
          storage.removeItem(key);
        }catch(_){ }
      }
    }catch(_){ }
    return Object.freeze({ cleared, storageKey:AUTH_STORAGE_KEY });
  }

  async function getSession(){
    const client = await getClient();
    const { data, error } = await client.auth.getSession();
    if(error) throw error;
    return data?.session || null;
  }

  async function hasSession(){
    const session = await getSession();
    return Boolean(session?.user?.id);
  }

  async function verifySessionNull(){
    const session = await getSession();
    if(session){
      const error = new Error('AQARI authentication session is still active');
      error.code = 'AQARI_SESSION_REMAINS';
      throw error;
    }
    return true;
  }

  async function signOut(){
    const client = await getClient();
    const { error } = await client.auth.signOut();
    if(error) throw error;
    clearPersistedSession();
  }

  async function bindAccess(expectedAccess, options){
    const context = await refreshContext(expectedAccess);
    return requireExactAccess(context, expectedAccess, options);
  }

  async function recheckBoundAccess(boundAccess, options){
    const context = await refreshContext(boundAccess);
    return requireExactAccess(context, boundAccess, options);
  }

  async function loadAppState(expectedAccess, { reuseVerifiedContext = false } = {}){
    // Startup has just authenticated this exact context in this document. Reuse
    // only that fresh in-memory result, never a localStorage authorization flag.
    // The mandatory post-read server revalidation below is NOT skipped. A role,
    // user, workspace or membership change therefore discards the entire payload.
    // Manual reads/writes retain their original full preflight by default.
    const expected = cleanAccess(expectedAccess);
    const age = Date.now() - contextVerifiedAt;
    const canReuse = reuseVerifiedContext && expected?.userId && expected?.workspaceId &&
      expected?.role && contextVerifiedAt > 0 && age >= 0 && age < 5000;
    if(canReuse && startupSnapshot?.epoch === contextEpoch){
      return consumeStartupSnapshot(expected);
    }
    const boundAccess = canReuse
      ? requireExactAccess(state, expected)
      : await bindAccess(expectedAccess);
    const client = await getClient();
    const { data, error } = await client
      .from('aqari_app_state')
      .select('workspace_id, payload, revision, updated_by, updated_at')
      .eq('workspace_id', boundAccess.workspaceId)
      .maybeSingle();
    if(error) throw error;
    if(data && data.workspace_id !== boundAccess.workspaceId) throw accessError('Cloud state workspace does not match authenticated access');
    await recheckBoundAccess(boundAccess);
    return data || null;
  }

  async function saveAppState(payload, expectedRevision, expectedAccess){
    const boundAccess = await bindAccess(expectedAccess, { write:true });
    const current = await loadAppState(boundAccess);
    const expected = Number(expectedRevision);

    if(current){
      const currentRevision = Number(current.revision);
      if(!Number.isInteger(expected) || expected !== currentRevision){
        throw revisionConflict(currentRevision);
      }
      await recheckBoundAccess(boundAccess, { write:true });
      const client = state.client;
      if(!client) throw accessError();
      const { data, error } = await client
        .from('aqari_app_state')
        .update({ payload })
        .eq('workspace_id', boundAccess.workspaceId)
        .eq('revision', expected)
        .select('workspace_id, payload, revision, updated_by, updated_at')
        .maybeSingle();
      if(error) throw error;
      if(!data) throw revisionConflict(currentRevision);
      if(data.workspace_id !== boundAccess.workspaceId) throw accessError('Saved cloud state workspace does not match authenticated access');
      await recheckBoundAccess(boundAccess, { write:true });
      return data;
    }

    if(expected !== 0) throw revisionConflict(null);
    await recheckBoundAccess(boundAccess, { write:true });
    const client = state.client;
    if(!client) throw accessError();
    const { data, error } = await client
      .from('aqari_app_state')
      .insert({ workspace_id:boundAccess.workspaceId, payload })
      .select('workspace_id, payload, revision, updated_by, updated_at')
      .single();
    if(error?.code === '23505') throw revisionConflict(null);
    if(error) throw error;
    if(!data || data.workspace_id !== boundAccess.workspaceId) throw accessError('Saved cloud state workspace does not match authenticated access');
    await recheckBoundAccess(boundAccess, { write:true });
    return data;
  }

  window.AQARI_SUPABASE = Object.freeze({
    version:'V206.2', getClient, refreshContext, signIn, signUp, signOut,
    resetPasswordForEmail, updatePassword, onAuthStateChange, loadAppState, saveAppState,
    clearPersistedSession, getSession, hasSession, verifySessionNull,
    authStorageKey:AUTH_STORAGE_KEY,
    get context(){ return { ...state }; }
  });
})();
