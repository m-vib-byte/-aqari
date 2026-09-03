import { beginReadOnly, sendReadOnlyJson } from '../lib/read-only.js';
export default async function handler(req,res){
  if(!beginReadOnly(req,res)) return;
  return sendReadOnlyJson(req,res,{ok:true,version:'V198',mode:'first-run-safe-migration',releasePreparationSnapshot:{cloudRevision:1,cloudPayloadTopLevelKeys:0},autoOverwrite:false,requiresAuthenticatedUser:true,requiresExplicitUploadAction:true});
}
