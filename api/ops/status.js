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
    mode: 'supabase_cloud',
    capabilities: {
      appShell: true,
      healthApi: true,
      releaseApi: true,
      pwaMetadata: true,
      cloudAuth: 'supabase_rls',
      centralizedDataApi: true,
      cloudState: 'workspace_jsonb_revisioned',
    },
    notices: [
      'First sign-in requires an authorized account and may require email confirmation.',
      'Initial core-data upload or restore is an explicit user choice; a local recovery cache remains on the device.',
    ],
    version: 'V168',
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    timestamp: new Date().toISOString(),
  };

  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).json(payload);
};
