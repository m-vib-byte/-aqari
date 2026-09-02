(function(){
  'use strict';

  const cfg = window.AQARI_PUBLIC_CONFIG || {};
  const state = {
    client: null,
    user: null,
    membership: null,
    workspace: null
  };

  async function ensureLibrary(){
    if (window.supabase && window.supabase.createClient) return window.supabase;

    await new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-aqari-supabase]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.async = true;
      s.dataset.aqariSupabase = 'true';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load Supabase JS'));
      document.head.appendChild(s);
    });

    if (!window.supabase || !window.supabase.createClient) {
      throw new Error('Supabase JS unavailable');
    }
    return window.supabase;
  }

  async function getClient(){
    if (state.client) return state.client;
    if (!cfg.supabaseUrl || !cfg.supabasePublishableKey) {
      throw new Error('AQARI Supabase public configuration is missing');
    }

    const lib = await ensureLibrary();
    state.client = lib.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return state.client;
  }

  async function refreshContext(){
    const client = await getClient();

    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError) throw userError;

    state.user = userData.user || null;
    state.membership = null;
    state.workspace = null;

    if (!state.user) return { ...state };

    const { data: membership, error: membershipError } = await client
      .from('aqari_memberships')
      .select('workspace_id, user_id, role, is_active, created_at')
      .eq('user_id', state.user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (membershipError) throw membershipError;
    state.membership = membership || null;

    if (state.membership?.workspace_id) {
      const { data: workspace, error: workspaceError } = await client
        .from('aqari_workspaces')
        .select('id, name, slug, created_at')
        .eq('id', state.membership.workspace_id)
        .maybeSingle();

      if (workspaceError) throw workspaceError;
      state.workspace = workspace || null;
    }

    return { ...state };
  }

  async function signIn(email, password){
    const client = await getClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await refreshContext();
    return data;
  }

  async function signOut(){
    const client = await getClient();
    const { error } = await client.auth.signOut();
    if (error) throw error;
    state.user = null;
    state.membership = null;
    state.workspace = null;
  }

  async function loadAppState(){
    await refreshContext();
    if (!state.membership?.workspace_id) return null;

    const client = await getClient();
    const { data, error } = await client
      .from('aqari_app_state')
      .select('workspace_id, payload, revision, updated_by, updated_at')
      .eq('workspace_id', state.membership.workspace_id)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  async function saveAppState(payload, expectedRevision){
    await refreshContext();
    if (!state.user || !state.membership?.workspace_id) {
      throw new Error('Authentication and active workspace membership are required');
    }

    const allowed = new Set(['general_manager', 'property_manager', 'accountant']);
    if (!allowed.has(state.membership.role)) {
      throw new Error('Current role does not allow app-state writes');
    }

    const current = await loadAppState();
    if (typeof expectedRevision === 'number' && current && current.revision !== expectedRevision) {
      const err = new Error('Revision conflict');
      err.code = 'AQARI_REVISION_CONFLICT';
      err.currentRevision = current.revision;
      throw err;
    }

    const client = await getClient();
    const nextRevision = (current?.revision || 0) + 1;

    const { data, error } = await client
      .from('aqari_app_state')
      .upsert({
        workspace_id: state.membership.workspace_id,
        payload,
        revision: nextRevision,
        updated_by: state.user.id,
        updated_at: new Date().toISOString()
      }, { onConflict: 'workspace_id' })
      .select('workspace_id, payload, revision, updated_by, updated_at')
      .single();

    if (error) throw error;
    return data;
  }

  window.AQARI_SUPABASE = Object.freeze({
    version: 'V198',
    getClient,
    refreshContext,
    signIn,
    signOut,
    loadAppState,
    saveAppState,
    get context(){
      return { ...state };
    }
  });
})();
