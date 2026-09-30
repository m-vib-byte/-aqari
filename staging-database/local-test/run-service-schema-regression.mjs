// In-memory PostgreSQL regression only; no hosted connection or business data.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import path from 'node:path';
const runtime=process.env.AQARI_PGLITE_MODULE;
if(runtime&&!path.isAbsolute(runtime))throw Error('Absolute local PGlite path required');
const {PGlite}=await import(runtime?pathToFileURL(runtime):'@electric-sql/pglite');
const db=new PGlite();
const read=name=>readFileSync(new URL('../sql/'+name,import.meta.url),'utf8');
const patch=read('property-owner-controls-property-type-fix.sql').replace(/^begin;|^commit;/gm,'');
try{
 await db.exec(`create schema private; create table private.aqari_property_master(property_type text);
 insert into private.aqari_property_master values('synthetic');
 create function public.aqari_property_controls(uuid,text,jsonb) returns text language plpgsql as $$begin return (select m.type from private.aqari_property_master m);end$$;
 create function private.aqari_property_template_scope_guard() returns text language plpgsql as $$begin return (select m.type from private.aqari_property_master m);end$$;`);
 await assert.rejects(db.query("select public.aqari_property_controls(null,'context','{}')"),/m.type/);
 for(let i=0;i<2;i++){
  await db.exec(patch);
  const {rows}=await db.query("select public.aqari_property_controls(null,'context','{}') as value,private.aqari_property_template_scope_guard() as guard");
  assert.deepEqual(rows,[{value:'synthetic',guard:'synthetic'}]);
 }
 console.log('PASS property type repair preserves values and is repeatable');
 const prerequisite=read('finance-owner-controls-b3.sql').match(/do \$prerequisite\$[\s\S]*?end \$prerequisite\$;/)[0];
 await assert.rejects(db.exec(prerequisite),/PROPERTY_COST_AREA_PREREQUISITE_REQUIRED/);
 await db.exec('create table private.aqari_unit_master(area_sqm numeric(12,3));');
 await db.exec(prerequisite);
 console.log('PASS missing area blocks installation; correct dependency permits it');
 // An unrecognized function must fail closed rather than silently claiming a repair.
 await db.exec("create or replace function public.aqari_property_controls(uuid,text,jsonb) returns text language sql as $$select 'unexpected'::text$$;");
 await assert.rejects(db.exec(patch),/PROPERTY_TYPE_FIX_ANCHOR_CHANGED/);
 console.log('PASS unknown function shape fails closed');
}finally{await db.close();}
