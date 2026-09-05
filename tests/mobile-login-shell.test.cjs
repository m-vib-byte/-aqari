const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(root + '/login.html', 'utf8');
const adapter = fs.readFileSync(root + '/supabase-adapter.js', 'utf8');
const serviceWorker = fs.readFileSync(root + '/sw.js', 'utf8');
const config = JSON.parse(fs.readFileSync(root + '/vercel.json', 'utf8'));

const rewrite = (source) => config.rewrites.find((item) => item.source === source);
const redirect = (source) => (config.redirects || []).find((item) => item.source === source);
assert.equal(redirect('/'), undefined, 'root must not require an extra browser navigation');
assert.equal(rewrite('/')?.destination, '/login.html');
assert.equal(rewrite('/')?.has, undefined, 'direct root entry must include iPad desktop mode');
assert.equal(config.rewrites.filter(item => item.source === '/').length, 1);
assert.equal(rewrite('/login')?.destination, '/login.html');
assert.equal(rewrite('/app')?.destination, '/index.html');
assert.equal(
  rewrite('/vendor/supabase-js-2.114.0.js')?.destination,
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.114.0/dist/umd/supabase.min.js'
);

const rootHeaders = config.headers.find((item) => item.source === '/')?.headers || [];
assert.equal(rootHeaders.find((item) => item.key === 'Vary'), undefined);

for (const id of ['loginForm','email','password','loginButton','recoveryButton','retryButton','status']) {
  assert.match(html, new RegExp('id="' + id + '"'));
}
assert.ok(html.indexOf('<main') < html.indexOf('<script>'), 'login UI must precede JavaScript');
assert.match(html, /membership\.is_active === true/);
assert.match(html, /AQARI_SUPABASE\.signIn/);
assert.match(html, /sha384-0UK\+HVlz5Y7F\/\/atDpPysyocv/);
assert.match(html, /AQARI • V266/);
assert.match(html, /window\.location\.replace\('\/app\?release='/);
assert.match(html, /var context = window\.AQARI_SUPABASE\.context/);
assert.match(html, /function restoreExistingSession/);
assert.doesNotMatch(html, /AQARI_SUPABASE\.signOut/);
assert.doesNotMatch(html, /id="loginButton"[^>]*disabled/);
assert.doesNotMatch(html, /id="recoveryButton"[^>]*disabled/);
assert.match(html, /loginButton\.disabled = busy/);
assert.match(html, /recoveryButton\.disabled = busy/);
assert.match(html, /retryButton\.disabled = busy \|\| preparing/);
assert.match(html, /error\.code = 'AQARI_TIMEOUT'/);
assert.match(html, /resetTimedOutCore\(error\)/);
assert.match(html, /retireLegacyReleaseState\(\)/);
assert.match(html, /navigator\.serviceWorker\.getRegistrations/);
assert.match(html, /window\.caches\.keys\(\)/);
assert.match(html, /retryButton\.addEventListener\('click',function\(\)\{ if\(!busy && !preparing\) prepare\(true\); \}\)/);

const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter(Boolean);
assert.equal(inlineScripts.length, 1);
new vm.Script(inlineScripts[0], { filename:'login.html:inline' });
new vm.Script(adapter, { filename:'supabase-adapter.js' });
new vm.Script(serviceWorker, { filename:'sw.js' });

// A stalled client bootstrap must never disable the credentials form. Retrying
// may disable only the retry control; the user can still submit credentials.
const elementHandlers = new Map();
const elements = Object.fromEntries(
  ['loginForm','email','password','loginButton','recoveryButton','retryButton','status'].map((id) => [id, {
    id, disabled:false, value:'', textContent:'', className:'',
    addEventListener(type, handler){ elementHandlers.set(id + ':' + type, handler); },
    focus(){}
  }])
);
const pendingClient = new Promise(() => {});
const timers = [];
const sandbox = {
  console,
  navigator:{},
  document:{ getElementById(id){ return elements[id] || null; } },
  setTimeout(handler, milliseconds){ timers.push({ handler, milliseconds }); return timers.length; },
  clearTimeout(){},
  window:{
    AQARI_PUBLIC_CONFIG:{},
    supabase:{ createClient(){} },
    AQARI_SUPABASE:{
      getClient(){ return pendingClient; },
      clearPersistedSession(){},
      context:{}
    },
    addEventListener(){},
    location:{ origin:'https://myaqari.com', replace(){} }
  }
};
sandbox.window.window = sandbox.window;
vm.runInNewContext(inlineScripts[0], sandbox, { filename:'login.html:pending-client' });
assert.equal(elements.loginButton.disabled, false, 'background preparation must not block login');
assert.equal(elements.recoveryButton.disabled, false, 'background preparation must not block recovery');
assert.equal(elements.retryButton.disabled, false, 'retry starts enabled');
elementHandlers.get('retryButton:click')();
assert.equal(elements.loginButton.disabled, false, 'manual preparation must not block login');
assert.equal(elements.recoveryButton.disabled, false, 'manual preparation must not block recovery');
assert.equal(elements.retryButton.disabled, true, 'duplicate preparation is blocked');

assert.match(adapter, /script\.src = '\/vendor\/supabase-js-2\.114\.0\.js'/);
assert.match(adapter, /script\.integrity = 'sha384-/);
assert.match(adapter, /new Set\(\['general_manager', 'property_manager', 'accountant'\]\)/);
assert.doesNotMatch(adapter, /service_role/i);
assert.ok(Buffer.byteLength(html) < 17_000, 'login plus automatic session restoration should stay under 17 KB');

assert.match(serviceWorker, /AQARI_RELEASE = 'V266'/);
assert.match(serviceWorker, /caches\.keys\(\)/);
assert.match(serviceWorker, /caches\.delete\(key\)/);
assert.match(serviceWorker, /self\.clients\.claim\(\)/);

const appHeaders = config.headers.find((item) => item.source === '/app')?.headers || [];
assert.match(appHeaders.find((item) => item.key === 'Cache-Control')?.value || '', /no-store/);
const swHeaders = config.headers.find((item) => item.source === '/sw.js')?.headers || [];
assert.match(swHeaders.find((item) => item.key === 'Cache-Control')?.value || '', /no-store/);
assert.equal(swHeaders.find((item) => item.key === 'Service-Worker-Allowed')?.value, '/');
for(const source of ['/final-release-ui.js','/v199-ui.js','/v201-experience.js']){
  const assetHeaders = config.headers.find((item) => item.source === source)?.headers || [];
  assert.match(assetHeaders.find((item) => item.key === 'Cache-Control')?.value || '', /no-store/);
}

console.log('mobile login shell tests: passed');
