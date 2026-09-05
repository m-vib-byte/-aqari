const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'..','supabase-adapter.js'),'utf8');
const bound={userId:'user-a',workspaceId:'space-a',role:'general_manager'};
function runtime(hook){
  let session={user:{id:'user-a'},access_token:'synthetic-token'}, rpcCount=0;
  const calls=[];
  const snapshot=()=>({user_id:'user-a',membership:{user_id:'user-a',workspace_id:'space-a',role:'general_manager',is_active:true},workspace:{id:'space-a'},profile:{user_id:'user-a'},app_state:{workspace_id:'space-a',payload:{synthetic:true},revision:1}});
  const client={auth:{async getSession(){return {data:{session},error:null}},stopAutoRefresh(){}},from(){throw Error('startup must not reacquire SDK locks for table queries')}};
  const window={AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://fixture.invalid',supabasePublishableKey:'public-test'},supabase:{createClient(){return client}},localStorage:{length:0,getItem(){return null},removeItem(){}},async fetch(url,options){
    const body=options.body?JSON.parse(options.body):null;
    calls.push({path:new URL(url).pathname,options,body});
    const data=body?snapshot():{id:'user-a'};
    if(body && ++rpcCount>1)data.app_state=null;
    const response={ok:true,status:200,async json(){return data}};
    return hook?.({url,options,body,data,response,rpcCount,api:window.AQARI_SUPABASE,setSession(value){session=value}})??response;
  }};
  vm.runInNewContext(source,{window,document:{getElementById(){return null}},console,AbortController,setTimeout,clearTimeout});
  return {api:window.AQARI_SUPABASE,calls};
}
test('native startup reads one payload and performs post-read server confirmation with the same JWT',async()=>{
  const r=runtime();await r.api.refreshContext();const row=await r.api.loadAppState(bound,{reuseVerifiedContext:true});
  assert.equal(row.payload.synthetic,true);assert.equal(r.calls.length,4);
  assert.equal(r.calls.filter(c=>c.body?.p_include_payload===true).length,1);
  assert.equal(r.calls.filter(c=>c.body?.p_include_payload===false).length,1);
  for(const c of r.calls){assert.equal(c.options.headers.Authorization,'Bearer synthetic-token');assert.equal(c.options.cache,'no-store');assert.equal(c.options.credentials,'omit');assert.equal(c.options.redirect,'error')}
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
test('a denied or missing RPC fails closed rather than authorizing from browser storage',async()=>{
 const r=runtime(({body,response})=>body?{ok:false,status:403}:response);
 await assert.rejects(r.api.refreshContext(),e=>e.status===403);assert.equal(r.api.context.workspace,null);
});
test('the startup snapshot is consumed once and ordinary reads retain their SDK preflight',async()=>{
 const r=runtime();await r.api.refreshContext();await r.api.loadAppState(bound,{reuseVerifiedContext:true});
 await assert.rejects(r.api.loadAppState(bound),/getUser|SDK/);
});
