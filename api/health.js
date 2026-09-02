'use strict';

function setHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

module.exports = function handler(req, res) {
  setHeaders(res);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const payload = {
    ok: true,
    status: 'healthy',
    service: 'aqari',
    version: 'V168',
    environment: process.env.VERCEL_ENV || 'unknown',
    deployment: {
      gitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      region: process.env.VERCEL_REGION || null,
    },
    timestamp: new Date().toISOString(),
  };

  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).json(payload);
};
