const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'..','supabase-adapter.js'),'utf8');
const bound={userId:'user-a',workspaceId:'space-a',role:'general_manager'};
function runtime(hook, timers={setTimeout,clearTimeout}){
  let session={user:{id:'user-a'},access_token:'synthetic-token'}, rpcCount=0;
  const calls=[];
  const snapshot=()=>({user_id:'user-a',membership:{user_id:'user-a',workspace_id:'space-a',role:'general_manager',is_active:true},workspace:{id:'space-a'},profile:{user_id:'user-a'},app_state:{workspace_id:'space-a',payload:{synthetic:true},revision:1}});
  const client={auth:{async getSession(){return {data:{session},error:null}},stopAutoRefresh(){}},from(){throw Error('startup must not reacquire SDK locks for table queries')}};
  const window={AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://fixture.invalid',supabasePublishableKey:'public-test'},supabase:{createClient(){return client}},localStorage:{length:0,getItem(){return null},removeItem(){}},async fetch(url,options){
    const body=options.body?JSON.parse(options.body):null;
    calls.push({path:new URL(url,'https://app.invalid').pathname,options,body});
    const data=body?snapshot():{id:'user-a'};
    if(body && ++rpcCount>1)data.app_state=null;
    const response={ok:true,status:200,async json(){return url==='/api/workspace-confirmation'?{user:{id:'user-a'},confirmation:data}:data}};
    return hook?.({url,options,body,data,response,rpcCount,api:window.AQARI_SUPABASE,setSession(value){session=value}})??response;
  }};
  vm.runInNewContext(source,{window,document:{getElementById(){return null}},console,AbortController,...timers});
  return {api:window.AQARI_SUPABASE,calls};
}
test('native startup reads one payload and performs post-read server confirmation with the same JWT',async()=>{
  const r=runtime();await r.api.refreshContext();const row=await r.api.loadAppState(bound,{reuseVerifiedContext:true});
  assert.equal(row.payload.synthetic,true);assert.equal(r.calls.length,3);assert.equal(r.calls[2].path,'/api/workspace-confirmation');
  assert.equal(r.calls.filter(c=>c.body?.p_include_payload===true).length,1);
  assert.equal(r.calls.filter(c=>c.body?.p_include_payload===false).length,1);
  for(const c of r.calls){assert.equal(c.options.headers.Authorization,'Bearer synthetic-token');assert.equal(c.options.cache,'no-store');assert.equal(c.options.credentials,c.path==='/api/workspace-confirmation'?'same-origin':'omit');assert.equal(c.options.redirect,'error')}
});
for(const mutation of ['revoked','role','workspace','user','profile','session','clear']){
  test('post-read '+mutation+' change discards the startup payload',async()=>{
    const r=runtime(({body,data,setSession,api,response})=>{
      if(body?.p_include_payload!==false)return response;
      if(mutation==='revoked')data.membership.is_active=false;
      if(mutation==='role')data.membership.role='viewer';
      if(mutation==='workspace')data.workspace.id='space-b';
      if(mutation==='user')data.user_id='user-b';
      if(mutation==='profile')data.profile.user_id='user-b';
      if(mutation==='session')setSession({user:{id:'user-b'},access_token:'other'});
      if(mutation==='clear')api.clearPersistedSession();
      return response;
    });
    await r.api.refreshContext();await assert.rejects(r.api.loadAppState(bound,{reuseVerifiedContext:true}),e=>e.code==='AQARI_ACCESS_CHANGED');
  });
}
test('payload from another workspace is rejected before publishing a context',async()=>{
 const r=runtime(({body,data,response})=>{if(body)data.app_state.workspace_id='space-b';return response});
 await assert.rejects(r.api.refreshContext(),e=>e.code==='AQARI_ACCESS_CHANGED');assert.equal(r.api.context.user,null);
});
test('an invalid user cannot request a snapshot',async()=>{
 const r=runtime(({body,response})=>body?response:{ok:false,status:401});
 await assert.rejects(r.api.refreshContext(),e=>e.status===401);assert.equal(r.calls.length,1);assert.equal(r.api.context.user,null);
});
for(const code of ['session_not_found','session_expired','refresh_token_not_found','refresh_token_already_used','bad_jwt'])for(const field of ['code','error_code']){
 test('a forbidden Auth '+code+' in '+field+' preserves its safe code and fails closed',async()=>{
  const r=runtime(()=>({ok:false,status:403,async json(){return {code:403,[field]:code,message:'private provider details',token:'private token'}}}));
  await assert.rejects(r.api.refreshContext(),e=>e.status===403 && e.code===code && !JSON.stringify(e).includes('private') && !e.message.includes('private'));
  assert.equal(r.calls.length,1);assert.equal(r.api.context.user,null);
 });
}
for(const kind of ['unknown','invalid-json','permission-rpc']){
 test('startup never exposes unrecognized provider details: '+kind,async()=>{
  const r=runtime(({body,response})=>{
   if(kind==='permission-rpc' && !body)return response;
   return {ok:false,status:403,async json(){if(kind==='invalid-json')throw Error('private parser detail');return {code:kind==='permission-rpc'?'session_expired':'private provider code',message:'private details'}}};
  });
  await assert.rejects(r.api.refreshContext(),e=>e.status===403 && e.code==='AQARI_ACCESS_CHANGED' && !JSON.stringify(e).includes('private') && !e.message.includes('private'));
  assert.equal(r.api.context.user,null);
 });
}

