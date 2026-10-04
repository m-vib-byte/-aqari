// Rehearse Production application DDL with synthetic rows and local Auth/Storage stubs.
// This is not a full database backup, hosted rehearsal, or device acceptance.
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const cwd=path.resolve('staging-database/local-test');
const env={...process.env,AQARI_SCHEMA_CATALOG:path.join(cwd,'schema-catalog-production-2026-10-05.json')};
const allocation='../reconciliation/commercial-allocation/candidate.sql';
const accounts='../reconciliation/commercial-allocation/account-status-candidate.sql';
const tests=['../reconciliation/commercial-allocation/acceptance.sql',
 '../reconciliation/commercial-allocation/commercial_collections_legacy_compat.sql',
 '../reconciliation/commercial-allocation/commercial_collections.sql',
 '../hosted-test/completion-current/08-collection_account_management.sql',
 '../tests/recent_mfa_hosted_acceptance.sql'];
function run(files){return spawnSync(process.execPath,['run-isolated.mjs',...files],{cwd,env,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});}
const before=run([allocation,tests[2]]);
if(before.status===0||!before.stderr.includes('aqari_collection_accounts_status_check')){
 console.error('Expected Production account archive mismatch was not reproduced.',before.stderr);process.exit(1);
}
console.log('REPRODUCED: account archive RPC conflicts with the Production status constraint.');
const after=run([accounts,allocation,...tests]);
if(after.status!==0){console.error(after.stderr||after.error?.message);process.exit(1);}
console.log(after.stdout);
const retry=run([accounts,accounts]);
if(retry.status===0||!retry.stderr.includes('COLLECTION_ACCOUNT_STATUS_SCHEMA_CHANGED')){
 console.error('Account status prerequisite failed to reject a changed schema.',retry.stderr);process.exit(1);
}
console.log('PASS: five acceptance suites against Production application DDL; account schema guard rejects reapplication.');
