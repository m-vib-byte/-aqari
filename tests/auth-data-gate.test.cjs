const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function storage(initial = {}){
  const values = new Map(Object.entries(initial));
  return {
    get length(){ return values.size; },
    key(index){ return Array.from(values.keys())[index] ?? null; },
    getItem(key){ return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value){ values.set(String(key), String(value)); },
    removeItem(key){ values.delete(String(key)); },
    clear(){ values.clear(); }
  };
}

function access(userId, workspaceId){
  return {
    user:{ id:userId },
    membership:{ is_active:true, user_id:userId, workspace_id:workspaceId, role:'general_manager' },
    workspace:{ id:workspaceId }
  };
}

function runtime(initial = {}){
  const localStorage = storage(initial);
  const window = {
    localStorage,
    AQARI_SUPABASE:{
      context:{ user:null, membership:null, workspace:null },
      async loadAppState(){ return null; },
      async saveAppState(payload){ return { payload, revision:1 }; }
    }
  };
  const context = vm.createContext({ window, localStorage, location:{ origin:'https://aqari.test', pathname:'/' }, console });
  vm.runInContext(fs.readFileSync(path.join(root, 'cloud-sync.js'), 'utf8'), context);
  return { window, localStorage };
}

function earlyStorageRuntime(initial = {}, initialSession = {}, withDom = false){
  const nativeStorage = storage(initial);
  const nativeSessionStorage = storage(initialSession);
  const window = {
    localStorage:nativeStorage,
    sessionStorage:nativeSessionStorage,
    AQARI_SUPABASE:{ context:{ user:null, membership:null, workspace:null } }
  };
  if(withDom){
    function FakeElement(){ this._html = ''; this.content = { querySelectorAll(){ return []; } }; }
    Object.defineProperty(FakeElement.prototype, 'innerHTML', {
      configurable:true,
      enumerable:true,
      get(){ return this._html; },
      set(value){ this._html = String(value); }
    });
    FakeElement.prototype.insertAdjacentHTML = function(_position, value){ this._html += String(value); };
    window.Element = FakeElement;
    window.document = { createElement(){ return new FakeElement(); } };
  }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const match = html.match(/<script id="aqari-early-storage-gate">([\s\S]*?)<\/script>/);
  assert.ok(match, 'early storage gate must be the first inline script');
  assert.ok(html.indexOf(match[0]) < html.indexOf('<script>', html.indexOf(match[0]) + match[0].length));
  const context = vm.createContext({ window, console });
  vm.runInContext(match[1], context);
  return { window, nativeStorage, nativeSessionStorage };
}

