import { beginReadOnly, sendReadOnlyJson } from '../../lib/read-only.js';

const projectUrl = 'https://qtavnufzbkdfeauyukot.supabase.co';

export default async function handler(req, res) {
  if(!beginReadOnly(req, res)) return;

  return sendReadOnlyJson(req, res, {
    ok: true,
    version: 'V198',
    provider: 'supabase',
    mode: 'supabase_cloud',
    configured: true,
    connected: false,
    connectionVerified: false,
    authMode: 'Supabase Auth + RLS',
    tables: [],
    publicConfiguration: {
      projectUrl,
      publishableKeyConfigured: true
    },
    note: 'Compatibility status only. Public integration configuration is present; no live database query was performed.'
  });
}
