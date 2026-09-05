import { beginReadOnly, sendReadOnlyJson } from '../../lib/read-only.js';
import { deploymentMetadata, releaseIdentity } from '../../lib/release-config.js';

export default async function handler(req, res) {
  if(!beginReadOnly(req, res)) return;

  return sendReadOnlyJson(req, res, {
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
      cloudState: 'workspace_jsonb_revisioned_cas',
      autosync: 'disabled_manual_transfer_only'
    },
    notices: [
      'Sign-in requires an authorized active workspace membership.',
      'Initial upload or restore is an explicit user choice; automatic overwrite is disabled.'
    ],
    ...releaseIdentity(),
    gitSha: deploymentMetadata().gitSha,
    timestamp: new Date().toISOString()
  });
}
