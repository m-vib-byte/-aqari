// Only the local, in-memory catalog runner is used. No hosted database credentials.
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const sql='staging-database/sql/salary-numeric-vouchers.sql';
assert.equal(readFileSync(join(root,sql),'utf8'),readFileSync(join(root,'staging-database/supabase/migrations/20261004202056_v267_salary_numeric_vouchers.sql'),'utf8'));
const temp=mkdtempSync(join(tmpdir(),'aqari-salary-number-'));
try{
 let acceptance=readFileSync(join(root,'staging-database/tests/salary_slip.sql'),'utf8');
 acceptance=acceptance.replace('begin;',`begin;
 select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);`);
 const legacy=join(temp,'legacy.sql');writeFileSync(legacy,acceptance);
 // Keep the original legacy acceptance suite, then reuse its complete lifecycle
 // (CAS, scopes, two approvals, signed file, payment and replay) after upgrading.
 assert.ok(acceptance.includes("'^DT-[0-9]{8}-[0-9]{6,}$'"));
 acceptance=acceptance.replace("'^DT-[0-9]{8}-[0-9]{6,}$'",()=>"'^[0-9]{4,}$'");
 const numeric=join(temp,'numeric.sql');writeFileSync(numeric,acceptance);
 // The generic catalog excludes platform-owned Storage table ACL/RLS flags.
 // Restore those flags only in this disposable instance; its policies are real.
 const storage=join(temp,'storage-platform.sql');writeFileSync(storage,'alter table storage.objects enable row level security; grant select on storage.objects to authenticated;');
 const run=files=>spawnSync(process.execPath,['staging-database/local-test/run-isolated.mjs','staging-database/sql/mfa-enforcement.sql','staging-database/sql/staff-property-scope.sql',storage,...files],{cwd:root,encoding:'utf8'});
 const before=run([numeric]);assert.notEqual(before.status,0,'Must reproduce the original numbering defect');assert.match(before.stderr,/SLIP_IDENTITY_FAILED/);
 const after=run([legacy,sql,sql,numeric]);
 process.stdout.write(after.stdout);process.stderr.write(after.stderr);assert.equal(after.status,0);
 writeFileSync(legacy,readFileSync(legacy,'utf8').replace('rollback;','commit;'));
 const boundaries=run([legacy,'staging-database/local-test/fixtures/salary-upgrade-before.sql',sql,sql,'staging-database/local-test/fixtures/salary-upgrade-after.sql','staging-database/tests/salary_numeric_vouchers.sql']);
 process.stdout.write(boundaries.stdout);process.stderr.write(boundaries.stderr);assert.equal(boundaries.status,0);
 console.log('PASS: old numbering regression reproduced; numeric issuance, legacy lifecycle, upgrade replay and number boundaries verified.');
}finally{rmSync(temp,{recursive:true,force:true});}
