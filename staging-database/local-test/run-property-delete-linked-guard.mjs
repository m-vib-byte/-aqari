import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
const w='10000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000001',p='30000000-0000-4000-8000-000000000001';
let cases=0;
const remove=()=>db.query('delete from public.aqari_properties where id=$1',[p]);
const blocked=async(message)=>{await assert.rejects(remove(),new RegExp(message));assert.equal((await db.query('select count(*)::int n from public.aqari_properties')).rows[0].n,1);cases++;};
try{
 await db.exec(`create schema private;create schema auth;create role anon;create role authenticated;create role service_role;
 create function auth.uid() returns uuid language sql as $$select case when current_setting('qa.actor',true)='none' then null else '${other}'::uuid end$$;
 create function private.aqari_manager(uuid) returns boolean language sql as $$select coalesce(current_setting('qa.manager',true),'yes')='yes'$$;
 create function private.aqari_can_property(uuid,uuid,text,text) returns boolean language sql as $$select coalesce(current_setting('qa.scope',true),'yes')='yes'$$;
 create function private.aqari_require_sensitive_aal2(uuid) returns void language plpgsql as $$begin if current_setting('qa.mfa',true) is distinct from 'fresh' then raise insufficient_privilege using message='MFA_RECENT_REAUTH_REQUIRED';end if;end$$;
 create table public.aqari_properties(id uuid primary key,workspace_id uuid,external_ref text,name text);
 create table public.aqari_documents(id int,workspace_id uuid,entity_type text,entity_ref text,metadata jsonb);
 create table public.aqari_app_state(workspace_id uuid,payload jsonb);
 create table public.aqari_units(property_id uuid references public.aqari_properties(id),workspace_id uuid);
 create table private.aqari_financial_audit(property_id uuid,workspace_id uuid);
 create table private.aqari_global_relation(property_id uuid);
 insert into public.aqari_properties values('${p}','${w}','external-qa','عقار اصطناعي');`);
 await db.exec(readFileSync(new URL('../sql/property-delete-linked-guard.sql',import.meta.url),'utf8'));
 await db.exec("set qa.actor='none'");await blocked('PROPERTY_DELETE_MANAGER_ONLY');await db.exec("set qa.actor='present';set qa.manager='no'");await blocked('PROPERTY_DELETE_MANAGER_ONLY');
 await db.exec("set qa.manager='yes';set qa.scope='no'");await blocked('PROPERTY_DELETE_MANAGER_ONLY');await db.exec("set qa.scope='yes'");await blocked('MFA_RECENT_REAUTH_REQUIRED');await db.exec("set qa.mfa='fresh'");
 for(const table of ['public.aqari_units','private.aqari_financial_audit']){
  await db.query(`insert into ${table} values($1,$2)`,[p,w]);await blocked('PROPERTY_DELETE_LINKED_RECORDS');await db.exec(`delete from ${table}`);
 }
 await db.query('insert into private.aqari_global_relation values($1)',[p]);await blocked('PROPERTY_DELETE_LINKED_RECORDS');await db.exec('delete from private.aqari_global_relation');
 // A newly added relation is detected without an application allow-list update.
 await db.exec('create table private.new_relationship(property_id uuid,workspace_id uuid)');await db.query('insert into private.new_relationship values($1,$2)',[p,w]);await blocked('PROPERTY_DELETE_LINKED_RECORDS');await db.exec('delete from private.new_relationship');
 for(const ref of [p,'external-qa','عقار اصطناعي']){await db.query('insert into public.aqari_documents values(1,$1,\'property\',$2,\'{}\')',[w,ref]);await blocked('PROPERTY_DELETE_LINKED_DOCUMENTS');await db.exec('delete from public.aqari_documents');}
 for(const value of [p,'external-qa','عقار اصطناعي']){await db.query('insert into public.aqari_documents values(1,$1,\'other\',\'x\',$2)',[w,JSON.stringify({nested:{property:value}})]);await blocked('PROPERTY_DELETE_LINKED_DOCUMENTS');await db.exec('delete from public.aqari_documents');}
 for(const value of [p,'external-qa','عقار اصطناعي']){await db.query('insert into public.aqari_app_state values($1,$2)',[w,JSON.stringify({properties:[{name:value}]})]);await blocked('PROPERTY_DELETE_IMPORTED_REFERENCES');await db.exec('delete from public.aqari_app_state');}
 await db.query('insert into private.aqari_financial_audit values($1,$2)',[p,other]);await blocked('PROPERTY_DELETE_LINKED_RECORDS');await db.exec('delete from private.aqari_financial_audit');await db.query('insert into public.aqari_documents values(1,$1,\'property\',$2,\'{}\')',[other,'عقار اصطناعي']);
 for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,'private.aqari_property_delete_linked_guard()','execute') ok",[role])).rows[0].ok,false);
 await remove();assert.equal((await db.query('select count(*)::int n from public.aqari_properties')).rows[0].n,0);cases++;
 console.log(JSON.stringify({result:'PASS',cases,linkedRowsPreserved:true,managerScopeAndRecentMfaRequired:true,grantsExpanded:false,productionApplied:false,twoConnectionConcurrencyTested:false}));
}finally{await db.close();}
