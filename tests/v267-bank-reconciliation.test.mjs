import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../staging-database/sql/bank-reconciliation.sql',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/v267/pages/bank-reconciliation.js',import.meta.url),'utf8');
const install=readFileSync(new URL('../scripts/install-v267-bank-reconciliation.mjs',import.meta.url),'utf8');
const has=(source,re)=>assert.match(source,re);

test('unknown bank transfers are persisted unmatched and never auto-assigned',()=>{
 has(sql,/state text not null default 'unmatched'/i);
 has(sql,/values\([^;]*'unmatched',null,1,auth\.uid\(\)\)/is);
 has(sql,/'autoMatched',false/);
 has(sql,/'autoMatch',false/);
 has(ui,/لن تربطه المنصة تلقائياً بأي مستأجر أو عقد أو عقار أو دفعة/);
 has(ui,/لا توجد مطابقة تلقائية أو تقريبية/);
});

test('reconciliation is explicit, permission-scoped, MFA-gated, and revision-safe',()=>{
 has(sql,/not private\.aqari_manager\(w\) or not private\.aqari_can\(w,'finance','write'\)/i);
 has(sql,/perform private\.aqari_require_sensitive_aal2\(w\)/i);
 has(sql,/EXPLICIT_PAYMENT_REQUIRED/);
 has(sql,/BANK_RECONCILIATION_REVISION_CONFLICT/);
 has(sql,/r\.amount=\(row_before->>'amount'\)::numeric/i);
 has(sql,/payment_method[^;]*bank_transfer/is);
 has(ui,/paymentId:payment\.value/);
 has(ui,/reason:text\(reason\.value\)/);
});

test('reconciliation history is immutable and queue cannot be hard-deleted',()=>{
 has(sql,/BANK_RECONCILIATION_DELETE_FORBIDDEN/);
 has(sql,/BANK_RECONCILIATION_EVENT_IMMUTABLE/);
 has(sql,/before update or delete on private\.aqari_bank_transfer_events/i);
 has(sql,/before_value jsonb/);
 has(sql,/after_value jsonb not null/);
});

test('cancelled receipts and already-linked payments are not candidates',()=>{
 has(sql,/aqari_receipt_cancellations/);
 has(sql,/not exists\(select 1 from private\.aqari_bank_transfer_queue q where q\.workspace_id=w and q\.payment_id=r\.id\)/i);
 has(sql,/lower\(coalesce\(r\.status,''\)\) not in\('cancelled','canceled','ملغى'\)/i);
});

test('financial register gets a bounded preview-only entry without rewriting the large concurrent page',()=>{
 has(install,/financial-register\.js/);
 has(install,/openBankReconciliation/);
 has(install,/V267 bank reconciliation integration anchor not found/);
 has(install,/toolbar\.append\(field\('الفترة المالية',month\),reload,add,bankReconciliation\)/);
});
