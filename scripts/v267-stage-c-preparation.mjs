import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';

const FULL_SHA_RE = /^[0-9a-f]{40}$/i;
const HEX64_RE = /^[0-9a-f]{64}$/i;
const BLOCKED_TARGETS = [
  /(^|[^a-z])production([^a-z]|$)/i,
  /(^|[^a-z])prod([^a-z]|$)/i,
  /myaqari\.com/i,
  /djkpkkgoibruaezdrchb/i,
  /qtavnufzbkdfeauyukot/i,
];

function text(value) {
  return String(value ?? '').trim();
}

function normalizedSha(value) {
  return text(value).toLowerCase();
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(stable(value));
}

export function assertIsolatedTarget(target) {
  const value = text(target);
  if (!value) throw new Error('ISOLATED_TARGET_REQUIRED');
  if (BLOCKED_TARGETS.some((pattern) => pattern.test(value))) throw new Error('PRODUCTION_TARGET_FORBIDDEN');
  return value;
}

export function hashFile(path) {
  const bytes = readFileSync(path);
  const stat = statSync(path);
  if (!stat.isFile()) throw new Error(`BACKUP_ARTIFACT_NOT_FILE: ${path}`);
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

export function buildBackupManifest({ candidateSha, target, artifacts = [], createdAt = new Date().toISOString() }) {
  const sha = normalizedSha(candidateSha);
  if (!FULL_SHA_RE.test(sha)) throw new Error('FULL_CANDIDATE_SHA_REQUIRED');
  const safeTarget = assertIsolatedTarget(target);
  const requiredKinds = new Set(['database', 'auth', 'storage_bytes']);
  const seen = new Set();
  const rows = artifacts.map((artifact) => {
    const kind = text(artifact?.kind);
    const path = text(artifact?.path);
    if (!kind || !path) throw new Error('BACKUP_ARTIFACT_KIND_AND_PATH_REQUIRED');
    if (seen.has(kind)) throw new Error(`DUPLICATE_BACKUP_ARTIFACT_KIND: ${kind}`);
    seen.add(kind);
    const fingerprint = hashFile(path);
    return { kind, name: basename(path), ...fingerprint };
  });
  for (const kind of requiredKinds) if (!seen.has(kind)) throw new Error(`MISSING_BACKUP_ARTIFACT: ${kind}`);
  const manifest = {
    schema: 'AQARI-V267-STAGE-C-BACKUP-1',
    candidateSha: sha,
    target: safeTarget,
    createdAt,
    artifacts: rows,
    includes: { database: true, auth: true, storageBytes: true },
  };
  return { ...manifest, manifestSha256: sha256(canonicalJson(manifest)) };
}

export function verifyBackupManifest(manifest, artifactPaths = {}) {
  const errors = [];
  if (manifest?.schema !== 'AQARI-V267-STAGE-C-BACKUP-1') errors.push('backup schema mismatch');
  const sha = normalizedSha(manifest?.candidateSha);
  if (!FULL_SHA_RE.test(sha)) errors.push('candidate SHA is invalid');
  try { assertIsolatedTarget(manifest?.target); } catch (error) { errors.push(error.message); }
  if (!HEX64_RE.test(text(manifest?.manifestSha256))) errors.push('backup manifest SHA-256 missing');
  else {
    const { manifestSha256, ...body } = manifest;
    if (sha256(canonicalJson(body)) !== manifestSha256) errors.push('backup manifest SHA-256 mismatch');
  }
  const rows = Array.isArray(manifest?.artifacts) ? manifest.artifacts : [];
  const kinds = new Set(rows.map((row) => row.kind));
  for (const kind of ['database', 'auth', 'storage_bytes']) {
    if (!kinds.has(kind)) errors.push(`backup missing ${kind}`);
  }
  for (const row of rows) {
    if (!HEX64_RE.test(text(row?.sha256)) || !Number.isInteger(row?.bytes) || row.bytes < 0) {
      errors.push(`invalid fingerprint for ${row?.kind || 'unknown artifact'}`);
      continue;
    }
    const path = artifactPaths[row.kind];
    if (!path) continue;
    const actual = hashFile(path);
    if (actual.sha256 !== row.sha256 || actual.bytes !== row.bytes) errors.push(`artifact mismatch: ${row.kind}`);
  }
  return { ok: errors.length === 0, errors };
}

function normalizeDataSafety(manifest, { strictSessions = false } = {}) {
  const value = structuredClone(manifest ?? {});
  delete value.generated_at;
  delete value.generatedAt;
  delete value.warning;
  if (!strictSessions && value.auth_safe && typeof value.auth_safe === 'object') delete value.auth_safe.sessions;
  return value;
}

export function compareDataSafetyManifests(before, after, options = {}) {
  const left = normalizeDataSafety(before, options);
  const right = normalizeDataSafety(after, options);
  const beforeSha256 = sha256(canonicalJson(left));
  const afterSha256 = sha256(canonicalJson(right));
  return {
    ok: beforeSha256 === afterSha256,
    beforeSha256,
    afterSha256,
    strictSessions: options.strictSessions === true,
    errors: beforeSha256 === afterSha256 ? [] : ['DATA_SAFETY_MANIFEST_MISMATCH'],
  };
}

export function validateRestoreReport(report = {}) {
  const errors = [];
  try { assertIsolatedTarget(report.target); } catch (error) { errors.push(error.message); }
  if (report.schema !== 'AQARI-V267-STAGE-C-RESTORE-1') errors.push('restore schema mismatch');
  if (report.independent !== true) errors.push('restore must be independent');
  if (report.externalSideEffectsDisabled !== true) errors.push('external side effects must be disabled during restore rehearsal');
  if (report.databaseRestored !== true) errors.push('database restore evidence missing');
  if (report.authRestored !== true) errors.push('auth restore evidence missing');
  if (report.storageBytesRestored !== true) errors.push('storage byte restore evidence missing');
  if (report.dataSafetyMatch !== true) errors.push('data-safety readback must match');
  if (report.storageByteHashMatch !== true) errors.push('restored storage bytes must match');
  if (!HEX64_RE.test(text(report.backupManifestSha256))) errors.push('backup manifest SHA-256 required');
  if (!FULL_SHA_RE.test(normalizedSha(report.candidateSha))) errors.push('full candidate SHA required');
  return { ok: errors.length === 0, errors };
}

export function validateRollbackPoint(point = {}) {
  const errors = [];
  if (point.schema !== 'AQARI-V267-STAGE-C-ROLLBACK-1') errors.push('rollback schema mismatch');
  if (!FULL_SHA_RE.test(normalizedSha(point.candidateSha))) errors.push('candidate SHA required');
  if (!FULL_SHA_RE.test(normalizedSha(point.previousApplicationSha))) errors.push('previous application SHA required');
  if (!HEX64_RE.test(text(point.backupManifestSha256))) errors.push('backup manifest SHA-256 required');
  if (!HEX64_RE.test(text(point.dataSafetyBaselineSha256))) errors.push('data-safety baseline SHA-256 required');
  if (point.strategy !== 'application-source-rollback-with-data-preservation') errors.push('data-preserving rollback strategy required');
  if (point.databaseRollback !== false) errors.push('automatic database rollback must be false');
  if (point.capturePostCheckpointTransactions !== true) errors.push('post-checkpoint transactions must be captured');
  if (point.preserveAuditAndDocuments !== true) errors.push('audit/documents must be preserved');
  if (point.rehearsed !== true) errors.push('rollback point must be rehearsed before C acceptance');
  return { ok: errors.length === 0, errors };
}
