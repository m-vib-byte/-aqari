import { beginReadOnly, sendReadOnlyJson } from '../lib/read-only.js';
import { deploymentIdentityStatus, deploymentMetadata, releaseIdentity } from '../lib/release-config.js';

export default async function handler(req, res){
  const started = Date.now();
  if(!beginReadOnly(req, res)) return;
  const deployment = deploymentMetadata();
  const identity = deploymentIdentityStatus();
  return sendReadOnlyJson(req, res, {
    ok:true, status:'healthy', service:'aqari', ...releaseIdentity(), mode:'supabase_cloud',
    environment:deployment.environment,
    deployment:{ gitSha:deployment.gitSha, region:deployment.region },
    releaseContract:{
      required:identity.required,
      ready:identity.ready,
      identityReady:identity.identityReady,
      releaseStageMatches:identity.releaseStageMatches,
      expectedReleaseStage:identity.expectedReleaseStage,
      actualReleaseStage:identity.actualReleaseStage
    },
    timestamp:new Date().toISOString(), latencyMs:Date.now() - started
  });
}
