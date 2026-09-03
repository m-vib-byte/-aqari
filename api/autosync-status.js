import { beginReadOnly, sendReadOnlyJson } from '../lib/read-only.js';
export default async function handler(req,res){
  if(!beginReadOnly(req,res)) return;
  return sendReadOnlyJson(req,res,{ok:true,version:'V198',mode:'manual_only',defaultEnabled:false,automaticUpload:false,explicitUserActionRequired:true,revisionConflictProtection:true,autoOverwrite:false});
}
