// In-memory PostgreSQL only: this runner accepts no database URL or credentials.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const runtime=process.env.AQARI_PGLITE_MODULE;
if(runtime&&!path.isAbsolute(runtime))throw Error('AQARI_PGLITE_MODULE must be an absolute local module path.');
const {PGlite}=await import(runtime?pathToFileURL(runtime):'@electric-sql/pglite');
const {btree_gist}=await import(runtime?pathToFileURL(path.join(path.dirname(runtime),'contrib/btree_gist.js')):'@electric-sql/pglite/contrib/btree_gist');
const db=new PGlite({extensions:{btree_gist}});
const q=s=>'"'+s.replaceAll('"','""')+'"';
const catalog=JSON.parse(await fs.readFile(new URL('./schema-catalog-2026-09-09.json',import.meta.url),'utf8'));
async function exec(sql,label){try{await db.exec(sql);}catch(e){throw Error(label+': '+e.message+'\n'+(e.where||''),{cause:e});}}
try{
 await exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema private;create schema storage;create schema extensions;
 create extension btree_gist;set check_function_bodies=off;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
 grant usage on schema public,private,auth,storage to authenticated,anon,service_role;
 grant execute on function auth.uid(),auth.jwt() to authenticated,anon,service_role;
 create table storage.buckets(id text primary key,name text,public boolean default false);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,metadata jsonb default '{}');
 create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;`,'bootstrap');
 for(const e of catalog.enums)await exec(`create type ${q(e.schema)}.${q(e.name)} as enum (${e.values.map(v=>"'"+v.replaceAll("'","''")+"'").join(',')});`,'enum '+e.name);
 for(const s of catalog.sequences.filter(s=>!s.identity))await exec(`create sequence ${q(s.schema)}.${q(s.name)};`,'sequence '+s.name);
 for(const t of catalog.tables){
  const cols=t.columns.map(c=>q(c.name)+' '+c.type+(c.identity?' generated '+(c.identity==='a'?'always':'by default')+' as identity':c.generated?` generated always as (${c.expression}) stored`:c.expression?' default '+c.expression:'')+(c.not_null?' not null':''));
  await exec(`create table ${q(t.schema)}.${q(t.name)} (${cols.join(',')});`,'table '+t.name);
 }
 for(const f of catalog.functions)await exec(f.definition,'function '+f.signature);
 for(const c of [...catalog.constraints].sort((a,b)=>(a.type==='f')-(b.type==='f')))await exec(`alter table ${c.table} add constraint ${q(c.name)} ${c.definition};`,'constraint '+c.name);
 for(const i of catalog.indexes)await exec(i,'index');
 for(const t of catalog.tables){
  if(t.rls)await exec(`alter table ${q(t.schema)}.${q(t.name)} enable row level security;`,'RLS');
  if(t.force_rls)await exec(`alter table ${q(t.schema)}.${q(t.name)} force row level security;`,'force RLS');
 }
 for(const p of catalog.policies)await exec(`create policy ${q(p.name)} on ${q(p.schema)}.${q(p.table)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(q).join(',')}${p.qual?' using ('+p.qual+')':''}${p.with_check?' with check ('+p.with_check+')':''};`,'policy '+p.name);
 const privileges={r:'select',a:'insert',w:'update',d:'delete',D:'truncate',x:'references',t:'trigger',X:'execute',U:'usage',C:'create'};
 async function acl(kind,object,value){
  await exec(`revoke all on ${kind} ${object} from public,anon,authenticated,service_role;`,'revoke '+object);
  if(value===null){if(kind==='function')await exec(`grant execute on function ${object} to public;`,'default function ACL');return;}
  for(const entry of value.slice(1,-1).split(',')){const [grantee,rest]=entry.split('=');const bits=rest.split('/')[0].replaceAll('*','');const perms=[...bits].map(b=>privileges[b]).filter(Boolean);if(perms.length)await exec(`grant ${perms.join(',')} on ${kind} ${object} to ${grantee?q(grantee):'public'};`,'grant '+object);}
 }
 for(const t of catalog.tables)await acl('table',`${q(t.schema)}.${q(t.name)}`,t.acl);
 for(const f of catalog.functions)await acl('function',f.signature,f.acl);
 for(const s of catalog.sequences)await acl('sequence',`${q(s.schema)}.${q(s.name)}`,s.acl);
 for(const t of catalog.triggers)await exec(t,'trigger');
 await exec(`insert into public.aqari_workspaces(id,slug,name) values('70000000-0000-4000-8000-000000000001','aqari-v267-staging','Local isolated synthetic workspace');
 insert into public.aqari_app_state(workspace_id,payload) values('70000000-0000-4000-8000-000000000001','{}');`,'synthetic workspace');
 console.log('Schema restored in local memory; no hosted database connection.');
 for(const name of process.argv.slice(2)){await exec(await fs.readFile(name,'utf8'),name);console.log('PASS '+name);}
}catch(e){console.error(e.message);process.exitCode=1;}finally{await db.close();}
