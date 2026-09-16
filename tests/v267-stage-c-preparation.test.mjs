import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertIsolatedTarget,
  buildBackupManifest,
  verifyBackupManifest,
  compareDataSafetyManifests,
  validateRestoreReport,
  validateRollbackPoint,
} from '../scripts/v267-stage-c-preparation.mjs';

const SHA = 'fdb4aaf8a31571c9b2adea9bcaed3534eeda8545';
const OLD = '5130eb1a4ee8c75c4868cd025d8dc15491145d7d';
const HEX64 = 'a'.repeat(64);

function artifacts() {
  const dir = mkdtempSync(join(tmpdir(), 'aqari-stage-c-'));
  const paths = {
    database: join(dir, 'database.dump'),
    auth: join(dir, 'auth.json'),
    storage_bytes: join(dir, 'storage.tar'),
  };
  writeFileSync(paths.database, 'db-fixture\n');
  writeFileSync(paths.auth, '{"users":1}\n');
  writeFileSync(paths.storage_bytes, 'storage-bytes\n');
  return paths;
}

test('production and domain targets are fail-closed', () => {
  for (const target of ['production', 'prod', 'myaqari.com', 'djkpkkgoibruaezdrchb', 'qtavnufzbkdfeauyukot']) {
    assert.throws(() => assertIsolatedTarget(target), /PRODUCTION_TARGET_FORBIDDEN/);
  }
  assert.equal(assertIsolatedTarget('isolated-restore-v267-c'), 'isolated-restore-v267-c');
});

test('backup manifest requires Database + Auth + Storage bytes and verifies their exact bytes', () => {
  const paths = artifacts();
  const manifest = buildBackupManifest({
    candidateSha: SHA,
    target: 'isolated-stage-c-rehearsal',
    artifacts: Object.entries(paths).map(([kind, path]) => ({ kind, path })),
    createdAt: '2026-09-16T08:00:00Z',
  });
  assert.equal(verifyBackupManifest(manifest, paths).ok, true);
  writeFileSync(paths.auth, '{"users":2}\n');
  const failed = verifyBackupManifest(manifest, paths);
  assert.equal(failed.ok, false);
  assert.match(failed.errors.join('\n'), /artifact mismatch: auth/);
});

test('backup manifest refuses an incomplete bundle', () => {
  const paths = artifacts();
  assert.throws(() => buildBackupManifest({
    candidateSha: SHA,
    target: 'isolated-stage-c-rehearsal',
    artifacts: [
      { kind: 'database', path: paths.database },
      { kind: 'auth', path: paths.auth },
    ],
  }), /MISSING_BACKUP_ARTIFACT: storage_bytes/);
});

test('restore data-safety comparison ignores only timestamp/warning and sessions by default', () => {
  const before = {
    format: 'AQARI-V267-DATA-SAFETY-MANIFEST-1',
    generated_at: 'before',
    warning: 'x',
    business: [{ schema: 'private', table: 'aqari_x', rows: 1, sha256: '1' }],
    auth_safe: { users: { rows: 1, sha256: '2' }, sessions: { rows: 1, sha256: 'old' } },
    storage_safe: { objects: 1, metadata_sha256: '3', bytes_reported: 10 },
  };
  const after = structuredClone(before);
  after.generated_at = 'after';
  after.warning = 'other';
  after.auth_safe.sessions = { rows: 0, sha256: 'new' };
  assert.equal(compareDataSafetyManifests(before, after).ok, true);
  assert.equal(compareDataSafetyManifests(before, after, { strictSessions: true }).ok, false);
  after.business[0].rows = 2;
  assert.equal(compareDataSafetyManifests(before, after).ok, false);
});

test('restore report cannot pass without independent isolated DB/Auth/Storage-byte proof', () => {
  const good = {
    schema: 'AQARI-V267-STAGE-C-RESTORE-1', candidateSha: SHA, target: 'isolated-restore-v267-c',
    independent: true, externalSideEffectsDisabled: true, databaseRestored: true, authRestored: true,
    storageBytesRestored: true, dataSafetyMatch: true, storageByteHashMatch: true,
    backupManifestSha256: HEX64,
  };
  assert.equal(validateRestoreReport(good).ok, true);
  assert.equal(validateRestoreReport({ ...good, target: 'myaqari.com' }).ok, false);
  assert.equal(validateRestoreReport({ ...good, storageByteHashMatch: false }).ok, false);
});

test('rollback point is application-only and preserves database transactions/audit/documents', () => {
  const good = {
    schema: 'AQARI-V267-STAGE-C-ROLLBACK-1', candidateSha: SHA, previousApplicationSha: OLD,
    backupManifestSha256: HEX64, dataSafetyBaselineSha256: 'b'.repeat(64),
    strategy: 'application-source-rollback-with-data-preservation', databaseRollback: false,
    capturePostCheckpointTransactions: true, preserveAuditAndDocuments: true, rehearsed: true,
  };
  assert.equal(validateRollbackPoint(good).ok, true);
  assert.equal(validateRollbackPoint({ ...good, databaseRollback: true }).ok, false);
  assert.equal(validateRollbackPoint({ ...good, capturePostCheckpointTransactions: false }).ok, false);
});
