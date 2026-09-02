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
    status: 'operational',
    mode: 'local_safe_mode',
    capabilities: {
      appShell: true,
      healthApi: true,
      releaseApi: true,
      pwaMetadata: true,
      cloudAuth: 'client_configurable',
      centralizedDataApi: false,
    },
    notices: [
      'Property and tenant records remain browser-local until the cloud data migration is completed.',
      'Do not treat the local PIN gate as production authentication.',
    ],
    version: 'V167',
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    timestamp: new Date().toISOString(),
  };

  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).json(payload);
};
