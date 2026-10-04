// Local in-memory PostgreSQL only. No hosted URL, credentials or real records.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const cwd=path.resolve('staging-database/local-test');
const pkg=JSON.parse(fs.readFileSync(path.join(cwd,'package.json'),'utf8'));
const files=pkg.scripts['test:completion'].split(/\s+/).slice(2);
// Preserve the complete committed setup, including payment guards and recent MFA.
// This is still a subsystem rehearsal, not a full Production clone.
const setup=files.filter(p=>!p.includes('/tests/'));
const fixture='./fixtures/commercial-production-gap.sql';
const candidate='../reconciliation/commercial-allocation/candidate.sql';
const tests=['../reconciliation/commercial-allocation/acceptance.sql','../reconciliation/commercial-allocation/commercial_collections_legacy_compat.sql','../reconciliation/commercial-allocation/commercial_collections.sql','../tests/payment_method_reference_guard.sql','../tests/recent_mfa_hosted_acceptance.sql'];
function run(args){return spawnSync(process.execPath,['run-isolated.mjs',...args],{cwd,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});}
const before=run([...setup,fixture,tests[0]]);
if(before.status===0||!before.stderr.includes('aqari_commercial_payment_allocations')||!before.stderr.includes('does not exist')){
 console.error('Expected missing allocation RPC was not reproduced.');console.error(before.stderr);process.exit(1);
}
console.log('REPRODUCED: allocation RPC missing from the observed subsystem shape.');
const after=run([...setup,fixture,candidate,...tests]);
if(after.status!==0){console.error(after.stderr||after.error?.message);process.exit(1);}
console.log(after.stdout.split('\n').filter(line=>tests.some(t=>line.includes(t))||line.includes(candidate)).join('\n'));
const retry=run([...setup,fixture,candidate,candidate]);
if(retry.status===0||!retry.stderr.includes('COMMERCIAL_RECONCILIATION_ALREADY_PRESENT_OR_PARTIAL')){
 console.error('Candidate did not stop on an existing subsystem.');console.error(retry.stderr);process.exit(1);
}
console.log('PASS: allocation, cancellation, dual-mode isolation, authorization and fail-closed reapplication.');
const changed=run([...setup,fixture,'./fixtures/commercial-source-drift.sql',candidate]);
if(changed.status===0||!changed.stderr.includes('COMMERCIAL_RECONCILIATION_SOURCE_CHANGED')){
 console.error('Candidate accepted an unexpected current definition.');console.error(changed.stderr);process.exit(1);
}
console.log('PASS: concurrent source changes block installation before new schema objects.');
