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

await check('home loads secure V198', async () => {
  const response = await page.goto(base, { waitUntil:'domcontentloaded', timeout:30000 });
  if(!response?.ok()) throw new Error(`HTTP ${response?.status()}`);
  await page.waitForTimeout(2000);
  if(!(await page.title()).includes('V198')) throw new Error('V198 title missing');
  const state = await page.evaluate(() => ({
    gate:Boolean(document.getElementById('aqariCloudGateV168')?.classList.contains('on')),
    loginSecure:window.login === window.cloudLoginV198,
    localLoginSecure:window.loginLocalV120 === window.cloudLoginV198,
    supabase:Boolean(window.AQARI_SUPABASE),
    cloud:Boolean(window.AQARI_CLOUD_SYNC),
    autosyncMode:window.AQARI_AUTOSYNC?.status?.mode
  }));
  if(!state.gate || !state.loginSecure || !state.localLoginSecure || !state.supabase || !state.cloud){
    throw new Error('secure cloud bridge unavailable');
  }
  if(state.autosyncMode !== 'manual_only') throw new Error('automatic upload must remain disabled');
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

await check('PWA assets and browser console', async () => {
  for(const path of ['/manifest.webmanifest','/sw.js','/aqari-icon.svg']){
    const response = await page.request.get(new URL(path, base).toString());
    if(!response.ok()) throw new Error(`${path} HTTP ${response.status()}`);
  }
  if(pageErrors.length) throw new Error(pageErrors.slice(0,3).join(' | '));
  if(responseErrors.length) throw new Error(responseErrors.slice(0,5).join(' | '));
});

await browser.close();
if(failed) process.exit(1);
console.log('AQARI V198 Preview E2E: PASS');
