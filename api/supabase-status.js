import { beginReadOnly, sendReadOnlyJson } from '../lib/read-only.js';
import {
  publicConfigurationStatus,
  releaseIdentity,
  setOperationalCache,
  shouldProbeSupabase,
  unverifiedSupabaseConnection
} from '../lib/release-config.js';
import { probeSupabase } from '../lib/supabase-probe.js';

export default async function handler(req,res){
  if(!beginReadOnly(req,res)) return;
  setOperationalCache(res);
  const config = publicConfigurationStatus();
  const connection = shouldProbeSupabase()
    ? await probeSupabase()
    : unverifiedSupabaseConnection();
  return sendReadOnlyJson(req,res,{
    ok:true,
    ...releaseIdentity(),
    provider:'supabase',
    mode:'supabase_cloud',
    publishableKeyConfigured:config.configured.SUPABASE_PUBLISHABLE_KEY,
    configured:config.summary.ready,
    connected:connection.connected,
    connectionVerified:connection.verified,
    connection,
    authMode:'supabase_auth_rls',
    tables:[],
    note:connection.verified
      ? 'Live connectivity is verified through a cached, read-only health RPC; no rows, privileged access, or secrets are exposed.'
      : 'Public configuration metadata only; no live database query, privileged access, or secret is exposed.'
  });
}
