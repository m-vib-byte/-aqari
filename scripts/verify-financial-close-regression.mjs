// In-memory PostgreSQL only; no database URL, API token or production writes.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const cwd=path.resolve('staging-database/local-test');
const pkg=JSON.parse(fs.readFileSync(path.join(cwd,'package.json'),'utf8'));
const upgrade='../sql/financial-close-cancellations.sql';
const test='../tests/financial_close_cancellations.sql';
const previousUpgrade='fixtures/financial-close-cancellations-v1.sql';
const setup=pkg.scripts['test:completion'].split(/\s+/).slice(2).filter(p=>!p.includes('/tests/')&&p!==upgrade);
function run(files){return spawnSync(process.execPath,['run-isolated.mjs',...files],{cwd,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});}
const before=run([...setup,test]);
if(before.status===0||!before.stderr?.includes('CLOSE_CANCELLED_RECEIPT_TOTAL')){
 console.error('Expected financial-close defect was not reproduced.');
 console.error(before.stderr||before.error?.message||'Unexpected success');process.exit(1);
}
console.log('REPRODUCED BEFORE FIX: cancelled receipt incorrectly contributes to close total.');
const match=before.stderr.match(/CLOSE_CANCELLED_RECEIPT_TOTAL[^\n]*/);console.log(match?.[0]);
// Reproduce the second defect in the previously shipped repair: a native
// cancelled status still counted even when the dashboard correctly excluded it.
const previous=run([...setup,previousUpgrade,test]);
if(previous.status===0||!previous.stderr?.includes('CLOSE_CANCELLED_RECEIPT_TOTAL: expected 50.125 got 125.125')){
 console.error('Expected native-cancelled defect was not reproduced.');
 console.error(previous.stderr||previous.error?.message||'Unexpected success');process.exit(1);
}
console.log('REPRODUCED PREVIOUS REPAIR: native cancelled receipt adds 75.000; expected 50.125, got 125.125.');
// Apply twice to prove retry safety; all tests write synthetic rows then roll back.
const after=run([...setup,upgrade,upgrade,test]);
if(after.status!==0){console.error(after.stderr||after.error?.message||'SQL failed');process.exit(1);}
console.log(after.stdout);
console.log('PASS AFTER FIX: native and registered cancellations excluded; totals/counts/history/authorization/closed periods; fresh install is idempotent.');
const migrated=run([...setup,previousUpgrade,upgrade,upgrade,test]);
if(migrated.status!==0){console.error(migrated.stderr||migrated.error?.message||'Prior-version upgrade failed');process.exit(1);}
console.log('PASS UPGRADE FROM PREVIOUS REPAIR: no history rewrite; retries are safe.');
