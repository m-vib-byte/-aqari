import { chromium } from 'playwright';

const base = process.env.AQARI_BASE_URL;
if (!base) {
  console.error('AQARI_BASE_URL is required');
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 }
});

let failed = false;

async function check(name, fn) {
  try {
    await fn();
    console.log('PASS', name);
  } catch (err) {
    console.error('FAIL', name, '-', err.message);
    failed = true;
  }
}

await check('home loads V198', async () => {
  const res = await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 });
  if (!res || !res.ok()) throw new Error(`HTTP ${res?.status()}`);
  const html = await page.content();
  if (!html.includes('V198')) throw new Error('V198 marker missing');
});

await check('no obvious JS page errors on load', async () => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(()=>{});
  if (errors.length) throw new Error(errors.slice(0,3).join(' | '));
});

await check('Supabase bridge files loaded', async () => {
  const state = await page.evaluate(() => ({
    publicConfig: Boolean(window.AQARI_PUBLIC_CONFIG),
    supabaseBridge: Boolean(window.AQARI_SUPABASE),
    cloudSync: Boolean(window.AQARI_CLOUD_SYNC),
    autosync: Boolean(window.AQARI_AUTOSYNC)
  }));
  for (const [k,v] of Object.entries(state)) {
    if (!v) throw new Error(`${k} unavailable`);
  }
});

await check('API health', async () => {
  const r = await page.request.get(new URL('/api/health', base).toString());
  if (!r.ok()) throw new Error(`HTTP ${r.status()}`);
  const j = await r.json();
  if (j.version !== 'V198' || j.ok !== true) throw new Error('Unexpected health payload');
});

await check('Supabase status API', async () => {
  const r = await page.request.get(new URL('/api/supabase-status', base).toString());
  if (!r.ok()) throw new Error(`HTTP ${r.status()}`);
  const j = await r.json();
  if (j.version !== 'V198' || j.provider !== 'supabase') throw new Error('Unexpected Supabase status');
});

await check('Migration status API', async () => {
  const r = await page.request.get(new URL('/api/migration-status', base).toString());
  if (!r.ok()) throw new Error(`HTTP ${r.status()}`);
  const j = await r.json();
  if (j.version !== 'V198') throw new Error('Unexpected migration status');
});

await check('Autosync status API', async () => {
  const r = await page.request.get(new URL('/api/autosync-status', base).toString());
  if (!r.ok()) throw new Error(`HTTP ${r.status()}`);
  const j = await r.json();
  if (j.version !== 'V198') throw new Error('Unexpected autosync status');
});

await browser.close();

if (failed) process.exit(1);
console.log('AQARI V198 Preview E2E: PASS');
