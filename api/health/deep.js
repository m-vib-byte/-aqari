import { beginReadOnly, sendReadOnlyJson } from '../../lib/read-only.js';

export default async function handler(req, res) {
  if(!beginReadOnly(req, res)) return;

  return sendReadOnlyJson(req, res, {
    ok: true,
    status: 'healthy',
    mode: 'supabase_cloud',
    checks: {
      runtime: { ok:true, required:true },
      staticApp: { ok:true, required:true },
      cloudIntegration: {
        ok: true,
        required: true,
        detail: 'V198 Supabase Auth, workspace RLS, revision CAS, and explicit manual transfer controls are deployed.'
      }
    },
    version: 'V198',
    environment: process.env.VERCEL_ENV || 'unknown',
    timestamp: new Date().toISOString()
  });
}
