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

function bridgeRaceRuntime(){
  const contextA = access('user-a', 'workspace-a');
  const contextB = access('user-b', 'workspace-b');
  const contexts = [contextA, contextB];
  const remotes = new Map();
  const activations = [];
  const listeners = {};
  const scheduled = [];
  let refreshIndex = 0;
  let live = { user:null, membership:null, workspace:null };
  let authCallback = null;
  let sealCount = 0;
  let signOutCount = 0;
  let signOutShouldFail = false;
  let clearShouldFail = false;
  let clearCount = 0;
  let presentationSealCount = 0;
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
      return next;
    },
    loadAppState(){
      const workspaceId = live.workspace.id;
      const pending = deferred();
      remotes.set(workspaceId, pending);
      return pending.promise;
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
    localStorage,
    sessionStorage,
    sealWorkspaceDbV198(){ sealCount += 1; },
    activateWorkspaceDbV198(candidate, payload){
      activations.push({ workspace:candidate.workspace.id, payload });
    },
    addEventListener(){},
    confirm(){ return true; }
  };
  const sandbox = vm.createContext({
    window, document, localStorage, sessionStorage,
    location:{ origin:'https://aqari.test', pathname:'/app', search:'?mode=secure', replace(value){ hardResets.push(value); } },
    setTimeout(callback){ scheduled.push(callback); return scheduled.length; },
    setInterval(){ return 1; },
    console
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'secure-auth-bridge.js'), 'utf8'), sandbox);
  return {
    window, contextA, contextB, remotes, activations, listeners, scheduled,
    get authCallback(){ return authCallback; },
    get sealCount(){ return sealCount; },
    get signOutCount(){ return signOutCount; },
    get clearCount(){ return clearCount; },
    setSignOutShouldFail(value){ signOutShouldFail = Boolean(value); },
    setClearShouldFail(value){ clearShouldFail = Boolean(value); },
    get presentationSealCount(){ return presentationSealCount; },
    get hardResets(){ return hardResets; }
  };
}

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
    harmless_preference:'kept'
  }, {
    aqari_session_v120:JSON.stringify({ username:attack }),
    aqari_v201_property:'Private Property',
    'aqari-supabase-auth-v198':'SUPABASE_SESSION_EXACT'
  });

  assert.equal(nativeStorage.getItem('aqari_contracts_v55'), null);
  assert.equal(nativeStorage.getItem('aqari_tenant_requests_v91'), null);
  assert.equal(nativeStorage.getItem('aqari_v74_recovery_point'), null);
  assert.match(nativeStorage.getItem('aqari_legacy_quarantine::aqari_contracts_v55'), /<img/);
  assert.equal(window.localStorage.getItem('aqari_contracts_v55'), null);
  assert.equal(window.localStorage.length, 1);
  assert.equal(window.localStorage.key(0), 'harmless_preference');
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

test('overlapping A to B bootstraps activate only B and legacy logout performs Supabase sign-out plus reset', async () => {
  const race = bridgeRaceRuntime();
  const starting = race.listeners.DOMContentLoaded();
  await spinUntil(() => race.remotes.has('workspace-a'), 'workspace A cloud load did not start');
  assert.equal(typeof race.authCallback, 'function');

  race.authCallback('SIGNED_IN', { user:{ id:'user-b' } });
  assert.ok(race.scheduled.length > 0, 'account switch must schedule a new bootstrap');
  race.scheduled.shift()();
  await spinUntil(() => race.remotes.has('workspace-b'), 'workspace B cloud load did not start');

  race.remotes.get('workspace-b').resolve({
    workspace_id:'workspace-b', payload:{ tenants:[['TENANT B']] }, revision:2
  });
  await spinUntil(() => race.activations.length === 1, 'workspace B did not unlock');
  assert.deepEqual(race.activations[0], {
    workspace:'workspace-b', payload:{ tenants:[['TENANT B']] }
  });

  race.remotes.get('workspace-a').resolve({
    workspace_id:'workspace-a', payload:{ tenants:[['TENANT A']] }, revision:1
  });
  await starting;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(race.activations.length, 1);

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
  await race.window.lockSessionV75();
  assert.equal(race.signOutCount, 3);
  assert.ok(race.sealCount > sealsBeforeIdleLock);
  assert.deepEqual(race.hardResets, ['https://aqari.test/app?mode=secure','https://aqari.test/app?mode=secure']);
  assert.ok(race.presentationSealCount >= 4, 'logout and idle lock must synchronously seal V201/V202 presentation state');
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
  assert.match(bridge, /function showGate[\s\S]*?sealData\(\);[\s\S]*?context = null/);
  assert.match(bridge, /function unlock\(nextContext, nextRemoteState\)[\s\S]*?requireRemoteWorkspace\(nextContext, nextRemoteState\)[\s\S]*?activateWorkspaceDbV198\(nextContext, nextRemoteState\?\.payload\)[\s\S]*?classList\.remove\('on'\)/);
  assert.match(bridge, /const activeRemoteState = await loadRemoteCandidate\(active\)[\s\S]*?unlock\(active, activeRemoteState\)/);
  assert.match(bridge, /window\.lockSessionV75 = \(\) => window\.cloudLogoutV198\(\)/);
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
  const bridgeIndex = html.indexOf('id="aqari-v198-secure-cloud-js"');
  assert.ok(guardIndex > 0 && guardIndex < bodyIndex);
  assert.ok(gateIndex > bodyIndex && readyIndex > gateIndex && bridgeIndex > readyIndex);
  assert.match(html, /html:not\(\.aqari-shell-ready\) body\{visibility:hidden!important\}/);
  assert.match(html, /html\.aqari-shell-ready:not\(\.aqari-auth-unlocked\) #aqariCloudGateV168\{visibility:visible!important;display:flex!important\}/);
  assert.match(bridge, /function showGate[\s\S]*?classList\.remove\('aqari-auth-unlocked'\)/);
  const unlock = bridge.match(/function unlock\(nextContext, nextRemoteState\)\{[\s\S]*?\n  \}/)[0];
  assert.match(unlock, /classList\.add\('aqari-auth-unlocked'\)/);
  assert.equal((bridge.match(/classList\.add\('aqari-auth-unlocked'\)/g) || []).length, 1);
});
