import { beginReadOnly, sendReadOnlyJson } from '../lib/read-only.js';

export default async function handler(req, res){
  if(!beginReadOnly(req, res)) return;
  return sendReadOnlyJson(req, res, {
    ok:true, app:'AQARI', version:'V203', runtimeBase:'V198', dataContract:'V202', stage:'release-candidate', mode:'supabase_cloud',
    patch:'unified-property-ledger',
    releaseFrozen:true,
    validation:{ runtimeContracts:'required_by_ci', releaseGate:'required_by_ci', previewE2E:'required_by_ci', production:'not_deployed' },
    supabase:{ configured:true, connectionVerified:false },
    productionDeployed:false,
    gitSha:process.env.VERCEL_GIT_COMMIT_SHA || null,
    gitBranch:process.env.VERCEL_GIT_COMMIT_REF || null,
    deploymentUrl:process.env.VERCEL_URL || null,
    environment:process.env.VERCEL_ENV || 'unknown',
    builtAt:process.env.VERCEL_DEPLOYMENT_CREATED_AT || null,
    timestamp:new Date().toISOString()
  });
}
