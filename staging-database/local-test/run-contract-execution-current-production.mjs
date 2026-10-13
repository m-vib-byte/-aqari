// Full app-state transaction on a captured schema; no server URL or credentials.
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const temp=mkdtempSync(path.join(tmpdir(),'aqari-execution-current-'));
try{
 const source=readFileSync(path.join(root,'staging-database/tests/contract_execution_finalize_hosted.sql'),'utf8');
 const files=[];
 const add=(name,sql)=>{const file=path.join(temp,name);writeFileSync(file,sql);files.push(file);};
 add('preserve-before.sql',`create temporary table execution_preserved_functions as
 select oid,md5(pg_get_functiondef(oid)) hash from pg_proc where proname in
 ('aqari_reserve_contract_serial','aqari_reserve_rent_receipt_serial','aqari_refresh_rent_due_schedule','aqari_require_sensitive_aal2');`);
 files.push(path.join(root,'staging-database/reconciliation/contract-execution/capability-candidate.sql'));
 for(const rent of ['0','100','17.125'])add('finalize-'+rent+'.sql',source.replace('begin;\n',`begin;\nset local aqari.execution_package_test_rent='${rent}';\n`));
 // Preserve the existing arithmetic vectors without running the old fixture's
 // obsolete template publishing/signing protocol against the new atomic guard.
 const entitlement=readFileSync(path.join(root,'staging-database/tests/rent_entitlement_start.sql'),'utf8');
 add('entitlement-calculation.sql',entitlement.slice(0,entitlement.indexOf('insert into public.aqari_workspaces'))+'\nrollback;\n');
 add('preserve-after.sql',`do $$ begin
 if exists(select 1 from execution_preserved_functions where hash<>md5(pg_get_functiondef(oid))) then raise exception 'EXECUTION_EXISTING_GUARD_OR_ALLOCATOR_CHANGED';end if;
 if exists(select 1 from public.aqari_workspaces where slug like 'package-test-%') then raise exception 'EXECUTION_FIXTURE_NOT_ROLLED_BACK';end if;
 if has_function_privilege('authenticated','public.aqari_contract_execution_package_commit(uuid,uuid,jsonb,jsonb,text,text,text,text,text,text,text)','execute')
 or has_function_privilege('anon','public.aqari_contract_execution_package_source(uuid,text,uuid,uuid,timestamptz,text,integer)','execute') then raise exception 'EXECUTION_ACL_BROADENED';end if;
 end $$;`);
 const run=spawnSync(process.execPath,[path.join(here,'run-isolated.mjs'),...files],{
  cwd:root,env:{...process.env,AQARI_SCHEMA_CATALOG:path.join(here,'schema-catalog-production-2026-10-07.json'),AQARI_TEST_PGCRYPTO:'1'},stdio:'inherit'
 });
 if(run.error)throw run.error;
 process.exitCode=run.status??1;
}finally{rmSync(temp,{recursive:true,force:true});}
