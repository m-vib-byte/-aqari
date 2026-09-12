const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const sql=fs.readFileSync('staging-database/sql/vacating-settlement-mfa-guard.sql','utf8');

test('vacating settlement writes require the shared sensitive AAL2 guard',()=>{
  assert.match(sql,/before insert or update on private\.aqari_vacating_settlements/i);
  assert.match(sql,/private\.aqari_require_sensitive_aal2\(new\.workspace_id\)/i);
  assert.match(sql,/security definer/i);
  assert.match(sql,/revoke all on function private\.aqari_vacating_settlement_aal2_guard\(\) from public,anon,authenticated/i);
});
