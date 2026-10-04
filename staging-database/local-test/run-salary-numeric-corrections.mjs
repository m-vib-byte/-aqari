// Full HR lifecycle in disposable PostgreSQL, including real pgcrypto hashing.
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const migration='staging-database/sql/salary-numeric-corrections.sql';
assert.equal(readFileSync(join(root,migration),'utf8'),readFileSync(join(root,'staging-database/supabase/migrations/20261004203316_v267_salary_numeric_corrections.sql'),'utf8'));
const temp=mkdtempSync(join(tmpdir(),'aqari-salary-correction-'));
try{
 let fixture='begin;\n'+readFileSync(join(root,'staging-database/tests/hr_lifecycle_cycle.sql'),'utf8');
 const anchor=" perform public.aqari_hr_cycle(w,'correct_salary',jsonb_build_object('employee_id',e,'replaces_id',registry,'reason','Synthetic corrected version','snapshot',result->'payload'));";
 assert.equal(fixture.split(anchor).length,2);
 fixture=fixture.replace(anchor,()=>` again:=public.aqari_hr_cycle(w,'correct_salary',jsonb_build_object('employee_id',e,'replaces_id',registry,'reason','Synthetic corrected version','snapshot',result->'payload'));
 if again->>'voucher_no' !~ '^[0-9]{4,}$' or (again->>'version')::int<>2 or again->>'replaces_id'<>registry::text then raise exception 'CORRECTION_NUMBER_FAILED';end if;
 if public.aqari_hr_cycle(w,'salary_export',jsonb_build_object('employee_id',e,'payroll_id',current_setting('aqari.test.cycle.payroll')))#>>'{registry,id}'<>again->>'id' then raise exception 'CORRECTION_EXPORT_CHANGED';end if;
 begin
  perform public.aqari_hr_cycle(w,'correct_salary',jsonb_build_object('employee_id',e,'replaces_id',registry,'reason','Synthetic retry','snapshot',result->'payload'));
  raise exception 'CORRECTION_REPLAY_ACCEPTED';
 exception when raise_exception then if sqlerrm<>'VOID_SALARY_REQUIRED' then raise;end if;end;
 perform set_config('request.jwt.claim.sub','c2670000-0000-4000-8000-000000000002',true);
 begin
  perform public.aqari_hr_cycle(w,'correct_salary',jsonb_build_object('employee_id',e,'replaces_id',registry,'reason','Synthetic denied request','snapshot',result->'payload'));
  raise exception 'SELF_CORRECTION_ACCEPTED';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','c2670000-0000-4000-8000-000000000001',true);`);
 fixture=fixture.replace("select 'PASS: HR lifecycle",()=>`do $$ begin
 if not exists(select 1 from private.aqari_hr_salary_registry where voucher_no='CYCLE-202609-1' and status='corrected' and version=1 and snapshot->>'voucher_no'='CYCLE-202609-1') then raise exception 'OLD_REGISTRY_RENUMBERED';end if;
 if (select count(*) from private.aqari_hr_salary_registry where voucher_no ~ '^[0-9]{4,}$')<>1 then raise exception 'DUPLICATE_CORRECTION';end if;
end $$;
select 'PASS: HR lifecycle`);
 const test=join(temp,'correction.sql');writeFileSync(test,fixture);
 const files=['supabase/migrations/20260922144456_hr_lifecycle_cycle.sql','supabase/migrations/20260922145409_hr_payroll_lifecycle_guard.sql','supabase/migrations/20260922145534_hr_month_transition_trigger_fix.sql','supabase/migrations/20260925173100_hr_month_report_property_guard.sql','staging-database/sql/salary-numeric-vouchers.sql'];
 const run=extra=>spawnSync(process.execPath,['staging-database/local-test/run-isolated.mjs',...files,...extra,test],{cwd:root,encoding:'utf8',env:{...process.env,AQARI_TEST_PGCRYPTO:'1'}});
 const before=run([]);assert.notEqual(before.status,0);assert.match(before.stderr,/CORRECTION_NUMBER_FAILED/);
 const after=run([migration,migration]);process.stdout.write(after.stdout);process.stderr.write(after.stderr);assert.equal(after.status,0);
 console.log('PASS: numeric corrected voucher, unchanged old number/snapshot, version/replacement linkage, export replay, correction retry refusal, manager-only access and full HR lifecycle.');
}finally{rmSync(temp,{recursive:true,force:true});}
