import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {audit} from '../scripts/audit-v267-evidence.mjs';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
test('normal completion SQL gate installs and tests both cancellation sources',()=>{
 const args=JSON.parse(read('staging-database/local-test/package.json')).scripts['test:completion'].split(/\s+/);
 const patch='../sql/financial-close-cancellations.sql',check='../tests/financial_close_cancellations.sql';
 assert.equal(args.filter(x=>x===patch).length,1);assert.equal(args.filter(x=>x===check).length,1);
 for(const dependency of ['../sql/financial-register.sql','../sql/kpi-dashboard.sql','../sql/final-gap-register.sql'])assert.ok(args.indexOf(dependency)>=0&&args.indexOf(dependency)<args.indexOf(patch));
 assert.ok(args.indexOf(patch)<args.indexOf(check));
});
test('native cancelled fixture stays in the immutable financial history',()=>{
 const sql=read('staging-database/tests/financial_close_cancellations.sql');
 assert.match(sql,/CLOSE-NATIVE-CANCEL/);assert.match(sql,/'cancelled','bank'/);
 assert.match(sql,/workspace_id=w\)<>4/);assert.match(sql,/HISTORICAL_SNAPSHOT_MODIFIED/);
});
test('regression proves both prior defects and in-place upgrade retry safety',()=>{
 const script=read('scripts/verify-financial-close-regression.mjs');
 assert.match(script,/previousUpgrade,upgrade,upgrade,test/);
 assert.match(script,/expected 50\.125 got 125\.125/);
 assert.ok(read('staging-database/local-test/fixtures/financial-close-cancellations-v1.sql').includes('FINANCIAL_CLOSE_SOURCE_CHANGED'));
});
test('full 155-item owner gate remains blocking until actual acceptance',()=>{
 const result=audit(new URL('../',import.meta.url).pathname);
 assert.equal(result.releasePolicy.all155RequiredBeforeRelease,true);
 assert.equal(result.releasePolicy.authorizationAlreadyGranted,false);
 assert.equal(result.releasePolicy.previewDevelopmentAuthorized,true);
 assert.equal(result.releasePolicy.ownerAcceptanceRequiredBeforeProduction,true);
 assert.ok(result.releasePolicy.required.includes('explicit-owner-acceptance-before-production'));
 assert.equal(result.releaseGate,'HOLD');assert.equal(result.requirements.length,155);
 assert.ok(result.releasePolicy.required.includes('isolated-restore'));
 assert.ok(result.releasePolicy.required.includes('tested-V266-rollback'));
 assert.ok(result.requirements.every(r=>r.fullAcceptance==='NOT_PROVEN'));
});
