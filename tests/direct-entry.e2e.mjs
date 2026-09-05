import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base = new URL(process.env.AQARI_BASE_URL || 'https://myaqari.com');
assert.equal(base.protocol, 'https:');
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '';
const output = 'test-results/direct-entry';
fs.mkdirSync(output, { recursive:true });
const results = [];
try {
  for (const [engineName, engine] of [['chromium',chromium],['webkit',webkit]]) {
    const browser = await engine.launch({ headless:true });
    try {
      for (const mode of ['normal','scripts-blocked','javascript-disabled']) {
        const context = await browser.newContext({
          viewport:{ width:1473, height:850 },
          javaScriptEnabled:mode !== 'javascript-disabled',
          extraHTTPHeaders:bypass ? { 'x-vercel-protection-bypass':bypass } : {}
        });
        try {
          // Fresh signed-out contexts only. Never forward the Preview secret
          // outside this deployment or contact an authenticated data backend.
          await context.route('**/*', route => {
            const request = route.request();
            const url = new URL(request.url());
            if (url.origin !== base.origin || (mode === 'scripts-blocked' && url.pathname.endsWith('.js'))) return route.abort();
            return route.continue();
          });
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', error => errors.push(error.message));
          const target = new URL(mode === 'scripts-blocked' ? '/?manual=1' : '/', base);
          const started = Date.now();
          const response = await page.goto(target.href, { waitUntil:'domcontentloaded', timeout:30000 });
          assert.equal(response?.status(), 200, 'root must serve HTML, not a 30x');
          assert.equal(response.request().redirectedFrom(), null, 'root must have no HTTP redirect');
          assert.equal(response.headers().location, undefined);
          assert.equal(page.url(), target.href, 'the requested root URL and query must remain intact');
          await page.locator('#email').waitFor({ state:'visible', timeout:5000 });
          assert.ok(await page.locator('#password').isVisible());
          assert.ok(await page.locator('#loginButton').isEnabled());
          assert.equal(await page.locator('#aqariCloudGateV168').count(), 0, 'do not load the private app shell at root');
          assert.equal(await page.locator('#home').count(), 0);
          assert.deepEqual(errors, []);
          const result = { engine:engineName, mode, status:response.status(), redirects:0, path:target.pathname, formVisible:true, observedMs:Date.now()-started };
          results.push(result);
          await page.screenshot({ path:output+'/'+engineName+'-'+mode+'.png' });
          console.log('DIRECT_ENTRY', JSON.stringify(result));
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally {
  fs.writeFileSync(output+'/results.json', JSON.stringify({ note:'Fresh signed-out CI browsers; not measurements from the owner iPad', results }, null, 2));
}
