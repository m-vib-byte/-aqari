import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const path='staging-database/verification/v267-data-safety-manifest.sql';
const sql=fs.readFileSync(path,'utf8');

function has(marker){assert.ok(sql.includes(marker),`missing manifest marker: ${marker}`);}

test('Stage C manifest is transaction-local verification and never claims to be a backup',()=>{
  assert.match(sql,/^begin;/m);
  has('create temp table v267_manifest_rows');
  assert.match(sql,/rollback;\s*$/);
  has('AQARI-V267-DATA-SAFETY-MANIFEST-2');
  has('It is not a backup');
  has('byte-for-byte restore hashes');
  assert.equal((sql.match(/\binsert into\b/gi)||[]).length,1);
  assert.match(sql,/insert into v267_manifest_rows/i);
  assert.doesNotMatch(sql,/\bupdate\s+(?:public|private|auth|storage)\./i);
  assert.doesNotMatch(sql,/\bdelete\s+from\s+(?:public|private|auth|storage)\./i);
  assert.doesNotMatch(sql,/\btruncate\s+(?:table\s+)?(?:public|private|auth|storage)\./i);
  assert.doesNotMatch(sql,/\balter\s+table\s+(?:public|private|auth|storage)\./i);
  assert.doesNotMatch(sql,/\bdrop\s+table\s+(?:public|private|auth|storage)\./i);
});

test('business fingerprint is order-independent and reports canonical rollups',()=>{
  has("string_agg(row_hash,'' order by row_hash)");
  has("'table_count'");
  has("'row_count'");
  has("'sha256',encode(digest(value::text,'sha256'),'hex')");
  has("'tables',value");
});

test('restore comparison fingerprints AQARI schema structure as well as rows',()=>{
  for(const marker of [
    'information_schema.columns',
    'pg_get_constraintdef(con.oid,true)',
    'from pg_indexes',
    'pg_get_functiondef(p.oid)',
    'pg_get_triggerdef(t.oid,true)',
    "'schema_safe'"
  ]) has(marker);
});

test('Auth fingerprint excludes credential secrets while retaining identity and MFA state',()=>{
  for(const marker of ['auth.users','auth.identities','auth.mfa_factors','auth.sessions']) has(marker);
  for(const forbidden of ['encrypted_password','confirmation_token','recovery_token','email_change_token','phone_change_token','secret']){
    assert.doesNotMatch(sql,new RegExp(`['\"]${forbidden}['\"]`,'i'),`credential field must not be fingerprinted: ${forbidden}`);
  }
});

test('Storage comparison covers object metadata and bucket configuration without replacing byte hashes',()=>{
  for(const marker of ["'metadata_sha256'","'bucket_config_sha256'",'to_jsonb(b)',"'bytes_reported'",'original object bytes']) has(marker);
});
