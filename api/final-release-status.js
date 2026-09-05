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
  const checks = [
    config.summary.ready,
    ...(deploymentIdentity.required ? [deploymentIdentity.ready] : []),
    ...(shouldProbeSupabase() ? [connection.state === 'up'] : [])
  ];
  const required = checks.length;
  const passed = checks.filter(Boolean).length;
  const ready = passed === required;
  return sendReadOnlyJson(req, res, {
    ok:true, ...releaseIdentity(), stage:RELEASE_STAGE, ready,
    env:{ present:passed, passed, required, ready },
    connection,
    safeguards:{ preMigrationBackup:true, migrationExplicitOnly:true, autosyncDisabled:true, manualTransferOnly:true, revisionConflictProtection:true, autoOverwrite:false },
    deployment:deploymentMetadata()
  });
}
