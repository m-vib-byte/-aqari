import { beginReadOnly, sendReadOnlyJson } from '../lib/read-only.js';
export default async function handler(req,res){
  if(!beginReadOnly(req,res)) return;
  return sendReadOnlyJson(req,res,{ok:true,version:'V203',runtimeBase:'V198',dataContract:'V202',stage:'release-candidate',mode:'manual_only',supabaseConnectionVerified:false,defaultEnabled:false,automaticUpload:false,explicitUserActionRequired:true,revisionConflictProtection:true,autoOverwrite:false});
}
