import { chromium } from 'playwright';

const base = process.env.AQARI_BASE_URL;
const expectedSha = String(process.env.AQARI_EXPECTED_SHA || '').trim();
if(!base || !expectedSha){
  console.error('AQARI_BASE_URL and AQARI_EXPECTED_SHA are required');
  process.exit(2);
}

const previewUrl = new URL(base);
const bypass = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || previewUrl.searchParams.get('x-vercel-protection-bypass') || '').trim();
const browser = await chromium.launch({ headless:true });
const context = await browser.newContext({
  viewport:{ width:390, height:844 },
  extraHTTPHeaders:bypass ? {
    'x-vercel-protection-bypass':bypass,
    'x-vercel-set-bypass-cookie':'true'
  } : {}
});
const page = await context.newPage();
const pageErrors = [];
const responseErrors = [];
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

await check('V201 easy luxury design loads on the secure V198 runtime', async () => {
  const response = await page.goto(base, { waitUntil:'domcontentloaded', timeout:30000 });
  if(!response?.ok()) throw new Error(`HTTP ${response?.status()}`);
  await page.waitForTimeout(2000);
  const state = await page.evaluate(() => ({
    gate:Boolean(document.getElementById('aqariCloudGateV168')?.classList.contains('on')),
    loginSecure:window.login === window.cloudLoginV198,
    localLoginSecure:window.loginLocalV120 === window.cloudLoginV198,
    supabase:Boolean(window.AQARI_SUPABASE),
    cloud:Boolean(window.AQARI_CLOUD_SYNC),
    autosyncMode:window.AQARI_AUTOSYNC?.status?.mode,
    design:document.querySelector('meta[name="aqari-design"]')?.content,
    luxury:document.body.classList.contains('aq-v200'),
    easy:document.body.classList.contains('aq-v201'),
    shell:Boolean(document.getElementById('aqariV199Topbar')),
    dashboard:Boolean(document.getElementById('aqariV199Dashboard')),
    mobileItems:document.querySelectorAll('.mobilebar .v199-bottom-button').length,
    createOptions:document.querySelectorAll('#v201CreateMenu [data-v201-create]').length,
    propertyActions:document.querySelectorAll('#v201PropertyCenter [data-v201-property-action]').length,
    mobileCreateSize:document.getElementById('v201MobileCreate')?.getBoundingClientRect().width,
    businessLinks:Array.from(document.querySelectorAll('#v199MoreMenu [data-v199-go]')).map(node => node.getAttribute('data-v199-go')),
    fakeBars:document.querySelectorAll('#aqariV199Dashboard .v199-mini-bars').length,
    labels:Array.from(document.querySelectorAll('#aqariV199Dashboard .v199-kpi-label')).map(node => node.textContent.trim()),
    priorityFirst:(() => {
      const dashboard=document.getElementById('aqariV199Dashboard');
      const priority=dashboard?.querySelector('.v201-priority-panel');
      const kpis=dashboard?.querySelector('.v199-kpi-grid');
      return Boolean(priority&&kpis&&(priority.compareDocumentPosition(kpis)&Node.DOCUMENT_POSITION_FOLLOWING));
    })(),
    horizontalOverflow:document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  }));
  if(!state.gate || !state.loginSecure || !state.localLoginSecure || !state.supabase || !state.cloud){
    throw new Error('secure cloud bridge unavailable');
  }
  if(state.autosyncMode !== 'manual_only') throw new Error('automatic upload must remain disabled');
  if(state.design !== 'V201-preview' || !state.luxury || !state.easy || !state.shell || !state.dashboard) throw new Error('V201 presentation layer unavailable');
  if(state.mobileItems !== 5) throw new Error(`mobile navigation count ${state.mobileItems}`);
  if(state.createOptions !== 4) throw new Error(`quick-create option count ${state.createOptions}`);
  if(state.propertyActions !== 4) throw new Error(`property action count ${state.propertyActions}`);
  if(state.mobileCreateSize < 44) throw new Error(`mobile create target ${state.mobileCreateSize}px`);
  for(const route of ['tenants','reports','documentsHub']) if(!state.businessLinks.includes(route)) throw new Error(`${route} missing from More menu`);
  if(state.fakeBars !== 0) throw new Error('hard-coded chart bars must not be shown');
  if(!state.priorityFirst) throw new Error('today priorities must precede KPIs');
  for(const label of ['الدخل المسجل','المقبوضات المسجلة','إيجار مستحق','طلبات صيانة مفتوحة']) if(!state.labels.includes(label)) throw new Error(`${label} missing`);
  if(state.horizontalOverflow) throw new Error('page has horizontal overflow at 390px');
});

await check('each property has its own action center', async () => {
  const trigger=await page.$('#aqariV199Dashboard [data-v201-property]');
  if(!trigger) throw new Error('property management trigger missing');
  await page.evaluate(() => document.querySelector('#aqariV199Dashboard [data-v201-property]')?.click());
  await page.waitForTimeout(80);
  const state=await page.evaluate(() => ({
    shown:document.getElementById('v201PropertyCenter')?.getAttribute('aria-hidden') === 'false',
    title:document.getElementById('v201PropertyTitle')?.textContent.trim(),
    actions:Array.from(document.querySelectorAll('#v201PropertyCenter [data-v201-property-action]')).map(node => node.textContent.trim())
  }));
  if(!state.shown || !state.title) throw new Error('property action center did not open');
  for(const label of ['إبرام عقد','وصل إيجار','كشف الإيجار','ملف العقار']) if(!state.actions.some(text => text.includes(label))) throw new Error(`${label} action missing`);
  await page.evaluate(() => document.querySelector('[data-v201-property-close]')?.click());
});

