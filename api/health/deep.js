'use strict';

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const cloudIsServerManaged = Boolean(
    process.env.SUPABASE_URL &&
    (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY)
  );

  const payload = {
    ok: true,
    status: 'healthy',
    mode: cloudIsServerManaged ? 'server_cloud_ready' : 'local_safe_mode',
    checks: {
      runtime: { ok: true, required: true },
      staticApp: { ok: true, required: true },
      cloudBackend: {
        ok: cloudIsServerManaged,
        required: false,
        detail: cloudIsServerManaged
          ? 'Server-side cloud configuration detected.'
          : 'Optional cloud configuration is not present on the server; local safe mode remains available.',
      },
    },
    version: 'V167',
    environment: process.env.VERCEL_ENV || 'unknown',
    timestamp: new Date().toISOString(),
  };

  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).json(payload);
};
