import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.AQARI_PGLITE_MODULE?pathToFileURL(process.env.AQARI_PGLITE_MODULE):'@electric-sql/pglite');
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const patch=readFileSync(new URL('../sql/property-master-cleared-values-fix.sql',import.meta.url),'utf8');
const snapshot=filename=>readFileSync(new URL('../sql/'+filename,import.meta.url),'utf8').match(/create or replace function private\.aqari_property_master_snapshot\([\s\S]*?\$\$;/)[0];
let passed=0;const check=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);passed++};
const read=async(w=1,p=2)=>(await db.query('select private.aqari_property_master_snapshot($1,$2) as value',[id(w),id(p)])).rows[0].value;
try{
 await db.exec(`create schema private;create role anon;create role authenticated;create role service_role;
 create table public.aqari_properties(workspace_id uuid,id uuid,name text,external_ref text,metadata jsonb);
 create table private.aqari_property_master(workspace_id uuid,property_id uuid,address text,description text,location_url text,property_automatic_ref text,property_type text,status text,stated_income numeric,owners jsonb,contact_email text,contact_phone text,contact_whatsapp text,assets jsonb,tenant_visibility jsonb,tenant_public_info jsonb,revision bigint,updated_at timestamptz);`);
 const legacy={propertyType:'legacy-type',propertyMonthlyIncome:'350.010'};
 await db.query('insert into public.aqari_properties values($1,$2,$3,$4,$5)',[id(1),id(2),'test','ref',legacy]);
 await db.query("insert into private.aqari_property_master(workspace_id,property_id,property_type,stated_income,revision,description) values($1,$2,'',null,1,'retained')",[id(1),id(2)]);
 for(const filename of ['property-master-file.sql','property-batch-a2-core.sql']){
  await db.exec(snapshot(filename));
  await db.exec('revoke all on function private.aqari_property_master_snapshot(uuid,uuid) from public,anon,authenticated,service_role;');
  let r=await read();check([r.type,r.statedIncome],['legacy-type',350.01],filename+': reproduce resurrected cleared values');
  await db.exec(patch);r=await read();check([r.type,r.statedIncome],['',null],filename+': cleared values preserved');
  await db.exec(patch);check(await read(),r,filename+': idempotent');
  check(await read(3),null,filename+': wrong workspace excluded');
  check(await read(1,4),null,filename+': missing property excluded');
  for(const role of ['anon','authenticated','service_role'])check((await db.query("select has_function_privilege($1,'private.aqari_property_master_snapshot(uuid,uuid)','execute') as allowed",[role])).rows[0].allowed,false,filename+': unchanged ACL '+role);
  await db.exec("update private.aqari_property_master set property_type='new-type',stated_income=0");
  r=await read();check([r.type,r.statedIncome],['new-type',0],filename+': explicit values and zero retained');
  await db.exec('update private.aqari_property_master set stated_income=350.011');
  check((await read()).statedIncome,350.011,filename+': fils retained');
  await db.exec('begin;delete from private.aqari_property_master;');
  r=await read();check([r.type,r.statedIncome],['legacy-type',350.01],filename+': unmigrated legacy remains readable');
  await db.exec('rollback');
  await db.exec("update private.aqari_property_master set property_type='',stated_income=null");
  if(filename.includes('batch'))check((await read()).description,'retained','extended fields preserved');
 }
 check((await db.query('select metadata from public.aqari_properties')).rows[0].metadata,legacy,'no business metadata changes');
 await db.exec("update public.aqari_properties set metadata=jsonb_build_object('propertyMonthlyIncome','invalid')");
 check((await read()).statedIncome,null,'invalid legacy income cannot break an existing master');
 await db.exec("create or replace function private.aqari_property_master_snapshot(w uuid,p uuid) returns jsonb language sql as $$select '{}'::jsonb$$;");
 await assert.rejects(db.exec(patch),/PROPERTY_MASTER_CLEAR_FIX_ANCHOR_CHANGED/);passed++;await db.exec('rollback');
 check(await read(),{},'unknown definition not overwritten');
 console.log(JSON.stringify({passed,failed:0,engine:'isolated PGlite PostgreSQL',hosted:false,productionWrites:false}));
}finally{await db.close()}
