(function(){
  'use strict';

  const LEGACY_ENABLE_KEY = 'aqari_cloud_autosync_enabled';
  const INIT_KEY = 'aqari_cloud_sync_initialized_v198';
  const LAST_REV_KEY = 'aqari_cloud_last_revision';
  const LAST_SYNC_KEY = 'aqari_cloud_last_sync_at';

  function disabledError(){
    const error = new Error('Automatic cloud upload is disabled in V203; use an explicit manual transfer');
    error.code = 'AQARI_AUTOSYNC_DISABLED';
    return error;
  }

  function enable(){ throw disabledError(); }
  async function syncNow(){ throw disabledError(); }
  function schedule(){ return { ok:false, reason:'manual-only' }; }
  function disable(){ localStorage.removeItem(LEGACY_ENABLE_KEY); }

  function markBaseline(revision){
    const value = Number(revision);
    if(!Number.isInteger(value) || value <= 0) return false;
    localStorage.setItem(LAST_REV_KEY, String(value));
    localStorage.setItem(INIT_KEY, '1');
    return true;
  }

  disable();
  window.AQARI_AUTOSYNC = Object.freeze({
    version:'V203', runtimeBase:'V198', dataContract:'V202', mode:'manual_only', enable, disable, markBaseline, syncNow, schedule,
    get status(){
      return {
        enabled:false,
        syncing:false,
        mode:'manual_only',
        initialized:localStorage.getItem(INIT_KEY) === '1',
        lastRevision:Number(localStorage.getItem(LAST_REV_KEY) || 0) || null,
        lastSyncAt:localStorage.getItem(LAST_SYNC_KEY),
        lastError:null
      };
    }
  });
})();

