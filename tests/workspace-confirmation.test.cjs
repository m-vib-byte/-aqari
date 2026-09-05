const test=require('node:test');
const assert=require('node:assert/strict');
const modulePromise=import('../api/workspace-confirmation.js');
const uid='11111111-1111-4111-8111-111111111111',wid='22222222-2222-4222-8222-222222222222';
const auth='Bearer synthetic.jwt.signature';
const input=()=>({p_workspace_id:wid,p_expected_role:'general_manager',p_include_payload:false,traceCode:'AQ-1234ABCD'});
const snapshot=()=>({user_id:uid,membership:{user_id:uid,workspace_id:wid,role:'general_manager',is_active:true},workspace:{id:wid},profile:{user_id:uid},app_state:null});
async function run({body=input(),headers={},method='POST',hook,timeoutMs=100,fetchImpl}={}){
 const calls=[],logs=[],res={headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.statusCode=s;return this;},json(v){this.body=v;return this;}};
 const {createConfirmationHandler}=await modulePromise;
 const fetcher=fetchImpl|| (async(url,options)=>{const path=new URL(url).pathname;calls.push({path,options});const value=path.endsWith('/user')?{id:uid}:snapshot();return hook?.({path,value,options})??{ok:true,status:200,json:async()=>value};});
 await createConfirmationHandler({fetchImpl:fetcher,timeoutMs,log:(...args)=>logs.push(args)})(
 {method,headers:{host:'myaqari.com',origin:'https://myaqari.com',authorization:auth,...headers},body},res);
 return {calls,logs,res};
}
test('same-origin confirmation requires the user JWT and verifies exact identity without a payload',async()=>{
 const {calls,res,logs}=await run();assert.equal(res.statusCode,200);assert.equal(res.body.user.id,uid);
 assert.equal(calls.length,2);for(const c of calls){assert.equal(c.options.headers.Authorization,auth);assert.ok(c.options.headers.apikey.startsWith('sb_publishable_'));assert.equal(c.options.cache,'no-store');assert.equal(c.options.credentials,'omit');assert.equal(c.options.redirect,'error');}
 const rpc=calls.find(c=>c.path.includes('/rpc/'));assert.deepEqual(JSON.parse(rpc.options.body),{p_workspace_id:wid,p_expected_role:'general_manager',p_include_payload:false});
 assert.equal(res.headers['CDN-Cache-Control'],'no-store');assert.equal(res.headers.Vary,'Authorization');
 assert.doesNotMatch(JSON.stringify(logs),/synthetic|11111111|22222222|general_manager/);
});
for(const kind of ['no-token','bad-token','foreign-origin','method','workspace','role','include-payload','extra-key','bad-json','large-body','bad-trace','trace-array','workspace-array']){
 test('rejects '+kind+' before any upstream request',async()=>{
  const options={body:input()};
  if(kind==='no-token')options.headers={authorization:undefined};
  if(kind==='bad-token')options.headers={authorization:'Bearer arbitrary'};
  if(kind==='foreign-origin')options.headers={origin:'https://other.invalid'};
  if(kind==='method')options.method='GET';
  if(kind==='workspace')options.body.p_workspace_id='other';
  if(kind==='role')options.body.p_expected_role='service_role';
  if(kind==='include-payload')options.body.p_include_payload=true;
  if(kind==='extra-key')options.body.url='https://untrusted.invalid';
  if(kind==='bad-json')options.body='{';
  if(kind==='large-body')options.body='x'.repeat(1025);
  if(kind==='bad-trace')options.body.traceCode='private arbitrary text';
  if(kind==='trace-array')options.body.traceCode=['AQ-1234ABCD'];
  if(kind==='workspace-array')options.body.p_workspace_id=[wid];
  const {res,calls}=await run(options);assert.ok(res.statusCode>=400);assert.equal(calls.length,0);
 });
}
for(const kind of ['revoked','role','workspace','user','profile','payload','identity']){
 test('rejects post-read '+kind+' mismatch',async()=>{
  const {res}=await run({hook:({path,value})=>{
    if(path.includes('/rpc/')){
      if(kind==='revoked')value.membership.is_active=false;
      if(kind==='role')value.membership.role='viewer';
      if(kind==='workspace')value.workspace.id=uid;
      if(kind==='user')value.user_id=wid;
      if(kind==='profile')value.profile.user_id=wid;
      if(kind==='payload')value.app_state={payload:{private:true}};
    }else if(kind==='identity')value.id=wid;
  }});
  assert.equal(res.statusCode,403);assert.deepEqual(Object.keys(res.body),['error']);
 });
}
for(const status of [401,403,500])test('upstream '+status+' cannot produce a confirmed response',async()=>{
 const {res}=await run({hook:()=>({ok:false,status,json:async()=>{throw Error('must not parse secret error body')}})});
 assert.equal(res.statusCode,status===500?502:status);
});
test('a hanging fetch is aborted and bounded even if it ignores its abort signal',async()=>{
 const signals=[];const {res}=await run({timeoutMs:15,fetchImpl:async(url,opts)=>{signals.push(opts.signal);return new Promise(()=>{});}});
 assert.equal(res.statusCode,504);assert.ok(signals.every(s=>s.aborted));
});
test('a response with a hanging JSON body is also bounded',async()=>{
 const {res}=await run({timeoutMs:15,fetchImpl:async()=>({ok:true,status:200,json:()=>new Promise(()=>{})})});assert.equal(res.statusCode,504);
});
test('malformed upstream JSON fails closed without leaking exceptions',async()=>{
 const {res}=await run({fetchImpl:async()=>({ok:true,status:200,json:async()=>{throw Error('private body') }})});assert.equal(res.statusCode,502);assert.doesNotMatch(JSON.stringify(res.body),/private/);
});
