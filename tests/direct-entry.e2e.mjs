import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { previewAccess, routePreviewRequest } from './preview-access.mjs';
import { githubPreviewAccess } from './github-preview-oidc.mjs';

const baseUrl = String(process.env.AQARI_BASE_URL || '').trim();
if (!baseUrl) {
  throw new Error('AQARI_BASE_URL is required; production fallback is not allowed.');
}
const base = new URL(baseUrl);
assert.equal(base.protocol, 'https:');
const access = process.env.AQARI_PREVIEW_AUTH === 'github-oidc'
  ? githubPreviewAccess(base)
  : previewAccess(base, process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
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
          serviceWorkers:'block'
        });
        try {
          // Fresh signed-out contexts only. Never forward the Preview secret
          // outside this deployment or contact an authenticated data backend.
          await context.route('**/*', route => {
            const request = route.request();
            const url = new URL(request.url());
            if (url.origin !== base.origin || (mode === 'scripts-blocked' && url.pathname.endsWith('.js'))) return route.abort();
            return routePreviewRequest(route, access);
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
        } finally {
          // Root can finish painting while a routed vendor asset is in flight.
          // Complete those callbacks before disposing their request context.
          try { await context.unrouteAll({ behavior:'wait' }); }
          finally { await context.close(); }
        }
      }
    } finally { await browser.close(); }
  }
} finally {
  fs.writeFileSync(output+'/results.json', JSON.stringify({ note:'Fresh signed-out CI browsers; not measurements from the owner iPad', results }, null, 2));
}
