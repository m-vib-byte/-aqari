import { beginReadOnly, sendReadOnlyJson } from '../../lib/read-only.js';
import {
  deploymentMetadata,
  publicConfigurationStatus,
  releaseIdentity,
  setOperationalCache,
  shouldProbeSupabase,
  unverifiedSupabaseConnection
} from '../../lib/release-config.js';
import { probeSupabase } from '../../lib/supabase-probe.js';

export default async function handler(req, res) {
  if(!beginReadOnly(req, res)) return;
  setOperationalCache(res);

  const config = publicConfigurationStatus();
  const connection = shouldProbeSupabase()
    ? await probeSupabase()
    : unverifiedSupabaseConnection();
  const cloudOk = config.summary.ready && (connection.state === 'up' || connection.state === 'not_checked');

  return sendReadOnlyJson(req, res, {
    ok: cloudOk,
    status: cloudOk ? 'healthy' : 'degraded',
    mode: 'supabase_cloud',
    checks: {
      runtime: { ok:true, required:true },
      staticApp: { ok:true, required:true },
      cloudIntegration: {
        ok: cloudOk,
        required: true,
        configured: config.summary.ready,
        connection
      }
    },
    ...releaseIdentity(),
    environment: deploymentMetadata().environment,
    timestamp: new Date().toISOString()
  });
}
