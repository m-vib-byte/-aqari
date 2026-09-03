import { beginReadOnly, sendReadOnlyJson } from '../lib/read-only.js';

const required = [
  'DATABASE_URL','AUTH_SECRET','MFA_ENCRYPTION_KEY','S3_ENDPOINT','S3_BUCKET',
  'S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','RESEND_API_KEY','WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID','PAYMENT_WEBHOOK_SECRET'
];

export default async function handler(req, res){
  if(!beginReadOnly(req, res)) return;
  const configured = Object.fromEntries(required.map(key => [key, Boolean(process.env[key])]));
  const present = Object.values(configured).filter(Boolean).length;
  return sendReadOnlyJson(req, res, {
    ok:true, version:'V203', runtimeBase:'V198', dataContract:'V202', stage:'release-candidate', releaseReadiness:'not_deployed',
    env:{ present, required:required.length, ready:present === required.length },
    releaseFrozen:true,
    supabaseConnectionVerified:false,
    production:{ status:'not_deployed', deployed:false },
    safeguards:{ preMigrationBackup:true, migrationExplicitOnly:true, autosyncDisabled:true, manualTransferOnly:true, revisionConflictProtection:true, autoOverwrite:false },
    deployment:{ environment:process.env.VERCEL_ENV || null, gitSha:process.env.VERCEL_GIT_COMMIT_SHA || null, url:process.env.VERCEL_URL || null }
  });
}
