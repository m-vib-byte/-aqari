import { beginReadOnly, sendReadOnlyJson } from '../lib/read-only.js';
import { deploymentMetadata, releaseIdentity } from '../lib/release-config.js';

export default async function handler(req, res){
  const started = Date.now();
  if(!beginReadOnly(req, res)) return;
  return sendReadOnlyJson(req, res, {
    ok:true, status:'healthy', service:'aqari', ...releaseIdentity(), mode:'supabase_cloud',
    environment:deploymentMetadata().environment,
    deployment:{ gitSha:deploymentMetadata().gitSha, region:deploymentMetadata().region },
    timestamp:new Date().toISOString(), latencyMs:Date.now() - started
  });
}
