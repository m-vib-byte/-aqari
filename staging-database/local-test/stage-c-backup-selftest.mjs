// Isolated synthetic test. Never connects to a hosted database.
// AQARI_PGLITE_MODULE may point to an installed PGlite module.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const runtime=process.env.AQARI_PGLITE_MODULE;
const {PGlite}=await import(runtime?pathToFileURL(runtime):'@electric-sql/pglite');
const db=new PGlite();
try {
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema auth; create schema private; create schema supabase_migrations;
 create table supabase_migrations.schema_migrations(version text,name text);
 create table public.aqari_backup_fixture(id integer primary key,payload text);
 create table private.aqari_empty_fixture(id integer);
 create table auth.users(id integer primary key);
 insert into public.aqari_backup_fixture select n,'fixture-'||n from generate_series(1,2501) n;
 insert into auth.users select n from generate_series(1,1001) n;`);
 await db.exec(await fs.readFile('supabase/migrations/20261001121500_stage_c_server_backup_export.sql','utf8'));
 await assert.rejects(db.query('select public.v267_stage_c_backup_snapshot()'),/SERVER_ONLY/);
 for(const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(db.query('select public.v267_stage_c_backup_snapshot()'),/permission denied/);
 }
 await db.exec('set role service_role');
 const {rows}=await db.query('select public.v267_stage_c_backup_snapshot() as snapshot');
 const snapshot=rows[0].snapshot;
 for(const [schema,table,count] of [['public','aqari_backup_fixture',2501],['auth','users',1001],['private','aqari_empty_fixture',0]]) {
  const pages=snapshot.pages.filter(p=>p.schema===schema&&p.table===table);
  const exported=pages.flatMap(p=>p.rows);
  assert.equal(exported.length,count);
  assert.equal(new Set(exported.map(r=>r.id)).size,count);
  assert.deepEqual(exported.map(r=>r.id).sort((a,b)=>a-b),Array.from({length:count},(_,i)=>i+1));
  assert.deepEqual(pages.map(p=>p.offset),Array.from({length:Math.ceil(count/1000)},(_,i)=>i*1000));
  for(const page of pages) assert.match(page.fingerprint_md5,/^[0-9a-f]{32}$/);
 }
 console.log('PASS: all 2501 application rows and 1001 Auth rows, empty table, unique IDs, offsets, fingerprints, server-only permissions');
} finally {await db.close();}
