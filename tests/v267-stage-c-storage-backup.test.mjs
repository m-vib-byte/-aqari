import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const edge=fs.readFileSync('supabase/functions/aqari-stage-c-storage-export/index.ts','utf8');
const ui=fs.readFileSync('src/v267/pages/owner-experience-settings.js','utf8');
const translations=fs.readFileSync('src/v267/components/visible-translations-a.js','utf8');
const dbExport=fs.readFileSync('supabase/migrations/20261001121500_stage_c_server_backup_export.sql','utf8');

test('Stage C Storage export is user-authenticated, manager-only and AAL2-only',()=>{
  assert.match(edge,/withSupabase\(\{auth:"user"\},/);
  assert.match(edge,/aal!=="aal2"/);
  assert.match(edge,/access\?\.role!=="general_manager"/);
  assert.match(edge,/aqari_workspace_access/);
  assert.doesNotMatch(edge,/createBucket\(|\.upload\(|\.remove\(|deleteObject|service_role/i);
});

test('Storage export is bounded to approved private buckets and workspace paths',()=>{
  for(const bucket of ['aqari-documents','aqari-hr-private','aqari-maintenance-private'])assert.match(edge,new RegExp(bucket));
  assert.match(edge,/\.like\("name",workspaceId\+"\/%"\)/);
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
  assert.match(ui,/workspaceId:d\.session\.bound\.workspace/);
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

// Run the actual Edge handler with synthetic Supabase/ZIP adapters.
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
function storageHandler(catalogPage) {
  let zipCalls=0;
  const source=stripTypeScriptTypes(edge.replace(/^import .*;$/gm,'').replace('export default {fetch};','globalThis.handler=fetch;'));
  const workspace='11111111-1111-4111-8111-111111111111';
  const caller='22222222-2222-4222-8222-222222222222';
  const query={select(){return this},in(){return this},like(){return this},order(){return this},range:catalogPage};
  const ctx={userClaims:{id:caller},jwtClaims:{aal:'aal2'},supabase:{rpc:async()=>({data:{workspace_id:workspace,user_id:caller,role:'general_manager'}})},supabaseAdmin:{schema:()=>({from:()=>query}),storage:{from:()=>({download:async()=>({data:new Blob(['x'])})})}}};
  const sandbox={URL,Request,Response,Headers,Blob,Uint8Array,crypto,Deno:{env:{get:()=> 'https://synthetic.supabase.co'}},withSupabase:(_,handler)=>req=>handler(req,ctx),strToU8:s=>new TextEncoder().encode(s),zipSync:()=>{zipCalls++;return new Uint8Array([1])}};
  vm.runInNewContext(source,sandbox);
  return {run:()=>sandbox.handler(new Request('https://synthetic.test',{method:'POST',body:JSON.stringify({workspaceId:workspace})})),zipCalls:()=>zipCalls,workspace};
}

test('Storage export includes 1201 objects even when the server caps each page at 200',async()=>{
  const calls=[];
  const app=storageHandler(async(from,to)=>{
    calls.push(from);
    return {count:1201,data:Array.from({length:Math.min(200,1201-from)},(_,i)=>({bucket_id:'aqari-documents',name:app.workspace+'/'+(from+i)+'.pdf'}))};
  });
  const response=await app.run();
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-aqari-backup-object-count'),'1201');
  assert.deepEqual(calls,[0,200,400,600,800,1000,1200]);
  assert.equal(app.zipCalls(),1);
});

for(const [name,makePage,error] of [
 ['over limit',()=>({count:5001,data:[]}),'BACKUP_OBJECT_LIMIT'],
 ['missing count',()=>({data:[]}),'STORAGE_CATALOG_FAILED'],
 ['empty incomplete page',()=>({count:1,data:[]}),'STORAGE_CATALOG_INCOMPLETE'],
 ['count changes',from=>({count:from===0?2:3,data:[{bucket_id:'aqari-documents',name:'unused'}]}),'STORAGE_CATALOG_CHANGED'],
 ['duplicate objects',()=>({count:2,data:[{bucket_id:'aqari-documents',name:'same'},{bucket_id:'aqari-documents',name:'same'}]}),'STORAGE_CATALOG_CHANGED'],
 ['catalog error',()=>({error:new Error('failed')}),'STORAGE_CATALOG_FAILED']
]) test('Storage export rejects '+name+' before producing a ZIP',async()=>{
 const app=storageHandler(async from=>makePage(from));
 const response=await app.run();
 assert.equal((await response.json()).error,error);
 assert.equal(app.zipCalls(),0);
});
