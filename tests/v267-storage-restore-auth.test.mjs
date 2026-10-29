import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {stripTypeScriptTypes} from 'node:module';
import {receiverHandler,snapshot} from '../supabase/functions/_shared/storage-restore-v2.js';
const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/aqari-storage-restore-v2/index.ts','utf8').replace(/^import .*;$/gm,''));
const workspace='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222';
const jwt=claims=>'header.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.synthetic-signature';
function app({aal='aal2',userStatus=200,role='general_manager',wrongUser=false,wrongWorkspace=false,enabled=true,target='https://nlqynpmilcdqztwrrvyu.supabase.co',bucketLimit=25*1024*1024,bucketPublic=false,envOverrides={}}={}){
 let handler,writes=0;const urls=[];const env={AQARI_RESTORE_SOURCE_URL:'https://ofgmcsmxmdswlovsckqs.supabase.co',AQARI_RESTORE_SOURCE_PUBLIC_KEY:'synthetic-publishable',AQARI_RESTORE_WORKSPACE:workspace,AQARI_RESTORE_BUCKET:'synthetic-existing-bucket',SUPABASE_URL:target,AQARI_STORAGE_RESTORE_V2_ENABLED:enabled?'true':'false'};
 Object.assign(env,envOverrides);
 const ctx={Request,Response,URL,AbortSignal,atob,receiverHandler,MAX_BYTES:64*1024*1024,Deno:{env:{get:n=>env[n]},serve:h=>{handler=h}},createClient:()=>({rpc:async()=>{writes++;return {data:{}};},storage:{getBucket:async()=>({data:{public:bucketPublic,file_size_limit:bucketLimit}})}}),fetch:async(url,init)=>{urls.push(url);assert.equal(init.redirect,'error');assert.ok(init.signal instanceof AbortSignal);if(url.endsWith('/user'))return Response.json({id:wrongUser?'other':user},{status:userStatus});return Response.json({workspace_id:wrongWorkspace?'other':workspace,user_id:user,role});}};
 vm.runInNewContext(source,ctx);
 return {run:(body={action:'finalize',runId:'33333333-3333-4333-8333-333333333333'})=>handler(new Request('https://receiver.invalid',{method:'POST',headers:{authorization:'Bearer '+jwt({sub:user,aal}),'content-type':'application/json'},body:JSON.stringify(body)})),writes:()=>writes,urls};
}
for(const options of [{aal:'aal1'},{userStatus:401},{role:'employee'},{wrongUser:true},{wrongWorkspace:true}])test('real adapter refuses '+JSON.stringify(options)+' before database writes',async()=>{const a=app(options);assert.equal((await a.run()).status,403);assert.equal(a.writes(),0);});
for(const options of [{enabled:false},{target:'https://djkpkkgoibruaezdrchb.supabase.co'}])test('real adapter refuses disabled or production receiver '+JSON.stringify(options),async()=>{const a=app(options);assert.equal((await a.run()).status,503);assert.equal(a.urls.length,0);assert.equal(a.writes(),0);});
test('configuration diagnostics expose names only without credentials, workspace or network access',async()=>{
 const a=app({enabled:false,target:'https://djkpkkgoibruaezdrchb.supabase.co'}),r=await a.run(),body=await r.json();
 assert.equal(r.status,503);assert.deepEqual(body.configuration_issues,['AQARI_STORAGE_RESTORE_V2_ENABLED','SUPABASE_URL']);
 assert.doesNotMatch(JSON.stringify(body),/synthetic-publishable|11111111|djkpkkgoibruaezdrchb|Bearer/);
 assert.equal(a.urls.length,0);assert.equal(a.writes(),0);
});

const MiB=1024*1024;
test('safe source URL paste formatting and boolean casing retain the fixed source and auth checks',async()=>{
 const a=app({aal:'aal1',envOverrides:{AQARI_RESTORE_SOURCE_URL:' https://ofgmcsmxmdswlovsckqs.supabase.co/ ',AQARI_STORAGE_RESTORE_V2_ENABLED:' TRUE '}});
 assert.equal((await a.run()).status,403);assert.equal(a.writes(),0);
});
for(const [url,reason] of [
 ['https://djkpkkgoibruaezdrchb.supabase.co','SOURCE_PROJECT_MISMATCH'],
 ['https://ofgmcsmxmdswlovsckqs.supabase.co/functions/v1/export','API_BASE_URL_REQUIRED'],
 ['https://ofgmcsmxmdswlovsckqs.supabase.co?token=private-fixture','API_BASE_URL_REQUIRED'],
 ['https://private-fixture@ofgmcsmxmdswlovsckqs.supabase.co','CREDENTIALS_NOT_ALLOWED'],
 ['http://ofgmcsmxmdswlovsckqs.supabase.co','HTTPS_REQUIRED'],
 ['not-a-url','INVALID_URL'],['','NOT_SET']
])test('source setting rejects '+reason+' without returning values or accessing the network',async()=>{
 const a=app({enabled:false,envOverrides:{AQARI_RESTORE_SOURCE_URL:url}}),r=await a.run(),body=await r.json();
 assert.equal(r.status,503);
 assert.equal(body.configuration_diagnostics.find(d=>d.name==='AQARI_RESTORE_SOURCE_URL').reason,reason);
 assert.equal(body.configuration_diagnostics.find(d=>d.name==='AQARI_STORAGE_RESTORE_V2_ENABLED').reason,'EXPLICITLY_DISABLED');
 assert.doesNotMatch(JSON.stringify(body),/private-fixture|supabase\.co|11111111|synthetic-publishable/);
 assert.equal(a.urls.length,0);assert.equal(a.writes(),0);
});
test('normalization never changes an explicitly disabled receiver into an enabled receiver',async()=>{
 const a=app({envOverrides:{AQARI_STORAGE_RESTORE_V2_ENABLED:' FALSE '}}),r=await a.run();
 assert.equal(r.status,503);assert.equal((await r.json()).configuration_diagnostics[0].reason,'EXPLICITLY_DISABLED');
 assert.equal(a.writes(),0);assert.equal(a.urls.length,0);
});
async function begin(a,sizes){
 const plan=await snapshot(workspace,'ofgmcsmxmdswlovsckqs',sizes.map((bytes,i)=>({bucket:'aqari-documents',name:workspace+'/'+i,bytes,sha256:'a'.repeat(64)})));
 return a.run({action:'begin',...plan});
}
test('real adapter accepts a 64 MiB snapshot with every object at most 25 MiB',async()=>{const a=app();assert.equal((await begin(a,[25*MiB,25*MiB,14*MiB])).status,200);assert.equal(a.writes(),1);});
test('real adapter rejects an individual file one byte over 25 MiB before creating a run',async()=>{const a=app();const r=await begin(a,[25*MiB+1]);assert.equal(r.status,409);assert.equal((await r.json()).error,'BACKUP_SIZE_LIMIT');assert.equal(a.writes(),0);});
for(const options of [{bucketLimit:null},{bucketPublic:true}])test('real adapter refuses unsafe bucket '+JSON.stringify(options),async()=>{const a=app(options);assert.equal((await begin(a,[1])).status,503);assert.equal(a.writes(),0);});
