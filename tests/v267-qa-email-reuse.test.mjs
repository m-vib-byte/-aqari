import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../staging-database/supabase/migrations/20260916094049_allow_reuse_of_disabled_qa_email.sql',import.meta.url),'utf8');

test('disabled or expired QA history no longer permanently reserves a fixed test email',()=>{
  assert.match(sql,/drop constraint if exists aqari_qa_accounts_workspace_id_email_key/i);
  assert.match(sql,/create unique index if not exists aqari_qa_accounts_workspace_email_live_unique/i);
  assert.match(sql,/where status in \('prepared','active','provision_failed','disable_pending'\)/i);
  assert.match(sql,/x\.status in\('prepared','active','provision_failed','disable_pending'\)/i);
  assert.match(sql,/QA_EMAIL_ALREADY_REGISTERED/);
  assert.match(sql,/QA_AUTH_EMAIL_ALREADY_EXISTS/);
  assert.doesNotMatch(sql,/delete\s+from\s+private\.aqari_qa_accounts/i);
});
