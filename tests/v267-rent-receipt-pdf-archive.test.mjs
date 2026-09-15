import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('receipt PDF archive is append-only and bound to persisted payment snapshot',()=>{
 const sql=read('staging-database/sql/rent-receipt-pdf-archive.sql');
 assert.match(sql,/private\.aqari_rent_receipt_pdf_artifacts/);
 assert.match(sql,/before update or delete/);
 assert.match(sql,/aqari_reject_immutable_change/);
 assert.match(sql,/aqari_can_lease\(p_workspace_id,lease_id,'collections','read'\)/);
 assert.match(sql,/aqari_owns_tenant\(p_workspace_id,lease_tenant\)/);
 assert.match(sql,/sha256\(convert_to\(receipt_snapshot::text,'UTF8'\)\)/);
 assert.match(sql,/aqari_rent_receipt_pdf_commit/);
 assert.match(sql,/current_setting\('role',true\) is distinct from 'service_role'/);
 assert.match(sql,/rent_receipt_pdf_archived/);
});

test('receipt API returns only archived bytes and exposes archived hash',()=>{
 const api=read('api/rent-receipt.py');
 assert.match(api,/def export_archive/);
 assert.match(api,/aqari_rent_receipt_pdf_get/);
 assert.match(api,/aqari_rent_receipt_pdf_commit/);
 assert.match(api,/AQARI_PDF_ARCHIVE_SERVICE_KEY/);
 assert.match(api,/AQARI_PDF_ARCHIVE_SUPABASE_URL/);
 assert.match(api,/ARCHIVE_WRITE_NOT_CONFIRMED/);
 assert.match(api,/RECEIPT_CHANGED_DURING_EXPORT/);
 assert.match(api,/X-Aqari-Archived-SHA256/);
 assert.match(api,/pdf = export_archive\(input_data, self\.headers\.get\("Authorization"\)\)/);
});
