const base = process.env.AQARI_BASE_URL;
if (!base) {
  console.error('AQARI_BASE_URL is required');
  process.exit(2);
}

const checks = [
  ['/', async (res) => {
    const html = await res.text();
    return res.ok && html.includes('V198');
  }],
  ['/api/health', async (res) => {
    const json = await res.json();
    return res.ok && json.ok === true && json.version === 'V198';
  }],
  ['/api/release', async (res) => {
    const json = await res.json();
    return res.ok && json.version === 'V198';
  }],
  ['/api/config-status', async (res) => {
    const json = await res.json();
    return res.ok && json.ok === true && json.version === 'V198';
  }],
  ['/api/supabase-status', async (res) => {
    const json = await res.json();
    return res.ok && json.ok === true && json.version === 'V198' && json.provider === 'supabase';
  }]
];

let failed = false;
for (const [path, validator] of checks) {
  const url = new URL(path, base);
  try {
    const res = await fetch(url, { redirect: 'follow' });
    const ok = await validator(res);
    console.log(path, ok ? 'PASS' : 'FAIL', res.status);
    if (!ok) failed = true;
  } catch (err) {
    console.error(path, 'ERROR', err.message);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('AQARI V198 deployment verification: PASS');
