export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');

  const required = [
    'DATABASE_URL',
    'AUTH_SECRET',
    'MFA_ENCRYPTION_KEY',
    'S3_ENDPOINT',
    'S3_BUCKET',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'RESEND_API_KEY',
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'PAYMENT_WEBHOOK_SECRET'
  ];

  const configured = Object.fromEntries(required.map(k => [k, Boolean(process.env[k])]));
  const present = Object.values(configured).filter(Boolean).length;

  return res.status(200).json({
    ok:true,
    version:'V198',
    stage:'release-freeze',
    env:{
      present,
      required:required.length,
      ready:present === required.length
    },
    safeguards:{
      preMigrationBackup:true,
      migrationExplicitOnly:true,
      autosyncDefaultOff:true,
      revisionConflictProtection:true,
      autoOverwrite:false
    },
    deployment:{
      environment:process.env.VERCEL_ENV || null,
      gitSha:process.env.VERCEL_GIT_COMMIT_SHA || null,
      url:process.env.VERCEL_URL || null
    }
  });
}
