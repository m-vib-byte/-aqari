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
