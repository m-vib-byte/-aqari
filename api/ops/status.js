import { beginReadOnly, sendReadOnlyJson } from '../../lib/read-only.js';

export default async function handler(req, res) {
  if(!beginReadOnly(req, res)) return;

  return sendReadOnlyJson(req, res, {
    ok: true,
    status: 'operational',
    stage: 'release-candidate',
    mode: 'supabase_cloud',
    integration: {
      provider: 'supabase',
      configured: true,
      connectionVerified: false
    },
    capabilities: {
      appShell: true,
      healthApi: true,
      releaseApi: true,
      pwaMetadata: true,
      cloudAuth: 'supabase_rls',
      centralizedDataApi: true,
      cloudState: 'workspace_jsonb_revisioned_cas',
      autosync: 'disabled_manual_transfer_only'
    },
    notices: [
      'This endpoint reports package capabilities and does not claim a verified live Supabase connection.',
      'Sign-in requires an authorized active workspace membership.',
      'Initial upload or restore is an explicit user choice; automatic overwrite is disabled.'
    ],
    version: 'V203',
    runtimeBase: 'V198',
    dataContract: 'V202',
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    timestamp: new Date().toISOString()
  });
}
