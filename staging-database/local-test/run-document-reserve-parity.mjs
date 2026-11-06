import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {DOCUMENT_CATEGORIES} from '../../src/v267/components/document-catalog.js';
const db=new PGlite();
const baseline=readFileSync(new URL('./fixtures/reserve-document-production-20261106.sql',import.meta.url),'utf8');
const migration=readFileSync(new URL('../sql/document-reserve-client-parity.sql',import.meta.url),'utf8');
const signature='public.aqari_reserve_document(uuid,text,text,text,text,text,text,jsonb)';
const definition=async()=>(await db.query('select pg_get_functiondef($1::regprocedure) as source',[signature])).rows[0].source;
const reserve=async(category='property_other',entity='property',kind='supporting_document',ref='synthetic',mime='application/pdf')=>db.query('select * from public.aqari_reserve_document($1,$2,$3,$4,$5,$6,$7,$8)', ['a0000000-0000-4000-8000-000000000001',kind,entity,ref,'Synthetic acceptance document','qa.pdf',mime,JSON.stringify(category===null?{}:{category})]);
try{
 await db.exec(`create schema private;create schema auth;create role anon;create role authenticated;create role service_role;
 create function auth.uid() returns uuid language sql as $$select 'a0000000-0000-4000-8000-000000000002'::uuid$$;
 create function private.aqari_can(uuid,text,text) returns boolean language sql as $$select coalesce(current_setting('test.allow',true),'yes')<>'no'$$;
 create function private.aqari_document_entity(uuid,text,text,text) returns boolean language sql as $$select $3='synthetic'$$;
 create function private.aqari_document_category_allowed(text,text) returns boolean language sql as $$select $2='legacy_allowed'$$;
 create table public.aqari_documents(id uuid primary key,workspace_id uuid,document_no text unique,document_type text,entity_type text,entity_ref text,title text,original_filename text,mime_type text,metadata jsonb,storage_path text unique,created_by uuid,status text default 'draft');`);
 await db.exec(baseline);await db.exec(`revoke all on function ${signature} from public;grant execute on function ${signature} to authenticated;`);
 const before=await definition();
 await assert.rejects(reserve(),/INVALID_DOCUMENT/,'reproduce published rejection before repair');
 assert.equal((await db.query('select count(*)::int n from public.aqari_documents')).rows[0].n,0);
 await db.exec(migration);
 const patchedFingerprint=(await db.query('select md5(pg_get_functiondef($1::regprocedure)) as hash',[signature])).rows[0].hash;
 const categories={...DOCUMENT_CATEGORIES};for(const key of ['property_logo','property_main_photo','property_photo','property_license','property_certificate','property_insurance','property_other'])categories[key]={entities:['property']};
 let matrix=0;
 for(const [category,{entities}]of Object.entries(categories))for(const entity of ['property','tenant','lease','unit','vendor','work_order','legal_case','employee','other']){
 const kind=category==='signed_lease'?'signed_contract':'supporting_document';
 if(entities.includes(entity)){const r=await reserve(category,entity,kind);assert.equal(r.rows.length,1);assert.equal(r.rows[0].storage_bucket,'aqari-documents');}
 else await assert.rejects(reserve(category,entity,kind),/INVALID_DOCUMENT_CATEGORY|INVALID_DOCUMENT/);
 matrix++;
 }
 await reserve('property_other','property','property_document');
 await reserve(null,'property','property_document');
 for(const c of [null,'unknown','',"property_other';drop table x;--"])await assert.rejects(reserve(c),/INVALID_DOCUMENT_CATEGORY/);
 await assert.rejects(reserve('title_deed','property','signed_contract'),/INVALID_DOCUMENT/);
 await assert.rejects(reserve('property_other','property','supporting_document','missing'),/DOCUMENT_ENTITY_NOT_FOUND/);
 await assert.rejects(reserve('property_other','property','supporting_document','synthetic','text/html'),/INVALID_DOCUMENT/);
 await db.exec("set test.allow='no'");await assert.rejects(reserve(),/ACCESS_DENIED/);await db.exec("set test.allow='yes'");
 for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,'private.aqari_document_category_valid(text,text,text)','execute') ok",[role])).rows[0].ok,false);
 assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') ok',['authenticated',signature])).rows[0].ok,true);
 const count=(await db.query('select count(*)::int n from public.aqari_documents')).rows[0].n;
 await assert.rejects(db.exec(migration),/DOCUMENT_RESERVE_BASELINE_CHANGED/);await db.exec('rollback');
 await db.exec(readFileSync(new URL('../sql/document-reserve-client-parity-rollback.sql',import.meta.url),'utf8'));
 assert.equal(await definition(),before);assert.equal((await db.query('select count(*)::int n from public.aqari_documents')).rows[0].n,count,'rollback preserves documents created after repair');
 await assert.rejects(reserve(),/INVALID_DOCUMENT/);
 console.log(JSON.stringify({result:'PASS',patchedFingerprint,matrixCases:matrix,createdSyntheticDocuments:count,baselineRejectionReproduced:true,invalidCategoryAndScopeRejected:true,grantsPreserved:true,rollbackPreservesNewDocuments:true,storageBytesTested:false}));
}finally{await db.close();}
