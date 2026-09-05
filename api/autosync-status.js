import { beginReadOnly, sendReadOnlyJson } from '../lib/read-only.js';
import { releaseIdentity } from '../lib/release-config.js';
export default async function handler(req,res){
  if(!beginReadOnly(req,res)) return;
  return sendReadOnlyJson(req,res,{ok:true,...releaseIdentity(),mode:'manual_only',defaultEnabled:false,automaticUpload:false,explicitUserActionRequired:true,revisionConflictProtection:true,autoOverwrite:false});
}
