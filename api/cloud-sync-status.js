import { beginReadOnly, sendReadOnlyJson } from '../lib/read-only.js';

export default async function handler(req, res){
  if(!beginReadOnly(req, res)) return;
  return sendReadOnlyJson(req, res, {
    ok:true, version:'V203', runtimeBase:'V198', dataContract:'V202', stage:'release-candidate', syncMode:'manual-safe', automaticUpload:false, autoOverwrite:false,
    supabaseConnectionVerified:false,
    localToCloudRequiresExplicitCall:true, cloudToLocalPreview:true, cloudToLocalRestoreRequiresExplicitCall:true,
    releasePreparationSnapshot:{ workspaceName:'عقاري', workspaceSlug:'aqari-main', appStateRevision:1, appStatePayloadType:'object' }
  });
}
