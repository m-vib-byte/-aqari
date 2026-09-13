import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../staging-database/sql/sensitive-record-delete-guard.sql',import.meta.url),'utf8');

const targets=[
  ['public','aqari_leases','aqari_sensitive_no_delete_lease'],
  ['public','aqari_rent_payments','aqari_sensitive_no_delete_payment'],
  ['public','aqari_documents','aqari_sensitive_no_delete_document'],
  ['private','aqari_financial_expenses','aqari_sensitive_no_delete_expense'],
  ['private','aqari_official_document_series','aqari_sensitive_no_delete_official_series']
];

test('sensitive delete guard fails closed with a stable database error',()=>{
  assert.match(sql,/create or replace function private\.aqari_reject_sensitive_delete\(\)/i);
  assert.match(sql,/SENSITIVE_RECORD_DELETE_FORBIDDEN:%/);
  assert.match(sql,/using errcode='23514'/i);
  assert.match(sql,/revoke all on function private\.aqari_reject_sensitive_delete\(\) from public, anon, authenticated/i);
});

for(const [schema,table,trigger] of targets){
  test(`direct DELETE is forbidden for ${schema}.${table}`,()=>{
    const escaped=`${schema}\\.${table}`;
    assert.match(sql,new RegExp(`create trigger ${trigger}\\s+before delete on ${escaped}\\s+for each row execute function private\\.aqari_reject_sensitive_delete\\(\\)`,`i`));
  });
}

test('guard remains additive and transactional',()=>{
  assert.match(sql,/^\s*begin;/im);
  assert.match(sql,/\bcommit;\s*$/im);
  assert.doesNotMatch(sql,/\bdelete\s+from\b/i);
  assert.doesNotMatch(sql,/\btruncate\b/i);
});
