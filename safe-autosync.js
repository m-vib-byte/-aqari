(function(){
  'use strict';

  const ENABLE_KEY = 'aqari_cloud_autosync_enabled';
  const LAST_REV_KEY = 'aqari_cloud_last_revision';
  const LAST_HASH_KEY = 'aqari_cloud_last_hash';
  const LAST_SYNC_KEY = 'aqari_cloud_last_sync_at';

  const state = {
    enabled: localStorage.getItem(ENABLE_KEY) === '1',
    syncing: false,
    timer: null,
    lastError: null
  };

  function stableStringify(value){
    const seen = new WeakSet();
    function normalize(v){
      if(v && typeof v === 'object'){
        if(seen.has(v)) return '[Circular]';
        seen.add(v);
        if(Array.isArray(v)) return v.map(normalize);
        return Object.keys(v).sort().reduce((acc,k)=>{
          acc[k] = normalize(v[k]);
          return acc;
        },{});
      }
      return v;
    }
    return JSON.stringify(normalize(value));
  }

  function fnv1a(str){
    let h = 0x811c9dc5;
    for(let i=0;i<str.length;i++){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8,'0');
  }

  function snapshot(){
    if(!window.AQARI_CLOUD_SYNC) throw new Error('AQARI_CLOUD_SYNC unavailable');
    return window.AQARI_CLOUD_SYNC.collectLocalSnapshot();
  }

  function hashSnapshot(snap){
    return fnv1a(stableStringify(snap?.values || {}));
  }

  async function getCloud(){
    if(!window.AQARI_CLOUD_SYNC) throw new Error('AQARI_CLOUD_SYNC unavailable');
    return await window.AQARI_CLOUD_SYNC.downloadCloudPreview();
  }

  async function canAutosync(){
    if(!state.enabled) return {ok:false, reason:'disabled'};
    if(!window.AQARI_SUPABASE) return {ok:false, reason:'supabase-unavailable'};

    const ctx = await window.AQARI_SUPABASE.refreshContext();
    if(!ctx.user) return {ok:false, reason:'signed-out'};

    const allowed = new Set(['general_manager','property_manager','accountant']);
    if(!allowed.has(ctx.membership?.role)){
      return {ok:false, reason:'role-not-allowed'};
    }

    const cloud = await getCloud();
    const payload = cloud?.payload;

    // Never start autosync against an uninitialized/empty cloud record.
    if(!payload || typeof payload !== 'object' || Object.keys(payload).length === 0){
      return {ok:false, reason:'cloud-not-initialized'};
    }

    return {ok:true, cloud};
  }

  async function syncNow(){
    if(state.syncing) return {ok:false, reason:'busy'};
    state.syncing = true;

    try{
      const gate = await canAutosync();
      if(!gate.ok) return gate;

      const snap = snapshot();
      const hash = hashSnapshot(snap);
      const previousHash = localStorage.getItem(LAST_HASH_KEY);

      if(hash === previousHash){
        return {ok:true, changed:false, revision:Number(localStorage.getItem(LAST_REV_KEY) || 0)};
      }

      const cloud = gate.cloud;
      const knownRevision = Number(localStorage.getItem(LAST_REV_KEY) || cloud?.revision || 0);

      // Conflict protection: do not overwrite if cloud advanced independently.
      if(cloud?.revision && knownRevision && Number(cloud.revision) !== knownRevision){
        const err = new Error('Cloud revision changed since last sync');
        err.code = 'AQARI_AUTOSYNC_CONFLICT';
        err.cloudRevision = Number(cloud.revision);
        err.localKnownRevision = knownRevision;
        throw err;
      }

      const payload = {
        format:'aqari-cloud-state-v1',
        migratedAt: cloud?.payload?.migratedAt || new Date().toISOString(),
        source:'release-freeze',
        syncedAt:new Date().toISOString(),
        snapshot:snap
      };

      const saved = await window.AQARI_SUPABASE.saveAppState(payload, Number(cloud.revision || 0));

      localStorage.setItem(LAST_REV_KEY, String(saved.revision));
      localStorage.setItem(LAST_HASH_KEY, hash);
      localStorage.setItem(LAST_SYNC_KEY, saved.updated_at || new Date().toISOString());
      state.lastError = null;

      return {ok:true, changed:true, revision:saved.revision, updatedAt:saved.updated_at};
    }catch(err){
      state.lastError = {
        message: err?.message || String(err),
        code: err?.code || null,
        at: new Date().toISOString()
      };
      throw err;
    }finally{
      state.syncing = false;
    }
  }

  function schedule(){
    if(!state.enabled) return;
    clearTimeout(state.timer);
    state.timer = setTimeout(()=>{
      syncNow().catch(()=>{});
    }, 1800);
  }

  function enable(){
    state.enabled = true;
    localStorage.setItem(ENABLE_KEY,'1');
    schedule();
  }

  function disable(){
    state.enabled = false;
    localStorage.removeItem(ENABLE_KEY);
    clearTimeout(state.timer);
  }

  function installStorageWatcher(){
    const originalSetItem = localStorage.setItem.bind(localStorage);
    if(localStorage.__aqariWrapped) return;

    try{
      Object.defineProperty(localStorage,'__aqariWrapped',{value:true, configurable:true});
    }catch{}

    localStorage.setItem = function(key,value){
      originalSetItem(key,value);
      if(!/^aqari_cloud_/.test(String(key))) schedule();
    };
  }

  window.AQARI_AUTOSYNC = Object.freeze({
    version:'V198',
    enable,
    disable,
    syncNow,
    schedule,
    get status(){
      return {
        enabled:state.enabled,
        syncing:state.syncing,
        lastRevision:Number(localStorage.getItem(LAST_REV_KEY) || 0) || null,
        lastSyncAt:localStorage.getItem(LAST_SYNC_KEY),
        lastError:state.lastError
      };
    }
  });

  installStorageWatcher();

  // If the user previously enabled autosync, resume in fail-safe mode.
  if(state.enabled){
    setTimeout(()=>schedule(),1200);
  }
})();
