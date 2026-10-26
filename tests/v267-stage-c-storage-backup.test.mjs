import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {snapshot,transferSnapshot,PROTOCOL} from '../supabase/functions/_shared/storage-restore-v2.js';

const edge=fs.readFileSync('supabase/functions/aqari-stage-c-storage-export/index.ts','utf8');
const ui=fs.readFileSync('src/v267/pages/owner-experience-settings.js','utf8');
const translations=fs.readFileSync('src/v267/components/visible-translations-a.js','utf8');
const dbExport=fs.readFileSync('supabase/migrations/20261001121500_stage_c_server_backup_export.sql','utf8');
const receiver=fs.readFileSync('supabase/functions/stage-c-storage-receiver-20261001/index.ts','utf8');
const restoreSql=fs.readFileSync('staging-database/supabase/migrations/20261001153500_stage_c_storage_restore_finalize.sql','utf8');

test('Stage C Storage export is user-authenticated, manager-only and AAL2-only',()=>{
  assert.match(edge,/withSupabase\(\{auth:"user"\},/);
  assert.match(edge,/aal!=="aal2"/);
  assert.match(edge,/access\?\.role!=="general_manager"/);
  assert.match(edge,/aqari_workspace_access/);
  assert.doesNotMatch(edge,/createBucket\(|\.upload\(|\.remove\(|deleteObject|service_role/i);
});

test('Storage export is bounded to approved private buckets and workspace paths',()=>{
  for(const bucket of ['aqari-documents','aqari-hr-private','aqari-maintenance-private'])assert.match(edge,new RegExp(bucket));
  assert.match(edge,/\.list\(prefix,/);
  assert.doesNotMatch(edge,/\.schema\("storage"\)/);
  assert.match(edge,/MAX_OBJECTS=5000/);
  assert.match(edge,/MAX_BYTES=64\*1024\*1024/);
  assert.match(edge,/safePath\(name,workspaceId\)/);
  assert.match(edge,/sha256\(bytes\)/);
  assert.match(edge,/manifest\.json/);
  assert.match(edge,/x-aqari-backup-sha256/);
  assert.match(edge,/zipSync\(files,\{level:0\}\)/);
});

test('Manager UI invokes only the authenticated project function and downloads the returned ZIP',()=>{
  assert.match(ui,/aqari-stage-c-storage-export/);
  assert.match(ui,/AQARI_SUPABASE\.getSession\(\)/);
  assert.match(ui,/Authorization:'Bearer '\+auth\.access_token/);
  assert.match(ui,/apikey:cfg\.supabasePublishableKey/);
  assert.match(ui,/credentials:'omit'/);
  assert.match(ui,/redirect:'error'/);
  assert.match(ui,/workspaceId:d\.session\.bound\.workspace,restoreToIsolated:true/);
  assert.match(ui,/x-aqari-restore-verified/);
  assert.match(ui,/URL\.createObjectURL\(blob\)/);
  assert.match(ui,/link\.download=savedName/);
  assert.match(ui,/MFA_REQUIRED/);
});

test('Storage backup controls are translated in all five supported interface languages',()=>{
  assert.match(translations,/"تنزيل نسخة احتياطية للملفات الأصلية"/);
  for(const value of [
    '"ar": "تنزيل نسخة احتياطية للملفات الأصلية"',
    '"en": "Download original files backup"',
    '"hi": "मूल फ़ाइलों का बैकअप डाउनलोड करें"',
    '"ur": "اصل فائلوں کا بیک اپ ڈاؤن لوڈ کریں"',
    '"ml": "അസൽ ഫയലുകളുടെ ബാക്കപ്പ് ഡൗൺലോഡ് ചെയ്യുക"'
  ])assert.ok(translations.includes(value),value);
});

test('Database and Auth export helpers remain server-only',()=>{
  assert.match(dbExport,/current_setting\('role',true\).*service_role/s);
  assert.match(dbExport,/n\.nspname='auth'/);
  assert.match(dbExport,/left\(c\.relname,6\)='aqari_'/);
  assert.match(dbExport,/revoke all on function public\.v267_stage_c_backup_catalog\(\) from public,anon,authenticated/);
  assert.match(dbExport,/revoke all on function public\.v267_stage_c_backup_table\(text,text,integer,integer\) from public,anon,authenticated/);
  assert.match(dbExport,/grant execute on function public\.v267_stage_c_backup_catalog\(\) to service_role/);
  assert.match(dbExport,/grant execute on function public\.v267_stage_c_backup_table\(text,text,integer,integer\) to service_role/);
  assert.match(dbExport,/c\.relname in\('users','identities','mfa_factors'\)/);
  assert.match(dbExport,/auth_transient_counts/);
  for(const transient of ['refresh_tokens','sessions','one_time_tokens','mfa_challenges']){
    assert.ok(dbExport.includes(transient),transient+' count must remain visible for recovery comparison');
  }
  assert.doesNotMatch(dbExport,/c\.relname in\('users','identities','mfa_factors','sessions'/);
});

test('one-click Storage restore forwards only the signed manager JWT and requires verified target completion',()=>{
  assert.match(edge,/RESTORE_TARGET/);
  assert.match(edge,/restoreToIsolated/);
  assert.match(edge,/transferSnapshot\(fetch,RESTORE_TARGET,authorization/);
  assert.match(edge,/ISOLATED_STORAGE_RESTORE_UNCONFIRMED/);
  assert.match(edge,/RESTORE_CONFIGURATION_PENDING/);
  assert.match(edge,/x-aqari-restore-verified/);
  assert.doesNotMatch(edge,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(edge,/x-aqari-stage-c-token/);
});

test('isolated receiver validates the source session, AAL2 and general manager role before writing',()=>{
  assert.match(receiver,/SOURCE_URL\+'\/auth\/v1\/user'/);
  assert.match(receiver,/aqari_workspace_access/);
  assert.match(receiver,/claim\?\.aal!=='aal2'/);
  assert.match(receiver,/access\?\.role!=='general_manager'/);
  assert.match(receiver,/readHash!==claimedSha/);
  assert.match(receiver,/v267_stage_c_restore_storage_record/);
  assert.match(receiver,/v267_stage_c_restore_storage_finalize/);
  assert.doesNotMatch(receiver,/x-aqari-stage-c-token/);
  assert.doesNotMatch(receiver,/const TOKEN=/);
});

test('isolated restore SQL is service-role-only and cannot finalize before DB/Auth verification',()=>{
  assert.match(restoreSql,/current_setting\('role',true\) is distinct from 'service_role'/);
  assert.match(restoreSql,/DATABASE_AUTH_NOT_VERIFIED/);
  assert.match(restoreSql,/STORAGE_RESTORE_MISMATCH/);
  assert.match(restoreSql,/storage_bytes_restored',true/);
  assert.match(restoreSql,/revoke all on function public\.v267_stage_c_restore_storage_finalize/);
  assert.match(restoreSql,/grant execute on function public\.v267_stage_c_restore_storage_finalize.*service_role/);
});

test('one-click recovery success and failure copy are localized',()=>{
  assert.match(translations,/"تم تنزيل النسخة الاحتياطية للملفات والتحقق من الاستعادة المعزولة\. عدد الملفات: "/);
  assert.match(translations,/"لم تتأكد الاستعادة المعزولة للملفات؛ لم تُعتمد النسخة بعد\."/);
});

// Run the actual Edge handler with synthetic Supabase/ZIP adapters.
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
function storageHandler(catalogPage,options={}) {
  let zipCalls=0;
  let zipFiles;
  const source=stripTypeScriptTypes(edge.replace(/^import .*;$/gm,'').replace('export default ','globalThis.edgeModule='));
  const workspace='11111111-1111-4111-8111-111111111111';
  const caller='22222222-2222-4222-8222-222222222222';
  let schemaCalls=0;
  const query={select(){return this},in(){return this},like(){return this},order(){return this},range:async()=>({error:{code:'PGRST106',message:'Invalid schema: storage'}})};
  const ctx={userClaims:{id:caller},jwtClaims:{aal:'aal2'},supabase:{rpc:async()=>({data:{workspace_id:workspace,user_id:caller,role:'general_manager'}})},supabaseAdmin:{schema:()=>{schemaCalls++;return {from:()=>query}},storage:{from:bucket=>({list:(prefix,params)=>catalogPage({bucket,prefix,...params}),download:options.download|| (async()=>({data:new Blob(['x'])}))})}}};
  options.configureContext?.(ctx);
  const sandbox={snapshot,transferSnapshot,URL,Request,Response,Headers,Blob,Uint8Array,crypto,btoa,AbortSignal,fetch:options.fetch||(()=>{throw new Error('Unexpected outbound fetch')}),Deno:{env:{get:name=>name==='AQARI_RESTORE_ALLOWED_ORIGIN'?(options.previewOrigin||''):name==='AQARI_STORAGE_RESTORE_V2_ENABLED'?'true':'https://ofgmcsmxmdswlovsckqs.supabase.co'}},withSupabase:(_,handler)=>req=>handler(req,ctx),strToU8:s=>new TextEncoder().encode(s),zipSync:files=>{zipCalls++;zipFiles=files;return new Uint8Array([1])}};
  vm.runInNewContext(source,sandbox);
  return {run:(body={},headers={})=>sandbox.edgeModule.fetch(new Request('https://synthetic.test',{method:'POST',headers,body:JSON.stringify({workspaceId:workspace,...body})})),zipCalls:()=>zipCalls,zipFiles:()=>zipFiles,schemaCalls:()=>schemaCalls,workspace};
}

const workspace='11111111-1111-4111-8111-111111111111';
const file=(name,metadata={})=>({id:'fixture-'+name,name,metadata:{size:1,...metadata}});
const documents=rows=>async({bucket,prefix,offset,limit})=>({data:bucket==='aqari-documents'&&prefix===workspace?rows.slice(offset,offset+limit):[]});

test('Storage backup works when PostgREST does not expose the storage schema',async()=>{
  const app=storageHandler(documents([file('contract.pdf')]));
  const response=await app.run();
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-aqari-backup-object-count'),'1');
  assert.equal(app.schemaCalls(),0);
});

test('Storage export includes 1201 objects even when the server caps each page at 200',async()=>{
  const calls=[];
  const app=storageHandler(async({bucket,prefix,offset,limit,sortBy})=>{
    assert.equal(prefix,workspace);
    assert.equal(limit,500);
    assert.equal(sortBy.column,'name');
    assert.equal(sortBy.order,'asc');
    if(bucket!=='aqari-documents')return {data:[]};
    calls.push(offset);
    return {data:Array.from({length:Math.max(0,Math.min(200,1201-offset))},(_,i)=>file((offset+i)+'.pdf'))};
  });
  const response=await app.run();
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-aqari-backup-object-count'),'1201');
  const scan=[0,200,400,600,800,1000,1200,1201];
  assert.deepEqual(calls,[...scan,...scan]);
  assert.equal(app.zipCalls(),1);
});

for(const [name,makePage,error] of [
 ['missing data',()=>({}),'STORAGE_CATALOG_FAILED'],
 ['non-array data',()=>({data:{}}),'STORAGE_CATALOG_FAILED'],
 ['oversized page',()=>({data:Array.from({length:501},(_,i)=>file(i+'.pdf'))}),'STORAGE_CATALOG_FAILED'],
 ['repeated page',()=>({data:[file('same.pdf')]}),'STORAGE_CATALOG_CHANGED'],
 ['duplicate objects',()=>({data:[file('same'),file('same')]}),'STORAGE_CATALOG_CHANGED'],
 ['missing size',()=>({data:[{id:'fixture',name:'contract.pdf',metadata:{}}]}),'STORAGE_CATALOG_FAILED'],
 ['invalid size',()=>({data:[file('contract.pdf',{size:-1})]}),'STORAGE_CATALOG_FAILED'],
 ['missing id',()=>({data:[{name:'contract.pdf',metadata:{size:1}}]}),'STORAGE_CATALOG_FAILED'],
 ['catalog error',()=>({error:new Error('failed')}),'STORAGE_CATALOG_FAILED']
]) test('Storage export rejects '+name+' before producing a ZIP',async()=>{
 const app=storageHandler(async params=>makePage(params));
 const response=await app.run();
 assert.equal((await response.json()).error,error);
 assert.equal(app.zipCalls(),0);
});

for(const name of ['../outside.pdf','nested/contract.pdf','..','.','',String.raw`folder\file.pdf`,'bad\u0000.pdf'])test('Storage export rejects unsafe relative entry '+JSON.stringify(name),async()=>{
 const app=storageHandler(documents([file(name)]));
 assert.equal((await (await app.run()).json()).error,'INVALID_STORAGE_PATH');
 assert.equal(app.zipCalls(),0);
});

test('Storage export walks nested folders in all three buckets within the authorized workspace',async()=>{
 const visited=[];
 const buckets=['aqari-documents','aqari-hr-private','aqari-maintenance-private'];
 const app=storageHandler(async({bucket,prefix,offset})=>{
   assert.ok(buckets.includes(bucket));
   assert.ok(prefix===workspace||prefix===workspace+'/nested');
   visited.push([bucket,prefix]);
   return {data:offset?[]:prefix===workspace?[{name:'nested',id:null,metadata:null},file('root.pdf')]:[file('child.pdf')]};
 });
 const response=await app.run();
 assert.equal(response.status,200);
 assert.equal(response.headers.get('x-aqari-backup-object-count'),'6');
 const manifest=JSON.parse(new TextDecoder().decode(app.zipFiles()['manifest.json']));
 assert.deepEqual(manifest.objects.map(row=>row.bucket+'/'+row.name).sort(),buckets.flatMap(bucket=>[bucket+'/'+workspace+'/root.pdf',bucket+'/'+workspace+'/nested/child.pdf']).sort());
 assert.equal(new Set(visited.map(row=>row.join('/'))).size,6);
});

test('Storage export rejects more than 5000 objects before downloads',async()=>{
 let downloaded=false;
 const app=storageHandler(documents(Array.from({length:5001},(_,i)=>file(i+'.pdf'))),{download:async()=>{downloaded=true;throw Error('unexpected download')}});
 assert.equal((await (await app.run()).json()).error,'BACKUP_OBJECT_LIMIT');
 assert.equal(downloaded,false);
 assert.equal(app.zipCalls(),0);
});

test('Storage export bounds folder traversal depth',async()=>{
 const app=storageHandler(async({offset})=>({data:offset?[]:[{name:'nested',id:null,metadata:null}]}));
 assert.equal((await (await app.run()).json()).error,'BACKUP_CATALOG_LIMIT');
 assert.equal(app.zipCalls(),0);
});

test('Storage export rejects a catalog exceeding the byte budget before downloads',async()=>{
 let downloaded=false;
 const app=storageHandler(documents([file('large.pdf',{size:64*1024*1024+1})]),{download:async()=>{downloaded=true;throw Error('unexpected download')}});
 assert.equal((await (await app.run()).json()).error,'BACKUP_SIZE_LIMIT');
 assert.equal(downloaded,false);
 assert.equal(app.zipCalls(),0);
});

for(const [name,changed] of [
 ['added file',[file('contract.pdf'),file('new.pdf')]],
 ['removed file',[]],
 ['replaced object',[{...file('contract.pdf'),id:'replacement'}]],
 ['changed etag',[file('contract.pdf',{eTag:'new-etag'})]],
 ['changed timestamp',[{...file('contract.pdf'),updated_at:'2026-10-01T19:00:00Z'}]]
])test('Storage export rejects '+name+' during backup before finalizing',async()=>{
 let scans=0;
 const outbound=[];
 const app=storageHandler(async({bucket,prefix,offset})=>{
   if(bucket!=='aqari-documents'||prefix!==workspace||offset)return {data:[]};
   return {data:++scans===1?[file('contract.pdf')]:changed};
 },{fetch:async(url,init)=>{const body=JSON.parse(init.body);outbound.push(body.action);return Response.json({ok:true,sha256:body.sha256})}});
 const response=await app.run({restoreToIsolated:true},{authorization:'Bearer synthetic-token'});
 assert.equal(response.status,409);
 assert.equal((await response.json()).error,'STORAGE_CATALOG_CHANGED');
 assert.deepEqual(outbound,[]);
 assert.equal(app.zipCalls(),0);
});

test('Storage export rejects downloaded bytes that no longer match the catalog size',async()=>{
 const app=storageHandler(documents([file('contract.pdf',{size:2})]));
 assert.equal((await (await app.run()).json()).error,'STORAGE_CATALOG_CHANGED');
 assert.equal(app.zipCalls(),0);
});

// Execute actual export handler through the v2 binary protocol.
test('export verifies the entire immutable snapshot before returning a ZIP',async()=>{
 let plan;const calls=[];
 const app=storageHandler(documents([file('contract.pdf')]),{fetch:async(url,init)=>{
  assert.equal(url,'https://nlqynpmilcdqztwrrvyu.supabase.co/functions/v1/aqari-storage-restore-v2');
  assert.equal(init.headers.authorization,'Bearer synthetic-manager');
  if(init.headers['content-type']==='application/octet-stream'){
   const object=JSON.parse(decodeURIComponent(init.headers['x-aqari-object']));calls.push('object');
   assert.equal(init.body.length,1);return Response.json({ok:true,protocol:PROTOCOL,runId:plan.runId,sha256:object.sha256});
  }
  const body=JSON.parse(init.body);calls.push(body.action);
  if(body.action==='begin'){plan=body;return Response.json({ok:true,protocol:PROTOCOL,runId:plan.runId});}
  return Response.json({ok:true,protocol:PROTOCOL,runId:plan.runId,snapshotHash:plan.snapshotHash,verified:true,count:plan.count,bytes:plan.bytes});
 }});
 const response=await app.run({restoreToIsolated:true},{authorization:'Bearer synthetic-manager'});
 assert.equal(response.status,200);assert.deepEqual(calls,['begin','object','finalize']);
 const manifest=JSON.parse(new TextDecoder().decode(app.zipFiles()['manifest.json']));
 assert.equal(manifest.isolated_restore.run_id,plan.runId);assert.equal(manifest.isolated_restore.scope,'storage_only');
 assert.equal(response.headers.get('x-aqari-restore-verified'),'true');
});
for(const failure of ['network','protocol','hash','finalize'])test('export cannot claim verified restore after '+failure+' failure',async()=>{
 let plan;
 const app=storageHandler(documents([file('contract.pdf')]),{fetch:async(url,init)=>{
  if(failure==='network')throw Error('network');
  if(failure==='protocol')return Response.json({ok:true});
  if(init.headers['content-type']==='application/octet-stream'){
   const o=JSON.parse(decodeURIComponent(init.headers['x-aqari-object']));return Response.json({ok:true,protocol:PROTOCOL,runId:plan.runId,sha256:failure==='hash'?'0'.repeat(64):o.sha256});
  }
  const b=JSON.parse(init.body);if(b.action==='begin'){plan=b;return Response.json({ok:true,protocol:PROTOCOL,runId:plan.runId});}
  return Response.json({ok:true,protocol:PROTOCOL,runId:plan.runId,verified:false});
 }});
 const response=await app.run({restoreToIsolated:true},{authorization:'Bearer synthetic-manager'});
 assert.equal(response.status,502);assert.equal(app.zipCalls(),0);assert.equal(response.headers.get('x-aqari-restore-verified'),null);
});
for(const [name,configureContext,authorization] of [
 ['missing token',()=>{},''],
 ['AAL1',ctx=>{ctx.jwtClaims.aal='aal1'},'Bearer synthetic'],
 ['employee',ctx=>{ctx.supabase.rpc=async()=>({data:{role:'employee'}})},'Bearer synthetic']
])test('export rejects '+name+' before restoration',async()=>{
 const app=storageHandler(documents([file('contract.pdf')]),{configureContext});
 const response=await app.run({restoreToIsolated:true},{authorization});assert.equal(response.status,403);assert.equal(app.zipCalls(),0);
});

const configuredPreview='https://aqari-17744528p-m-vib-5421.vercel.app';
test('explicit configured preview gets matching CORS without changing authentication',async()=>{
 const app=storageHandler(documents([]),{previewOrigin:configuredPreview});
 const response=await app.run({}, {origin:configuredPreview});
 assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),configuredPreview);
});
for(const origin of ['https://evil.invalid','https://aqari-17744528p-other-team.vercel.app',configuredPreview+'/',configuredPreview+'?token=x'])test('restore refuses to reflect an unapproved configured origin '+origin,async()=>{
 const app=storageHandler(documents([]),{previewOrigin:origin});const response=await app.run({}, {origin});
 assert.notEqual(response.headers.get('access-control-allow-origin'),origin);
});
test('a different preview cannot inherit the configured preview permission',async()=>{
 const app=storageHandler(documents([]),{previewOrigin:configuredPreview});const response=await app.run({}, {origin:'https://aqari-unconfigured-m-vib-5421.vercel.app'});
 assert.equal(response.headers.get('access-control-allow-origin'),'https://myaqari.com');
});
