// Local in-memory PostgreSQL only. No hosted connection or authentication stub.
// PGlite uses one session: this proves constraint behavior, NOT concurrent acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const runtime=process.env.AQARI_PGLITE_MODULE;
if(runtime&&!path.isAbsolute(runtime))throw Error('Absolute local PGlite path required');
const {PGlite}=await import(runtime?pathToFileURL(runtime):'@electric-sql/pglite');
const {btree_gist}=await import(runtime?pathToFileURL(path.join(path.dirname(runtime),'contrib/btree_gist.js')):'@electric-sql/pglite/contrib/btree_gist');
const catalog=JSON.parse(await fs.readFile(new URL('./schema-catalog-production-2026-10-05.json',import.meta.url),'utf8'));
const constraint=catalog.constraints.find(c=>c.table==='public.aqari_leases'&&c.type==='x');
assert.equal(constraint?.name,'aqari_leases_workspace_id_unit_id_daterange_excl');
const db=new PGlite({extensions:{btree_gist}}),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const base={workspace:id(1),unit:id(2),start:'2026-01-01',end:'2026-12-31',release:null,status:'signed'};
let passed=0;
async function insert(n,row){return db.query('insert into lease_fixture values ($1,$2,$3,$4,$5,$6,$7)',[n,row.workspace,row.unit,row.start,row.end,row.release,row.status]);}
async function result(task,conflict){
 if(conflict)await assert.rejects(task,error=>error.code==='23P01');else await task();
 passed++;
}
try{
 await db.exec(`create extension btree_gist;create table lease_fixture(id integer primary key,workspace_id uuid not null,unit_id uuid not null,start_date date,end_date date,vacated_on date,status text not null, constraint occupancy ${constraint.definition});`);
 const cases=[
  ['same period',{}, {},true],
  ['nested period',{}, {start:'2026-03-01',end:'2026-05-31'},true],
  ['enclosing period',{}, {start:'2025-01-01',end:'2027-12-31'},true],
  ['shared first day',{}, {start:'2025-12-01',end:'2026-01-01'},true],
  ['shared last day',{}, {start:'2026-12-31',end:'2027-12-31'},true],
  ['prior adjacent day',{}, {start:'2025-01-01',end:'2025-12-31'},false],
  ['next adjacent day',{}, {start:'2027-01-01',end:'2027-12-31'},false],
  ['different unit',{}, {unit:id(3)},false],
  ['different workspace',{}, {workspace:id(4)},false],
  ['cancelled prior',{status:'cancelled'}, {},false],
  ['cancelled candidate',{}, {status:'cancelled'},false],
  ['expired without release',{status:'expired'}, {start:'2026-07-01'},true],
  ['approved release next day',{status:'expired',release:'2026-06-30'}, {start:'2026-07-01'},false],
  ['approved release same day',{status:'expired',release:'2026-06-30'}, {start:'2026-06-30'},true],
  ['unknown historical bounds',{start:null,end:null}, {},true],
  ['operational draft',{status:'draft'}, {},true],
 ];
 for(const [name,old,change,conflict] of cases){
  await db.exec('truncate lease_fixture');await insert(1,{...base,...old});
  try{await result(()=>insert(2,{...base,...change}),conflict);}catch(error){throw Error(name,{cause:error});}
 }
 await db.exec('truncate lease_fixture');await insert(1,base);await insert(2,{...base,start:'2027-01-01',end:'2027-12-31'});
 await result(()=>db.query("update lease_fixture set start_date='2026-12-31' where id=2"),true);
 await db.exec('truncate lease_fixture');await insert(1,base);await insert(2,{...base,status:'cancelled'});
 await result(()=>db.query("update lease_fixture set status='signed' where id=2"),true);
 console.log(JSON.stringify({passed,failed:0,engine:'local PGlite PostgreSQL',constraint:constraint.name,source:'production catalog; definition matched live read-only catalog on 2026-10-06',concurrent:false,hosted:false,businessWrites:false}));
}finally{await db.close();}
