import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/dist/umd/supabase.min.js';
const SDK_SHA384 = 'JBR+x8blGwjDRO63aHCGiZMD4VNiTR4ZUGA+N6ZKLf3zNt1fK8IBpcgPaMrxqWBp';
const XSS_TENANT = '<img src=x onerror=alert(1)>';
const SNAPSHOT_PATH = '/rest/v1/rpc/aqari_startup_snapshot_v266';
const CONFIRMATION_PATH = '/api/workspace-confirmation';
const SCENARIOS = ['empty', 'populated', 'manual', 'timeout', 'confirmation-timeout', 'revoked-confirmation'];

// Only synthetic identities and data are served here. The real recovery page,
// adapter and pinned SDK run unchanged; this fixture never reaches Supabase.
// Exporting the fixture permits Node-only transport validation without a browser.
export async function createRecoveryFixture({ root = process.cwd(), sdk = Buffer.alloc(0) } = {}) {
  root = path.resolve(root);
  const user = { id:'11111111-1111-4111-8111-111111111111', email:'synthetic@example.invalid', aud:'authenticated', role:'authenticated', app_metadata:{provider:'email'}, user_metadata:{} };
  const workspace = { id:'22222222-2222-4222-8222-222222222222', name:'Synthetic workspace' };
  const membership = { user_id:user.id, workspace_id:workspace.id, role:'general_manager', is_active:true };
  const profile = { user_id:user.id, display_name:'Synthetic user' };
  const populated = { properties:[['Synthetic Tower', 'Test', '110', '27500']], tenants:[], tenantDirectoryV202:[], rentLedgerV202:[] };
  for (let i = 1; i <= 110; i += 1) {
    const tenant = i === 1 ? XSS_TENANT : 'Synthetic Tenant ' + i;
    const property = 'Synthetic Tower', unit = String(i), contractNo = 'SYN-' + i;
    populated.tenants.push([tenant, property, '250', 'مستحق']);
    populated.tenantDirectoryV202.push({ property, unit, tenant, contractNo, email:'synthetic-private@example.invalid', phone:'SYNTHETIC-PRIVATE-PHONE', civilId:'SYNTHETIC-PRIVATE-ID' });
    populated.rentLedgerV202.push({ property, unit, tenant, period:'2026-08', due:250, paid:250, balance:0, receiptNo:'R-' + i, status:'paid' });
  }
  let base, token, session, scenario = 'empty';
  const requests = [], forbiddenWrites = [];
  const send = (res, value, status = 200) => {
    res.writeHead(status, { 'content-type':'application/json', 'cache-control':'no-store' });
    res.end(status === 204 ? undefined : JSON.stringify(value));
  };
  const json = async req => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    return JSON.parse(raw || '{}');
  };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, base);
      const currentScenario = scenario;
      requests.push({ method:req.method, path:url.pathname });
      const authorized = req.headers.authorization === 'Bearer ' + token;
      if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
        const input = await json(req);
        const passwordGrant = url.searchParams.get('grant_type') === 'password' && input.email === user.email && input.password === 'Synthetic-password-only';
        const refreshGrant = url.searchParams.get('grant_type') === 'refresh_token' && input.refresh_token === session.refresh_token;
        return send(res, passwordGrant || refreshGrant ? session : { message:'Invalid login credentials' }, passwordGrant || refreshGrant ? 200 : 400);
      }
      if (url.pathname === '/auth/v1/logout' && req.method === 'POST') return send(res, {}, authorized ? 204 : 401);
      if (url.pathname === '/auth/v1/user' && req.method === 'GET') return send(res, authorized ? user : {}, authorized ? 200 : 401);
      if ([SNAPSHOT_PATH, CONFIRMATION_PATH].includes(url.pathname) && req.method === 'POST') {
        if (!authorized) return send(res, {}, 401);
        const input = await json(req);
        if (url.pathname === CONFIRMATION_PATH) {
          if (input.p_workspace_id !== workspace.id || input.p_expected_role !== membership.role || input.p_include_payload !== false) return send(res, {}, 403);
          if (currentScenario === 'confirmation-timeout') return;
          const confirmedMembership = currentScenario === 'revoked-confirmation' ? { ...membership, is_active:false } : membership;
          return send(res, { user, confirmation:{ user_id:user.id, membership:confirmedMembership, workspace, profile, app_state:null } });
        }
        if ((input.p_workspace_id && input.p_workspace_id !== workspace.id) || (input.p_expected_role && input.p_expected_role !== membership.role) || typeof input.p_include_payload !== 'boolean') return send(res, {}, 403);
        if (currentScenario === 'timeout' && input.p_include_payload) return;
        const payload = currentScenario === 'empty' ? {} : populated;
        return send(res, { user_id:user.id, membership, workspace, profile, app_state:input.p_include_payload ? { workspace_id:workspace.id, payload, revision:1 } : null });
      }
      if (!['GET', 'HEAD'].includes(req.method)) {
        forbiddenWrites.push({ method:req.method, path:url.pathname });
        return send(res, { message:'Synthetic fixture: unexpected write forbidden' }, 403);
      }
      if (url.pathname.startsWith('/rest/v1/')) {
        if (!authorized) return send(res, {}, 401);
        const rows = {
          aqari_memberships:membership,
          aqari_workspaces:workspace,
          aqari_profiles:profile,
          aqari_app_state:{ workspace_id:workspace.id, payload:currentScenario === 'empty' ? {} : populated, revision:1 }
        };
        const table = url.pathname.slice('/rest/v1/'.length);
        if (!Object.hasOwn(rows, table)) return send(res, {}, 404);
        if (table === 'aqari_app_state' && currentScenario === 'timeout') return;
        return send(res, (req.headers.accept || '').includes('vnd.pgrst.object') ? rows[table] : [rows[table]]);
      }
      if (url.pathname === '/public-config.js') {
        res.writeHead(200, { 'content-type':'text/javascript' });
        return res.end('window.AQARI_PUBLIC_CONFIG=' + JSON.stringify({ supabaseUrl:base, supabasePublishableKey:'sb_publishable_synthetic', supabaseAuthStorageKey:'aqari-supabase-auth-v198' }) + ';');
      }
      if (url.pathname === '/vendor/supabase-js-2.116.0.js') {
        res.writeHead(200, { 'content-type':'text/javascript' });
        return res.end(sdk);
      }
      const file = path.resolve(root, '.' + url.pathname);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, {}, 404);
      const type = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml' }[path.extname(file)] || 'application/octet-stream';
      res.writeHead(200, { 'content-type':type + '; charset=utf-8', 'cache-control':'no-store' });
      res.end(fs.readFileSync(file));
    } catch {
      if (!res.headersSent) send(res, { message:'Invalid synthetic request' }, 400);
      else res.end();
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  base = 'http://127.0.0.1:' + server.address().port;
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const expires = Math.floor(Date.now() / 1000) + 3600;
  token = encode({ alg:'HS256', typ:'JWT' }) + '.' + encode({ sub:user.id, exp:expires, iat:expires - 3600, role:'authenticated', aud:'authenticated', iss:base + '/auth/v1' }) + '.synthetic-signature';
  session = { user, access_token:token, refresh_token:'synthetic-refresh-token', token_type:'bearer', expires_at:expires, expires_in:3600 };
  return {
    base, user, workspace, membership, session, requests, forbiddenWrites,
    setScenario(next) { assert.ok(SCENARIOS.includes(next)); scenario = next; },
    reset(next) { this.setScenario(next); requests.length = 0; forbiddenWrites.length = 0; },
    close() { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); }
  };
}

