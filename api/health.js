import { beginReadOnly, sendReadOnlyJson } from '../lib/read-only.js';

export default async function handler(req, res){
  const started = Date.now();
  if(!beginReadOnly(req, res)) return;
  return sendReadOnlyJson(req, res, {
    ok:true, status:'healthy', service:'aqari', version:'V203', runtimeBase:'V198', dataContract:'V202', stage:'release-candidate', mode:'supabase_cloud',
    integration:{ provider:'supabase', configured:true, connectionVerified:false },
    environment:process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    deployment:{ gitSha:process.env.VERCEL_GIT_COMMIT_SHA || null, region:process.env.VERCEL_REGION || null },
    timestamp:new Date().toISOString(), latencyMs:Date.now() - started
  });
}
