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

  function resetContext(){
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
      const existing = document.querySelector('script[data-aqari-supabase]');
      if(existing){
        existing.addEventListener('load', resolve, { once:true });
        existing.addEventListener('error', reject, { once:true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.114.0';
      script.async = true;
      script.dataset.aqariSupabase = 'true';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load Supabase JS'));
      document.head.appendChild(script);
    });
    if(!window.supabase?.createClient) throw new Error('Supabase JS unavailable');
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
            storage: window.sessionStorage,
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

  async function refreshContext(expectedAccess){
    const expected = cleanAccess(expectedAccess);
    const client = await getClient();
    const { data:sessionData, error:sessionError } = await client.auth.getSession();
    if(sessionError) throw sessionError;
    const sessionUserId = String(sessionData.session?.user?.id || '').trim();
    if(!sessionUserId){
      resetContext();
      if(expected) throw accessError();
      return { ...state };
    }
    if(expected?.userId && expected.userId !== sessionUserId) throw accessError();

    const { data:userData, error:userError } = await client.auth.getUser();
    if(userError) throw userError;
    const user = userData.user || null;
    const userId = String(user?.id || '').trim();
    if(!userId || userId !== sessionUserId || (expected?.userId && expected.userId !== userId)){
      resetContext();
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
    if(membershipError) throw membershipError;
    const workspaceId = String(membership?.workspace_id || '').trim();
    const role = String(membership?.role || '').trim();
    if(!membership || membership.user_id !== userId || membership.is_active !== true || !workspaceId || !role ||
       (expected?.workspaceId && expected.workspaceId !== workspaceId) ||
       (expected?.role && expected.role !== role)){
      resetContext();
      if(expected) throw accessError();
    }

    let workspace = null;
    if(workspaceId){
      const { data:workspaceData, error:workspaceError } = await client
        .from('aqari_workspaces')
        .select('id, name, slug, created_at')
        .eq('id', workspaceId)
        .maybeSingle();
      if(workspaceError) throw workspaceError;
      if(!workspaceData || workspaceData.id !== workspaceId){
        resetContext();
        if(expected) throw accessError();
      }
      // Keep the value local until the complete snapshot has been authenticated.
      workspace = workspaceData || null;
    }

    const { data:profile, error:profileError } = await client
      .from('aqari_profiles')
      .select('user_id, display_name, created_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if(profileError) throw profileError;

    const { data:finalSessionData, error:finalSessionError } = await client.auth.getSession();
    if(finalSessionError) throw finalSessionError;
    if(String(finalSessionData.session?.user?.id || '').trim() !== userId) {
      resetContext();
      throw accessError();
    }

    state.user = user;
    state.membership = membership || null;
    state.workspace = workspace;
    state.profile = profile || null;
    if(expected) requireExactAccess(state, expected);
    return { ...state };
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
    clientPromise = null;
    state.client = null;
    resetContext();
    try{ previousClient?.auth?.stopAutoRefresh?.(); }catch(_){ }

    let cleared = 0;
    try{
      const storage = window.sessionStorage;
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

  const FOLLOW_UP_ACTIONS = new Set([
    'reminder_copied', 'statement_opened', 'contract_opened',
    'receipt_opened', 'collection_opened', 'reviewed'
  ]);
  const FOLLOW_UP_STATES = new Set(['due', 'pending', 'readonly', 'unlinked', 'resolved']);
  const FOLLOW_UP_PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
  const FOLLOW_UP_KEYS = new Set(['recordKey', 'property', 'period', 'actionKind', 'state']);

  function safeJournalText(value, field, maxLength){
    if(typeof value !== 'string' || value !== value.trim() || !value ||
       value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)){
      const error = new Error('Invalid follow-up '+field);
      error.code = 'AQARI_FOLLOW_UP_INVALID';
      throw error;
    }
    return value;
  }

  async function followUpRecordHash(value){
    const raw = safeJournalText(value, 'recordKey', 1200);
    const subtle = window.crypto?.subtle;
    const Encoder = window.TextEncoder || globalThis.TextEncoder;
    if(!subtle || typeof Encoder !== 'function'){
      const error = new Error('Web Crypto is required for private follow-up identifiers');
      error.code = 'AQARI_FOLLOW_UP_CRYPTO_UNAVAILABLE';
      throw error;
    }
    const digest = await subtle.digest('SHA-256', new Encoder().encode(raw));
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  function validateFollowUpEvent(event){
    if(!event || typeof event !== 'object' || Array.isArray(event)){
      const error = new Error('Invalid follow-up event');
      error.code = 'AQARI_FOLLOW_UP_INVALID';
      throw error;
    }
    const keys = Object.keys(event);
    if(keys.some((key) => !FOLLOW_UP_KEYS.has(key))){
      const error = new Error('Unexpected follow-up event field');
      error.code = 'AQARI_FOLLOW_UP_INVALID';
      throw error;
    }
    const actionKind = safeJournalText(event.actionKind, 'actionKind', 40);
    const stateName = safeJournalText(event.state, 'state', 20);
    const periodValue = safeJournalText(event.period, 'period', 7);
    if(!FOLLOW_UP_ACTIONS.has(actionKind) || !FOLLOW_UP_STATES.has(stateName) || !FOLLOW_UP_PERIOD.test(periodValue)){
      const error = new Error('Invalid follow-up event value');
      error.code = 'AQARI_FOLLOW_UP_INVALID';
      throw error;
    }
    return Object.freeze({
      record_key:safeJournalText(event.recordKey, 'recordKey', 1200),
      property:safeJournalText(event.property, 'property', 160),
      period:periodValue,
      action_kind:actionKind,
      state:stateName
    });
  }

  function validateFollowUpFilter(filter){
    const value = filter && typeof filter === 'object' && !Array.isArray(filter) ? filter : {};
    const allowed = new Set(['recordKey', 'property', 'period', 'limit']);
    if(Object.keys(value).some((key) => !allowed.has(key))){
      const error = new Error('Unexpected follow-up filter field');
      error.code = 'AQARI_FOLLOW_UP_INVALID';
      throw error;
    }
    const out = {};
    if(value.recordKey != null) out.recordKey = safeJournalText(value.recordKey, 'recordKey', 1200);
    if(value.property != null) out.property = safeJournalText(value.property, 'property', 160);
    if(value.period != null){
      out.period = safeJournalText(value.period, 'period', 7);
      if(!FOLLOW_UP_PERIOD.test(out.period)){
        const error = new Error('Invalid follow-up period');
        error.code = 'AQARI_FOLLOW_UP_INVALID';
        throw error;
      }
    }
    const limit = value.limit == null ? 60 : Number(value.limit);
    if(!Number.isInteger(limit) || limit < 1 || limit > 100){
      const error = new Error('Invalid follow-up limit');
      error.code = 'AQARI_FOLLOW_UP_INVALID';
      throw error;
    }
    out.limit = limit;
    return Object.freeze(out);
  }

  async function appStateRevision(expectedAccess){
    const boundAccess = await bindAccess(expectedAccess);
    const client = await getClient();
    const { data, error } = await client
      .from('aqari_app_state')
      .select('workspace_id, revision')
      .eq('workspace_id', boundAccess.workspaceId)
      .maybeSingle();
    if(error) throw error;
    if(!data || data.workspace_id !== boundAccess.workspaceId || !Number.isInteger(Number(data.revision))){
      throw revisionConflict(data?.revision ?? null);
    }
    await recheckBoundAccess(boundAccess);
    return Number(data.revision);
  }

  async function appendFollowUpEvent(event, expectedAccess, expectedRevision){
    const boundAccess = await bindAccess(expectedAccess, { write:true });
    const clean = validateFollowUpEvent(event);
    const expected = Number(expectedRevision);
    const currentRevision = await appStateRevision(boundAccess);
    if(!Number.isInteger(expected) || expected <= 0 || expected !== currentRevision){
      throw revisionConflict(currentRevision);
    }
    await recheckBoundAccess(boundAccess, { write:true });
    const client = state.client;
    if(!client) throw accessError();
    const recordHash = await followUpRecordHash(clean.record_key);
    await recheckBoundAccess(boundAccess, { write:true });
    const { data, error } = await client
      .from('aqari_follow_up_events')
      .insert({
        workspace_id:boundAccess.workspaceId,
        ...clean,
        record_key:recordHash,
        app_state_revision:expected
      })
      .select('id, workspace_id, record_key, property, period, action_kind, state, app_state_revision, created_by, created_at')
      .single();
    if(error?.code === '40001' || error?.message === 'AQARI_REVISION_CONFLICT'){
      throw revisionConflict(currentRevision);
    }
    if(error) throw error;
    if(!data || data.workspace_id !== boundAccess.workspaceId || data.created_by !== boundAccess.userId){
      throw accessError('Follow-up event ownership does not match authenticated access');
    }
    await recheckBoundAccess(boundAccess, { write:true });
    return Object.freeze({ ...data });
  }

  async function listFollowUpEvents(filter, expectedAccess){
    const boundAccess = await bindAccess(expectedAccess);
    const clean = validateFollowUpFilter(filter);
    const client = await getClient();
    let query = client
      .from('aqari_follow_up_events')
      .select('id, workspace_id, record_key, property, period, action_kind, state, app_state_revision, created_by, created_at')
      .eq('workspace_id', boundAccess.workspaceId);
    if(clean.recordKey) query = query.eq('record_key', await followUpRecordHash(clean.recordKey));
    if(clean.property) query = query.eq('property', clean.property);
    if(clean.period) query = query.eq('period', clean.period);
    const { data, error } = await query
      .order('created_at', { ascending:false })
      .limit(clean.limit);
    if(error) throw error;
    const rows = Array.isArray(data) ? data : [];
    if(rows.some((row) => row?.workspace_id !== boundAccess.workspaceId)){
      throw accessError('Follow-up timeline workspace does not match authenticated access');
    }
    await recheckBoundAccess(boundAccess);
    return Object.freeze(rows.map((row) => Object.freeze({ ...row })));
  }

  async function loadAppState(expectedAccess){
    const boundAccess = await bindAccess(expectedAccess);
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
    version:'V211.1', getClient, refreshContext, signIn, signUp, signOut,
    resetPasswordForEmail, updatePassword, onAuthStateChange, loadAppState, saveAppState,
    appStateRevision, followUpRecordHash, appendFollowUpEvent, listFollowUpEvents,
    clearPersistedSession, getSession, hasSession, verifySessionNull,
    authStorageKey:AUTH_STORAGE_KEY,
    testing:Object.freeze({ validateFollowUpEvent, validateFollowUpFilter }),
    get context(){ return { ...state }; }
  });
})();
