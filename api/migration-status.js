import { beginReadOnly, sendReadOnlyJson } from '../lib/read-only.js';
export default async function handler(req,res){
  if(!beginReadOnly(req,res)) return;
  return sendReadOnlyJson(req,res,{ok:true,version:'V203',runtimeBase:'V198',dataContract:'V202',stage:'release-candidate',mode:'first-run-safe-migration',supabaseConnectionVerified:false,releasePreparationSnapshot:{cloudRevision:1,cloudPayloadTopLevelKeys:0},autoOverwrite:false,requiresAuthenticatedUser:true,requiresExplicitUploadAction:true});
}
