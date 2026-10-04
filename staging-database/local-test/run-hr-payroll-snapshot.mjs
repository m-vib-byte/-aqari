import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const sql='staging-database/sql/hr-payroll-allocation-snapshot.sql';
assert.equal(readFileSync(join(root,sql),'utf8'),readFileSync(join(root,'staging-database/supabase/migrations/20261004223026_v267_hr_payroll_allocation_snapshot.sql'),'utf8'));
const temp=mkdtempSync(join(tmpdir(),'aqari-hr-snapshot-'));
try{
 const baseline='begin;\n'+readFileSync(join(root,'staging-database/tests/hr_lifecycle_cycle.sql'),'utf8');
 const anchor="reset role;\nupdate private.aqari_hr_payroll set state='paid'";
 assert.equal(baseline.split(anchor).length,2);
 const checks=readFileSync(join(root,'staging-database/tests/hr_payroll_allocation_snapshot.sql'),'utf8');
 const fixture=baseline.replace(anchor,()=>checks+'\n'+anchor).replace("state='paid',voucher_no='CYCLE-202609-1',issued_at=now(),paid_at=now()","state='paid',paid_at=now()");
 const test=join(temp,'snapshot.sql');writeFileSync(test,fixture);
 const files=['supabase/migrations/20260922144456_hr_lifecycle_cycle.sql','supabase/migrations/20260922145409_hr_payroll_lifecycle_guard.sql','supabase/migrations/20260922145534_hr_month_transition_trigger_fix.sql','supabase/migrations/20260925173100_hr_month_report_property_guard.sql','staging-database/sql/salary-numeric-vouchers.sql','staging-database/sql/salary-numeric-corrections.sql','staging-database/sql/hr-cost-allocation-integrity.sql'];
 const run=extra=>spawnSync(process.execPath,['staging-database/local-test/run-isolated.mjs',...files,...extra],{cwd:root,encoding:'utf8',env:{...process.env,AQARI_TEST_PGCRYPTO:'1'}});
 const before=run([test]);assert.notEqual(before.status,0);assert.match(before.stderr,/HR_HISTORY_MOVED/);
 const after=run([sql,sql,test]);process.stdout.write(after.stdout);process.stderr.write(after.stderr);assert.equal(after.status,0);
 const legacy=join(temp,'legacy.sql'),legacyCheck=join(temp,'legacy-check.sql');
 writeFileSync(legacy,baseline.replace('rollback;','commit;'));
 writeFileSync(legacyCheck,`begin;
 select set_config('request.jwt.claim.sub','c2670000-0000-4000-8000-000000000001',true);
 do $$begin if exists(select 1 from private.aqari_hr_payroll_cost_snapshots) then raise exception 'LEGACY_HISTORY_INVENTED';end if;end $$;
 set local role authenticated;
 do $$declare w uuid;r jsonb;begin
 select workspace_id into w from public.aqari_memberships where user_id=auth.uid() and is_active;
 r:=public.aqari_hr_cycle(w,'month_report','{"employee_id":"c2670000-0000-4000-8000-000000000021","month":"2026-09-01","property_id":"c2670000-0000-4000-8000-000000000011"}'::jsonb);
 if r#>>'{rows,0,cost_basis}' is distinct from 'legacy_current' then raise exception 'LEGACY_BASIS_NOT_EXPLICIT';end if;
 end $$;reset role;rollback;`);
 const upgrade=run([legacy,sql,sql,legacyCheck]);process.stdout.write(upgrade.stdout);process.stderr.write(upgrade.stderr);assert.equal(upgrade.status,0);
 const salary=join(temp,'salary.sql'),storage=join(temp,'storage.sql');
 writeFileSync(storage,'alter table storage.objects enable row level security; grant select on storage.objects to authenticated;');
 writeFileSync(salary,readFileSync(join(root,'staging-database/tests/salary_slip.sql'),'utf8').replace("'^DT-[0-9]{8}-[0-9]{6,}$'",()=>"'^[0-9]{4,}$'").replace('begin;',`begin;select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);`));
 const lifecycle=run(['staging-database/sql/mfa-enforcement.sql','staging-database/sql/staff-property-scope.sql',storage,sql,salary]);process.stdout.write(lifecycle.stdout);process.stderr.write(lifecycle.stderr);assert.equal(lifecycle.status,0);
 console.log('PASS: reproduced historical drift; issued allocation survives share and property changes; new drafts use current allocation; closed historical month remains protected; private access and immutable history verified.');
}finally{rmSync(temp,{recursive:true,force:true});}
