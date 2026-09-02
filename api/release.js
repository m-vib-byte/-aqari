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
    app: 'عقاري',
    version: 'V167',
    patch: 'runtime-contracts-1',
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF || null,
    deploymentUrl: process.env.VERCEL_URL || null,
    environment: process.env.VERCEL_ENV || 'unknown',
    builtAt: process.env.VERCEL_DEPLOYMENT_CREATED_AT || null,
    timestamp: new Date().toISOString(),
  };

  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).json(payload);
};
