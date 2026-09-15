import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../staging-database/sql/official-commercial-statement-20260915.sql',import.meta.url),'utf8');
test('official tenant statement no longer rejects commercial leases wholesale',()=>{
 assert.doesNotMatch(sql,/DOCUMENT_COMMERCIAL_RECONCILIATION_REQUIRED/);assert.match(sql,/aqari_assert_commercial_collections/);assert.match(sql,/aqari_commercial_legacy_history/);
});
test('statement includes CAM and percentage-sales charges through tenant adjustments',()=>{
 assert.match(sql,/private\.aqari_tenant_adjustments/);assert.match(sql,/kind='common_charge'/);assert.match(sql,/commercialIncluded/);assert.match(sql,/camIncluded/);
});
test('statement includes dedicated commercial collections and their reversals exactly once',()=>{
 assert.match(sql,/private\.aqari_commercial_collections/);assert.match(sql,/private\.aqari_commercial_collection_reversals/);assert.match(sql,/commercialCollectionsIncluded/);assert.match(sql,/union all select c\.occurred_on,'payment',c\.amount/);assert.match(sql,/union all select r\.occurred_on,'charge',r\.amount/);
});
test('rent payments remain cancellation-aware and official source guards remain intact',()=>{
 assert.match(sql,/private\.aqari_receipt_cancellations/);assert.match(sql,/DOCUMENT_OPENING_RECONCILIATION_REQUIRED/);assert.match(sql,/DOCUMENT_UNALLOCATED_DEBT_REVIEW_REQUIRED/);assert.match(sql,/DOCUMENT_CREDIT_TRANSFER_REVIEW_REQUIRED/);assert.match(sql,/private\.aqari_can_lease/);
});
