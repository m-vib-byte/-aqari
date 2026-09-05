import { beginReadOnly, sendReadOnlyJson } from '../lib/read-only.js';
import { releaseIdentity } from '../lib/release-config.js';
export default async function handler(req,res){
  if(!beginReadOnly(req,res)) return;
  return sendReadOnlyJson(req,res,{ok:true,...releaseIdentity(),mode:'first-run-safe-migration',autoOverwrite:false,requiresAuthenticatedUser:true,requiresExplicitUploadAction:true,note:'Capability metadata only; no cloud revision or payload metadata is exposed.'});
}
