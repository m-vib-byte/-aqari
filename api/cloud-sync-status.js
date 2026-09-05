import { beginReadOnly, sendReadOnlyJson } from '../lib/read-only.js';
import { releaseIdentity } from '../lib/release-config.js';

export default async function handler(req, res){
  if(!beginReadOnly(req, res)) return;
  return sendReadOnlyJson(req, res, {
    ok:true, ...releaseIdentity(), syncMode:'manual-safe', automaticUpload:false, autoOverwrite:false,
    localToCloudRequiresExplicitCall:true, cloudToLocalPreview:true, cloudToLocalRestoreRequiresExplicitCall:true,
    note:'Capability metadata only; workspace identity, revision, payload shape, and user data are not exposed.'
  });
}
