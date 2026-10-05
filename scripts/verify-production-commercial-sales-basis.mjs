// No hosted connection: reproduce and repair against captured Production DDL.
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const cwd=path.resolve('staging-database/local-test');
const env={...process.env,AQARI_SCHEMA_CATALOG:path.join(cwd,'schema-catalog-production-2026-10-05.json')};
const basis='../reconciliation/commercial-sales-basis/candidate.sql';
const prerequisites=['../reconciliation/commercial-allocation/account-status-candidate.sql','../reconciliation/commercial-allocation/candidate.sql'];
const tests=['../hosted-test/completion-current/06-commercial_sales.sql','../hosted-test/completion-current/07-commercial_sales_vacating.sql','../reconciliation/commercial-allocation/commercial_collections.sql'];
function run(files){return spawnSync(process.execPath,['run-isolated.mjs',...files],{cwd,env,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});}
const before=run([...prerequisites,tests[0]]);
if(before.status===0||!before.stderr.includes('INVALID_COMMERCIAL_SALES'))throw Error('Expected greater-of rejection not reproduced: '+before.stderr);
console.log('REPRODUCED: Production register rejects the approved greater-of basis.');
const after=run([basis,...prerequisites,...tests]);
if(after.status!==0)throw Error(after.stderr||after.error?.message);
console.log(after.stdout);
for(const files of [[basis,basis]]){
 const refused=run(files);
 if(refused.status===0||!refused.stderr.includes('COMMERCIAL_SALES_FUNCTION_CHANGED'))throw Error('Changed function not refused: '+refused.stderr);
}
console.log('PASS: sales, clearance and collections; duplicate installation refused.');
// All repaired domains share one restored database, including captured Storage RLS.
const combined=spawnSync(process.execPath,['run-isolated.mjs',basis,...prerequisites,
 '../reconciliation/tenant-rating/candidate.sql','../reconciliation/tenant-contact/candidate.sql',
 '../reconciliation/maintenance/candidate.sql',
 ...['01-maintenance_workflow','02-maintenance_attachments','03-tenant_rating_quarters',
 '04-tenant_contact_unification','05-work_order_request_link','06-commercial_sales',
 '07-commercial_sales_vacating','08-collection_account_management','09-vendor_optional_identity']
 .map(name=>'../hosted-test/completion-current/'+name+'.sql')],
 {cwd,env:{...env,AQARI_STORAGE_POLICY_CATALOG:path.join(cwd,'storage-object-policies-production-2026-10-05.json')},encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
if(combined.status!==0)throw Error(combined.stderr||combined.error?.message);
console.log(combined.stdout);
console.log('PASS: all nine completion suites together against Production application DDL and captured Storage SQL policies. Not hosted or device acceptance.');
