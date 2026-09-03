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
    ok:true, version:'V203', runtimeBase:'V198', dataContract:'V202', stage:'release-candidate', configured,
    summary:{ present, required:required.length, ready:present === required.length },
    note:'Reports presence only; secret values are never returned.'
  });
}
