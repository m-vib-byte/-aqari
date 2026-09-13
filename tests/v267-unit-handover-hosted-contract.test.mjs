import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../staging-database/sql/unit-handover-pdf-runtime.sql',import.meta.url),'utf8');
const api=readFileSync(new URL('../api/unit-handover.py',import.meta.url),'utf8');

const compact=value=>value.replace(/\s+/g,' ');

test('handover source is signed move-out only and binds verified stored evidence',()=>{
  const source=compact(sql);
  assert.match(source,/kind='move_out' and x\.status='signed'/);
  assert.match(source,/jsonb_array_length\(i\.photo_document_ids\)=0/);
  assert.match(source,/private\.aqari_operations_document\(w,p\.id,d\.id\)/);
  assert.match(source,/join storage\.objects o on o\.bucket_id=d\.storage_bucket and o\.name=d\.storage_path/);
  assert.match(source,/actual_count<>expected_count/);
  assert.match(source,/count\(distinct x->>'id'\)/);
  assert.match(source,/count\(distinct x->>'role'\)/);
});

test('archive is append-only and browser roles cannot commit PDF bytes',()=>{
  const source=compact(sql);
  assert.match(source,/before update or delete on private\.aqari_unit_handover_pdf_artifacts/);
  assert.match(source,/current_setting\('role',true\) is distinct from 'service_role'/);
  assert.match(source,/revoke all on function public\.aqari_unit_handover_pdf_commit[^;]+from public,anon,authenticated/);
  assert.match(source,/grant execute on function public\.aqari_unit_handover_pdf_commit[^;]+to service_role/);
  assert.match(source,/if current_source is distinct from p_source then raise exception 'UNIT_HANDOVER_SOURCE_CHANGED'/);
  assert.match(source,/pdf_sha256=encode\(sha256\(pdf_bytes\),'hex'\)/);
});

test('authenticated readback re-authorizes source and never returns fresh unarchived bytes',()=>{
  assert.match(api,/aqari_unit_handover_pdf_source/);
  assert.match(api,/aqari_unit_handover_pdf_get/);
  assert.match(api,/storage\/v1\/object\/authenticated/);
  assert.match(api,/if current != source:\n\s+raise ValueError\("UNIT_HANDOVER_SOURCE_CHANGED"\)/);
  assert.match(api,/if artifact == \{\}:[\s\S]+raise ValueError\("ARCHIVE_WRITE_NOT_CONFIRMED"\)/);
  assert.match(api,/final_source = read\("\/rest\/v1\/rpc\/aqari_unit_handover_pdf_source"/);
  assert.match(api,/verified_artifact\(artifact, workspace, inspection_id, source, snapshot_hash\)/);
});

test('trusted archive configuration is server-only and pinned to the preview target',()=>{
  assert.match(api,/AQARI_PDF_ARCHIVE_SERVICE_KEY/);
  assert.match(api,/AQARI_PDF_ARCHIVE_SUPABASE_URL/);
  assert.match(api,/if target != url or not key/);
  assert.doesNotMatch(api,/request_data\[["'](?:service|secret|token|key)/i);
  assert.match(api,/class NoRedirect\(HTTPRedirectHandler\)/);
});

test('evidence storage paths are structural and one object cannot satisfy multiple roles',()=>{
  assert.match(api,/def verified_evidence_storage\(row, seen_storage\):/);
  assert.match(api,/bucket != "aqari-documents"/);
  assert.match(api,/piece in \("\.", "\.\."\)/);
  assert.match(api,/UNIT_HANDOVER_EVIDENCE_STORAGE_REUSED/);
  assert.match(api,/seen_storage = set\(\)/);
  assert.match(api,/verified_evidence_storage\(row, seen_storage\)/);
  assert.doesNotMatch(api,/inspection_id\]\)\[:0\]/);
});
