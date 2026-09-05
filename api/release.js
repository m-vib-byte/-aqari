import { beginReadOnly, sendReadOnlyJson } from '../lib/read-only.js';
import {
  deploymentMetadata,
  RELEASE_PATCH,
  RELEASE_STAGE,
  releaseIdentity
} from '../lib/release-config.js';

export default async function handler(req, res){
  if(!beginReadOnly(req, res)) return;
  const deployment = deploymentMetadata();
  return sendReadOnlyJson(req, res, {
    ok:true, app:'AQARI', ...releaseIdentity(), stage:RELEASE_STAGE, mode:'supabase_cloud',
    patch:RELEASE_PATCH,
    gitSha:deployment.gitSha,
    gitBranch:deployment.gitBranch,
    deploymentUrl:deployment.url,
    environment:deployment.environment,
    builtAt:deployment.builtAt,
    timestamp:new Date().toISOString()
  });
}
