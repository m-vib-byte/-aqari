import { chromium, webkit } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

// No credentials, production rows, or persistent auth state are used.
// The comparison isolates resource discovery at 300 ms per script response.
const latency = 300;
const output = 'test-results/login-speed';
fs.mkdirSync(output, { recursive:true });
const html = fs.readFileSync('login.html', 'utf8');
const baseline = html.replace(/^  <link rel="preload"[^>]+>\n/gm, '');
const adapter = fs.readFileSync('supabase-adapter.js', 'utf8');
const sdkResponse = await fetch('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/dist/umd/supabase.min.js', { signal:AbortSignal.timeout(20000) });
assert.ok(sdkResponse.ok);
const sdk = Buffer.from(await sdkResponse.arrayBuffer());
assert.equal(crypto.createHash('sha384').update(sdk).digest('base64'), 'JBR+x8blGwjDRO63aHCGiZMD4VNiTR4ZUGA+N6ZKLf3zNt1fK8IBpcgPaMrxqWBp');
const paths = ['/public-config.js', '/vendor/supabase-js-2.116.0.js', '/supabase-adapter.js'];
const config = "window.AQARI_PUBLIC_CONFIG={supabaseUrl:'https://example.invalid',supabasePublishableKey:'synthetic-public-key'};";
const files = new Map([[paths[0], config], [paths[1], sdk], [paths[2], adapter], ['/v267-login-locale.js', fs.readFileSync('v267-login-locale.js','utf8')]]);
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if(url.pathname === '/') {
    res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store' });
    res.end(url.searchParams.has('baseline') ? baseline : html);
  } else if(files.has(url.pathname)) {
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type':'application/javascript', 'Cache-Control':'public, max-age=3600' });
      res.end(files.get(url.pathname));
    }, latency);
  } else { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const results = [];
try {
  for(const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch({ headless:true });
    try {
      for(const before of [true, false]) {
        const context = await browser.newContext({ viewport:{width:1473,height:850} });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(origin + (before ? '/?baseline=1' : '/'), { waitUntil:'domcontentloaded' });
        await page.waitForFunction(() => Boolean(window.AQARI_SUPABASE?.context?.client), {}, { timeout:10000 });
        await page.waitForFunction(() => document.getElementById('status').textContent.includes('الاتصال جاهز'), {}, { timeout:10000 });
        assert.ok(await page.locator('#email').isVisible());
        assert.ok(await page.locator('#loginButton').isEnabled());
        assert.equal(new URL(page.url()).pathname, '/');
        const result = await page.evaluate(() => ({
          readyMs:Math.round(performance.now()),
          firstPaint:performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
          resources:performance.getEntriesByType('resource').filter(r => r.name.includes('.js')).map(r => ({path:new URL(r.name).pathname, start:r.startTime, end:r.responseEnd}))
        }));
        for(const path of paths) assert.equal(result.resources.filter(r => r.path === path).length, 1, 'one download per script');
        assert.deepEqual(errors, []);
        results.push({ engine:name, variant:before ? 'sequential-baseline':'preloaded', ...result });
        if(!before){
          await page.locator('#loginLanguageControl').waitFor({state:'visible'});
          await page.locator('#email').fill('fixture@example.test');await page.locator('#password').fill('synthetic-only');
          for(const width of [390,820,1440]){
            await page.setViewportSize({width,height:1000});
            for(const [code,title] of Object.entries({ar:'أملاكك، بكل وضوح.',en:'Your properties, clearly.',hi:'आपकी संपत्तियाँ, स्पष्ट रूप से।',ur:'آپ کی املاک، واضح طور پر۔',ml:'നിങ്ങളുടെ സ്വത്തുകൾ, വ്യക്തമായി.'})){
              await page.locator('#loginLanguage').selectOption(code);
              assert.equal(await page.locator('#title').textContent(),title);assert.equal(await page.locator('html').getAttribute('dir'),['ar','ur'].includes(code)?'rtl':'ltr');
              assert.equal(await page.locator('#email').inputValue(),'fixture@example.test');assert.equal(await page.locator('#password').inputValue(),'synthetic-only');assert.ok(await page.locator('#loginButton').isEnabled());
              assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
              await page.screenshot({path:output+'/'+name+'-'+width+'-'+code+'.png',fullPage:true});
            }
          }
          assert.deepEqual(errors,[]);console.log('LOGIN_LANGUAGES',name,'five languages at three widths; credentials preserved');
        }
        await context.close();
      }
      const [before, after] = results.filter(r => r.engine === name);
      const startSpread = Math.max(...after.resources.map(r => r.start)) - Math.min(...after.resources.map(r => r.start));
      assert.ok(startSpread < latency, 'all scripts must begin before the first response');
      assert.ok(after.readyMs < before.readyMs, 'cold login preparation must improve');
      console.log('LOGIN_SPEED', JSON.stringify({ engine:name, baselineMs:before.readyMs, preloadedMs:after.readyMs, savedMs:before.readyMs-after.readyMs, transportDelayMs:latency, startSpreadMs:Math.round(startSpread) }));
    } finally { await browser.close(); }
  }
} finally {
  fs.writeFileSync(output+'/comparison.json', JSON.stringify({note:'Controlled local signed-out test, not a production or iPad SLA',latency,results}, null, 2));
  server.closeAllConnections(); server.close();
}