function deferred(){
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function spinUntil(predicate, message){
  for(let attempt = 0; attempt < 40; attempt += 1){
    if(predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(message);
}

function bridgeRaceRuntime(options = {}){
  const tokenRefreshesPerContext = Number(options.tokenRefreshesPerContext || 0);
  const contextA = access('user-a', 'workspace-a');
  const contextB = access('user-b', 'workspace-b');
  const contexts = [contextA, contextB];
  const remotes = new Map();
  const remoteLoads = [];
  const activations = [];
  const listeners = {};
  const scheduled = [];
  let refreshIndex = 0;
  let live = { user:null, membership:null, workspace:null };
  let authCallback = null;
  let insideAuthCallback = false;
  let sealsInsideAuthCallback = 0;
  let sealCount = 0;
  let signOutCount = 0;
  let signOutShouldFail = false;
  let clearShouldFail = false;
  let clearCount = 0;
  let presentationSealCount = 0;
  let portfolioResumeCount = 0;
  let searchResumeCount = 0;
  let commandResumeCount = 0;
  let followUpResumeCount = 0;
  let startupBackupScheduleCount = 0;
  let startupBackupCancelCount = 0;
  let activeRemoteLoads = 0;
  let maxRemoteLoads = 0;
  const hardResets = [];
  const localStorage = storage();
  const sessionStorage = storage();

  const profileQuery = {
    select(){ return this; },
    eq(){ return this; },
    limit(){ return this; },
    async maybeSingle(){ return { data:{ display_name:'AQARI User' }, error:null }; }
  };
  const client = {
    auth:{
      onAuthStateChange(callback){ authCallback = callback; return { data:{ subscription:{ unsubscribe(){} } } }; }
    },
    from(){ return Object.create(profileQuery); }
  };
  const supabase = {
    get context(){ return live; },
    async getClient(){ return client; },
    async refreshContext(){
      const next = contexts[Math.min(refreshIndex, contexts.length - 1)];
      refreshIndex += 1;
      live = next;
      if(tokenRefreshesPerContext > 0){
        await Promise.resolve();
        for(let index = 0; index < tokenRefreshesPerContext && authCallback; index += 1){
          insideAuthCallback = true;
          try{ authCallback('TOKEN_REFRESHED', { user:next.user }); }
          finally{ insideAuthCallback = false; }
        }
      }
      return next;
    },
    loadAppState(){
      const workspaceId = live.workspace.id;
      const pending = deferred();
      remotes.set(workspaceId, pending);
      remoteLoads.push({ workspaceId, pending });
      activeRemoteLoads += 1;
      maxRemoteLoads = Math.max(maxRemoteLoads, activeRemoteLoads);
      return pending.promise.finally(() => { activeRemoteLoads -= 1; });
    },
    async signOut(){
      signOutCount += 1;
      if(signOutShouldFail) throw new Error('network signout failure');
      live = { user:null, membership:null, workspace:null };
    },
    clearPersistedSession(){
      clearCount += 1;
      if(!clearShouldFail) live = { user:null, membership:null, workspace:null };
    },
    async verifySessionNull(){
      if(live.user) throw new Error('session remains');
      return true;
    }
  };
  const document = {
    readyState:'loading',
    hidden:false,
    getElementById(){ return null; },
    querySelectorAll(){ return []; },
    addEventListener(name, callback){ listeners[name] = callback; }
  };
  const window = {
    AQARI_SUPABASE:supabase,
    AQARI_V201:{ seal(){ presentationSealCount += 1; } },
    AQARI_V202:{ seal(){ presentationSealCount += 1; } },
    AQARI_V208:{
      seal(){ presentationSealCount += 1; },
      resume(){ portfolioResumeCount += 1; return true; }
    },
    AQARI_V209:{
      seal(){ presentationSealCount += 1; },
      resume(){ searchResumeCount += 1; return true; }
    },
    AQARI_V210:{
      seal(){ presentationSealCount += 1; },
      resume(){ commandResumeCount += 1; return true; }
    },
    AQARI_V211:{
      seal(){ presentationSealCount += 1; },
      resume(){ followUpResumeCount += 1; return true; }
    },
    AQARI_STARTUP_BACKUP:{
      schedule(){ startupBackupScheduleCount += 1; return true; },
      cancel(){ startupBackupCancelCount += 1; }
    },
    localStorage,
    sessionStorage,
    sealWorkspaceDbV198(){
      sealCount += 1;
      if(insideAuthCallback) sealsInsideAuthCallback += 1;
    },
    activateWorkspaceDbV198(candidate, payload){
      activations.push({ workspace:candidate.workspace.id, payload });
    },
    addEventListener(){},
    confirm(){ return true; }
  };
  const sandbox = vm.createContext({
    window, document, localStorage, sessionStorage,
    location:{ origin:'https://aqari.test', pathname:'/app', search:'?mode=secure', replace(value){ hardResets.push(value); } },
    setTimeout(callback, milliseconds){ if(milliseconds !== 20000) scheduled.push(callback); return scheduled.length; },
    clearTimeout(){},
    setInterval(){ return 1; },
    console
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'secure-auth-bridge.js'), 'utf8'), sandbox);
  return {
    window, contextA, contextB, remotes, remoteLoads, activations, listeners, scheduled,
    get authCallback(){ return authCallback; },
    get sealCount(){ return sealCount; },
    get sealsInsideAuthCallback(){ return sealsInsideAuthCallback; },
    get signOutCount(){ return signOutCount; },
    get clearCount(){ return clearCount; },
    setSignOutShouldFail(value){ signOutShouldFail = Boolean(value); },
    setClearShouldFail(value){ clearShouldFail = Boolean(value); },
    get presentationSealCount(){ return presentationSealCount; },
    get portfolioResumeCount(){ return portfolioResumeCount; },
    get searchResumeCount(){ return searchResumeCount; },
    get commandResumeCount(){ return commandResumeCount; },
    get followUpResumeCount(){ return followUpResumeCount; },
    get startupBackupScheduleCount(){ return startupBackupScheduleCount; },
    get startupBackupCancelCount(){ return startupBackupCancelCount; },
    get maxRemoteLoads(){ return maxRemoteLoads; },
    get hardResets(){ return hardResets; }
  };
}

function adapterRaceRuntime(){
  const finalSessionA = deferred();
  let mode = 'a';
  let sessionCallsA = 0;
  let finalSessionARequested = false;

  const rows = {
    a:{
      aqari_memberships:{ workspace_id:'workspace-a', user_id:'user-a', role:'general_manager', is_active:true },
      aqari_workspaces:{ id:'workspace-a', name:'Workspace A' },
      aqari_profiles:{ user_id:'user-a', display_name:'User A' }
    },
    b:{
      aqari_memberships:{ workspace_id:'workspace-b', user_id:'user-b', role:'general_manager', is_active:true },
      aqari_workspaces:{ id:'workspace-b', name:'Workspace B' },
      aqari_profiles:{ user_id:'user-b', display_name:'User B' }
    }
  };

  const client = {
    auth:{
      async getSession(){
        if(mode === 'a'){
          sessionCallsA += 1;
          if(sessionCallsA === 1) return { data:{ session:{ user:{ id:'user-a', email:'a@example.test' } } }, error:null };
          finalSessionARequested = true;
          return finalSessionA.promise;
        }
        return { data:{ session:{ user:{ id:'user-b', email:'b@example.test' } } }, error:null };
      },
      async getUser(){
        const id = mode === 'a' ? 'user-a' : 'user-b';
        return { data:{ user:{ id, email:(mode === 'a' ? 'a' : 'b') + '@example.test' } }, error:null };
      }
    },
    from(table){
      const snapshot = mode;
      const query = {
        select(){ return query; },
        eq(){ return query; },
        limit(){ return query; },
        async maybeSingle(){ return { data:rows[snapshot][table] || null, error:null }; }
      };
      return query;
    }
  };

  const sessionStorage = storage();
  const window = {
    AQARI_PUBLIC_CONFIG:{
      supabaseUrl:'https://project.supabase.co',
      supabasePublishableKey:'sb_publishable_test'
    },
    sessionStorage,
    supabase:{ createClient(){ return client; } }
  };
  const sandbox = vm.createContext({
    window,
    document:{},
    location:{ origin:'https://aqari.test' },
    console
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'supabase-adapter.js'), 'utf8'), sandbox);
  return {
    window,
    finalSessionA,
    useB(){ mode = 'b'; },
    get finalSessionARequested(){ return finalSessionARequested; }
  };
}

function adapterLibraryRetryRuntime(){
  const scripts = [];
  const timers = new Map();
  let activeScript = null;
  let nextTimer = 0;

  function makeScript(){
    const listeners = new Map();
    return {
      dataset:{},
      async:false,
      src:'',
      addEventListener(name, callback){
        if(!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(callback);
      },
      removeEventListener(name, callback){ listeners.get(name)?.delete(callback); },
      remove(){ if(activeScript === this) activeScript = null; },
      emit(name){ for(const callback of Array.from(listeners.get(name) || [])) callback(); }
    };
  }

  const document = {
    querySelector(){ return activeScript; },
    createElement(){ return makeScript(); },
    head:{
      appendChild(script){
        activeScript = script;
        scripts.push(script);
      }
    }
  };
  const window = {
    AQARI_PUBLIC_CONFIG:{
      supabaseUrl:'https://project.supabase.co',
      supabasePublishableKey:'sb_publishable_test'
    },
    sessionStorage:storage()
  };
  const sandbox = vm.createContext({
    window,
    document,
    location:{ origin:'https://aqari.test' },
    console,
    setTimeout(callback){ const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id){ timers.delete(id); }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'supabase-adapter.js'), 'utf8'), sandbox);
  return { window, scripts, get activeScript(){ return activeScript; } };
}

function listenerRetryRuntime(){
  const listeners = {};
  const windowListeners = {};
  const timers = [];
  const clientReady = deferred();
  const localStorage = storage();
  const sessionStorage = storage();
  let getClientCalls = 0;
  let listenerCount = 0;
  const client = {
    auth:{
      onAuthStateChange(){
        listenerCount += 1;
        return { data:{ subscription:{ unsubscribe(){} } } };
      }
    }
  };
  const window = {
    localStorage,
    sessionStorage,
    AQARI_SUPABASE:{
      context:{ user:null, membership:null, workspace:null },
      async getClient(){
        getClientCalls += 1;
        if(getClientCalls === 1) throw new Error('temporary client failure');
        return clientReady.promise;
      },
      async refreshContext(){ return { user:null, membership:null, workspace:null }; }
    },
    addEventListener(name, callback){ windowListeners[name] = callback; }
  };
  const document = {
    readyState:'loading',
    hidden:false,
    documentElement:{ classList:{ add(){}, remove(){}, toggle(){} } },
    getElementById(){ return null; },
    querySelectorAll(){ return []; },
    addEventListener(name, callback){ listeners[name] = callback; }
  };
  const sandbox = vm.createContext({
    window,
    document,
    localStorage,
    sessionStorage,
    location:{ origin:'https://aqari.test', pathname:'/', search:'', replace(){} },
    setTimeout(callback, delay){ const timer={ callback, delay }; timers.push(timer); return timer; },
    clearTimeout(timer){ const index=timers.indexOf(timer); if(index>=0)timers.splice(index,1); },
    setInterval(){ return 1; },
    console
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'secure-auth-bridge.js'), 'utf8'), sandbox);
  return {
    listeners,
    windowListeners,
    timers,
    client,
    clientReady,
    get getClientCalls(){ return getClientCalls; },
    get listenerCount(){ return listenerCount; }
  };
}