test('a transient startup user failure retries once and then continues',async()=>{
 let authAttempts=0;
 const r=runtime(({body,response})=>{
  if(body)return response;
  authAttempts++;
  if(authAttempts===1)return {ok:false,status:503,async json(){return {}}};
  return response;
 });
 await r.api.refreshContext();
 assert.equal(authAttempts,2);
 assert.equal(r.api.context.user.id,'user-a');
 assert.deepEqual(r.calls.slice(0,3).map(x=>x.path),['/auth/v1/user','/auth/v1/user','/rest/v1/rpc/aqari_startup_snapshot_v266']);
});
test('explicit Auth rejection is never retried',async()=>{
 let authAttempts=0;
 const r=runtime(({body,response})=>{
  if(body)return response;
  authAttempts++;
  return {ok:false,status:401,async json(){return {code:'session_expired'}}};
 });
 await assert.rejects(r.api.refreshContext(),e=>e.status===401);
 assert.equal(authAttempts,1);
 assert.equal(r.api.context.user,null);
});

test('a stalled Auth error body remains bounded by the startup deadline',async()=>{
 let requestedDeadline;
 const r=runtime(()=>({ok:false,status:403,json(){return new Promise(()=>{})}}),{
  setTimeout(callback,delay){requestedDeadline=delay;return setTimeout(callback,5)},clearTimeout
 });
 await assert.rejects(r.api.refreshContext(),e=>e.code==='AQARI_STARTUP_TIMEOUT');
 assert.ok(requestedDeadline>0 && requestedDeadline<=6000);assert.equal(r.calls.filter(c=>c.path==='/auth/v1/user').length,2);assert.equal(r.api.context.user,null);
});
test('a denied or missing RPC fails closed rather than authorizing from browser storage',async()=>{
 const r=runtime(({body,response})=>body?{ok:false,status:403}:response);
 await assert.rejects(r.api.refreshContext(),e=>e.status===403);assert.equal(r.api.context.workspace,null);
});
test('the startup snapshot is consumed once and ordinary reads retain their SDK preflight',async()=>{
 const r=runtime();await r.api.refreshContext();await r.api.loadAppState(bound,{reuseVerifiedContext:true});
 await assert.rejects(r.api.loadAppState(bound),/getUser|SDK/);
});

// Preview protection validates its own same-origin cookie before the app's JWT.
test('protected preview allows JWT confirmation without exposing cookies to Supabase',async()=>{
  const r=runtime(({url,options,response})=>{
    if(url==='/api/workspace-confirmation' && options.credentials!=='same-origin')
      return {ok:false,status:401};
    return response;
  });
    await r.api.refreshContext();
    const row=await r.api.loadAppState(bound,{reuseVerifiedContext:true});
    assert.equal(r.api.context.membership.role,'general_manager');
    assert.equal(row.payload.synthetic,true);
  for(const c of r.calls){
    assert.equal(c.options.credentials,c.path==='/api/workspace-confirmation'?'same-origin':'omit');
    assert.equal(c.options.headers.Authorization,'Bearer synthetic-token');
    assert.equal(c.options.redirect,'error');
  }
});
