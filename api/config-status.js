import { beginReadOnly, sendReadOnlyJson } from '../lib/read-only.js';
import { publicConfigurationStatus, releaseIdentity } from '../lib/release-config.js';

export default async function handler(req, res){
  if(!beginReadOnly(req, res)) return;
  const { configured, summary } = publicConfigurationStatus();
  return sendReadOnlyJson(req, res, {
    ok:true, ...releaseIdentity(), configured, summary,
    note:'Reports browser-safe Supabase client configuration only; secret names and values are never returned.'
  });
}
