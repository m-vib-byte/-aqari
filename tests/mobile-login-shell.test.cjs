const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(root + '/login.html', 'utf8');
const adapter = fs.readFileSync(root + '/supabase-adapter.js', 'utf8');
const config = JSON.parse(fs.readFileSync(root + '/vercel.json', 'utf8'));

const rewrite = (source) => config.rewrites.find((item) => item.source === source);
const redirect = (source) => config.redirects.find((item) => item.source === source);
assert.equal(redirect('/')?.destination, '/login');
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
assert.match(html, /window\.location\.replace\('\/app'\)/);
assert.match(html, /retryButton\.addEventListener\('click',function\(\)\{ prepare\(false\); \}\)/);

const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter(Boolean);
assert.equal(inlineScripts.length, 1);
new vm.Script(inlineScripts[0], { filename:'login.html:inline' });
new vm.Script(adapter, { filename:'supabase-adapter.js' });

assert.match(adapter, /script\.src = '\/vendor\/supabase-js-2\.114\.0\.js'/);
assert.match(adapter, /script\.integrity = 'sha384-/);
assert.match(adapter, /new Set\(\['general_manager', 'property_manager', 'accountant'\]\)/);
assert.doesNotMatch(adapter, /service_role/i);
assert.ok(Buffer.byteLength(html) < 15_000, 'mobile login shell should stay under 15 KB');

console.log('mobile login shell tests: passed');
