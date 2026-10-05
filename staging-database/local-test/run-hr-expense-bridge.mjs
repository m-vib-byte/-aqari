import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const sql='staging-database/sql/hr-expense-bridge.sql';
assert.equal(readFileSync(join(root,sql),'utf8'),readFileSync(join(root,'staging-database/supabase/migrations/20261005000509_v267_hr_expense_bridge.sql'),'utf8'));
const temp=mkdtempSync(join(tmpdir(),'aqari-hr-expense-'));
try{
 const storage=join(temp,'storage.sql'),test=join(temp,'bridge.sql');
 writeFileSync(storage,'alter table storage.objects enable row level security; grant select on storage.objects to authenticated;');
 let base=readFileSync(join(root,'staging-database/tests/salary_slip.sql'),'utf8')
 .replace("'^DT-[0-9]{8}-[0-9]{6,}$'",()=>"'^[0-9]{4,}$'")
 .replace('begin;',`begin;select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);`);
 const legacyBase=base;
 base=base.replace('set local role authenticated;',()=>`create function pg_temp.bridge_invoice_fixture(p text) returns void language sql security definer set search_path='' as $$insert into storage.objects(bucket_id,name,metadata) values('aqari-documents',p,'{"size":100,"mimetype":"image/jpeg"}');$$;
 grant execute on function pg_temp.bridge_invoice_fixture(text) to authenticated;
 set local role authenticated;`);
 const beforePayment=readFileSync(join(root,'staging-database/tests/hr_expense_bridge_before_payment.sql'),'utf8');
 const anchor=" r:=public.aqari_hr(w,'paid',jsonb_build_object('employee_id','f2670000-0000-4000-8000-000000000021','payroll_id',current_setting('hr.test.payroll'),'revision',5));";
 assert.equal(base.split(anchor).length,2);base=base.replace(anchor,()=>beforePayment+anchor);
 const fixture=base.replace('rollback;',()=>readFileSync(join(root,'staging-database/tests/hr_expense_bridge.sql'),'utf8')+'\nrollback;');
 writeFileSync(test,fixture);
 if(process.env.AQARI_BRIDGE_FIXTURE_OUTPUT)writeFileSync(process.env.AQARI_BRIDGE_FIXTURE_OUTPUT,fixture);
 const files=['supabase/migrations/20260922144456_hr_lifecycle_cycle.sql','supabase/migrations/20260922145409_hr_payroll_lifecycle_guard.sql','supabase/migrations/20260922145534_hr_month_transition_trigger_fix.sql','supabase/migrations/20260925173100_hr_month_report_property_guard.sql','staging-database/sql/salary-numeric-vouchers.sql','staging-database/sql/salary-numeric-corrections.sql','staging-database/sql/hr-cost-allocation-integrity.sql','staging-database/sql/mfa-enforcement.sql','staging-database/sql/staff-property-scope.sql',storage,'staging-database/sql/financial-register.sql','staging-database/sql/hr-payroll-allocation-snapshot.sql',sql,sql,test];
 const run=spawnSync(process.execPath,['staging-database/local-test/run-isolated.mjs',...files],{cwd:root,encoding:'utf8',env:{...process.env,AQARI_TEST_PGCRYPTO:'1'}});
 process.stdout.write(run.stdout);process.stderr.write(run.stderr);assert.equal(run.status,0);
 const legacy=join(temp,'legacy.sql'),legacyCheck=join(temp,'legacy-check.sql');
 writeFileSync(legacy,legacyBase.replace('rollback;','commit;'));
 writeFileSync(legacyCheck,`begin;
 select set_config('request.jwt.claim.sub','f2670000-0000-4000-8000-000000000001',true);
 set local role authenticated;
 do $$declare r jsonb;begin
 r:=public.aqari_financial_register('70000000-0000-4000-8000-000000000001','list',jsonb_build_object('month',to_char(now() at time zone 'Asia/Kuwait','YYYY-MM')));
 if (r#>>'{summary,unlinked_salary_count}')::int<>1 or jsonb_array_length(r->'salary_expenses')<>0 or (r#>>'{summary,salary_disbursements}')::numeric<>0 then raise exception 'LEGACY_HISTORY_INVENTED_OR_HIDDEN';end if;
 end $$;reset role;rollback;`);
 const upgrade=spawnSync(process.execPath,['staging-database/local-test/run-isolated.mjs',...files.slice(0,-4),legacy,...files.slice(-4,-1),legacyCheck],{cwd:root,encoding:'utf8',env:{...process.env,AQARI_TEST_PGCRYPTO:'1'}});
 process.stdout.write(upgrade.stdout);process.stderr.write(upgrade.stderr);assert.equal(upgrade.status,0);
}finally{rmSync(temp,{recursive:true,force:true});}
