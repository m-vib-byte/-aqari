const test=require('node:test');
const assert=require('node:assert/strict');
let api;
test.before(async()=>{api=await import('../src/v267/components/document-catalog.js');});

test('official document catalog covers property, finance, maintenance, legal and staff records',()=>{
 for(const key of ['title_deed','floor_plan','building_license','payment_receipt','deposit_refund','work_order','legal_filing','salary_slip'])assert.ok(api.DOCUMENT_CATEGORIES[key],key);
});
test('official form pack includes required operational forms with immutable versions',()=>{
 for(const key of ['rent_receipt','deposit_receipt','deposit_refund','tenant_statement','debt_notice','renewal_notice','nonrenewal_notice','receipt_voucher','payment_voucher','work_order','expense_approval','key_handover','damage_report','final_settlement','clearance','daily_collection'])assert.equal(api.OFFICIAL_FORM_TEMPLATES[key].immutableAfterIssue,true,key);
});
test('form rendering refuses missing database fields and snapshots issued data',()=>{
 assert.throws(()=>api.renderOfficialForm('clearance',{documentNo:'C-1'}),/ناقصة/);
 const form=api.renderOfficialForm('clearance',{documentNo:'C-1',issuedAt:'2026-09-11',tenantName:'مستأجر',contractNo:'L-1',settlementReference:'S-1',approvedBy:'المدير'});
 assert.match(form.body,/L-1/);assert.equal(form.snapshot.settlementReference,'S-1');assert.equal(Object.isFrozen(form),true);
});
test('document category rejects wrong entity scope',()=>{
 assert.deepEqual(api.documentCategory('title_deed','property').documentType,'supporting_document');
 assert.throws(()=>api.documentCategory('title_deed','tenant'));
});
