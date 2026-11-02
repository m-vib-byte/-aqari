// Run with PGlite 0.5.8 installed in an isolated toolchain:
// AQARI_PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node --test staging-database/tests/follow-up-cloud.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(process.env.AQARI_PGLITE_MODULE?pathToFileURL(process.env.AQARI_PGLITE_MODULE).href:'@electric-sql/pglite');
const sql=await readFile(new URL('../sql/follow-up-cloud-compat.sql',import.meta.url),'utf8');
const rollbackSql=await readFile(new URL('../sql/follow-up-cloud-rollback.sql',import.meta.url),'utf8');
const w='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const users=Array.from({length:6},(_,i)=>`11111111-1111-4111-8111-${String(i+1).padStart(12,'0')}`);
const hash='a'.repeat(64),hash2='b'.repeat(64);
test('V267 follow-up RPCs on real local PostgreSQL engine',async t=>{
 const db=new PGlite();
 const actor=async(user,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);await db.exec('set role '+role);};
 const append=(args=[])=>db.query('select public.aqari_record_follow_up_event($1,$2,$3,$4,$5,$6) as event',[w,hash,'2026-11','reviewed','pending',11].map((v,i)=>i<args.length?args[i]:v));
 const list=(workspace=w,key=hash,period='2026-11',limit=20)=>db.query('select * from public.aqari_list_follow_up_events($1,$2,$3,$4)',[workspace,key,period,limit]);
 const rejects=(work,code)=>assert.rejects(work,e=>e.code===code);
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema private;grant usage on schema auth to authenticated;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table auth.users(id uuid primary key);
 create table public.aqari_workspaces(id uuid primary key);
 create table public.aqari_memberships(workspace_id uuid,user_id uuid,role text,is_active boolean,primary key(workspace_id,user_id));
 create table public.aqari_app_state(workspace_id uuid primary key,payload jsonb,revision bigint);
 create function private.aqari_reject_immutable_change() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'IMMUTABLE_LEDGER_ENTRY' using errcode='23514';end $$;
 insert into auth.users values ${users.map(u=>`('${u}')`).join(',')};
 insert into public.aqari_workspaces values ('${w}'),('${other}');
 insert into public.aqari_app_state values ('${w}','{"unchanged":true}',11),('${other}','{}',7);
 insert into public.aqari_memberships values
 ('${w}','${users[0]}','general_manager',true),('${w}','${users[1]}','property_manager',true),
 ('${w}','${users[2]}','accountant',true),('${w}','${users[3]}','viewer',true),
 ('${w}','${users[4]}','general_manager',false),('${other}','${users[5]}','general_manager',true);`);
 await db.exec(sql);
 await t.test('empty journal rollback removes only the new contract and supports reapplication',async()=>{
  await db.exec(rollbackSql);
  assert.equal((await db.query("select to_regclass('private.aqari_follow_up_events') as journal")).rows[0].journal,null);
  assert.equal((await db.query('select count(*)::int n from public.aqari_memberships')).rows[0].n,6);
  await db.exec(sql);
 });
 await t.test('three authorized staff roles can append and read opaque metadata',async()=>{
  for(const user of users.slice(0,3)){await actor(user);const r=await append();assert.equal(r.rows[0].event.record_hash,hash);assert.equal(r.rows[0].event.app_state_revision,11);assert.equal('actor_id' in r.rows[0].event,false);}
  const r=await list();assert.equal(r.rows.length,3);assert.deepEqual(Object.keys(r.rows[0]).sort(),['event_id','action_kind','state','period','app_state_revision','created_at'].sort());
 });
 await t.test('viewer can read but cannot append',async()=>{await actor(users[3]);assert.equal((await list()).rows.length,3);await rejects(()=>append(),'42501');});
 await t.test('inactive membership and a different workspace cannot read or append',async()=>{
  for(const user of [users[4],users[5]]){await actor(user);await rejects(()=>append(),'42501');await rejects(()=>list(),'42501');}
 });
 await t.test('missing identity, anonymous and service roles cannot call write RPC',async()=>{
  await actor(null);await rejects(()=>append(),'42501');
  for(const role of ['anon','service_role']){await actor(users[0],role);await rejects(()=>append(),'42501');await rejects(()=>list(),'42501');}
 });
 await t.test('private table and sequence are inaccessible to application roles',async()=>{
  for(const role of ['anon','authenticated','service_role']){await actor(users[0],role);await rejects(()=>db.query('select * from private.aqari_follow_up_events'),'42501');await rejects(()=>db.query("select nextval('private.aqari_follow_up_events_id_seq')"),'42501');}
 });
 await t.test('malformed hashes, periods, actions, states and revisions are rejected',async()=>{
  await actor(users[0]);
  for(const args of [[w,null],[w,'tenant name'],[w,hash,'2026-13'],[w,hash,'2026-11','bad'],[w,hash,'2026-11','reviewed','bad'],[w,hash,'2026-11','reviewed','pending',null],[w,hash,'2026-11','reviewed','pending',0]])await rejects(()=>append(args),'22023');
  await rejects(()=>list(w,hash,'2026-13'),'22023');await rejects(()=>list(w,null),'22023');
 });
 await t.test('stale revision produces conflict and no new event',async()=>{
  const count=(await list()).rows.length;await rejects(()=>append([w,hash,'2026-11','reviewed','pending',10]),'40001');assert.equal((await list()).rows.length,count);
 });
 await t.test('workspace, period and record filters do not mix histories',async()=>{
  await append([w,hash2]);await append([w,hash,'2026-10']);
  assert.equal((await list(w,hash2)).rows.length,1);assert.equal((await list(w,hash,'2026-10')).rows.length,1);assert.equal((await list(w,'c'.repeat(64))).rows.length,0);
  await actor(users[5]);await append([other,hash,'2026-11','reviewed','pending',7]);assert.equal((await list(other)).rows.length,1);await rejects(()=>list(w),'42501');
 });
 await t.test('results are newest first and limits remain bounded',async()=>{
  await actor(users[0]);for(let i=0;i<52;i++)await append();
  const r=(await list(w,hash,'2026-11',1000)).rows;assert.equal(r.length,50);assert.ok(r.every((row,i)=>!i||Number(r[i-1].event_id)>Number(row.event_id)));
  assert.equal((await list(w,hash,'2026-11',0)).rows.length,1);assert.equal((await list(w,hash,'2026-11',null)).rows.length,20);
 });
 await t.test('events are immutable even through an administrative connection',async()=>{
  await db.exec('reset role');await rejects(()=>db.query("update private.aqari_follow_up_events set state='resolved'"),'23514');await rejects(()=>db.query('delete from private.aqari_follow_up_events'),'23514');
 });
 await t.test('reapplying additive SQL preserves event count and protections',async()=>{
  const before=(await db.query('select count(*)::int n from private.aqari_follow_up_events')).rows[0].n;await db.exec(sql);assert.equal((await db.query('select count(*)::int n from private.aqari_follow_up_events')).rows[0].n,before);
  const r=await db.query("select relrowsecurity rls from pg_class where oid='private.aqari_follow_up_events'::regclass");assert.equal(r.rows[0].rls,true);
 });
 await t.test('business payload and revision remain unchanged',async()=>{
  const r=await db.query('select payload,revision from public.aqari_app_state where workspace_id=$1',[w]);assert.deepEqual(r.rows[0].payload,{unchanged:true});assert.equal(Number(r.rows[0].revision),11);
 });
 await t.test('rollback refuses to delete saved history and leaves the contract intact',async()=>{
  await assert.rejects(()=>db.exec(rollbackSql),e=>e.message.includes('FOLLOW_UP_HISTORY_EXISTS'));
  await db.exec('rollback');
  assert.ok((await db.query('select count(*)::int n from private.aqari_follow_up_events')).rows[0].n>0);
  assert.ok((await db.query("select to_regprocedure('public.aqari_list_follow_up_events(uuid,text,text,integer)') as rpc")).rows[0].rpc);
 });
 }finally{await db.close();}
});
