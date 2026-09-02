export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    version: 'V198',
    syncMode: 'manual-safe',
    autoOverwrite: false,
    localToCloud: true,
    cloudToLocalPreview: true,
    cloudToLocalRestoreRequiresExplicitCall: true,
    verifiedSupabaseState: {
      workspaceName: 'عقاري',
      workspaceSlug: 'aqari-main',
      appStateRevision: 1,
      appStatePayloadType: 'object',
      appStateTopLevelKeys: 0
    }
  });
}