await check('V201 quick-create and accessible modal', async () => {
  await page.evaluate(() => document.querySelector('[data-v201-quick]')?.click());
  await page.waitForTimeout(80);
  const open = await page.evaluate(() => ({
    shown:document.getElementById('v201CreateMenu')?.getAttribute('aria-hidden') === 'false',
    focused:Boolean(document.activeElement?.matches('[data-v201-create]'))
  }));
  if(!open.shown || !open.focused) throw new Error('quick-create sheet did not open accessibly');
  await page.evaluate(() => document.querySelector('[data-v201-create="properties"]')?.click());
  await page.waitForTimeout(180);
  const modal = await page.evaluate(() => ({
    open:document.getElementById('modal')?.classList.contains('on'),
    role:document.getElementById('modal')?.getAttribute('role'),
    ariaModal:document.getElementById('modal')?.getAttribute('aria-modal'),
    labels:document.querySelectorAll('#fields .v201-field').length,
    controls:document.querySelectorAll('#fields input,#fields select,#fields textarea').length
  }));
  if(!modal.open || modal.role !== 'dialog' || modal.ariaModal !== 'true') throw new Error('create modal accessibility contract failed');
  if(!modal.controls || modal.labels !== modal.controls) throw new Error(`visible labels ${modal.labels}/${modal.controls}`);
  await page.evaluate(() => {
    document.getElementById('modal')?.classList.remove('on');
    window.go?.('home');
  });
});

async function readApi(path){
  const response = await page.request.get(new URL(path, base).toString());
  if(!response.ok()) throw new Error(`${path} HTTP ${response.status()}`);
  if(!String(response.headers()['cache-control'] || '').includes('no-store')) throw new Error(`${path} cache contract`);
  if(response.headers()['x-content-type-options'] !== 'nosniff') throw new Error(`${path} nosniff contract`);
  const body = await response.json();
  if(body.ok !== true || body.version !== 'V198') throw new Error(`${path} payload mismatch`);
  const post = await page.request.post(new URL(path, base).toString());
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
  if(typeof body.connected !== 'boolean') throw new Error('connected must be boolean');
  if(body.connectionVerified !== false) throw new Error('compatibility route must not claim a live database check');
  if(typeof body.authMode !== 'string' || !body.authMode) throw new Error('authMode missing');
  if(!Array.isArray(body.tables)) throw new Error('tables must be an array');
});

await check('Preview SHA and environment', async () => {
  const body = await readApi('/api/production-meta');
  if(body.deployment?.environment !== 'preview') throw new Error('not a Preview deployment');
  if(body.deployment?.gitSha !== expectedSha) throw new Error(`SHA ${body.deployment?.gitSha || 'missing'} != ${expectedSha}`);
});

await check('Preview production-readiness contract', async () => {
  const body = await readApi('/api/production-readiness');
  const configured = body.configured;
  const summary = body.summary;
  if(body.deployment?.environment !== 'preview') throw new Error('production-readiness did not report Preview');
  if(!configured || typeof configured !== 'object' || Array.isArray(configured)) throw new Error('configured map missing');

  const keys = Object.keys(configured);
  if(!keys.length) throw new Error('configured map is empty');
  for(const key of keys){
    if(!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error(`invalid configured key: ${key}`);
    if(typeof configured[key] !== 'boolean') throw new Error(`configured.${key} must be boolean`);
  }

  if(!summary || !Number.isInteger(summary.present) || !Number.isInteger(summary.required) || typeof summary.ready !== 'boolean'){
    throw new Error('summary contract invalid');
  }
  const present = Object.values(configured).filter(Boolean).length;
  if(summary.required <= 0) throw new Error('summary.required must be positive');
  if(summary.required !== keys.length) throw new Error(`required ${summary.required} != configured keys ${keys.length}`);
  if(summary.present !== present) throw new Error(`present ${summary.present} != configured true values ${present}`);
  if(summary.ready !== (summary.present === summary.required)) throw new Error('summary.ready is inconsistent');

  console.log('INFO', `production environment configuration visible to Preview: ${summary.present}/${summary.required}`);
});

await check('PWA and V201 presentation assets', async () => {
  for(const path of ['/manifest.webmanifest','/sw.js','/aqari-icon.svg','/v199-ui.css','/v199-ui.js','/v200-luxury.css','/v201-easy.css','/v201-experience.js']){
    const response = await page.request.get(new URL(path, base).toString());
    if(!response.ok()) throw new Error(`${path} HTTP ${response.status()}`);
  }
  if(pageErrors.length) throw new Error(pageErrors.slice(0,3).join(' | '));
  if(responseErrors.length) throw new Error(responseErrors.slice(0,5).join(' | '));
});

await browser.close();
if(failed) process.exit(1);
console.log('AQARI V201 Easy Luxury Preview E2E on V198 runtime: PASS');
