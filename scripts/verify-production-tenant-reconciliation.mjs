// PGlite only; no hosted credentials or real records.
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const cwd=path.resolve('staging-database/local-test');
const env={...process.env,AQARI_SCHEMA_CATALOG:path.join(cwd,'schema-catalog-production-2026-10-05.json')};
const rating='../reconciliation/tenant-rating/candidate.sql';
const contact='../reconciliation/tenant-contact/candidate.sql';
const ratingTest='../hosted-test/completion-current/03-tenant_rating_quarters.sql';
const contactTest='../hosted-test/completion-current/04-tenant_contact_unification.sql';
const commercial=['../reconciliation/commercial-allocation/account-status-candidate.sql','../reconciliation/commercial-allocation/candidate.sql'];
function run(files){return spawnSync(process.execPath,['run-isolated.mjs',...files],{cwd,env,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});}
function rejects(files,error){const r=run(files);if(r.status===0||!r.stderr.includes(error)){console.error('Expected refusal: '+error,r.stderr||r.error?.message);process.exit(1);}console.log('REPRODUCED/REFUSED: '+error);}
rejects([ratingTest],'rating_year');
rejects([contactTest],'REGISTER_TO_EDITOR_READBACK_FAILED');
const success=run(['../reconciliation/tenant-contact/history-before.sql',rating,contact,'../reconciliation/tenant-contact/history-after.sql',...commercial,ratingTest,contactTest,
 '../reconciliation/commercial-allocation/acceptance.sql','../reconciliation/commercial-allocation/commercial_collections_legacy_compat.sql',
 '../reconciliation/commercial-allocation/commercial_collections.sql','../hosted-test/completion-current/08-collection_account_management.sql','../tests/recent_mfa_hosted_acceptance.sql']);
if(success.status!==0){console.error(success.stderr||success.error?.message);process.exit(1);}
console.log(success.stdout);
rejects([contact],'PRODUCTION_CONTACT_SOURCE_CHANGED');
rejects([rating,rating],'PRODUCTION_RATING_SOURCE_CHANGED');
rejects([rating,contact,contact],'PRODUCTION_CONTACT_SOURCE_CHANGED');
console.log('PASS: rating/contact and five financial/security suites; historical audit and ACL unchanged; wrong order and reapplication refused.');
