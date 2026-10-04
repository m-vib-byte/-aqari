// Regression + real HR RPC acceptance, only in disposable local PostgreSQL.
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const migration='staging-database/sql/hr-cost-allocation-integrity.sql';
assert.equal(readFileSync(join(root,migration),'utf8'),readFileSync(join(root,'staging-database/supabase/migrations/20261004210754_v267_hr_cost_allocation_integrity.sql'),'utf8'));
const temp=mkdtempSync(join(tmpdir(),'aqari-hr-allocation-'));
try{
 const baseline='begin;\n'+readFileSync(join(root,'staging-database/tests/hr_lifecycle_cycle.sql'),'utf8');
 const anchor="reset role;\nupdate private.aqari_hr_payroll set state='paid'";
 assert.equal(baseline.split(anchor).length,2);
 const checks=readFileSync(join(root,'staging-database/tests/hr_cost_allocation_integrity.sql'),'utf8');
 const fixture=baseline.replace(anchor,()=>checks+'\n'+anchor);
 const test=join(temp,'allocation.sql');writeFileSync(test,fixture);
 const files=['supabase/migrations/20260922144456_hr_lifecycle_cycle.sql','supabase/migrations/20260922145409_hr_payroll_lifecycle_guard.sql','supabase/migrations/20260922145534_hr_month_transition_trigger_fix.sql','supabase/migrations/20260925173100_hr_month_report_property_guard.sql','staging-database/sql/salary-numeric-vouchers.sql','staging-database/sql/salary-numeric-corrections.sql'];
 const run=extra=>spawnSync(process.execPath,['staging-database/local-test/run-isolated.mjs',...files,...extra,test],{cwd:root,encoding:'utf8',env:{...process.env,AQARI_TEST_PGCRYPTO:'1'}});
 const before=run([]);assert.notEqual(before.status,0);assert.match(before.stderr,/FILS_ROUNDING_DUPLICATED/);
 const after=run([migration,migration]);process.stdout.write(after.stdout);process.stderr.write(after.stderr);assert.equal(after.status,0);
 console.log('PASS: reproduced duplicate fils; exact monthly/annual/property totals; incomplete allocation blocks reports and review; malformed/over-precise shares rejected; self and helper access denied; original HR lifecycle passed.');
}finally{rmSync(temp,{recursive:true,force:true});}
