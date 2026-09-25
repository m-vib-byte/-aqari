import test from 'node:test';
import assert from 'node:assert/strict';
import {SUPABASE_PUBLIC_CONFIG} from '../lib/release-config.js';
import {createHash} from 'node:crypto';
import {createSession} from '../src/v267/api/session.js';
import {readContractExecutionPdf} from '../src/v267/pages/contract-execution.js';

// Real session cancellation and real page download code; only transport/auth
// and the minimal login context are synthetic. No settlement or database write.
async function fixture(t,{content='%PDF-1.7\nfixture archive\n%%EOF',mime='application/pdf',hash,holdBody=false,status=200,afterBody,finalUser}={}){
 const originals={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch},calls=[];
 const user='fixture-user',workspace='fixture-workspace';let session,authReads=0,release,reached;
 const bodyStarted=new Promise(resolve=>{reached=resolve;});
 const blob=new Blob([content],{type:mime});
 const expected=hash??createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex');
 const client={auth:{async getSession(){authReads++;return {data:{session:{access_token:'fixture-token',user:{id:authReads>1&&finalUser?finalUser:user}}}};}}};
 globalThis.document={documentElement:{classList:{contains:()=>true}}};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:SUPABASE_PUBLIC_CONFIG.url},AQARI_DATA_GATE:{scope:{userId:user,workspaceId:workspace}},AQARI_SUPABASE:{getClient:async()=>client,context:{user:{id:user},workspace:{id:workspace},membership:{user_id:user,workspace_id:workspace,is_active:true,role:'general_manager'}}}};
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return {ok:status===200,status,headers:new Headers({'X-Aqari-Archived-SHA256':expected}),async blob(){reached();if(holdBody)await new Promise(resolve=>{release=resolve;});afterBody?.(session);return blob;}};};
 session=createSession();await session.connect();
 t.after(async()=>{session.close();release?.();await new Promise(setImmediate);Object.assign(globalThis,originals);});
 return {session,calls,blob,expected,bodyStarted,release:()=>release?.(),body:{workspaceId:workspace,documentId:'saved-document',version:1},get authReads(){return authReads;}};
}

test('tenant/owner documents and the saved rent receipt require identical verified archived bytes',async t=>{
 const f=await fixture(t);
 for(const path of ['/api/official-document','/api/rent-receipt']){
  const body=path.endsWith('rent-receipt')?{workspaceId:f.body.workspaceId,receiptNo:'AQ-R-2026-00000001'}:f.body;
  const result=await readContractExecutionPdf(f.session,path,body);
  assert.equal(result.blob,f.blob);assert.equal(result.archivedHash,f.expected);
  const request=f.calls.at(-1);assert.equal(request.url,path);assert.deepEqual(JSON.parse(request.options.body),body);
  assert.ok(request.options.signal);assert.equal(request.options.credentials,'same-origin');assert.equal(request.options.cache,'no-store');assert.equal(request.options.redirect,'error');
 }
 assert.equal(f.authReads,4,'auth rechecked after each complete PDF');
});

test('corrupt PDF bytes, missing or wrong archived hashes and oversized files are refused',async t=>{
 for(const options of [{content:'not PDF',mime:'application/pdf'},{mime:'text/html'},{hash:''},{hash:'0'.repeat(64)},{content:'%PDF-'+ 'x'.repeat(2097152)}]){
  await t.test(JSON.stringify({...options,content:options.content?.slice(0,15)}),async t=>{
   const f=await fixture(t,options);await assert.rejects(readContractExecutionPdf(f.session,'/api/official-document',f.body),/PDF|بصمة/);
  });
 }
});

test('closing during a response body cannot return an artifact even when fetch ignores abort',async t=>{
 const f=await fixture(t,{holdBody:true}),pending=readContractExecutionPdf(f.session,'/api/official-document',f.body);
 await f.bodyStarted;f.session.close();
 await assert.rejects(pending,/جلسة/);assert.equal(f.calls[0].options.signal.aborted,true);
 f.release();await new Promise(setImmediate);assert.equal(f.authReads,1);
});

test('session loss immediately after body resolution blocks the previously accepted late PDF',async t=>{
 const f=await fixture(t,{afterBody:session=>session.close()});
 await assert.rejects(readContractExecutionPdf(f.session,'/api/official-document',f.body),/جلسة/);
});

test('changed authenticated user after hashing cannot receive the archived document',async t=>{
 const f=await fixture(t,{finalUser:'different-user'});
 await assert.rejects(readContractExecutionPdf(f.session,'/api/rent-receipt',{workspaceId:f.body.workspaceId,receiptNo:'saved-receipt'}),/جلسة/);
 assert.equal(f.authReads,2);
});

test('cross-workspace and unsupported paths cannot start an authenticated request',async t=>{
 const f=await fixture(t);
 await assert.rejects(readContractExecutionPdf(f.session,'/api/official-document',{...f.body,workspaceId:'other-workspace'}),/نطاق/);
 await assert.rejects(readContractExecutionPdf(f.session,'https://untrusted.invalid/document',f.body),/نطاق/);
 assert.equal(f.calls.length,0);assert.equal(f.authReads,0);
});

test('server archive failure stays a failure and never returns a guessed PDF',async t=>{
 const f=await fixture(t,{status:503});
 await assert.rejects(readContractExecutionPdf(f.session,'/api/official-document',f.body),{status:503});
 assert.equal(f.authReads,1);
});
