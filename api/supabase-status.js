import { beginReadOnly, sendReadOnlyJson } from '../lib/read-only.js';

export default async function handler(req,res){
  if(!beginReadOnly(req,res)) return;
  return sendReadOnlyJson(req,res,{
    ok:true,
    version:'V198',
    provider:'supabase',
    mode:'supabase_cloud',
    projectUrl:'https://qtavnufzbkdfeauyukot.supabase.co',
    publishableKeyConfigured:true,
    configured:true,
    connected:false,
    connectionVerified:false,
    authMode:'Supabase Auth + RLS',
    tables:[],
    releasePreparationSnapshot:{
      authUsers:1,
      workspaces:1,
      memberships:1,
      appStates:1,
      rlsPoliciesDetected:true
    },
    note:'Release-preparation and public configuration metadata only; no live database query, privileged access, or secret is exposed.'
  });
}
