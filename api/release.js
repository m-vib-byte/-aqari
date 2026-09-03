import { beginReadOnly, sendReadOnlyJson } from '../lib/read-only.js';

export default async function handler(req, res){
  if(!beginReadOnly(req, res)) return;
  return sendReadOnlyJson(req, res, {
    ok:true, app:'AQARI', version:'V198', stage:'release-freeze', mode:'supabase_cloud',
    patch:'secure-manual-cloud-sync',
    gitSha:process.env.VERCEL_GIT_COMMIT_SHA || null,
    gitBranch:process.env.VERCEL_GIT_COMMIT_REF || null,
    deploymentUrl:process.env.VERCEL_URL || null,
    environment:process.env.VERCEL_ENV || 'unknown',
    builtAt:process.env.VERCEL_DEPLOYMENT_CREATED_AT || null,
    timestamp:new Date().toISOString()
  });
}
