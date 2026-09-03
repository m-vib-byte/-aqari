import { beginReadOnly, sendReadOnlyJson } from '../lib/read-only.js';
export default async function handler(req,res){
  if(!beginReadOnly(req,res)) return;
  return sendReadOnlyJson(req,res,{ok:true,version:'V198',provider:'supabase',projectUrl:'https://qtavnufzbkdfeauyukot.supabase.co',publishableKeyConfigured:true,releasePreparationSnapshot:{authUsers:1,workspaces:1,memberships:1,appStates:1,rlsPoliciesDetected:true},note:'Release-preparation metadata only; no privileged live query or secret is exposed.'});
}
