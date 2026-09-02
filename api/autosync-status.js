export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok:true,
    version:'V198',
    mode:'release-freeze',
    defaultEnabled:false,
    requiresInitializedCloudState:true,
    revisionConflictProtection:true,
    autoOverwrite:false
  });
}
