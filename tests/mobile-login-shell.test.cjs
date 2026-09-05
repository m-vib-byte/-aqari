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
const redirect = (source) => config.redirects.find((item) => item.source === source);
assert.equal(redirect('/')?.destination, '/login?release=V211.1.2');
assert.equal(redirect('/')?.permanent, false);
assert.equal(
  redirect('/')?.has?.[0]?.value,
  '(?<ios>.*(?:iPhone|iPad|iPod|Macintosh.*Mobile).*)'
);
assert.equal(rewrite('/login')?.destination, '/login.html');
assert.equal(rewrite('/app')?.destination, '/index.html');
assert.equal(
  rewrite('/vendor/supabase-js-2.114.0.js')?.destination,
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.114.0/dist/umd/supabase.min.js'
);

const rootHeaders = config.headers.find((item) => item.source === '/')?.headers || [];
assert.equal(rootHeaders.find((item) => item.key === 'Vary')?.value, 'User-Agent');

for (const id of ['loginForm','email','password','loginButton','recoveryButton','retryButton','status']) {
  assert.match(html, new RegExp('id="' + id + '"'));
}
assert.ok(html.indexOf('<main') < html.indexOf('<script>'), 'login UI must precede JavaScript');
assert.match(html, /membership\.is_active === true/);
assert.match(html, /AQARI_SUPABASE\.signIn/);
assert.match(html, /sha384-0UK\+HVlz5Y7F\/\/atDpPysyocv/);
assert.match(html, /AQARI • V211\.1\.2/);
assert.match(html, /window\.location\.replace\('\/app\?release='/);
assert.match(html, /var context = window\.AQARI_SUPABASE\.context/);
assert.doesNotMatch(html, /AQARI_SUPABASE\.refreshContext/);
assert.doesNotMatch(html, /id="loginButton"[^>]*disabled/);
assert.doesNotMatch(html, /id="recoveryButton"[^>]*disabled/);
assert.match(html, /retireLegacyReleaseState\(\)/);
assert.match(html, /navigator\.serviceWorker\.getRegistrations/);
assert.match(html, /window\.caches\.keys\(\)/);
assert.match(html, /retryButton\.addEventListener\('click',function\(\)\{ if\(!busy\) prepare\(true\); \}\)/);

const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter(Boolean);
assert.equal(inlineScripts.length, 1);
new vm.Script(inlineScripts[0], { filename:'login.html:inline' });
new vm.Script(adapter, { filename:'supabase-adapter.js' });
new vm.Script(serviceWorker, { filename:'sw.js' });

assert.match(adapter, /script\.src = '\/vendor\/supabase-js-2\.114\.0\.js'/);
assert.match(adapter, /script\.integrity = 'sha384-/);
assert.match(adapter, /new Set\(\['general_manager', 'property_manager', 'accountant'\]\)/);
assert.doesNotMatch(adapter, /service_role/i);
assert.ok(Buffer.byteLength(html) < 15_000, 'mobile login shell should stay under 15 KB');

assert.match(serviceWorker, /AQARI_RELEASE = 'V211\.1\.2'/);
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
