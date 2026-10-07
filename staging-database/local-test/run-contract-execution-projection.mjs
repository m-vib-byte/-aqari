// Isolated downstream projection test on the captured Production schema.
// Never accepts a server URL. Existing serial allocators remain unchanged.
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const read=name=>readFileSync(path.join(root,'staging-database/sql',name),'utf8');
const temp=mkdtempSync(path.join(tmpdir(),'aqari-execution-projection-'));
try {
 const legacy=read('contract-execution-finalization-v2.sql');
 const marker='create table if not exists private.aqari_contract_execution_artifacts(';
 assert.equal(legacy.split(marker).length,2,'unambiguous artifact-only source section');
 const artifactOnly='begin;\n'+legacy.slice(legacy.indexOf(marker));
 assert.ok(!artifactOnly.includes('create or replace function public.aqari_reserve_'),'must preserve Production allocators');
 const due=read('rent-entitlement-start.sql').match(/create or replace function private\.aqari_rent_due_on\([\s\S]*?revoke all on function private\.aqari_rent_due_on\(jsonb,date,date\) from public,anon,authenticated;/)?.[0];
 assert.ok(due,'exact rent due date source, without unrelated entitlement migrations');
 const snapshot=`create temporary table execution_allocator_before as select oid,md5(pg_get_functiondef(oid)) as hash from pg_proc where proname in ('aqari_reserve_contract_serial','aqari_reserve_rent_receipt_serial');`;
 const verify=`do $$ begin if exists(select 1 from execution_allocator_before where hash<>md5(pg_get_functiondef(oid))) then raise exception 'ALLOCATOR_DEFINITION_CHANGED';end if;end $$;`;
 const files=[['before.sql',snapshot],['artifacts.sql',artifactOnly],['due-date.sql',due],['after.sql',verify]];
 for(const [name,content] of files)writeFileSync(path.join(temp,name),content);
 const source=name=>path.join(root,'staging-database/sql',name);
 const result=spawnSync(process.execPath,[path.join(here,'run-isolated.mjs'),path.join(temp,'before.sql'),source('contract-execution-settlement.sql'),path.join(temp,'artifacts.sql'),path.join(temp,'due-date.sql'),source('official-document-pdf-archive.sql'),source('contract-execution-package-atomic.sql'),source('contract-execution-package-ledger-fix.sql'),source('contract-execution-official-source.sql'),path.join(root,'staging-database/tests/contract_execution_projection.sql'),path.join(temp,'after.sql')],{
  cwd:root,env:{...process.env,AQARI_SCHEMA_CATALOG:path.join(here,'schema-catalog-production-2026-10-05.json'),AQARI_TEST_PGCRYPTO:'1'},stdio:'inherit'
 });
 if(result.error)throw result.error;
 process.exitCode=result.status??1;
} finally {rmSync(temp,{recursive:true,force:true});}