test('a stale Supabase context refresh cannot overwrite a newer authenticated workspace', async () => {
  const race = adapterRaceRuntime();
  const refreshA = race.window.AQARI_SUPABASE.refreshContext();
  await spinUntil(() => race.finalSessionARequested, 'user A did not reach the final session check');

  race.useB();
  const contextB = await race.window.AQARI_SUPABASE.refreshContext();
  assert.equal(contextB.user.id, 'user-b');
  assert.equal(contextB.workspace.id, 'workspace-b');

  race.finalSessionA.resolve({
    data:{ session:{ user:{ id:'user-a', email:'a@example.test' } } },
    error:null
  });
  await assert.rejects(refreshA, (error) => {
    assert.equal(error.code, 'AQARI_ACCESS_CHANGED');
    assert.equal(error.reason, 'AQARI_CONTEXT_SUPERSEDED');
    return true;
  });
  assert.equal(race.window.AQARI_SUPABASE.context.user.id, 'user-b');
  assert.equal(race.window.AQARI_SUPABASE.context.workspace.id, 'workspace-b');
});

test('same-workspace context refreshes share one authenticated snapshot', async () => {
  const race = adapterRaceRuntime();
  const expected = { userId:'user-a', workspaceId:'workspace-a', role:'general_manager' };
  const refreshes = Array.from({ length:3 }, () => race.window.AQARI_SUPABASE.refreshContext(expected));
  await spinUntil(() => race.finalSessionARequested, 'the shared refresh did not reach its final session check');
  race.finalSessionA.resolve({
    data:{ session:{ user:{ id:'user-a', email:'a@example.test' } } },
    error:null
  });
  const contexts = await Promise.all(refreshes);
  assert.deepEqual(contexts.map((context) => context.user.id), ['user-a', 'user-a', 'user-a']);
  assert.deepEqual(contexts.map((context) => context.workspace.id), ['workspace-a', 'workspace-a', 'workspace-a']);
});

test('Supabase library load failure can retry without a page reload', async () => {
  const race = adapterLibraryRetryRuntime();
  const first = race.window.AQARI_SUPABASE.getClient();
  assert.equal(race.scripts.length, 1);
  const failedScript = race.scripts[0];
  failedScript.emit('error');
  await assert.rejects(first, /Failed to load Supabase JS/);
  assert.equal(race.activeScript, null);

  const client = { auth:{} };
  const second = race.window.AQARI_SUPABASE.getClient();
  assert.equal(race.scripts.length, 2);
  assert.notEqual(race.scripts[1], failedScript);
  race.window.supabase = { createClient(){ return client; } };
  race.scripts[1].emit('load');
  assert.equal(await second, client);
});

test('unauthorized login forces a clean listener rebind on reload', () => {
  const bridge = fs.readFileSync(path.join(root, 'secure-auth-bridge.js'), 'utf8');
  const login = bridge.match(/window\.cloudLoginV198 = async function\(\)\{[\s\S]*?\n  \};/);
  assert.ok(login);
  assert.match(login[0], /error\?\.code === 'AQARI_ACCESS_DENIED'\) hardResetPage\(\)/);
});

test('a transient listener install failure retries once and shares the in-flight retry', async () => {
  const race = listenerRetryRuntime();
  await race.listeners.DOMContentLoaded();
  assert.equal(race.getClientCalls, 1);
  assert.equal(race.listenerCount, 0);
  assert.equal(race.timers.length, 1);
  assert.equal(race.timers[0].delay, 1000);

  race.timers.shift().callback();
  race.windowListeners.focus();
  assert.equal(race.getClientCalls, 2, 'timer and focus must share one listener installation');
  race.clientReady.resolve(race.client);
  await spinUntil(() => race.listenerCount === 1, 'listener retry did not finish');
  assert.equal(race.getClientCalls, 2);
  assert.equal(race.listenerCount, 1);
});

