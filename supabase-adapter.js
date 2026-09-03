(function(){
  'use strict';

  const cfg = window.AQARI_PUBLIC_CONFIG || {};
  const state = { client:null, user:null, membership:null, workspace:null, profile:null };
  let clientPromise = null;

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
    clientPromise = ensureLibrary()
      .then((lib) => {
        state.client = lib.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storage: window.sessionStorage,
            storageKey: 'aqari-supabase-auth-v198'
          }
        });
        return state.client;
      })
      .catch((error) => {
        clientPromise = null;
        throw error;
      });
    return clientPromise;
  }

  async function refreshContext(){
    const client = await getClient();
    const { data:sessionData, error:sessionError } = await client.auth.getSession();
    if(sessionError) throw sessionError;
    resetContext();
    if(!sessionData.session) return { ...state };

    const { data:userData, error:userError } = await client.auth.getUser();
    if(userError) throw userError;
    state.user = userData.user || null;
    if(!state.user) return { ...state };

    const { data:membership, error:membershipError } = await client
      .from('aqari_memberships')
      .select('workspace_id, user_id, role, is_active, created_at')
      .eq('user_id', state.user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if(membershipError) throw membershipError;
    state.membership = membership || null;

    if(state.membership?.workspace_id){
      const { data:workspace, error:workspaceError } = await client
        .from('aqari_workspaces')
        .select('id, name, slug, created_at')
        .eq('id', state.membership.workspace_id)
        .maybeSingle();
      if(workspaceError) throw workspaceError;
      state.workspace = workspace || null;
    }

    const { data:profile, error:profileError } = await client
      .from('aqari_profiles')
      .select('user_id, display_name, role, is_active')
      .eq('user_id', state.user.id)
      .eq('is_active', true)
      .maybeSingle();
    if(profileError) throw profileError;
    state.profile = profile || null;
    return { ...state };
  }

  async function signIn(email, password){
    const client = await getClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if(error) throw error;
    const context = await refreshContext();
    if(!context.membership || !context.workspace || !context.profile){
      await client.auth.signOut().catch(() => {});
      resetContext();
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

  async function signOut(){
    const client = await getClient();
    const { error } = await client.auth.signOut();
    if(error) throw error;
    resetContext();
  }

  async function loadAppState(){
    await refreshContext();
    if(!state.membership?.workspace_id) return null;
    const client = await getClient();
    const { data, error } = await client
      .from('aqari_app_state')
      .select('workspace_id, payload, revision, updated_by, updated_at')
      .eq('workspace_id', state.membership.workspace_id)
      .maybeSingle();
    if(error) throw error;
    return data || null;
  }

  async function saveAppState(payload, expectedRevision){
    await refreshContext();
    if(!state.user || !state.membership?.workspace_id){
      throw new Error('Authentication and active workspace membership are required');
    }
    const allowed = new Set(['general_manager', 'property_manager', 'accountant']);
    if(!allowed.has(state.membership.role)){
      throw new Error('Current role does not allow app-state writes');
    }

    const client = await getClient();
    const current = await loadAppState();
    const expected = Number(expectedRevision);

    if(current){
      const currentRevision = Number(current.revision);
      if(!Number.isInteger(expected) || expected !== currentRevision){
        throw revisionConflict(currentRevision);
      }
      const { data, error } = await client
        .from('aqari_app_state')
        .update({ payload })
        .eq('workspace_id', state.membership.workspace_id)
        .eq('revision', expected)
        .select('workspace_id, payload, revision, updated_by, updated_at')
        .maybeSingle();
      if(error) throw error;
      if(!data) throw revisionConflict(currentRevision);
      return data;
    }

    if(expected !== 0) throw revisionConflict(null);
    const { data, error } = await client
      .from('aqari_app_state')
      .insert({ workspace_id:state.membership.workspace_id, payload })
      .select('workspace_id, payload, revision, updated_by, updated_at')
      .single();
    if(error?.code === '23505') throw revisionConflict(null);
    if(error) throw error;
    return data;
  }

  window.AQARI_SUPABASE = Object.freeze({
    version:'V198', getClient, refreshContext, signIn, signUp, signOut,
    resetPasswordForEmail, updatePassword, onAuthStateChange, loadAppState, saveAppState,
    get context(){ return { ...state }; }
  });
})();
