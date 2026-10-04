import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.AQARI_PGLITE_MODULE?pathToFileURL(process.env.AQARI_PGLITE_MODULE):'@electric-sql/pglite');
const db=new PGlite();
const w='11111111-1111-4111-8111-111111111111',p='22222222-2222-4222-8222-222222222222',doc='33333333-3333-4333-8333-333333333333',owner='44444444-4444-4444-8444-444444444444',other='55555555-5555-4555-8555-555555555555',id='66666666-6666-4666-8666-666666666666';
const snap={mapping:{version:1,title:'',propertyId:p,fields:[{id:'f1',label:'اسم',type:'text',page:1,x:.2,y:.2,width:.2,height:.025,fontSize:10,align:'right',color:'#000000'}]},values:{f1:'مستأجر تجريبي'},page:1,selected:'f1'};
const data={id,property_id:p,document_id:doc,expected_revision:0,request_id:'77777777-7777-4777-8777-777777777777',snapshot:snap};
async function actor(user=owner){await db.exec(`reset role;select set_config('request.jwt.claim.sub','${user}',false);set role authenticated;`);}
const rpc=async(action,payload,workspace=w)=>(await db.query('select public.aqari_pdf_editor_drafts($1,$2,$3) as result',[workspace,action,payload])).rows[0].result;
try{
 await db.exec(`create schema auth;create schema private;create role anon;create role authenticated;grant usage on schema public,private,auth to authenticated;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.aqari_workspaces(id uuid primary key);
 create table public.aqari_properties(id uuid primary key,workspace_id uuid,external_ref text);
 create table public.aqari_documents(id uuid primary key,workspace_id uuid,status text,mime_type text,entity_type text,entity_ref text,document_type text,metadata jsonb);
 create table public.aqari_memberships(workspace_id uuid,user_id uuid,role text,is_active boolean);
 create function private.aqari_manager(w uuid) returns boolean language sql security definer set search_path='' as $$select exists(select 1 from public.aqari_memberships where workspace_id=w and user_id=auth.uid() and role='general_manager' and is_active)$$;
 create function private.aqari_can(w uuid,s text,a text) returns boolean language sql security definer set search_path='' as $$select private.aqari_manager(w)$$;
 create table public.aqari_app_state(payload jsonb);insert into public.aqari_app_state values(' {"contracts":["signed-original"],"payments":["untouched"]}');
 create table public.aqari_leases(id int);insert into public.aqari_leases values(1);
 create function private.no_business_write() returns trigger language plpgsql as $$begin raise exception 'BUSINESS_WRITE_FORBIDDEN';end$$;
 create trigger no_business_write before insert or update or delete on public.aqari_app_state for each statement execute function private.no_business_write();
 create trigger no_business_write before insert or update or delete on public.aqari_leases for each statement execute function private.no_business_write();`);
 await db.query('insert into public.aqari_workspaces values($1)',[w]);await db.query('insert into public.aqari_properties values($1,$2,$3)',[p,w,'property']);
 await db.query('insert into public.aqari_documents values($1,$2,$3,$4,$5,$6,$7,$8)',[doc,w,'uploaded','application/pdf','property','property','property_document',{category:'property_other',asset_role:'property_contract',property_id:p}]);
 await db.query('insert into public.aqari_memberships values($1,$2,$3,true),($1,$4,$3,true)',[w,owner,'general_manager',other]);
 const sql=readFileSync(new URL('../sql/pdf-editor-drafts.sql',import.meta.url),'utf8');
 assert.equal(sql,readFileSync(new URL('../supabase/migrations/20261003165942_v267_pdf_editor_drafts.sql',import.meta.url),'utf8'));
 // Installation rollback is transactional and does not affect prior business tables.
 await db.exec('begin');await db.exec(sql);await db.exec('rollback');assert.equal((await db.query("select to_regclass('private.aqari_pdf_editor_drafts') as relation")).rows[0].relation,null);
 await db.exec(sql);
 const linkedSql=readFileSync(new URL('../sql/pdf-linked-fields.sql',import.meta.url),'utf8');
 assert.equal(linkedSql,readFileSync(new URL('../supabase/migrations/20261004013257_v267_pdf_linked_fields.sql',import.meta.url),'utf8'));
 await db.exec(linkedSql);await db.exec(linkedSql);await actor();
 const first=await rpc('save',data);assert.equal(first.revision,1);assert.deepEqual(first.snapshot,snap);assert.equal(first.created_by,owner);
 assert.equal((await rpc('save',data)).revision,1,'lost-response retry is idempotent');
 await assert.rejects(rpc('save',{...data,snapshot:{...snap,page:2}}),/PDF_DRAFT_RETRY_CONFLICT/);
 const next={...data,expected_revision:1,request_id:'88888888-8888-4888-8888-888888888888',snapshot:{...snap,values:{f1:'تعديل جديد'}}};
 assert.equal((await rpc('save',next)).revision,2);
 await assert.rejects(rpc('save',{...data,request_id:'99999999-9999-4999-8999-999999999999'}),/PDF_DRAFT_REVISION_CONFLICT/);
 assert.deepEqual((await rpc('get',{id,property_id:p})).snapshot.values,{f1:'تعديل جديد'});
 const list=await rpc('list',{property_id:p});assert.equal(list.items.length,1);assert.equal('snapshot' in list.items[0],false);assert.equal(list.has_more,false);
 await assert.rejects(db.query('select * from private.aqari_pdf_editor_drafts'),/permission denied/);
 await actor(other);assert.equal((await rpc('list',{property_id:p})).items.length,0);await assert.rejects(rpc('get',{id,property_id:p}),/ACCESS_DENIED/);await assert.rejects(rpc('save',next),/ACCESS_DENIED/);
 await actor();await assert.rejects(rpc('get',{id,property_id:p},other),/ACCESS_DENIED/);await assert.rejects(rpc('save',{...next,expected_revision:2,document_id:other}),/ACCESS_DENIED/);
 const invalid=[{...snap,values:{f1:'x'.repeat(1001)}},{...snap,values:{unknown:'value'}},{...snap,mapping:{...snap.mapping,fields:[...snap.mapping.fields,...snap.mapping.fields]}},{...snap,mapping:{...snap.mapping,fields:[{...snap.mapping.fields[0],x:.95}]}},{...snap,mapping:{...snap.mapping,propertyId:other}},{...snap,mapping:{...snap.mapping,title:'x'.repeat(161)}},{...snap,page:31}];
 for(const snapshot of invalid)await assert.rejects(rpc('save',{...next,expected_revision:2,snapshot}),/INVALID_PDF_DRAFT/);
 const linkedSnap=structuredClone(snap);linkedSnap.mapping.fields[0].dataKey='tenant';linkedSnap.mapping.fields.push({...linkedSnap.mapping.fields[0],id:'f2',page:2});linkedSnap.values.f2=linkedSnap.values.f1;
 const linkedData={...next,expected_revision:2,request_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',snapshot:linkedSnap};
 assert.deepEqual((await rpc('save',linkedData)).snapshot,linkedSnap);
 for(const mutate of [s=>s.mapping.fields[0].dataKey=null,s=>s.mapping.fields[0].dataKey='',s=>s.mapping.fields[1].type='date',s=>s.values.f2='conflicting']){
  const bad=structuredClone(linkedSnap);mutate(bad);await assert.rejects(rpc('save',{...linkedData,expected_revision:3,request_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',snapshot:bad}),/INVALID_PDF_DRAFT/);
 }
 console.log('PASS linked PDF drafts: roundtrip, cross-page values, conflicting values/types rejected, migration idempotent');
 await db.exec('reset role');await db.query('update public.aqari_memberships set is_active=false where user_id=$1',[owner]);await actor();await assert.rejects(rpc('get',{id,property_id:p}),/ACCESS_DENIED/);await assert.rejects(rpc('save',next),/ACCESS_DENIED/);
 await db.exec('reset role;set role anon');await assert.rejects(rpc('list',{property_id:p}),/permission denied/);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int as n from private.aqari_pdf_editor_drafts')).rows[0].n,1);assert.equal((await db.query('select payload from public.aqari_app_state')).rows[0].payload.payments[0],'untouched');assert.equal((await db.query('select count(*)::int n from public.aqari_leases')).rows[0].n,1);
 console.log('PASS PDF draft SQL: create, readback, restore, CAS conflict, retry identity, owner/workspace/document isolation, revoked access, anonymous/direct denial, validation, rollback and zero business writes');
}finally{await db.close();}
