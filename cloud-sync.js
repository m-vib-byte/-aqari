(function(){
  'use strict';

  const DEFAULT_KEYS = [
    'aqariData',
    'aqari_data',
    'aqariState',
    'aqari_state',
    'tenants',
    'properties',
    'units',
    'leases',
    'payments',
    'maintenance',
    'employees',
    'owners',
    'vendors',
    'documents'
  ];

  function safeParse(v){
    try { return JSON.parse(v); } catch { return v; }
  }

  function collectLocalSnapshot(){
    const snapshot = {
      schema: 'aqari-local-snapshot-v1',
      capturedAt: new Date().toISOString(),
      origin: location.origin,
      pathname: location.pathname,
      values: {}
    };

    const dynamicKeys = [];
    for(let i=0; i<localStorage.length; i++){
      const key = localStorage.key(i);
      if(key && /aqari|tenant|property|unit|lease|payment|maintenance|employee|owner|vendor|document/i.test(key)){
        dynamicKeys.push(key);
      }
    }

    const keys = Array.from(new Set([...DEFAULT_KEYS, ...dynamicKeys]));
    for(const key of keys){
      const raw = localStorage.getItem(key);
      if(raw !== null){
        snapshot.values[key] = safeParse(raw);
      }
    }

    return snapshot;
  }

  function snapshotHasData(snapshot){
    return Boolean(snapshot && snapshot.values && Object.keys(snapshot.values).length);
  }

  async function readCloud(){
    if(!window.AQARI_SUPABASE) throw new Error('Supabase adapter unavailable');
    return await window.AQARI_SUPABASE.loadAppState();
  }

  async function uploadLocal(){
    if(!window.AQARI_SUPABASE) throw new Error('Supabase adapter unavailable');

    const local = collectLocalSnapshot();
    if(!snapshotHasData(local)){
      const err = new Error('No AQARI localStorage data detected');
      err.code = 'AQARI_NO_LOCAL_DATA';
      throw err;
    }

    const cloud = await window.AQARI_SUPABASE.loadAppState();
    const expectedRevision = cloud ? Number(cloud.revision) : 0;

    const payload = {
      format: 'aqari-cloud-state-v1',
      migratedAt: new Date().toISOString(),
      source: 'localStorage',
      snapshot: local
    };

    return await window.AQARI_SUPABASE.saveAppState(payload, expectedRevision);
  }

  async function downloadCloudPreview(){
    const cloud = await readCloud();
    return {
      revision: cloud?.revision ?? null,
      updatedAt: cloud?.updated_at ?? null,
      payload: cloud?.payload ?? null
    };
  }

  async function restoreCloudToLocal(options = {}){
    const { overwrite = false } = options;
    const cloud = await readCloud();

    const values = cloud?.payload?.snapshot?.values;
    if(!values || typeof values !== 'object'){
      throw new Error('Cloud payload does not contain a compatible localStorage snapshot');
    }

    const conflicts = [];
    const restored = [];

    for(const [key, value] of Object.entries(values)){
      const existing = localStorage.getItem(key);
      if(existing !== null && !overwrite){
        conflicts.push(key);
        continue;
      }

      localStorage.setItem(
        key,
        typeof value === 'string' ? value : JSON.stringify(value)
      );
      restored.push(key);
    }

    return {
      restored,
      conflicts,
      revision: cloud.revision,
      updatedAt: cloud.updated_at
    };
  }

  window.AQARI_CLOUD_SYNC = Object.freeze({
    version: 'V198',
    collectLocalSnapshot,
    readCloud,
    uploadLocal,
    downloadCloudPreview,
    restoreCloudToLocal
  });
})();
