import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const sql=readFileSync(resolve('staging-database/tests/recent_mfa_hosted_acceptance.sql'),'utf8');

test('hosted MFA evidence rejects aal2 without a recent second factor',()=>{
  assert.match(sql,/request\.jwt\.claims','\{\"aal\":\"aal2\"\}'/);
  assert.match(sql,/MISSING_AMR_WAS_ACCEPTED/);
  assert.match(sql,/MFA_RECENT_REAUTH_REQUIRED/);
});

test('hosted MFA evidence rejects a stale TOTP factor',()=>{
  assert.match(sql,/method','totp'/);
  assert.match(sql,/interval '16 minutes'/);
  assert.match(sql,/STALE_AMR_WAS_ACCEPTED/);
  assert.match(sql,/MFA_RECENT_REAUTH_REQUIRED/);
});

test('hosted MFA evidence accepts a current TOTP factor through the real guard',()=>{
  assert.match(sql,/extract\(epoch from now\(\)\)::bigint/);
  assert.match(sql,/private\.aqari_require_sensitive_aal2/);
});

test('hosted MFA evidence is transaction-scoped and verifies cleanup',()=>{
  assert.match(sql,/^begin;/m);
  assert.match(sql,/^rollback;/m);
  assert.match(sql,/fixture_workspaces_remaining/);
});
