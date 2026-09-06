import { chromium } from 'playwright';
import { previewAccess, routePreviewRequest } from './preview-access.mjs';

const base = process.env.AQARI_BASE_URL;
const expectedSha = String(process.env.AQARI_EXPECTED_SHA || '').trim();
if(!base || !expectedSha){
  console.error('AQARI_BASE_URL and AQARI_EXPECTED_SHA are required');
  process.exit(2);
}

const previewUrl = new URL(base);
const appUrl = new URL('/app?release=V267', previewUrl).toString();
const access = previewAccess(base, process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
const browser = await chromium.launch({ headless:true });
const context = await browser.newContext({
  viewport:{ width:390, height:844 },
  serviceWorkers:'block'
});
await context.route('**/*', route => routePreviewRequest(route, access));
const page = await context.newPage();
const pageErrors = [];
const responseErrors = [];
const dbStatusRequests = [];
const startupDialogs = [];
page.on('request', request => {
  try{
    const url = new URL(request.url());
    if(url.origin === previewUrl.origin && ['/api/db/status','/api/supabase-status'].includes(url.pathname)){
      dbStatusRequests.push(url.pathname);
    }
  }catch{}
});
page.on('dialog', async dialog => {
  startupDialogs.push({ type:dialog.type(), message:dialog.message() });
  await dialog.dismiss();
});
await page.route('**/final-release-ui.js*', async route => {
  await new Promise(resolve => setTimeout(resolve, 5000));
  await route.fallback();
});
page.on('pageerror', error => pageErrors.push(error.stack || error.message));
page.on('response', response => {
  try{
    if(new URL(response.url()).origin === previewUrl.origin && response.status() >= 400){
      responseErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  }catch{}
});

let failed = false;
async function check(name, fn){
  try{ await fn(); console.log('PASS', name); }
  catch(error){ failed = true; console.error('FAIL', name, '-', error.message); }
}

await check('Root opens the dedicated V267 login on every device', async () => {
  const loginPage = await context.newPage();
  try{
    const response = await loginPage.goto(new URL('/', previewUrl).toString(), { waitUntil:'domcontentloaded', timeout:30000 });
    if(!response?.ok()) throw new Error(`HTTP ${response?.status()}`);
    const finalUrl = new URL(loginPage.url());
    if(finalUrl.pathname !== '/' || response.request().redirectedFrom() || response.headers().location){
      throw new Error('root must serve the login directly without redirecting');
    }
    await loginPage.waitForSelector('#email:not([disabled])', { state:'visible', timeout:12000 });
    await loginPage.waitForSelector('#password:not([disabled])', { state:'visible', timeout:12000 });
  }finally{
    await loginPage.close();
  }
});

await check('V267 signed-out login shell loads on the secure V198 runtime', async () => {
  const navigation = page.goto(appUrl, { waitUntil:'domcontentloaded', timeout:30000 });
  await page.waitForSelector('#aqariCloudGateV168', { state:'visible', timeout:3500 });
  const firstPaint = await page.evaluate(() => ({
    shellReady:document.documentElement.classList.contains('aqari-shell-ready'),
    authUnlocked:document.documentElement.classList.contains('aqari-auth-unlocked'),
    bodyVisibility:getComputedStyle(document.body).visibility,
    gateVisible:Boolean(document.getElementById('aqariCloudGateV168')?.getClientRects().length),
    credentialsVisible:Boolean(document.getElementById('cloudPasswordV168')?.getClientRects().length),
    message:document.getElementById('cloudGateMsgV168')?.textContent?.trim() || '',
    authButtonsDisabled:Array.from(document.querySelectorAll('[data-cloud-auth-action]')).every(button => button.disabled)
  }));
  if(!firstPaint.shellReady || firstPaint.authUnlocked || firstPaint.bodyVisibility !== 'visible' || !firstPaint.gateVisible || firstPaint.credentialsVisible || !firstPaint.authButtonsDisabled || !firstPaint.message.includes('جاري استعادة الجلسة')){
    throw new Error('secure login shell was not usable during delayed asset loading: ' + JSON.stringify(firstPaint));
  }
  const response = await navigation;
  if(!response?.ok()) throw new Error(`HTTP ${response?.status()}`);
  await page.waitForFunction(() => window.AQARI_SUPABASE && window.AQARI_CLOUD_SYNC && document.querySelector('.v199-gate-version') && !Array.from(document.querySelectorAll('[data-cloud-auth-action]')).some(button => button.disabled), undefined, { timeout:15000 });
  if(startupDialogs.length) throw new Error('blocking startup dialog: ' + JSON.stringify(startupDialogs));
  if(dbStatusRequests.length) throw new Error('startup triggered database status requests: ' + dbStatusRequests.join(','));
  const state = await page.evaluate(() => ({
    gate:Boolean(document.getElementById('aqariCloudGateV168')?.classList.contains('on')),
    gateInert:document.getElementById('aqariCloudGateV168')?.hasAttribute('inert'),
    gateAriaHidden:document.getElementById('aqariCloudGateV168')?.getAttribute('aria-hidden'),
    authButtonsDisabled:Array.from(document.querySelectorAll('[data-cloud-auth-action]')).some(button => button.disabled),
    loginSecure:window.login === window.cloudLoginV198,
    localLoginSecure:window.loginLocalV120 === window.cloudLoginV198,
    supabase:Boolean(window.AQARI_SUPABASE),
    cloud:Boolean(window.AQARI_CLOUD_SYNC),
    autosyncMode:window.AQARI_AUTOSYNC?.status?.mode,
    design:document.querySelector('meta[name="aqari-design"]')?.content,
    productRelease:document.querySelector('meta[name="aqari-release"]')?.content,
    apiContract:document.querySelector('meta[name="aqari-api-contract"]')?.content,
    releaseStage:document.querySelector('meta[name="aqari-stage"]')?.content,
    title:document.title,
    luxury:document.body.classList.contains('aq-v200'),
    premium:document.body.classList.contains('aq-v267'),
    shell:Boolean(document.getElementById('aqariV199Topbar')),
    premiumCss:Boolean(document.getElementById('aqari-v267-premium-workspace-css')),
    horizontalOverflow:document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  }));
  if(!state.gate || !state.loginSecure || !state.localLoginSecure || !state.supabase || !state.cloud){
    throw new Error('secure cloud bridge unavailable');
  }
  if(state.gateInert || state.gateAriaHidden === 'true' || state.authButtonsDisabled){
    throw new Error('secure cloud gate did not become interactive after startup');
  }
  if(state.autosyncMode !== 'manual_only') throw new Error('automatic upload must remain disabled');
  if(state.productRelease !== 'V267' || state.apiContract !== 'V198' || state.releaseStage !== 'production'){
    throw new Error('visible release identity mismatch');
  }
  if(!state.title.includes('V267')) throw new Error('document title has stale release identity');
  if(!state.luxury || !state.premium || !state.premiumCss || !state.shell) throw new Error('V267 login presentation unavailable');
  if(state.horizontalOverflow) throw new Error('page has horizontal overflow at 390px');
});

// Authenticated layout, search, daily actions and quick-create are exercised
// by v267-presentation-checks.mjs after the synthetic workspace is verified.
await check('Authenticated modules and workspace data stay deferred while signed out', async () => {
  const state = await page.evaluate(() => ({
    authenticated:Boolean(window.AQARI_SUPABASE?.context?.user),
    unlocked:document.documentElement.classList.contains('aqari-auth-unlocked'),
    modules:['201','202','205','206','208','209','210','211','266'].filter(version => Boolean(window['AQARI_V'+version])),
    scripts:Array.from(document.scripts).map(script => script.id).filter(id => /^aqari-v(?:201|202|205|206|208|209|210|211|266)-/.test(id)),
    searchOpen:Boolean(document.getElementById('v199SearchPanel')?.classList.contains('on')),
    searchResults:document.querySelectorAll('#v209SearchResults [data-v209-result]').length,
    commandCenter:Boolean(document.getElementById('v210DailyCommandCenter')),
    simpleHome:Boolean(document.getElementById('v205SimpleHome')),
    gate:document.getElementById('aqariCloudGateV168')?.classList.contains('on')
  }));
  if(state.authenticated || state.unlocked || !state.gate) throw new Error('test requires a locked signed-out Preview');
  if(state.modules.length || state.scripts.length) throw new Error('authenticated presentation initialized before the workspace boundary: '+JSON.stringify(state));
  if(state.searchOpen || state.searchResults || state.commandCenter || state.simpleHome) throw new Error('signed-out workspace surfaces must remain sealed');
});

await check('V205 signed-out home exposes no protected tenant data', async () => {
  const state=await page.evaluate(() => {
    const root=document.getElementById('v205SimpleHome');
    const normalized=String(root?.innerText||'').replace(/[٠-٩]/g,digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
    return {
      authenticated:Boolean(window.AQARI_SUPABASE?.context?.user),
      civilIdVisible:/\b\d{12}\b/.test(normalized),
      protectedCards:root?.querySelectorAll('[data-v202-unit-index],[data-v202-tenant-statement],[data-v202-civil-reveal]').length||0,
      contactLinks:root?.querySelectorAll('a[href^="mailto:"],a[href^="tel:"]').length||0,
      rawSensitiveValues:root?.querySelectorAll('.aq-unit-sensitive-value,.v204-sensitive-value:not(.is-masked)').length||0
    };
  });
  if(state.authenticated)throw new Error('test requires a signed-out Preview');
  if(state.civilIdVisible||state.protectedCards||state.contactLinks||state.rawSensitiveValues)throw new Error('protected tenant data leaked into the public V205 home');
});

await check('signed-out property workspace fails closed', async () => {
  const trigger=await page.$('#aqariV199Dashboard [data-v201-property]');
  if(trigger) await trigger.click();
  await page.waitForTimeout(160);
  const state=await page.evaluate(() => ({
    shown:document.getElementById('v202PropertyWorkspace')?.getAttribute('aria-hidden') === 'false',
    documentShown:document.getElementById('v202DocumentDialog')?.getAttribute('aria-hidden') === 'false',
    tenantData:document.querySelectorAll('#v202PropertyWorkspace [data-v202-unit-index],#v202DocumentDialog [data-v202-tenant-statement]').length,
    horizontalOverflow:document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  }));
  if(state.shown||state.documentShown||state.tenantData) throw new Error('signed-out property data or document became visible');
  if(state.horizontalOverflow) throw new Error('signed-out property flow creates horizontal overflow at 390px');
});

await check('V206 ledger remains sealed before authentication', async () => {
  const trigger=await page.$('#aqariV199Dashboard [data-v201-property]');
  if(trigger) await trigger.click();
  await page.waitForTimeout(160);
  await page.evaluate(() => document.querySelector('#v202PropertyWorkspace [data-v202-action="statement"]')?.click());
  await page.waitForTimeout(160);
  const state=await page.evaluate(() => ({
    shown:document.getElementById('v202DocumentDialog')?.getAttribute('aria-hidden')==='false',
    ledger:Boolean(document.querySelector('#v202DocumentDialog [data-v206-ledger]')),
    legacyV206:Boolean(document.querySelector('#v201RentStatement [data-v206-ledger]'))
  }));
  if(state.shown||state.ledger||state.legacyV206) throw new Error('signed-out V206 ledger must not render');
});

await check('Signed-out actions remain behind the accessible auth modal', async () => {
  const state = await page.evaluate(() => ({
    gateOpen:document.getElementById('aqariCloudGateV168')?.classList.contains('on'),
    role:document.getElementById('aqariCloudGateV168')?.getAttribute('role'),
    modal:document.getElementById('aqariCloudGateV168')?.getAttribute('aria-modal'),
    authenticated:Boolean(window.AQARI_SUPABASE?.context?.user),
    createOpen:document.getElementById('v201CreateMenu')?.getAttribute('aria-hidden') === 'false'
  }));
  if(state.authenticated || !state.gateOpen || state.role !== 'dialog' || state.modal !== 'true' || state.createOpen) {
    throw new Error('signed-out actions escaped the accessible auth boundary');
  }
});

await check('V79 database status is manual, coalesced, and render-safe', async () => {
  const before = dbStatusRequests.length;
  if(before !== 0) throw new Error(`database status requested during startup: ${dbStatusRequests.join(', ')}`);
  await page.evaluate(() => Promise.all(Array.from({length:20}, () => window.checkBootstrapV79())));
  if(dbStatusRequests.length - before !== 1) throw new Error(`status requests were not coalesced: ${dbStatusRequests.length - before}`);
  const after = dbStatusRequests.length;
  await page.evaluate(() => { for(let i=0;i<10;i+=1) window.render(); });
  await page.waitForTimeout(100);
  if(dbStatusRequests.length !== after) throw new Error('render triggered a database status request');
});

async function readApi(path){
  const response = await page.request.get(new URL(path, base).toString(), { headers:access.headersFor(new URL(path, base)), maxRedirects:0 });
  if(!response.ok()) throw new Error(`${path} HTTP ${response.status()}`);
  const cacheControl = String(response.headers()['cache-control'] || '');
  if(!cacheControl.includes('no-store')) throw new Error(`${path} browser cache contract`);
  if(response.headers()['x-content-type-options'] !== 'nosniff') throw new Error(`${path} nosniff contract`);
  const body = await response.json();
  if(body.ok !== true || body.version !== 'V198') throw new Error(`${path} payload mismatch`);
  const post = await page.request.post(new URL(path, base).toString(), { headers:access.headersFor(new URL(path, base)), maxRedirects:0 });
  if(post.status() !== 405) throw new Error(`${path} POST must be 405`);
  return body;
}

await check('all read-only APIs', async () => {
  for(const path of [
    '/api/health','/api/health/deep','/api/db/status','/api/ops/status','/api/release',
    '/api/config-status','/api/supabase-status','/api/cloud-sync-status',
    '/api/migration-status','/api/autosync-status','/api/production-readiness',
    '/api/final-release-status','/api/production-meta'
  ]) await readApi(path);
});

await check('legacy database status compatibility', async () => {
  const body = await readApi('/api/db/status');
  if(body.provider !== 'supabase' || body.mode !== 'supabase_cloud') throw new Error('Supabase mode missing');
  if(body.configured !== true) throw new Error('public Supabase configuration missing');
  if(body.connected !== true || body.connectionVerified !== true) throw new Error('live Supabase connection was not verified');
  if(body.connection?.state !== 'up') throw new Error(`Supabase connection state ${body.connection?.state || 'missing'}`);
  if(typeof body.authMode !== 'string' || !body.authMode) throw new Error('authMode missing');
  if(!Array.isArray(body.tables)) throw new Error('tables must be an array');
  if('releasePreparationSnapshot' in body) throw new Error('stale release snapshot leaked');
});

await check('Preview SHA and environment', async () => {
  const body = await readApi('/api/production-meta');
  if(body.deployment?.environment !== 'preview') throw new Error('not a Preview deployment');
  if(body.deployment?.gitSha !== expectedSha) throw new Error(`SHA ${body.deployment?.gitSha || 'missing'} != ${expectedSha}`);
  if(body.productVersion !== 'V267' || body.apiContractVersion !== 'V198') throw new Error('release identity mismatch');
});

await check('Preview production-readiness contract', async () => {
  const body = await readApi('/api/production-readiness');
  const summary = body.summary;
  if(body.deployment?.environment !== 'preview') throw new Error('production-readiness did not report Preview');
  if(!summary || !Number.isInteger(summary.passed) || !Number.isInteger(summary.required) || typeof summary.ready !== 'boolean'){
    throw new Error('summary contract invalid');
  }
  if(summary.required <= 0) throw new Error('summary.required must be positive');
  if(summary.ready !== (summary.passed === summary.required) || body.ready !== summary.ready) throw new Error('readiness is inconsistent');
  if(body.ready !== true) throw new Error('Preview is not operationally ready: ' + JSON.stringify(body.checks));
  if(body.checks?.supabaseConnection?.state !== 'up') throw new Error('Supabase live check did not pass');
  const serialized = JSON.stringify(body);
  if(/DATABASE_URL|AUTH_SECRET|MFA_ENCRYPTION_KEY|S3_SECRET_ACCESS_KEY|RESEND_API_KEY|WHATSAPP_ACCESS_TOKEN|PAYMENT_WEBHOOK_SECRET/.test(serialized)){
    throw new Error('legacy secret footprint leaked from readiness payload');
  }

  console.log('INFO', `operational readiness checks: ${summary.passed}/${summary.required}`);
});

await check('V267 login identity remains visible with authenticated presentation unavailable', async () => {
  const fallbackPage = await context.newPage();
  try{
    await fallbackPage.route('**/v201-experience.js*', route => route.abort('failed'));
    const fallbackUrl = new URL(base);
    fallbackUrl.pathname = '/app';
    fallbackUrl.searchParams.set('release','V267');
    const response = await fallbackPage.goto(fallbackUrl.toString(), { waitUntil:'domcontentloaded', timeout:30000 });
    if(!response?.ok()) throw new Error(`fallback HTTP ${response?.status()}`);
    await fallbackPage.waitForSelector('#aqariV199Topbar', { state:'attached', timeout:12000 });
    await fallbackPage.waitForSelector('.v199-gate-version', { state:'visible', timeout:12000 });
    const identity = await fallbackPage.evaluate(() => ({
      header:document.querySelector('#aqariV199Topbar .v199-brand-copy small')?.textContent?.trim() || '',
      gate:document.querySelector('.v199-gate-version')?.textContent?.trim() || '',
      stale:Array.from(document.querySelectorAll('#aqariV199Topbar,.v199-gate-version'))
        .some(node => /V200(?:\s+LUXURY)?/i.test(node.textContent || ''))
    }));
    if(identity.header !== 'V267' || identity.gate !== 'AQARI V267' || identity.stale){
      throw new Error('fallback release identity mismatch: ' + JSON.stringify(identity));
    }
  }finally{
    await fallbackPage.close();
  }
});

await check('PWA and V267 presentation assets', async () => {
  for(const path of ['/manifest.webmanifest','/sw.js','/aqari-icon.svg','/v199-ui.css','/v199-ui.js','/v200-luxury.css','/v201-easy.css','/v201-experience.js','/v202-prestige.css','/v202-property-os.js','/v205-simple.css','/v205-simplified-shell.js','/v206-integrated-ledger.css','/v208-portfolio-collections.css','/v208-portfolio-collections.js','/v209-global-search.css','/v209-global-search.js','/v210-daily-command-center.css','/v210-daily-command-center.js','/v267-premium-workspace.css']){
    const response = await page.request.get(new URL(path, base).toString(), { headers:access.headersFor(new URL(path, base)), maxRedirects:0 });
    if(!response.ok()) throw new Error(`${path} HTTP ${response.status()}`);
  }
  if(pageErrors.length) throw new Error(pageErrors.slice(0,3).join(' | '));
  if(responseErrors.length) throw new Error(responseErrors.slice(0,5).join(' | '));
});

await browser.close();
if(failed) process.exit(1);
console.log('AQARI V267 signed-out Preview E2E on V198 runtime: PASS');
