const base = process.env.AQARI_BASE_URL;
if (!base) {
  console.error('Set AQARI_BASE_URL, e.g. https://preview.vercel.app');
  process.exit(2);
}

for (const path of ['/api/health', '/api/release', '/api/config-status', '/api/supabase-status', '/api/cloud-sync-status', '/api/migration-status']) {
  const url = new URL(path, base);
  const res = await fetch(url);
  const body = await res.text();
  console.log(path, res.status, body.slice(0, 500));
  if (!res.ok) process.exit(1);
}

console.log('AQARI V203 smoke: PASS');