export async function runRecoveryE2E() {
  const { chromium, webkit } = await import('playwright');
  const response = await fetch(SDK_URL, { signal:AbortSignal.timeout(20000) });
  assert.ok(response.ok, 'pinned SDK download must succeed');
  const sdk = Buffer.from(await response.arrayBuffer());
  assert.equal(crypto.createHash('sha384').update(sdk).digest('base64'), SDK_SHA384, 'pinned SDK integrity');
  const fixture = await createRecoveryFixture({ sdk });
  const out = path.join(process.cwd(), 'test-results', 'recovery');
  fs.mkdirSync(out, { recursive:true });
  let failed = false;
  try {
    for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
      for (const scenario of SCENARIOS) {
        const name = engineName + '-' + scenario;
        fixture.reset(scenario);
        let browser;
        const errors = [], dialogs = [], externalRequests = [];
        try {
          browser = await engine.launch({ headless:true });
          const context = await browser.newContext({ viewport:{ width:1473, height:850 }, serviceWorkers:'block' });
          await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin === fixture.base) return route.continue();
            externalRequests.push(url.origin + url.pathname);
            return route.abort();
          });
          await context.addInitScript(value => {
            if (value) localStorage.setItem('aqari-supabase-auth-v198', JSON.stringify(value));
            setInterval(() => { window.__recoveryHeartbeats = (window.__recoveryHeartbeats || 0) + 1; }, 100);
          }, scenario === 'manual' ? null : fixture.session);
          const page = await context.newPage();
          page.on('pageerror', error => errors.push(error.stack || error.message));
          page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
          const entry = await page.goto(fixture.base + '/recovery.html', { waitUntil:'domcontentloaded', timeout:30000 });
          assert.equal(entry.status(), 200);
          assert.equal(new URL(page.url()).pathname, '/recovery.html');

          const assertLocked = async phase => {
            assert.equal(await page.locator('#aqariCloudGateV168').getAttribute('data-auth-phase'), phase);
            assert.ok(await page.locator('#aqariCloudGateV168').isVisible());
            assert.equal(await page.locator('#home').isVisible(), false);
            assert.equal(await page.evaluate(() => document.documentElement.classList.contains('aqari-auth-unlocked')), false);
            assert.equal(await page.locator('#workspaceName').textContent(), '');
            assert.equal(await page.locator('#propertiesTable tbody tr, #tenantsTable tbody tr, #ledgerTable tbody tr').count(), 0);
          };
          const assertReady = async empty => {
            await page.waitForFunction(() => document.documentElement.classList.contains('aqari-auth-unlocked'), {}, { timeout:18000 });
            assert.equal(await page.locator('#aqariCloudGateV168').getAttribute('data-auth-phase'), 'ready');
            assert.equal(await page.locator('#aqariCloudGateV168').isVisible(), false);
            assert.ok(await page.locator('#home').isVisible());
            assert.equal(await page.locator('#workspaceName').textContent(), fixture.workspace.name);
            assert.equal(await page.locator('#tenantsTable tbody tr').count(), empty ? 0 : 110);
            assert.equal(await page.locator('#propertiesTable tbody tr').count(), empty ? 0 : 1);
            assert.equal(await page.locator('#ledgerTable tbody tr').count(), empty ? 0 : 110);
            if (!empty) {
              assert.ok((await page.locator('#tenantsTable').textContent()).includes(XSS_TENANT), 'hostile tenant text must render literally');
              assert.equal(await page.locator('#home img, #home [onerror], #home script, #home iframe').count(), 0, 'tenant text must never become executable markup');
              const visibleText = await page.locator('#home').textContent();
              for (const secret of ['SYNTHETIC-PRIVATE-ID', 'SYNTHETIC-PRIVATE-PHONE', 'synthetic-private@example.invalid']) assert.equal(visibleText.includes(secret), false, 'private identity fields stay out of recovery tables');
            }
          };

          if (scenario === 'manual') {
            await page.waitForSelector('[data-auth-phase="login"]', { timeout:12000 });
            assert.ok(await page.locator('#loginButton').isEnabled());
            await assertLocked('login');
            assert.equal(fixture.requests.filter(item => item.path === SNAPSHOT_PATH).length, 0, 'signed-out entry must not read workspace data');
            await page.fill('#email', fixture.user.email);
            await page.fill('#password', 'Synthetic-password-only');
            await page.click('#loginButton');
          }
          if (['timeout', 'confirmation-timeout', 'revoked-confirmation'].includes(scenario)) {
            await page.waitForSelector('[data-auth-phase="error"]', { timeout:18000 });
            await assertLocked('error');
            assert.ok(await page.locator('#aqariManualLoginRecovery').isVisible());
            assert.ok(await page.locator('#retryButton').isVisible());
            assert.ok(await page.locator('#retryButton').isEnabled());
            assert.equal(fixture.requests.filter(item => item.path === SNAPSHOT_PATH).length, 1, 'one startup snapshot per attempt');
            assert.equal(fixture.requests.filter(item => item.path === CONFIRMATION_PATH).length, scenario === 'timeout' ? 0 : 1, 'confirmation must occur after a successful data read');
            const before = fixture.requests.filter(item => [SNAPSHOT_PATH, CONFIRMATION_PATH].includes(item.path)).length;
            await page.evaluate(() => window.AQARI_SUPABASE.getClient().then(client => client.auth.refreshSession()));
            await page.waitForTimeout(800);
            await assertLocked('error');
            assert.equal(fixture.requests.filter(item => [SNAPSHOT_PATH, CONFIRMATION_PATH].includes(item.path)).length, before, 'late auth must not restart a failed recovery');
            if (scenario !== 'revoked-confirmation') {
              fixture.setScenario('populated');
              await page.click('#retryButton');
              await assertReady(false);
              assert.equal(fixture.requests.filter(item => item.path === SNAPSHOT_PATH).length, 2, 'an explicit retry starts exactly one new snapshot');
            }
          } else await assertReady(scenario === 'empty');

          assert.equal(new URL(page.url()).pathname, '/recovery.html', 'recovery stays isolated from the full app');
          assert.equal(await page.evaluate(() => window.AQARI_RECOVERY?.readOnly), true);
          assert.equal(await page.locator('script[src*="v202-property-os"], script[src*="final-release-ui"], script[src*="secure-auth-bridge"]').count(), 0);
          assert.equal(fixture.requests.some(item => /\/(?:v\d+[^/]*|final-release-ui|secure-auth-bridge)\.js$/.test(item.path)), false, 'no full-app presentation or auth scripts may load');
          const beats = await page.evaluate(() => window.__recoveryHeartbeats);
          await page.waitForTimeout(300);
          assert.ok(await page.evaluate(() => window.__recoveryHeartbeats) > beats, 'recovery must remain responsive');
          await page.screenshot({ path:path.join(out, name + '.png') });
          if (scenario === 'populated') {
            await page.click('#logoutButton');
            await page.waitForFunction(() => document.getElementById('status').textContent.includes('تم تسجيل الخروج'));
            await assertLocked('login');
          }
          assert.deepEqual(fixture.forbiddenWrites, [], 'recovery must not attempt business data writes');
          assert.equal(fixture.requests.some(item => ['PATCH', 'PUT', 'DELETE'].includes(item.method)), false);
          assert.deepEqual(externalRequests, [], 'synthetic recovery must stay on its local backend');
          assert.deepEqual(dialogs, [], 'recovery must not execute hostile tenant markup or open blocking dialogs');
          assert.deepEqual(errors, []);
          fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify({ name, passed:true, requests:fixture.requests }, null, 2));
          console.log('PASS', name);
        } catch (error) {
          failed = true;
          console.error('FAIL', name, error.stack);
          fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify({ name, passed:false, error:error.stack, requests:fixture.requests, forbiddenWrites:fixture.forbiddenWrites, errors, dialogs, externalRequests }, null, 2));
        } finally {
          if (browser) await browser.close();
        }
      }
    }
  } finally {
    await fixture.close();
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = await runRecoveryE2E();
