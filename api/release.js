export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    app: 'AQARI',
    version: 'V198',
    stage: 'release-freeze',
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    deploymentUrl: process.env.VERCEL_URL || null,
    environment: process.env.VERCEL_ENV || null
  });
}