test('startup backup is owned by the auth boundary and the late release wrapper is gone', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const bridge = fs.readFileSync(path.join(root, 'secure-auth-bridge.js'), 'utf8');
  const releaseUI = fs.readFileSync(path.join(root, 'final-release-ui.js'), 'utf8');

  assert.match(html, /AQARI_STARTUP_BACKUP=Object\.freeze\(\{[\s\S]*?schedule:scheduleStartupBackupV211,[\s\S]*?cancel:cancelStartupBackupV211/);
  assert.doesNotMatch(html, /setTimeout\(\(\)=>makeAutoBackup\(\),1500\)/);
  assert.match(bridge, /function sealData\(\)\{[\s\S]*?AQARI_STARTUP_BACKUP\?\.cancel\?\.\(\)/);
  assert.match(bridge, /function unlock\(nextContext, nextRemoteState\)\{[\s\S]*?activateWorkspaceDbV198[\s\S]*?AQARI_STARTUP_BACKUP\?\.schedule\?\.\(\)/);
  assert.doesNotMatch(releaseUI, /installStartupBackupGuard|__v211StartupGuard/);
  assert.match(releaseUI, /عقاري V266 — التشغيل الآلي السحابي/);
});

test('index starts with an empty database and never reads the legacy global key', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /let db=\{\};const aqariV198LegacyDemo=/);
  assert.doesNotMatch(html, /let db=JSON\.parse\(localStorage\.getItem\('aqari_v30'\)/);
  assert.match(html, /function persist\(\)\{const gate=window\.AQARI_DATA_GATE;if\(!gate\?\.scope\)return false/);
});

test('signed-out callers cannot read, export, or activate workspace data', () => {
  const victim = JSON.stringify({ tenants:[['PRIVATE TENANT']] });
  const { window } = runtime({
    aqari_v30:victim,
    'aqari_v30::workspace::workspace-a':victim
  });
  assert.throws(() => window.AQARI_DATA_GATE.activate(access('user-a', 'workspace-a')), /matching active workspace/);
  assert.throws(() => window.AQARI_CLOUD_SYNC.collectLocalSnapshot(), /matching active workspace/);
  assert.equal(window.AQARI_DATA_GATE.scope, null);
});

test('workspace activation ignores the global key, preserves canonical data, and fails closed on account switch', () => {
  const contextA = access('user-a', 'workspace-a');
  const contextB = access('user-b', 'workspace-b');
  const { window, localStorage } = runtime({
    aqari_v30:JSON.stringify({ tenants:[['GLOBAL PRIVATE']] }),
    'aqari_v30::workspace::workspace-a':JSON.stringify({ tenants:[['<img src=x onerror=alert(1)>']] }),
    'aqari_v30::workspace::workspace-b':JSON.stringify({ tenants:[['WORKSPACE B']] })
  });

  window.AQARI_SUPABASE.context = contextA;
  const stateA = window.AQARI_DATA_GATE.activate(contextA);
  assert.equal(stateA.tenants[0][0], '<img src=x onerror=alert(1)>');
  assert.doesNotMatch(JSON.stringify(stateA), /GLOBAL PRIVATE/);

  window.AQARI_DATA_GATE.write({ tenants:[['" onclick="alert(1)']] });
  assert.equal(
    JSON.parse(localStorage.getItem('aqari_v30::workspace::workspace-a')).tenants[0][0],
    '" onclick="alert(1)'
  );

  window.AQARI_SUPABASE.context = contextB;
  assert.throws(() => window.AQARI_DATA_GATE.read(), /matching active workspace/);
  assert.throws(() => window.AQARI_DATA_GATE.scopedStorageSnapshot(), /matching active workspace/);
  const stateB = window.AQARI_DATA_GATE.activate(contextB);
  assert.equal(stateB.tenants[0][0], 'WORKSPACE B');
});

test('cloud state seeds an empty workspace in memory without silently writing local storage', () => {
  const contextA = access('user-a', 'workspace-a');
  const { window, localStorage } = runtime();
  window.AQARI_SUPABASE.context = contextA;

  const state = window.AQARI_DATA_GATE.activate(contextA, {
    format:'aqari-cloud-state-v1',
    snapshot:{ values:{ aqari_v30:{ tenants:[['<b>REMOTE</b>']] } } }
  });

  assert.equal(state.tenants[0][0], '<b>REMOTE</b>');
  assert.equal(localStorage.getItem('aqari_v30::workspace::workspace-a'), null);
});

test('data gate read then write preserves markup-like canonical text exactly', () => {
  const contextA = access('user-a', 'workspace-a');
  const { window, localStorage } = runtime();
  window.AQARI_SUPABASE.context = contextA;
  window.AQARI_DATA_GATE.activate(contextA);
  const canonical = { properties:[['<ACME & Sons>', '&lt;Tower&gt;', "O'Brien\nBlock A"]] };
  window.AQARI_DATA_GATE.write(canonical);
  const firstRead = JSON.parse(JSON.stringify(window.AQARI_DATA_GATE.read()));
  assert.deepEqual(firstRead, canonical);
  window.AQARI_DATA_GATE.write(firstRead);
  assert.deepEqual(JSON.parse(localStorage.getItem('aqari_v30::workspace::workspace-a')), canonical);
});

test('cloud restore rechecks scope after await and cannot write into a switched workspace', async () => {
  const contextA = access('user-a', 'workspace-a');
  const contextB = access('user-b', 'workspace-b');
  const { window, localStorage } = runtime();
  let resolveLoad;
  window.AQARI_SUPABASE.context = contextA;
  window.AQARI_SUPABASE.loadAppState = () => new Promise((resolve) => { resolveLoad = resolve; });
  window.AQARI_DATA_GATE.activate(contextA);

  const restoring = window.AQARI_CLOUD_SYNC.restoreCloudToLocal({ overwrite:true });
  window.AQARI_SUPABASE.context = contextB;
  resolveLoad({ payload:{ tenants:[['PRIVATE A']] }, revision:7, updated_at:'now' });

  await assert.rejects(restoring, /matching active workspace/);
  assert.equal(localStorage.getItem('aqari_v30::workspace::workspace-a'), null);
  assert.equal(localStorage.getItem('aqari_v30::workspace::workspace-b'), null);
});

test('cold boot purges unscoped legacy contracts, requests, backups, and stored XSS before app scripts', () => {
  const attack = '<img src=x onerror="globalThis.pwned=1">';
  const { window, nativeStorage, nativeSessionStorage } = earlyStorageRuntime({
    aqari_contracts_v55:JSON.stringify([{ tenant:attack }]),
    aqari_tenant_requests_v91:JSON.stringify([{ details:attack }]),
    aqari_v74_recovery_point:JSON.stringify({ db:{ tenants:[[attack]] } }),
    'aqari-supabase-auth-v198':'SUPABASE_LOCAL_SESSION_EXACT',
    harmless_preference:'kept'
  }, {
    aqari_session_v120:JSON.stringify({ username:attack }),
    aqari_v201_property:'Private Property',
    'aqari-supabase-auth-v198':'SUPABASE_SESSION_EXACT'
  });

  assert.equal(nativeStorage.getItem('aqari_contracts_v55'), null);
  assert.equal(nativeStorage.getItem('aqari_tenant_requests_v91'), null);
  assert.equal(nativeStorage.getItem('aqari_v74_recovery_point'), null);
  assert.equal(nativeStorage.getItem('aqari-supabase-auth-v198'), 'SUPABASE_LOCAL_SESSION_EXACT');
  assert.equal(nativeStorage.getItem('aqari_legacy_quarantine::aqari-supabase-auth-v198'), null);
  assert.equal(window.localStorage.getItem('aqari-supabase-auth-v198'), 'SUPABASE_LOCAL_SESSION_EXACT');
  assert.match(nativeStorage.getItem('aqari_legacy_quarantine::aqari_contracts_v55'), /<img/);
  assert.equal(window.localStorage.getItem('aqari_contracts_v55'), null);
  assert.equal(window.localStorage.length, 2);
  assert.deepEqual(
    [window.localStorage.key(0), window.localStorage.key(1)].sort(),
    ['aqari-supabase-auth-v198', 'harmless_preference']
  );
  assert.equal(nativeSessionStorage.getItem('aqari_session_v120'), null);
  assert.equal(nativeSessionStorage.getItem('aqari_v201_property'), null);
  assert.equal(window.sessionStorage.getItem('aqari-supabase-auth-v198'), 'SUPABASE_SESSION_EXACT');
});

test('legacy business storage preserves canonical bytes and stays isolated across A to B workspace switches', () => {
  const contextA = access('user-a', 'workspace-a');
  const contextB = access('user-b', 'workspace-b');
  const { window, nativeStorage } = earlyStorageRuntime();

  window.AQARI_SUPABASE.context = contextA;
  window.AQARI_EARLY_STORAGE_GATE.activate(contextA);
  window.localStorage.setItem('aqari_contracts_v55', JSON.stringify([{
    tenant:'A <img src=x onerror="alert(1)">', unit:'A-1'
  }]));
  window.localStorage.setItem('aqari_tenant_requests_v91', JSON.stringify([{
    tenant:'Tenant A', details:'" onclick="alert(2)'
  }]));
  window.localStorage.setItem('aqari_v74_recovery_point', JSON.stringify({ owner:'Owner A' }));

  const physicalA = 'aqari_workspace_store::workspace-a::aqari_contracts_v55';
  assert.equal(nativeStorage.getItem('aqari_contracts_v55'), null);
  assert.match(nativeStorage.getItem(physicalA), /<img/);
  assert.match(window.localStorage.getItem('aqari_contracts_v55'), /<img/);
  assert.match(JSON.parse(window.localStorage.getItem('aqari_contracts_v55'))[0].tenant, /A <img/);

  window.AQARI_EARLY_STORAGE_GATE.seal();
  assert.equal(window.localStorage.getItem('aqari_contracts_v55'), null);
  window.AQARI_SUPABASE.context = contextB;
  window.AQARI_EARLY_STORAGE_GATE.activate(contextB);
  assert.equal(window.localStorage.getItem('aqari_contracts_v55'), null);
  assert.equal(window.localStorage.getItem('aqari_tenant_requests_v91'), null);
  assert.equal(window.localStorage.getItem('aqari_v74_recovery_point'), null);
  window.localStorage.setItem('aqari_contracts_v55', JSON.stringify([{ tenant:'Tenant B' }]));

  window.AQARI_EARLY_STORAGE_GATE.seal();
  window.AQARI_SUPABASE.context = contextA;
  window.AQARI_EARLY_STORAGE_GATE.activate(contextA);
  assert.match(window.localStorage.getItem('aqari_contracts_v55'), /A <img/);
  assert.doesNotMatch(window.localStorage.getItem('aqari_contracts_v55'), /Tenant B/);
});

test('workspace facade preserves canonical punctuation, newlines, and technical URLs without touching Supabase auth', () => {
  const contextA = access('user-a', 'workspace-a');
  const { window, nativeStorage, nativeSessionStorage } = earlyStorageRuntime({}, {
    'aqari-supabase-auth-v198':'pkce&token=O\'Brien'
  });
  window.AQARI_SUPABASE.context = contextA;
  window.AQARI_EARLY_STORAGE_GATE.activate(contextA);
  const canonical = {
    company:'AT&T',
    tenant:"O'Brien",
    note:'line one\nline two\\path',
    url:'https://example.test/report?a=1&b=2',
    literal:'<ACME & Sons>',
    entity:'&lt;tenant&gt;'
  };
  window.localStorage.setItem('aqari_documents_v96', JSON.stringify(canonical));

  const physical = 'aqari_workspace_store::workspace-a::aqari_documents_v96';
  assert.deepEqual(JSON.parse(nativeStorage.getItem(physical)), canonical);
  assert.deepEqual(JSON.parse(window.localStorage.getItem('aqari_documents_v96')), canonical);
  const readThenWrite = JSON.parse(window.localStorage.getItem('aqari_documents_v96'));
  window.localStorage.setItem('aqari_documents_v96', JSON.stringify(readThenWrite));
  assert.deepEqual(JSON.parse(nativeStorage.getItem(physical)), canonical);
  assert.equal(nativeSessionStorage.getItem('aqari-supabase-auth-v198'), 'pkce&token=O\'Brien');
  assert.equal(window.sessionStorage.getItem('aqari-supabase-auth-v198'), 'pkce&token=O\'Brien');
});

test('session storage is isolated by both user and workspace', () => {
  const contextA = access('user-a', 'workspace-shared');
  const contextB = access('user-b', 'workspace-shared');
  const { window, nativeSessionStorage } = earlyStorageRuntime();
  window.AQARI_SUPABASE.context = contextA;
  window.AQARI_EARLY_STORAGE_GATE.activate(contextA);
  window.sessionStorage.setItem('aqari_v201_property', 'Property A');
  assert.equal(nativeSessionStorage.getItem('aqari_workspace_session::user-a::workspace-shared::aqari_v201_property'), 'Property A');
  window.AQARI_EARLY_STORAGE_GATE.seal();
  window.AQARI_SUPABASE.context = contextB;
  window.AQARI_EARLY_STORAGE_GATE.activate(contextB);
  assert.equal(window.sessionStorage.getItem('aqari_v201_property'), null);
  window.sessionStorage.setItem('aqari_v201_property', 'Property B');
  assert.equal(nativeSessionStorage.getItem('aqari_workspace_session::user-b::workspace-shared::aqari_v201_property'), 'Property B');
  window.AQARI_EARLY_STORAGE_GATE.seal();
  window.AQARI_SUPABASE.context = contextA;
  window.AQARI_EARLY_STORAGE_GATE.activate(contextA);
  assert.equal(window.sessionStorage.getItem('aqari_v201_property'), null);
});

test('HTML sink blocks quote-only event injection without mutating canonical workspace data', () => {
  const contextA = access('user-a', 'workspace-a');
  const { window, nativeStorage } = earlyStorageRuntime({}, {}, true);
  window.AQARI_SUPABASE.context = contextA;
  window.AQARI_EARLY_STORAGE_GATE.activate(contextA);
  const quoteOnly = '" onerror="globalThis.pwned=1';
  window.localStorage.setItem('aqari_documents_v96', JSON.stringify({ title:quoteOnly }));

  const physical = 'aqari_workspace_store::workspace-a::aqari_documents_v96';
  assert.equal(JSON.parse(nativeStorage.getItem(physical)).title, quoteOnly);
  assert.equal(JSON.parse(window.localStorage.getItem('aqari_documents_v96')).title, quoteOnly);
  const rendered = window.AQARI_EARLY_STORAGE_GATE.sanitizeHTML('<div data-title="' + quoteOnly + '">safe</div>');
  assert.doesNotMatch(rendered, /\sonerror\s*=/i);
  assert.doesNotMatch(window.AQARI_EARLY_STORAGE_GATE.sanitizeHTML('<button onclick="alert(1)">x</button>'), /\sonclick\s*=/i);
  const navigation = window.AQARI_EARLY_STORAGE_GATE.sanitizeHTML('<button onclick="go(\'home\')">x</button>');
  assert.doesNotMatch(navigation, /\sonclick\s*=/i);
  assert.match(navigation, /data-aqari-nav-action="home"/);
  const destructive = window.AQARI_EARLY_STORAGE_GATE.sanitizeHTML('<button onclick="del(0)">x</button>');
  assert.doesNotMatch(destructive, /\sonclick\s*=|data-aqari-nav-action/i);
  const target = new window.Element();
  target.innerHTML = '<div data-title="' + quoteOnly + '">safe</div>';
  assert.doesNotMatch(target.innerHTML, /\sonerror\s*=/i);
});

test('A to B bootstrap requests stay single-flight, activate only B, and legacy logout resets safely', async () => {
  const race = bridgeRaceRuntime();
  const starting = race.listeners.DOMContentLoaded();
  assert.equal(await race.window.lockNowV120(), false, 'legacy startup lock must not terminate an in-flight secure bootstrap');
  assert.equal(race.signOutCount, 0);
  await spinUntil(() => race.remotes.has('workspace-a'), 'workspace A cloud load did not start');
  assert.equal(typeof race.authCallback, 'function');

  const sealsBeforeAuthEvent = race.sealCount;
  race.authCallback('SIGNED_IN', { user:{ id:'user-b' } });
  assert.ok(race.scheduled.length > 0, 'account switch must schedule a new bootstrap');
  assert.equal(
    race.sealCount,
    sealsBeforeAuthEvent,
    'the Supabase auth callback must not synchronously seal or render the workspace'
  );
  race.scheduled.shift()();
  assert.equal(
    race.sealCount,
    sealsBeforeAuthEvent,
    'an auth event must coalesce with the already sealed bootstrap instead of invalidating it'
  );
  assert.equal(race.remotes.has('workspace-b'), false, 'a second bootstrap must not overlap the active flight');
  assert.equal(race.maxRemoteLoads, 1);

  race.remotes.get('workspace-a').resolve({
    workspace_id:'workspace-a', payload:{ tenants:[['TENANT A']] }, revision:1
  });
  await spinUntil(() => race.remotes.has('workspace-b'), 'workspace B trailing bootstrap did not start');

  race.remotes.get('workspace-b').resolve({
    workspace_id:'workspace-b', payload:{ tenants:[['TENANT B']] }, revision:2
  });
  await spinUntil(() => race.activations.length === 1, 'workspace B did not unlock');
  assert.deepEqual(race.activations[0], {
    workspace:'workspace-b', payload:{ tenants:[['TENANT B']] }
  });
  assert.equal(race.portfolioResumeCount, 1, 'validated workspace unlock must resume V208 portfolio exactly once');
  assert.equal(race.searchResumeCount, 1, 'validated workspace unlock must resume V209 search exactly once');
  assert.equal(race.commandResumeCount, 1, 'validated workspace unlock must resume V210 command center exactly once');
  assert.equal(race.followUpResumeCount, 1, 'validated workspace unlock must resume V211 follow-up center exactly once');
  await starting;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(race.activations.length, 1);
  assert.equal(race.maxRemoteLoads, 1, 'bootstrap work must stay single-flight');
  assert.equal(race.startupBackupScheduleCount, 1, 'only the validated workspace unlock schedules backup');
  assert.ok(race.startupBackupCancelCount >= 2, 'each lock/bootstrap transition cancels pending backup');

  const sealsBeforeLogout = race.sealCount;
  race.setSignOutShouldFail(true);
  race.setClearShouldFail(true);
  assert.equal(await race.window.logoutProductionV75(), false);
  assert.equal(race.signOutCount, 1);
  assert.equal(race.clearCount, 1);
  assert.ok(race.sealCount > sealsBeforeLogout);
  assert.deepEqual(race.hardResets, []);
  race.setSignOutShouldFail(false);
  race.setClearShouldFail(false);
  await race.window.logoutProductionV75();
  assert.equal(race.signOutCount, 2);
  assert.ok(race.sealCount > sealsBeforeLogout);
  assert.deepEqual(race.hardResets, ['https://aqari.test/app?mode=secure']);
  const sealsBeforeIdleLock = race.sealCount;
  assert.equal(await race.window.lockSessionV75(), false, 'an already locked bridge must not issue another global sign-out');
  assert.equal(race.signOutCount, 2);
  assert.ok(race.sealCount > sealsBeforeIdleLock);
  assert.deepEqual(race.hardResets, ['https://aqari.test/app?mode=secure']);
  assert.ok(race.presentationSealCount >= 12, 'logout and idle lock must synchronously seal every protected presentation module');
});

test('repeated same-user token refreshes cannot starve an active workspace bootstrap', async () => {
  const race = bridgeRaceRuntime({ tokenRefreshesPerContext:3 });
  const starting = race.listeners.DOMContentLoaded();
  await spinUntil(() => race.remoteLoads.length === 1, 'initial workspace cloud load did not start');

  const sealsBeforeDeferredEvents = race.sealCount;
  assert.equal(race.sealsInsideAuthCallback, 0, 'Supabase auth callbacks must never seal synchronously');
  while(race.scheduled.length) race.scheduled.shift()();
  assert.equal(race.sealsInsideAuthCallback, 0);
  assert.equal(race.sealCount, sealsBeforeDeferredEvents, 'same-user positive events must not relock an active bootstrap');

  race.remoteLoads[0].pending.resolve({
    workspace_id:'workspace-a', payload:{ tenants:[['TENANT A']] }, revision:1
  });
  await spinUntil(
    () => race.activations.length === 1 || race.remoteLoads.length > 1,
    'workspace bootstrap neither activated nor retried'
  );
  assert.equal(race.remoteLoads.length, 1, 'same-user token refreshes must be coalesced into the active flight');
  assert.deepEqual(race.activations, [{ workspace:'workspace-a', payload:{ tenants:[['TENANT A']] } }]);
  await starting;
});

test('legacy idle lock signs out only after the secure workspace is active', async () => {
  const race = bridgeRaceRuntime();
  const starting = race.listeners.DOMContentLoaded();
  await spinUntil(() => race.remotes.has('workspace-a'), 'workspace A cloud load did not start');
  race.remotes.get('workspace-a').resolve({
    workspace_id:'workspace-a', payload:{ tenants:[['TENANT A']] }, revision:1
  });
  await spinUntil(() => race.activations.length === 1, 'workspace A did not unlock');
  await starting;
  assert.equal(await race.window.lockSessionV75(), true);
  assert.equal(race.signOutCount, 1);
  assert.deepEqual(race.hardResets, ['https://aqari.test/app?mode=secure']);
});

test('legacy V120 startup timer yields to the secure Supabase bridge', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /setTimeout\(\(\)=>lockNowV120\(\),100\)/);
  assert.match(html, /document\.getElementById\('aqari-v198-secure-cloud-js'\)/);
});

test('IndexedDB access is workspace-scoped, epoch guarded after awaits, and closed on seal', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /indexedDB\.open\('aqari_workspace_'\+encodeURIComponent\(workspaceId\)\+'_vault_v40'/);
  assert.match(html, /indexedDB\.open\('aqari_workspace_'\+encodeURIComponent\(workspaceId\)\+'_'\+AQARI_V47_STORE/);
  assert.match(html, /function closeWorkspaceIndexedDbV206\(\)\{[\s\S]*?workspaceStorageEpochV206\+=1;[\s\S]*?vaultDb\.close\(\)[\s\S]*?aqariV47Db\.close\(\)/);
  assert.match(html, /async function getVaultFiles[\s\S]*?await new Promise[\s\S]*?assertWorkspaceStorageV206\(ticket\);return rows/);
  assert.match(html, /async function restoreFromIndexedDb[\s\S]*?await new Promise[\s\S]*?assertWorkspaceStorageV206\(ticket\)[\s\S]*?AQARI_DATA_GATE\?\.prepareState\(rec\.data\)/);
  assert.match(html, /async function makeAutoBackup[\s\S]*?await new Promise[\s\S]*?assertWorkspaceStorageV206\(ticket\)/);
  assert.match(html, /async function restore\(e\)[\s\S]*?captureWorkspaceStorageV206\(\)[\s\S]*?await file\.text\(\)[\s\S]*?assertWorkspaceStorageV206\(ticket\)[\s\S]*?db=next/);
  assert.match(html, /async function importCsvV47\(\)[\s\S]*?captureWorkspaceStorageV206\(\)[\s\S]*?await file\.text\(\)[\s\S]*?assertWorkspaceStorageV206\(ticket\)[\s\S]*?db\[section\]=nextRows/);
  assert.match(html, /function renderCoreRowsV206\(\)[\s\S]*?textContent=String\(values\[column\][\s\S]*?addEventListener\('click',\(\)=>del\(index\)\)/);
  assert.doesNotMatch(html, /vaultRows\.innerHTML=rows\.map/);
});

test('auth bridge seals before showing the gate and hydrates only while unlocking', () => {
  const bridge = fs.readFileSync(path.join(root, 'secure-auth-bridge.js'), 'utf8');
  assert.match(bridge, /refreshContext\(expectedAccess\)/);
  assert.match(bridge, /loadContextCandidate\(currentIdentity\)/);
  assert.match(bridge, /function showGate[\s\S]*?sealData\(\);[\s\S]*?context = null/);
  assert.match(bridge, /function unlock\(nextContext, nextRemoteState\)[\s\S]*?requireRemoteWorkspace\(nextContext, nextRemoteState\)[\s\S]*?activateWorkspaceDbV198\(nextContext, nextRemoteState\?\.payload\)[\s\S]*?classList\.remove\('on'\)/);
  assert.match(bridge, /const activeRemoteState = await boundedBootstrap\(loadRemoteCandidate\(active\)[\s\S]*?unlock\(active, activeRemoteState\)/);
  assert.match(bridge, /function legacyLockV198\(\)[\s\S]*?sameIdentity\(expected, live\)[\s\S]*?return false[\s\S]*?cloudLogoutV198\(\)/);
  assert.match(bridge, /window\.lockNowV120 = legacyLockV198/);
  assert.match(bridge, /window\.lockSessionV75 = legacyLockV198/);
  assert.match(bridge, /window\.logoutProductionV75 = \(\) => window\.cloudLogoutV198\(\)/);
  assert.match(bridge, /clearPersistedSession[\s\S]*?verifySessionNull[\s\S]*?return false[\s\S]*?hardResetPage\(\)/);
  assert.match(bridge, /aqariCloudUploadV198[\s\S]*?addEventListener\('click', action\)/);
  assert.doesNotMatch(bridge.match(/function buildPanel\(\)[\s\S]*?function installOverrides/)[0], /onclick=/);
  assert.match(bridge, /loadAppState\(expectedAccess\)/);
  assert.match(fs.readFileSync(path.join(root, 'cloud-sync.js'), 'utf8'), /loadAppState\(scope\)[\s\S]*?saveAppState\(payload, Number\(cloud\?\.revision \|\| 0\), scope\)/);
  assert.match(bridge, /generation !== authGeneration/);
});

test('first paint stays closed until the login shell exists and only unlock reveals app content', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const bridge = fs.readFileSync(path.join(root, 'secure-auth-bridge.js'), 'utf8');
  const guardIndex = html.indexOf('id="aqari-auth-paint-guard"');
  const bodyIndex = html.indexOf('<body');
  const gateIndex = html.indexOf('id="aqariCloudGateV168"');
  const readyIndex = html.indexOf('id="aqari-shell-ready"');
  const legacyGateIndex = html.indexOf('id="auth"');
  const publicConfigIndex = html.indexOf('defer src="/public-config.js"');
  const bridgeIndex = html.indexOf('id="aqari-v198-secure-cloud-js"');
  assert.ok(guardIndex > 0 && guardIndex < bodyIndex);
  assert.ok(gateIndex > bodyIndex && readyIndex > gateIndex && legacyGateIndex > readyIndex && publicConfigIndex > legacyGateIndex && bridgeIndex > publicConfigIndex);
  assert.match(html, /html:not\(\.aqari-shell-ready\) body\{visibility:hidden!important\}/);
  assert.match(html, /html\.aqari-shell-ready:not\(\.aqari-auth-unlocked\) #aqariCloudGateV168\{visibility:visible!important;display:flex!important\}/);
  assert.equal((html.match(/<script defer src="\//g) || []).length, 10);
  assert.match(html, /<script defer id="aqari-v198-secure-cloud-js" src="\/secure-auth-bridge\.js"><\/script>/);
  assert.match(bridge, /function showGate[\s\S]*?classList\.remove\('aqari-auth-unlocked'\)/);
  assert.match(bridge, /function safelySeal\(action\)\{[\s\S]*?try\{ action\(\); \}catch/);
  assert.match(bridge, /function sealData\(\)[\s\S]*?safelySeal\(\(\) => window\.AQARI_V205\?\.seal\?\.\(\)\)/);
  assert.match(bridge, /safelySeal\(\(\) => window\.sealWorkspaceDbV198\?\.\(\)\);\s*safelySeal\(\(\) => window\.closeWorkspaceIndexedDbV206\?\.\(\)\);\s*safelySeal\(\(\) => window\.AQARI_DATA_GATE\?\.seal\(\)\);\s*safelySeal\(\(\) => window\.AQARI_EARLY_STORAGE_GATE\?\.seal\(\)\)/);
  assert.match(bridge, /function showGate[\s\S]*?removeAttribute\('inert'\)[\s\S]*?setAttribute\('aria-hidden','false'\)[\s\S]*?sealData\(\)/);
  assert.match(bridge, /Number\(error\?\.status \|\| error\?\.statusCode \|\| 0\) >= 500[\s\S]*?تعثر الاتصال الآمن مؤقتاً/);
  const unlock = bridge.match(/function unlock\(nextContext, nextRemoteState\)\{[\s\S]*?\n  \}/)[0];
  assert.match(unlock, /classList\.add\('aqari-auth-unlocked'\)/);
  assert.match(unlock, /setAttribute\('aria-hidden','true'\)[\s\S]*?setAttribute\('inert',''\)/);
  assert.equal((bridge.match(/classList\.add\('aqari-auth-unlocked'\)/g) || []).length, 1);
  assert.match(bridge, /const listenerReady = installAuthListener\(\)[\s\S]*?await requestBootstrap\(\)[\s\S]*?await listenerReady/);
});
