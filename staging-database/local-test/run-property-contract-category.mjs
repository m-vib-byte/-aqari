import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.AQARI_PGLITE_MODULE?pathToFileURL(process.env.AQARI_PGLITE_MODULE):'@electric-sql/pglite');
const db=new PGlite();
const sql=readFileSync(new URL('../sql/property-contract-category-compat.sql',import.meta.url),'utf8');
assert.equal(sql,readFileSync(new URL('../supabase/migrations/20261004010000_v267_property_contract_category_compat.sql',import.meta.url),'utf8'));
const existing=readFileSync(new URL('../sql/property-batch-a2-core.sql',import.meta.url),'utf8');
const validator=existing.match(/create or replace function private\.aqari_document_category_valid\([\s\S]*?\$\$;/)?.[0];
assert.ok(validator);
const categories=[...new Set([...validator.matchAll(/when '([^']+)'/g)].map(x=>x[1])),null,'unknown'];
const entities=['property','lease','tenant','other',null];
const kinds=['supporting_document','signed_contract','property_document','tenant_attachment','mobile_scan',null];
const call=async(c,e,k)=>(await db.query('select private.aqari_document_category_valid($1,$2,$3) as allowed',[c,e,k])).rows[0].allowed;
try{
 await db.exec('create schema private;create role anon;create role authenticated;');
 await db.exec(sql); // Schemas without this validator must stay unchanged.
 assert.equal((await db.query("select to_regprocedure('private.aqari_document_category_valid(text,text,text)') as function")).rows[0].function,null);
 await db.exec(validator+'revoke all on function private.aqari_document_category_valid(text,text,text) from public,anon,authenticated;');
 assert.equal(await call('property_other','property','property_document'),false,'reproduces the hosted upload rejection');
 const before=[];
 for(const c of categories)for(const e of entities)for(const k of kinds)before.push({c,e,k,result:await call(c,e,k)});
 await db.exec('begin');await db.exec(sql);assert.equal(await call('property_other','property','property_document'),true);await db.exec('rollback');
 assert.equal(await call('property_other','property','property_document'),false,'rollback restores prior validator');
 await db.exec(sql);await db.exec(sql);
 for(const {c,e,k,result} of before)assert.equal(await call(c,e,k),c==='property_other'&&e==='property'&&k==='property_document'?true:result,JSON.stringify({c,e,k}));
 for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'private.aqari_document_category_valid(text,text,text)','execute') as allowed",[role])).rows[0].allowed,false,'existing grants unchanged');
 await db.exec('create or replace function private.aqari_document_category_valid(category text,entity text,kind text) returns boolean language sql as $$select false$$;');
 await assert.rejects(db.exec(sql),/DOCUMENT_CATEGORY_COMPAT_ANCHOR_CHANGED/,'unknown validators must fail safely');
 console.log('PASS property PDF category: hosted rejection reproduced, '+before.length+' combinations preserved except intended property PDF, idempotency, rollback, unchanged grants, absent/unknown schema guards');
}finally{await db.close();}
