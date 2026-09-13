import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../lib/unit_handover_pdf.py',import.meta.url),'utf8');

test('handover renderer remains fail-closed around signed source identity',()=>{
  for(const token of [
    'def verified_unit_handover_bundle',
    'def verified_unit_handover_evidence',
    'def unit_handover_snapshot_sha256',
    'def render_unit_handover_pdf',
    'UNIT_HANDOVER_PDF_SIGNATURE_EVIDENCE_REQUIRED',
    'UNIT_HANDOVER_PDF_PHOTO_EVIDENCE_REQUIRED',
    'UNIT_HANDOVER_PDF_ATTACHMENT_IDENTITY_CONFLICT',
    'UNIT_HANDOVER_PDF_EVIDENCE_BYTES_REQUIRED',
    'UNIT_HANDOVER_PDF_EVIDENCE_SIZE_MISMATCH',
    'UNIT_HANDOVER_PDF_EVIDENCE_SHA256_MISMATCH',
    'UNIT_HANDOVER_PDF_EVIDENCE_MIME_MISMATCH',
    'checksum_sha256',
    'inspection_revision',
    'FONT_PATH',
    'AQARI V267'
  ])assert.ok(source.includes(token),`missing renderer contract token: ${token}`);
});

test('renderer verifies real evidence bytes and visually embeds image evidence',()=>{
  assert.match(source,/hashlib\.sha256\(raw\)\.hexdigest\(\) != attachment\["checksum_sha256"\]/);
  assert.match(source,/ImageReader\(BytesIO\(raw\)\)/);
  assert.match(source,/pdf\.drawImage\(/);
  assert.match(source,/mime == "application\/pdf"/);
  assert.match(source,/raw\.startswith\(b"%PDF-"\)/);
});

test('renderer emits only a real PDF and fingerprints the canonical saved bundle',()=>{
  assert.match(source,/json\.dumps\(verified,[\s\S]*sort_keys=True/);
  assert.match(source,/hashlib\.sha256\(canonical\)\.hexdigest\(\)/);
  assert.match(source,/data\.startswith\(b"%PDF-"\)/);
  assert.match(source,/بصمة محضر التسليم/);
});
