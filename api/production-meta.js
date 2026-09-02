export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({
    ok:true,
    app:'AQARI',
    version:'V198',
    stage:'release-freeze',
    debugUiDefault:false,
    deployment:{
      environment:process.env.VERCEL_ENV || null,
      gitSha:process.env.VERCEL_GIT_COMMIT_SHA || null,
      url:process.env.VERCEL_URL || null
    }
  });
}
