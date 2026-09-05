const base = process.env.AQARI_BASE_URL;
if (!base) {
  console.error('Set AQARI_BASE_URL, e.g. https://preview.vercel.app');
  process.exit(2);
}

for (const path of ['/api/health', '/api/release', '/api/config-status', '/api/supabase-status', '/api/production-readiness', '/api/cloud-sync-status', '/api/migration-status']) {
  const url = new URL(path, base);
  const res = await fetch(url);
  const text = await res.text();
  console.log(path, res.status, text.slice(0, 500));
  if (!res.ok) process.exit(1);
  const body = JSON.parse(text);
  if(body.ok !== true || body.version !== 'V198') process.exit(1);
  if(path === '/api/supabase-status' && body.connection?.state !== 'up') process.exit(1);
  if(path === '/api/production-readiness' && body.ready !== true) process.exit(1);
}

console.log('AQARI V211.1.2 smoke: PASS');
