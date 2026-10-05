// Local only. No hosted credentials, real rows, Storage bytes or network access.
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const cwd=path.resolve('staging-database/local-test');
const env={...process.env,AQARI_SCHEMA_CATALOG:process.env.AQARI_SCHEMA_CATALOG||path.join(cwd,'schema-catalog-production-2026-10-05.json'),AQARI_STORAGE_POLICY_CATALOG:path.join(cwd,'storage-object-policies-production-2026-10-05.json')};
const base='../reconciliation/commercial-sales-basis/';
const candidate=base+'candidate.sql';
function run(files){return spawnSync(process.execPath,['run-isolated.mjs',...files],{cwd,env,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});}
function passes(files){const r=run(files);if(r.status!==0){console.error(r.stderr||r.error?.message);process.exit(1);}console.log(r.stdout);}
function rejects(files,expected){const r=run(files);if(r.status===0||!r.stderr.includes(expected)){console.error('Expected '+expected,r.stderr||r.error?.message);process.exit(1);}console.log('REPRODUCED/REFUSED: '+expected);}
rejects([base+'acceptance.sql'],'APPROVED_BASIS_READBACK_FAILED');
passes([base+'history-before.sql',candidate,base+'history-after.sql']);
passes(['../reconciliation/maintenance/candidate.sql','../reconciliation/tenant-rating/candidate.sql','../reconciliation/tenant-contact/candidate.sql','../reconciliation/commercial-allocation/account-status-candidate.sql','../reconciliation/commercial-allocation/candidate.sql',candidate,
 '../hosted-test/completion-current/01-maintenance_workflow.sql',
 '../hosted-test/completion-current/02-maintenance_attachments.sql',
 '../hosted-test/completion-current/03-tenant_rating_quarters.sql',
 '../hosted-test/completion-current/04-tenant_contact_unification.sql',
 '../hosted-test/completion-current/05-work_order_request_link.sql',
 base+'acceptance.sql',
 '../hosted-test/completion-current/07-commercial_sales_vacating.sql',
 '../hosted-test/completion-current/08-collection_account_management.sql',
 '../hosted-test/completion-current/09-vendor_optional_identity.sql',
 '../reconciliation/commercial-allocation/acceptance.sql',
 '../reconciliation/commercial-allocation/commercial_collections.sql',
 '../reconciliation/commercial-allocation/commercial_collections_legacy_compat.sql',
 '../tests/recent_mfa_hosted_acceptance.sql']);
rejects([candidate,candidate],'COMMERCIAL_SALES_FUNCTION_CHANGED');
console.log('PASS: 13 acceptance suites together; prior sales/ledger/terms and ACL preserved; repeated installation refused. No hosted migration or complete restore proved.');
