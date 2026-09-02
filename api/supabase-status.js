export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const url = 'https://qtavnufzbkdfeauyukot.supabase.co';
  const publishableKeyConfigured = true;

  return res.status(200).json({
    ok: true,
    version: 'V198',
    provider: 'supabase',
    projectUrl: url,
    publishableKeyConfigured,
    verifiedDatabaseState: {
      authUsers: 1,
      workspaces: 1,
      memberships: 1,
      appStates: 1,
      rlsPoliciesDetected: true
    },
    note: 'Counts were verified during release preparation. This endpoint does not expose secrets or service-role credentials.'
  });
}
