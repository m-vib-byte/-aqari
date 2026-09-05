import { beginReadOnly, sendReadOnlyJson } from '../lib/read-only.js';
import {
  deploymentIdentityStatus,
  deploymentMetadata,
  publicConfigurationStatus,
  RELEASE_STAGE,
  releaseIdentity,
  setOperationalCache,
  shouldProbeSupabase,
  unverifiedSupabaseConnection
} from '../lib/release-config.js';
import { probeSupabase } from '../lib/supabase-probe.js';

export default async function handler(req, res){
  if(!beginReadOnly(req, res)) return;
  setOperationalCache(res);
  const config = publicConfigurationStatus();
  const connection = shouldProbeSupabase()
    ? await probeSupabase()
    : unverifiedSupabaseConnection();
  const deploymentIdentity = deploymentIdentityStatus();
  const requiredChecks = [
    { id:'publicConfiguration', ok:config.summary.ready },
    ...(deploymentIdentity.required ? [{ id:'deploymentIdentity', ok:deploymentIdentity.ready }] : []),
    ...(shouldProbeSupabase() ? [{ id:'supabaseConnection', ok:connection.state === 'up' }] : [])
  ];
  const passed = requiredChecks.filter(check => check.ok).length;
  const ready = passed === requiredChecks.length;
  return sendReadOnlyJson(req, res, {
    ok:true,
    ...releaseIdentity(),
    stage:RELEASE_STAGE,
    status:ready ? 'ready' : 'not_ready',
    ready,
    configured:config.configured,
    summary:{ present:passed, passed, required:requiredChecks.length, ready },
    checks:{
      publicConfiguration:{ required:true, ok:config.summary.ready, state:config.summary.ready ? 'pass' : 'fail' },
      deploymentIdentity:{ required:deploymentIdentity.required, ok:deploymentIdentity.ready, state:deploymentIdentity.ready ? 'pass' : 'fail' },
      supabaseConnection:{
        required:shouldProbeSupabase(),
        ok:connection.state === 'up',
        state:connection.state,
        connection
      }
    },
    capabilities:{ emailNotifications:'optional', whatsappNotifications:'optional', objectStorage:'optional', paymentWebhooks:'optional' },
    deployment:deploymentMetadata()
  });
}
