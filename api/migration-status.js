export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    version: 'V198',
    mode: 'first-run-safe-migration',
    verifiedCloudRevisionBeforeMigration: 1,
    verifiedCloudPayloadTopLevelKeysBeforeMigration: 0,
    autoOverwrite: false,
    requiresAuthenticatedUser: true,
    requiresExplicitUploadAction: true
  });
}
