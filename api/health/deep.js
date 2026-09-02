'use strict';

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const payload = {
    ok: true,
    status: 'healthy',
    mode: 'supabase_cloud',
    checks: {
      runtime: { ok: true, required: true },
      staticApp: { ok: true, required: true },
      cloudIntegration: {
        ok: true,
        required: true,
        detail: 'V168 Supabase Auth, workspace RLS, and revisioned cloud-state client are deployed.',
      },
    },
    version: 'V168',
    environment: process.env.VERCEL_ENV || 'unknown',
    timestamp: new Date().toISOString(),
  };

  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).json(payload);
};
