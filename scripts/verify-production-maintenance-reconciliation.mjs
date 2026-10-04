// Local PGlite rehearsal only. Auth/Storage services are stubs; no hosted connection.
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const cwd=path.resolve('staging-database/local-test');
const env={...process.env,AQARI_SCHEMA_CATALOG:path.join(cwd,'schema-catalog-production-2026-10-05.json')};
const base='../reconciliation/maintenance/';
const candidate=base+'candidate.sql';
const test='../hosted-test/completion-current/05-work_order_request_link.sql';
function run(files){return spawnSync(process.execPath,['run-isolated.mjs',...files],{cwd,env,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});}
function passes(files){const r=run(files);if(r.status!==0){console.error(r.stderr||r.error?.message);process.exit(1);}console.log(r.stdout);}
function rejects(files,expected){const r=run(files);if(r.status===0||!r.stderr.includes(expected)){console.error('Expected '+expected,r.stderr||r.error?.message);process.exit(1);}console.log('REPRODUCED/REFUSED: '+expected);}
rejects([test],'category_code');
passes([candidate,test,'../hosted-test/completion-current/01-maintenance_workflow.sql']);
passes([base+'history-before.sql',candidate,base+'history-after.sql']);
rejects([candidate,candidate],'PRODUCTION_MAINTENANCE_SOURCE_CHANGED');
console.log('PASS: request/work-order linking and maintenance workflow; original history and operations guards preserved; reapplication refused. Storage and physical devices not tested.');
