import { beginReadOnly, sendReadOnlyJson } from '../lib/read-only.js';
import { deploymentMetadata, RELEASE_STAGE, releaseIdentity } from '../lib/release-config.js';
export default async function handler(req,res){
  if(!beginReadOnly(req,res)) return;
  return sendReadOnlyJson(req,res,{
    ok:true,
    app:'AQARI',
    ...releaseIdentity(),
    stage:RELEASE_STAGE,
    debugUiDefault:false,
    deployment:deploymentMetadata()
  });
}
