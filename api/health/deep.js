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
      cloudRuntime: {
        ok: true,
        required: true,
        configured: true,
        detail: 'V203 uses the preserved V198 Supabase security runtime and V202 operational data contract.'
      },
      cloudConnection: {
        ok: false,
        required: false,
        connectionVerified: false,
        detail: 'This read-only endpoint does not perform or claim a live privileged database check.'
      }
    },
    version: 'V203',
    runtimeBase: 'V198',
    dataContract: 'V202',
    stage: 'release-candidate',
    environment: process.env.VERCEL_ENV || 'unknown',
    timestamp: new Date().toISOString()
  });
}
