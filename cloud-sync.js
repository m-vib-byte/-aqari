(function(){
  'use strict';

  const PRIMARY_DATA_KEY = 'aqari_v30';
  const LAST_REV_KEY = 'aqari_cloud_last_revision';
  const INIT_KEY = 'aqari_cloud_sync_initialized_v198';
  const DATA_KEY = /aqari|tenant|property|unit|lease|payment|maintenance|employee|owner|vendor|document/i;
  const SENSITIVE_KEY = /session|token|auth|login|password|passwd|pin|secret|credential|access|api[_-]?key/i;
  const DEFAULT_KEYS = [
    PRIMARY_DATA_KEY, 'aqariData', 'aqari_data', 'aqariState', 'aqari_state',
    'tenants', 'properties', 'units', 'leases', 'payments', 'maintenance',
    'employees', 'owners', 'vendors', 'documents'
  ];

  function safeParse(value){
    try { return JSON.parse(value); } catch { return value; }
  }

  function shouldCollectKey(key){
    return Boolean(key && DATA_KEY.test(key) && !SENSITIVE_KEY.test(key) && !/^aqari_cloud_/i.test(key));
  }

  function collectLocalSnapshot(){
    const snapshot = {
      schema:'aqari-local-snapshot-v1',
      capturedAt:new Date().toISOString(),
      origin:location.origin,
      pathname:location.pathname,
      values:{}
    };
    const dynamic = [];
    for(let index = 0; index < localStorage.length; index += 1){
      const key = localStorage.key(index);
      if(shouldCollectKey(key)) dynamic.push(key);
    }
    for(const key of new Set([...DEFAULT_KEYS, ...dynamic])){
      if(!shouldCollectKey(key)) continue;
      const raw = localStorage.getItem(key);
      if(raw !== null) snapshot.values[key] = safeParse(raw);
    }
    return snapshot;
  }

  function primaryLocalState(){
    const raw = localStorage.getItem(PRIMARY_DATA_KEY);
    const data = raw === null ? null : safeParse(raw);
    if(!data || typeof data !== 'object' || Array.isArray(data)){
      const error = new Error('AQARI primary local state is unavailable');
      error.code = 'AQARI_NO_LOCAL_DATA';
      throw error;
    }
    return data;
  }

  function payloadHasData(payload){
    if(payload === null || payload === undefined) return false;
    if(typeof payload !== 'object') return true;
    return Object.keys(payload).length > 0;
  }

  function decodeCloudPayload(payload){
    if(!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    if(payload.format === 'aqari-cloud-state-v1'){
      const primary = payload.snapshot?.values?.[PRIMARY_DATA_KEY];
      return primary && typeof primary === 'object' && !Array.isArray(primary)
        ? { format:'aqari-cloud-state-v1', primary }
        : null;
    }
    if(payload.schema === 'aqari-local-snapshot-v1'){
      const primary = payload.values?.[PRIMARY_DATA_KEY];
      return primary && typeof primary === 'object' && !Array.isArray(primary)
        ? { format:'aqari-local-snapshot-v1', primary }
        : null;
    }
    return { format:'aqari-v168-direct-db', primary:payload };
  }

  function markBaseline(revision){
    const value = Number(revision);
    if(Number.isInteger(value) && value > 0){
      localStorage.setItem(LAST_REV_KEY, String(value));
      localStorage.setItem(INIT_KEY, '1');
    }
  }

  async function readCloud(){
    if(!window.AQARI_SUPABASE) throw new Error('Supabase adapter unavailable');
    return window.AQARI_SUPABASE.loadAppState();
  }

  async function uploadLocal(){
    if(!window.AQARI_SUPABASE) throw new Error('Supabase adapter unavailable');
    const payload = primaryLocalState();
    const cloud = await readCloud();
    if(payloadHasData(cloud?.payload)){
      const error = new Error('Cloud state already contains data; restore it before any replacement');
      error.code = 'AQARI_CLOUD_NOT_EMPTY';
      throw error;
    }
    const saved = await window.AQARI_SUPABASE.saveAppState(payload, Number(cloud?.revision || 0));
    markBaseline(saved?.revision);
    return saved;
  }

  async function downloadCloudPreview(){
    const cloud = await readCloud();
    const decoded = decodeCloudPayload(cloud?.payload);
    return {
      revision:cloud?.revision ?? null,
      updatedAt:cloud?.updated_at ?? null,
      payload:cloud?.payload ?? null,
      format:decoded?.format ?? null
    };
  }

  async function restoreCloudToLocal(options = {}){
    const { overwrite = false } = options;
    const cloud = await readCloud();
    const decoded = decodeCloudPayload(cloud?.payload);
    if(!decoded) throw new Error('Cloud payload does not contain compatible AQARI data');
    const existing = localStorage.getItem(PRIMARY_DATA_KEY);
    if(existing !== null && !overwrite){
      return { restored:[], conflicts:[PRIMARY_DATA_KEY], revision:cloud.revision, updatedAt:cloud.updated_at };
    }
    localStorage.setItem(PRIMARY_DATA_KEY, JSON.stringify(decoded.primary));
    markBaseline(cloud.revision);
    return {
      restored:[PRIMARY_DATA_KEY],
      conflicts:[],
      revision:cloud.revision,
      updatedAt:cloud.updated_at,
      format:decoded.format,
      baselineRecorded:true
    };
  }

  window.AQARI_CLOUD_SYNC = Object.freeze({
    version:'V203', runtimeBase:'V198', dataContract:'V202', collectLocalSnapshot, decodeCloudPayload, readCloud,
    uploadLocal, downloadCloudPreview, restoreCloudToLocal
  });
})();

