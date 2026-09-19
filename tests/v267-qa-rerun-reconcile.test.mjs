import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../staging-database/supabase/migrations/20260916094358_reconcile_qa_rerun_after_email_reuse.sql',import.meta.url),'utf8');

test('final QA rerun state keeps cleanup while allowing terminal email history',()=>{
  assert.match(sql,/drop index if exists private\.aqari_qa_accounts_workspace_email_live_unique/i);
  assert.match(sql,/aqari_qa_accounts_active_email_unique/i);
  assert.match(sql,/where status in\('prepared','active','disable_pending'\)/i);
  assert.match(sql,/p_action='cleanup'/i);
  assert.match(sql,/x\.status in\('disabled','expired'\) and x\.auth_user_id is not null/i);
  assert.match(sql,/x\.email=target_email and x\.status in\('prepared','active','disable_pending'\)/i);
  assert.match(sql,/QA_AUTH_EMAIL_ALREADY_EXISTS/);
  assert.match(sql,/QA_EMAIL_ALREADY_REGISTERED/);
});
