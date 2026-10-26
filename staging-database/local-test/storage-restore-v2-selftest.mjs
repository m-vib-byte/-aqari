import fs from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {snapshot,digest} from '../../supabase/functions/_shared/storage-restore-v2.js';
const db=new PGlite();
const workspace='11111111-1111-4111-8111-111111111111',sourceProject='ofgmcsmxmdswlovsckqs';
try{
 await db.exec('create role anon;create role authenticated;create role service_role;create schema private;');
 await db.exec(fs.readFileSync('staging-database/reconciliation/unified-20261014/storage-restore-v2.sql','utf8'));
 const rpc=async(action,data)=> (await db.query('select public.aqari_storage_restore_v2($1,$2::jsonb) result',[action,JSON.stringify({workspace,sourceProject,...data})])).rows[0].result;
 const a={bucket:'aqari-documents',name:workspace+'/synthetic-a',bytes:1,sha256:await digest(new Uint8Array([1]))};
 const b={...a,name:workspace+'/synthetic-b',sha256:await digest(new Uint8Array([2]))};
 const p=await snapshot(workspace,sourceProject,[a,b]);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(rpc('begin',p),/permission denied/);await db.exec('reset role');}
 console.log('PASS browser roles cannot call restore helper');
 await db.exec('set role service_role');await rpc('begin',p);await rpc('begin',p);
 await assert.rejects(rpc('finalize',p),/RESTORE_INCOMPLETE/);console.log('PASS begin is idempotent; incomplete snapshot cannot finalize');
 await rpc('check',{runId:p.runId,object:a});await rpc('record',{runId:p.runId,object:a});await rpc('record',{runId:p.runId,object:a});
 await assert.rejects(rpc('record',{runId:p.runId,object:{...b,sha256:'0'.repeat(64)}}),/OBJECT_NOT_IN_SNAPSHOT/);
 await assert.rejects(rpc('begin',{...p,snapshotHash:'0'.repeat(64)}),/RUN_MISMATCH/);
 console.log('PASS duplicate acknowledgements safe; changed bytes/run identity rejected');
 await rpc('record',{runId:p.runId,object:b});const done=await rpc('finalize',p),again=await rpc('finalize',p);assert.deepEqual(done,again);assert.equal(done.count,2);assert.equal(done.bytes,2);
 console.log('PASS finalize/readback completion idempotent');
 const q=await snapshot(workspace,sourceProject,[a]);await rpc('begin',q);await rpc('record',{runId:q.runId,object:a});assert.equal((await rpc('finalize',q)).count,1);assert.equal((await rpc('finalize',p)).count,2);
 console.log('PASS source deletion makes independent run and preserves old verified proof');
 await assert.rejects(rpc('finalize',{...q,workspace:'22222222-2222-4222-8222-222222222222'}));console.log('PASS cross-workspace run denied');
 const empty=await snapshot(workspace,sourceProject,[]);await rpc('begin',empty);assert.equal((await rpc('finalize',empty)).count,0);console.log('PASS empty snapshot verified explicitly');
 await db.exec('reset role');
 assert.equal((await db.query('select count(*)::int n from private.aqari_storage_restore_runs_v2')).rows[0].n,3);
 console.log('PASS exactly three snapshots; no duplicate run or object records');
}finally{await db.close();}
