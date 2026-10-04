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
 await db.exec(linkedSql);await db.exec(linkedSql);
 const lockSql=readFileSync(new URL('../sql/pdf-field-position-lock.sql',import.meta.url),'utf8');
 assert.equal(lockSql,readFileSync(new URL('../supabase/migrations/20261004022050_v267_pdf_field_position_lock.sql',import.meta.url),'utf8'));
 await db.exec('begin');await db.exec(lockSql);await db.exec('rollback');
 assert.equal((await db.query("select strpos(pg_get_functiondef('private.aqari_pdf_editor_drafts(uuid,text,jsonb)'::regprocedure),'''locked''') as position")).rows[0].position,0);
 await db.exec(lockSql);await db.exec(lockSql);
 const inputsSql=readFileSync(new URL('../sql/pdf-field-inputs.sql',import.meta.url),'utf8');
 assert.equal(inputsSql,readFileSync(new URL('../supabase/migrations/20261004062402_v267_pdf_field_inputs.sql',import.meta.url),'utf8'));
 const beforeInputs=(await db.query("select md5(pg_get_functiondef('private.aqari_pdf_editor_drafts(uuid,text,jsonb)'::regprocedure)) as hash")).rows[0].hash;
 await db.exec('begin');await db.exec(inputsSql);await db.exec('rollback');assert.equal((await db.query("select md5(pg_get_functiondef('private.aqari_pdf_editor_drafts(uuid,text,jsonb)'::regprocedure)) as hash")).rows[0].hash,beforeInputs);
 await db.exec(inputsSql);await db.exec(inputsSql);await actor();
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
 const linkedSnap=structuredClone(snap);linkedSnap.mapping.fields[0].dataKey='aqari_source_tenant_name';linkedSnap.mapping.fields.push({...linkedSnap.mapping.fields[0],id:'f2',page:2});linkedSnap.values.f2=linkedSnap.values.f1;
 const linkedData={...next,expected_revision:2,request_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',snapshot:linkedSnap};
 assert.deepEqual((await rpc('save',linkedData)).snapshot,linkedSnap);
 for(const mutate of [s=>s.mapping.fields[0].dataKey=null,s=>s.mapping.fields[0].dataKey='',s=>s.mapping.fields[1].type='date',s=>s.values.f2='conflicting']){
  const bad=structuredClone(linkedSnap);mutate(bad);await assert.rejects(rpc('save',{...linkedData,expected_revision:3,request_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',snapshot:bad}),/INVALID_PDF_DRAFT/);
 }
 const lockedSnap=structuredClone(linkedSnap);lockedSnap.mapping.fields[0].locked=true;lockedSnap.mapping.fields[1].locked=false;
 const lockedData={...linkedData,expected_revision:3,request_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',snapshot:lockedSnap};
 assert.deepEqual((await rpc('save',lockedData)).snapshot,lockedSnap);
 assert.deepEqual((await rpc('get',{id,property_id:p})).snapshot,lockedSnap);
 for(const invalid of [null,'true',1,0,{},[]]){
  const bad=structuredClone(lockedSnap);bad.mapping.fields[0].locked=invalid;
  await assert.rejects(rpc('save',{...lockedData,expected_revision:4,request_id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',snapshot:bad}),/INVALID_PDF_DRAFT/);
 }
 const inputSnap=structuredClone(lockedSnap);inputSnap.mapping.fields.forEach(f=>{f.type='select';f.options=['A','B'];});inputSnap.mapping.fields[1].required=false;inputSnap.values={f1:'A',f2:'A'};
 const inputData={...lockedData,expected_revision:4,request_id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',snapshot:inputSnap};
 assert.deepEqual((await rpc('save',inputData)).snapshot,inputSnap);
 assert.deepEqual((await rpc('get',{id,property_id:p})).snapshot,inputSnap);
 for(const mutate of [s=>s.mapping.fields[0].options=[],s=>s.mapping.fields[0].options=null,s=>s.mapping.fields[0].options={},s=>s.mapping.fields[0].options=['a','a'],s=>s.mapping.fields[0].options=[' a'],s=>s.mapping.fields[0].options=[1],s=>s.mapping.fields[0].options=['a'.repeat(101)],s=>s.mapping.fields[0].options=Array.from({length:51},(_,i)=>String(i)),s=>s.mapping.fields[0].required='false',s=>s.mapping.fields[0].required=null,s=>s.mapping.fields[1].options=['A','C']]){
  const bad=structuredClone(inputSnap);mutate(bad);await assert.rejects(rpc('save',{...inputData,expected_revision:5,request_id:'ffffffff-ffff-4fff-8fff-ffffffffffff',snapshot:bad}),/INVALID_PDF_DRAFT/);
 }
 const civilSnap=structuredClone(inputSnap);civilSnap.mapping.fields.forEach(f=>{f.type='civil_id';delete f.options;});civilSnap.values={f1:'123',f2:'123'};
 assert.deepEqual((await rpc('save',{...inputData,expected_revision:5,request_id:'ffffffff-ffff-4fff-8fff-ffffffffffff',snapshot:civilSnap})).snapshot,civilSnap,'drafts preserve incomplete input for later correction');
 console.log('PASS PDF input types: optional/select/civil draft roundtrip, options/required/link validation, partial input preserved, rollback and idempotency');
 console.log('PASS PDF position lock: roundtrip, strict boolean validation, migration rollback, idempotency and prior authorization guards');
 console.log('PASS linked PDF drafts: roundtrip, cross-page values, conflicting values/types rejected, migration idempotent');

 // Staff approval and filling: isolated scope fixtures, no production users.
 await db.exec('reset role');
 await db.exec(`alter table public.aqari_documents add column checksum_sha256 text;
 create table private.aqari_staff_assignments(workspace_id uuid,user_id uuid,operational_role text,property_ids uuid[],is_active boolean);
 create table public.aqari_workspace_controls(workspace_id uuid,settings jsonb);
 create function private.aqari_section_keys() returns text[] language sql as $$select array['home','properties','tenants','contracts','collections','documents','notifications','reports','finance','employees','maintenance','partners']$$;`);
 const scopeSql=readFileSync(new URL('../sql/staff-property-scope.sql',import.meta.url),'utf8');
 const ceiling=scopeSql.slice(scopeSql.indexOf('create function private.aqari_staff_ceiling'),scopeSql.indexOf('revoke all on function private.aqari_staff_ceiling'));
 const propertyScope=scopeSql.slice(scopeSql.indexOf('create function private.aqari_can_property'),scopeSql.indexOf('create function private.aqari_can_lease'));
 await db.exec(ceiling);await db.exec(propertyScope);
 // This fixture limits filling to property managers; hosted acceptance also
 // exercises the actual current membership and operational-role ceilings.
 await db.exec(`create or replace function private.aqari_can(w uuid,s text,a text) returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from public.aqari_memberships m where m.workspace_id=w and m.user_id=auth.uid() and m.is_active and
 (m.role='general_manager' or exists(select 1 from private.aqari_staff_assignments x where x.workspace_id=w and x.user_id=auth.uid() and x.is_active and
 ((m.role='property_manager' and x.operational_role='property_manager') or (m.role='viewer' and x.operational_role='viewer') or (m.role='accountant' and x.operational_role='collector'))
 and private.aqari_staff_ceiling(x.operational_role,s,a))))$$;`);
 const staff='10000000-0000-4000-8000-000000000001',viewer='10000000-0000-4000-8000-000000000002',collector='10000000-0000-4000-8000-000000000003',staffDraft='10000000-0000-4000-8000-000000000004',requestId='10000000-0000-4000-8000-000000000005';
 await db.query("update public.aqari_documents set checksum_sha256=repeat('a',64),metadata=metadata||'{\"pdf_field_template\":true}'::jsonb");
 for(const [u,role,op]of [[staff,'property_manager','property_manager'],[viewer,'viewer','viewer'],[collector,'accountant','collector']]){
  await db.query('insert into public.aqari_memberships values($1,$2,$3,true)',[w,u,role]);
  await db.query('insert into private.aqari_staff_assignments values($1,$2,$3,$4,true)',[w,u,op,[p]]);
 }
 const staffSql=readFileSync(new URL('../sql/pdf-staff-filling.sql',import.meta.url),'utf8');
 assert.equal(staffSql,readFileSync(new URL('../supabase/migrations/20261004065734_v267_pdf_staff_filling.sql',import.meta.url),'utf8'));
 await db.exec('begin');await db.exec(staffSql);await db.exec('rollback');
 assert.equal((await db.query("select to_regclass('private.aqari_pdf_template_approvals') as relation")).rows[0].relation,null);
 await db.exec(staffSql);await db.exec(staffSql);
 const templates=async(action,payload)=>(await db.query('select public.aqari_pdf_templates($1,$2,$3) as result',[w,action,{property_id:p,...payload}])).rows[0].result;
 const published=structuredClone(civilSnap);published.mapping.title='Published test model';
 const staffData={id:staffDraft,property_id:p,document_id:doc,expected_revision:0,request_id:requestId,snapshot:published};
 await actor(staff);await assert.rejects(templates('context',{document_id:doc}),/ACCESS_DENIED/);await assert.rejects(rpc('save',staffData),/ACCESS_DENIED/);
 await assert.rejects(templates('publish',{document_id:doc,mapping:published.mapping}),/ACCESS_DENIED/);
 await actor();assert.equal((await templates('publish',{document_id:doc,mapping:published.mapping})).approved,true);
 await templates('publish',{document_id:doc,mapping:published.mapping});
 await assert.rejects(templates('publish',{document_id:doc,mapping:{...published.mapping,title:'Tampered'}}),/PDF_TEMPLATE_IMMUTABLE/);
 await actor(staff);assert.equal((await templates('context',{document_id:doc})).can_publish,false);
 assert.equal((await templates('list',{})).items.length,1);
 assert.deepEqual((await rpc('save',staffData)).snapshot,published);assert.equal((await rpc('save',staffData)).revision,1);
 assert.deepEqual((await rpc('get',{id:staffDraft,property_id:p})).snapshot,published);
 for(const mutate of [m=>m.title='Changed',m=>m.fields[0].x=.1,m=>m.fields[0].color='#ff0000',m=>m.fields[0].label='Changed',m=>m.fields[0].required=false,m=>m.fields[0].fontSize=14]){
  const bad=structuredClone(staffData);mutate(bad.snapshot.mapping);bad.expected_revision=1;bad.request_id='10000000-0000-4000-8000-000000000006';
  await assert.rejects(rpc('save',bad),/PDF_TEMPLATE_IMMUTABLE/);
 }
 await assert.rejects(rpc('get',{id,property_id:p}),/ACCESS_DENIED/);
 await templates('request',{id:requestId,document_id:doc,reason:'Please enlarge this field'});await templates('request',{id:requestId,document_id:doc,reason:'Please enlarge this field'});
 await assert.rejects(templates('request',{id:requestId,document_id:doc,reason:'Different request'}),/PDF_TEMPLATE_RETRY_CONFLICT/);
 await assert.rejects(templates('respond',{id:requestId,response:'Unauthorized response'}),/ACCESS_DENIED/);
 await assert.rejects(templates('revoke',{document_id:doc}),/ACCESS_DENIED/);
 for(const u of [viewer,collector]){await actor(u);await assert.rejects(templates('context',{}),/ACCESS_DENIED/);await assert.rejects(rpc('get',{id:staffDraft,property_id:p}),/ACCESS_DENIED/);}
 await actor();await templates('respond',{id:requestId,response:'Reviewed; publish a new corrected version.'});await assert.rejects(templates('respond',{id:requestId,response:'Overwrite response'}),/PDF_TEMPLATE_RESPONSE_EXISTS/);
 await actor(staff);assert.match((await templates('requests',{})).items[0].response,/Reviewed/);
 await db.exec('reset role');await db.query('update private.aqari_staff_assignments set property_ids=$1 where user_id=$2',[[other],staff]);await actor(staff);
 await assert.rejects(templates('context',{}),/ACCESS_DENIED/);await assert.rejects(rpc('get',{id:staffDraft,property_id:p}),/ACCESS_DENIED/);
 await db.exec('reset role');await db.query('update private.aqari_staff_assignments set property_ids=$1 where user_id=$2',[[p],staff]);await actor();await templates('revoke',{document_id:doc});
 await actor(staff);assert.equal((await templates('list',{})).items.length,0);assert.equal((await rpc('list',{property_id:p})).items.length,0);await assert.rejects(rpc('get',{id:staffDraft,property_id:p}),/ACCESS_DENIED/);
 await actor();await templates('publish',{document_id:doc,mapping:published.mapping});
 await db.exec('reset role');await db.query("update public.aqari_documents set checksum_sha256=repeat('b',64) where id=$1",[doc]);await actor(staff);await assert.rejects(templates('context',{document_id:doc}),/ACCESS_DENIED/);
 await db.exec('reset role');await db.query("update public.aqari_documents set checksum_sha256=repeat('a',64) where id=$1",[doc]);
 for(const table of ['aqari_pdf_template_approvals','aqari_pdf_template_requests','aqari_pdf_template_events']){await actor(staff);await assert.rejects(db.query('select * from private.'+table),/permission denied/);}
 await db.exec('reset role;set role anon');await assert.rejects(templates('list',{}),/permission denied/);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from private.aqari_pdf_template_requests')).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from private.aqari_pdf_template_events')).rows[0].n,3);
 console.log('PASS staff PDF: manager approval, immutable map, own drafts, role/property isolation, revocation, checksum binding, change requests, immutable response, retries, RLS and no business writes');
 await actor();


 // Template lineage: two managers retain candidates; one base can advance once.
 await db.exec('reset role');
 const versionSql=readFileSync(new URL('../sql/pdf-template-versions.sql',import.meta.url),'utf8');
 assert.equal(versionSql,readFileSync(new URL('../supabase/migrations/20261004075240_v267_pdf_template_versions.sql',import.meta.url),'utf8'));
 await db.exec('begin');await db.exec(versionSql);await db.exec('rollback');
 assert.equal((await db.query("select to_regclass('private.aqari_pdf_template_versions') r")).rows[0].r,null);
 await db.exec(versionSql);await db.exec(versionSql);await actor();
 assert.equal((await templates('context',{document_id:doc})).template_version.revision,1);
 const nextDoc='20000000-0000-4000-8000-000000000001',competing='20000000-0000-4000-8000-000000000002',copyDoc='20000000-0000-4000-8000-000000000003',targetP='20000000-0000-4000-8000-000000000004';
 await db.exec('reset role');
 await db.query('insert into public.aqari_properties values($1,$2,$3)',[targetP,w,'target-property']);
 for(const [d,prop,ref] of [[nextDoc,p,'property'],[competing,p,'property'],[copyDoc,targetP,'target-property']])await db.query('insert into public.aqari_documents values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[d,w,'uploaded','application/pdf','property',ref,'property_document',{category:'property_other',asset_role:'property_contract',property_id:prop,pdf_field_template:true},'a'.repeat(64)]);
 await actor();const origin={kind:'revision',document_id:doc,revision:1};
 assert.equal((await templates('publish',{document_id:nextDoc,mapping:published.mapping,origin})).revision,2);
 assert.equal((await templates('publish',{document_id:nextDoc,mapping:published.mapping,origin})).revision,2);
 await actor(other);await assert.rejects(templates('publish',{document_id:competing,mapping:published.mapping,origin}),/PDF_TEMPLATE_REVISION_CONFLICT/);
 assert.equal((await templates('context',{document_id:competing})).approved,false);
 const history=(await templates('history',{document_id:doc})).items;assert.deepEqual(history.map(v=>v.revision),[2,1]);assert.equal(history[0].is_latest,true);assert.equal(history[1].is_latest,false);
 assert.deepEqual((await templates('list',{})).items.map(v=>v.document_id),[nextDoc]);
 await actor(staff);assert.equal((await templates('context',{document_id:doc})).approved,true,'old staff drafts remain on their exact approved version');
 await assert.rejects(templates('history',{document_id:doc}),/ACCESS_DENIED/);
 await assert.rejects(templates('publish',{document_id:competing,mapping:published.mapping,origin}),/ACCESS_DENIED/);
 await assert.rejects(db.query('select * from private.aqari_pdf_template_versions'),/permission denied/);
 await assert.rejects(db.query('select private.aqari_pdf_templates_v400($1,$2,$3)',[w,'publish',{property_id:p,document_id:competing,mapping:published.mapping}]),/permission denied/);
 await actor();
 assert.equal((await templates('publish',{property_id:targetP,document_id:copyDoc,mapping:{...published.mapping,propertyId:targetP},origin:{kind:'copy',document_id:nextDoc,property_id:p}})).revision,1);
 const copied=(await templates('history',{property_id:targetP,document_id:copyDoc})).items;assert.equal(copied.length,1);assert.equal(copied[0].copied_from_document_id,nextDoc);
 await templates('revoke',{document_id:nextDoc});await actor(staff);assert.equal((await templates('list',{})).items.length,0,'revoking head does not silently restore an old version');
 await db.exec('reset role;set role anon');await assert.rejects(templates('history',{document_id:doc}),/permission denied/);await actor();
 console.log('PASS PDF versions: migration rollback/idempotency, immutable history, two-manager stale-base rejection, exact retry, latest-only list, old draft access, cross-property independent family, direct/anonymous/staff denial');
 await db.exec('reset role');await db.query('update public.aqari_memberships set is_active=false where user_id=$1',[owner]);await actor();await assert.rejects(rpc('get',{id,property_id:p}),/ACCESS_DENIED/);await assert.rejects(rpc('save',next),/ACCESS_DENIED/);
 await db.exec('reset role;set role anon');await assert.rejects(rpc('list',{property_id:p}),/permission denied/);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int as n from private.aqari_pdf_editor_drafts')).rows[0].n,2);assert.equal((await db.query('select payload from public.aqari_app_state')).rows[0].payload.payments[0],'untouched');assert.equal((await db.query('select count(*)::int n from public.aqari_leases')).rows[0].n,1);
 console.log('PASS PDF draft SQL: create, readback, restore, CAS conflict, retry identity, owner/workspace/document isolation, revoked access, anonymous/direct denial, validation, rollback and zero business writes');
}finally{await db.close();}
