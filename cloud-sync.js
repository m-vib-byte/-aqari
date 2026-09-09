(function(){
  'use strict';

  const PRIMARY_DATA_KEY = 'aqari_v30';
  const WORKSPACE_DATA_PREFIX = PRIMARY_DATA_KEY + '::workspace::';
  const LAST_REV_KEY = 'aqari_cloud_last_revision';
  const INIT_KEY = 'aqari_cloud_sync_initialized_v198';
  const DATA_KEY = /aqari|tenant|property|unit|lease|payment|maintenance|employee|owner|vendor|document/i;
  const SENSITIVE_KEY = /session|token|auth|login|password|passwd|pin|secret|credential|access|api[_-]?key/i;
  const DEFAULT_KEYS = [
    PRIMARY_DATA_KEY, 'aqariData', 'aqari_data', 'aqariState', 'aqari_state',
    'tenants', 'properties', 'units', 'leases', 'payments', 'maintenance',
    'employees', 'owners', 'vendors', 'documents'
  ];
  let activeScope = null;

  function accessScope(context){
    const userId = String(context?.user?.id || '').trim();
    const workspaceId = String(context?.workspace?.id || '').trim();
    const membership = context?.membership;
    if(!userId || !workspaceId || membership?.is_active !== true) return null;
    if(String(membership.user_id || '') !== userId) return null;
    if(String(membership.workspace_id || '') !== workspaceId) return null;
    return { userId, workspaceId };
  }

  function sameScope(left, right){
    return Boolean(left && right && left.userId === right.userId && left.workspaceId === right.workspaceId);
  }

  function scopeError(){
    const error = new Error('Authentication and matching active workspace membership are required');
    error.code = 'AQARI_DATA_SCOPE_REQUIRED';
    return error;
  }

  function requireScope(expected = activeScope){
    const live = accessScope(window.AQARI_SUPABASE?.context);
    if(!sameScope(activeScope, live) || !sameScope(expected, live)) throw scopeError();
    const storageGate = window.AQARI_EARLY_STORAGE_GATE;
    if(storageGate && !sameScope(storageGate.scope, live)) throw scopeError();
    return live;
  }

  function workspaceDataKey(scope){
    return WORKSPACE_DATA_PREFIX + encodeURIComponent(scope.workspaceId);
  }

  function safeText(value){
    if(window.AQARI_EARLY_STORAGE_GATE?.neutralValue){
      return window.AQARI_EARLY_STORAGE_GATE.neutralValue(value);
    }
    return String(value)
      .replace(/&(?=(?:#(?:x[0-9a-f]+|[0-9]+)|lt|gt|quot|apos|colon|tab|newline);?)/gi, '＆')
      .replace(/</g, '‹')
      .replace(/>/g, '›');
  }

  function sanitizeValue(value, depth = 0){
    if(depth > 12) throw new Error('AQARI data nesting is too deep');
    if(value === null || typeof value === 'number' || typeof value === 'boolean') return value;
    if(typeof value === 'string') return safeText(value);
    if(Array.isArray(value)) return value.map((item) => sanitizeValue(item, depth + 1));
    if(!value || typeof value !== 'object') return null;
    const clean = {};
    for(const [key, item] of Object.entries(value)){
      if(key === '__proto__' || key === 'prototype' || key === 'constructor') continue;
      clean[key] = sanitizeValue(item, depth + 1);
    }
    return clean;
  }

  function canonicalValue(value, depth = 0){
    if(depth > 12) throw new Error('AQARI data nesting is too deep');
    if(value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if(Array.isArray(value)) return value.map((item) => canonicalValue(item, depth + 1));
    if(!value || typeof value !== 'object') return null;
    const clean = {};
    for(const [key, item] of Object.entries(value)){
      if(key === '__proto__' || key === 'prototype' || key === 'constructor') continue;
      clean[key] = canonicalValue(item, depth + 1);
    }
    return clean;
  }

  function prepareState(value){
    if(!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return canonicalValue(value);
  }

  function readWorkspaceState(expected = activeScope){
    const scope = requireScope(expected);
    const raw = localStorage.getItem(workspaceDataKey(scope));
    return prepareState(raw === null ? {} : safeParse(raw));
  }

  function writeWorkspaceState(value, expected = activeScope){
    const scope = requireScope(expected);
    const canonical = canonicalValue(value);
    localStorage.setItem(workspaceDataKey(scope), JSON.stringify(canonical));
    return prepareState(canonical);
  }

  function activate(context, cloudSeed = null){
    const next = accessScope(context);
    const live = accessScope(window.AQARI_SUPABASE?.context);
    if(!sameScope(next, live)) throw scopeError();
    try{
      window.AQARI_EARLY_STORAGE_GATE?.activate(context);
      activeScope = next;
      const local = readWorkspaceState(next);
      const decoded = decodeCloudPayload(cloudSeed);
      if(window.AQARI_PUBLIC_CONFIG?.supabaseUrl === 'https://djkpkkgoibruaezdrchb.supabase.co' && decoded){
        const cloud = prepareState(decoded.primary);
        if(Object.keys(local).length && JSON.stringify(local) !== JSON.stringify(cloud)){
          const backupKey = workspaceDataKey(next) + ':before-cloud-activation';
          if(localStorage.getItem(backupKey) === null) localStorage.setItem(backupKey, JSON.stringify(local));
        }
        // A verified staging snapshot is authoritative after a reload or import.
        // Never send the old browser cache back over the cloud snapshot.
        return writeWorkspaceState(cloud, next);
      }
      if(Object.keys(local).length) return local;
      return prepareState(decoded?.primary || {});
    }catch(error){
      activeScope = null;
      window.AQARI_EARLY_STORAGE_GATE?.seal();
      throw error;
    }
  }

  function seal(){
    window.AQARI_EARLY_STORAGE_GATE?.seal();
    activeScope = null;
  }

  function scopedStorageSnapshot(){
    const scope = requireScope();
    return { [PRIMARY_DATA_KEY]:readWorkspaceState(scope) };
  }

  function safeParse(value){
    try { return JSON.parse(value); } catch { return value; }
  }

  function shouldCollectKey(key){
    return Boolean(key && DATA_KEY.test(key) && !SENSITIVE_KEY.test(key) && !/^aqari_cloud_/i.test(key));
  }

  function collectLocalSnapshot(){
    const scope = requireScope();
    const snapshot = {
      schema:'aqari-local-snapshot-v1',
      capturedAt:new Date().toISOString(),
      origin:location.origin,
      pathname:location.pathname,
      values:{}
    };
    snapshot.values[PRIMARY_DATA_KEY] = readWorkspaceState(scope);
    return snapshot;
  }

  function primaryLocalState(expected = activeScope){
    const data = readWorkspaceState(expected);
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

  async function readCloud(expected = activeScope){
    const scope = requireScope(expected);
    if(!window.AQARI_SUPABASE) throw new Error('Supabase adapter unavailable');
    const result = await window.AQARI_SUPABASE.loadAppState(scope);
    requireScope(scope);
    if(result?.workspace_id && String(result.workspace_id) !== scope.workspaceId) throw scopeError();
    return result;
  }

  async function uploadLocal(){
    const scope = requireScope();
    if(!window.AQARI_SUPABASE) throw new Error('Supabase adapter unavailable');
    const payload = primaryLocalState(scope);
    const cloud = await readCloud(scope);
    if(payloadHasData(cloud?.payload)){
      const error = new Error('Cloud state already contains data; restore it before any replacement');
      error.code = 'AQARI_CLOUD_NOT_EMPTY';
      throw error;
    }
    const saved = await window.AQARI_SUPABASE.saveAppState(payload, Number(cloud?.revision || 0), scope);
    requireScope(scope);
    if(saved?.workspace_id && String(saved.workspace_id) !== scope.workspaceId) throw scopeError();
    markBaseline(saved?.revision);
    return saved;
  }

  async function downloadCloudPreview(){
    const scope = requireScope();
    const cloud = await readCloud(scope);
    const decoded = decodeCloudPayload(cloud?.payload);
    return {
      revision:cloud?.revision ?? null,
      updatedAt:cloud?.updated_at ?? null,
      payload:cloud?.payload ?? null,
      format:decoded?.format ?? null
    };
  }

  async function restoreCloudToLocal(options = {}){
    const scope = requireScope();
    const { overwrite = false } = options;
    const cloud = await readCloud(scope);
    const decoded = decodeCloudPayload(cloud?.payload);
    if(!decoded) throw new Error('Cloud payload does not contain compatible AQARI data');
    const existing = readWorkspaceState(scope);
    if(Object.keys(existing).length && !overwrite){
      return { restored:[], conflicts:[PRIMARY_DATA_KEY], revision:cloud.revision, updatedAt:cloud.updated_at };
    }
    writeWorkspaceState(decoded.primary, scope);
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

  window.AQARI_DATA_GATE = Object.freeze({
    version:'V198', accessScope, activate, seal, prepareState,
    read:readWorkspaceState, write:writeWorkspaceState,
    scopedStorageSnapshot,
    get scope(){ return activeScope ? { ...activeScope } : null; }
  });

  window.AQARI_CLOUD_SYNC = Object.freeze({
    version:'V198', collectLocalSnapshot, decodeCloudPayload, readCloud,
    uploadLocal, downloadCloudPreview, restoreCloudToLocal
  });
})();
