import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession} from '../src/v267/api/session.js';

function fixture(t){
 const prior={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch},calls=[];
 const context={user:{id:'user-a'},workspace:{id:'workspace-a'},membership:{role:'general_manager',user_id:'user-a',workspace_id:'workspace-a',is_active:true}};
 const state={auth:{user:{id:'user-a'},access_token:'synthetic-token'},body:async()=>new Blob(['synthetic photo'],{type:'image/jpeg'})};
 globalThis.window={AQARI_SUPABASE:{context,getSession:async()=>state.auth},AQARI_DATA_GATE:{scope:{userId:'user-a',workspaceId:'workspace-a'}},AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co',supabasePublishableKey:'synthetic-key'}};
 globalThis.document={documentElement:{classList:{contains:name=>name==='aqari-auth-unlocked'}}};
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,blob:()=>state.body(),json:async()=>({saved:true})};};
 const session=createSession();t.after(()=>{session.close();Object.assign(globalThis,prior);});return {session,state,calls};
}
test('maintenance bucket uses authenticated GET and insert-only POST through the bounded staff session',async t=>{
 const f=fixture(t),path='workspace-a/request-a/document-a',file=new File(['synthetic photo'],'photo.jpg',{type:'image/jpeg'});
 await f.session.storage('POST',path,file,'aqari-maintenance-private');const blob=await f.session.storage('GET',path,undefined,'aqari-maintenance-private');
 assert.equal(blob.type,'image/jpeg');assert.equal(f.calls[0].url,'https://ofgmcsmxmdswlovsckqs.supabase.co/storage/v1/object/aqari-maintenance-private/'+path);
 assert.equal(f.calls[1].url,'https://ofgmcsmxmdswlovsckqs.supabase.co/storage/v1/object/authenticated/aqari-maintenance-private/'+path);
 assert.equal(f.calls[0].options.headers['x-upsert'],'false');assert.equal(f.calls[0].options.body,file);assert.equal(f.calls[0].options.headers.Authorization,'Bearer synthetic-token');assert.equal(f.calls[1].options.cache,'no-store');assert.equal(f.calls[1].options.redirect,'error');assert.equal(f.calls[1].options.credentials,'omit');
});
test('new bucket does not permit cross-workspace, traversal, non-whitelisted buckets or replacing/deleting methods',async t=>{
 const f=fixture(t);
 for(const args of [['GET','workspace-b/r/d',undefined,'aqari-maintenance-private'],['GET','workspace-a/../r/d',undefined,'aqari-maintenance-private'],['GET','workspace-a-other/r/d',undefined,'aqari-maintenance-private'],['GET','workspace-a/r/d',undefined,'public'],...['PUT','PATCH','DELETE','HEAD'].map(method=>[method,'workspace-a/r/d',undefined,'aqari-maintenance-private'])])await assert.rejects(f.session.storage(...args),/مسار المستند غير صالح/);
 assert.equal(f.calls.length,0);
 for(const bucket of ['aqari-documents','aqari-hr-private'])await f.session.storage('GET','workspace-a/r/d',undefined,bucket);assert.equal(f.calls.length,2);
});
test('a mismatched authenticated account cannot fetch maintenance bytes',async t=>{
 const f=fixture(t);f.state.auth={user:{id:'user-b'},access_token:'other-synthetic'};await assert.rejects(f.session.storage('GET','workspace-a/r/d',undefined,'aqari-maintenance-private'),/تغيرت جلسة/);assert.equal(f.calls.length,0);
});
test('account scope change while reading the complete body discards maintenance bytes',async t=>{
 const f=fixture(t);f.state.body=async()=>{window.AQARI_DATA_GATE.scope.userId='user-b';return new Blob(['old private bytes']);};await assert.rejects(f.session.storage('GET','workspace-a/r/d',undefined,'aqari-maintenance-private'),/تغيرت جلسة/);assert.equal(f.calls.length,1);
});
