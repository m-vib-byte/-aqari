import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {prepareContractExecutionPackage,assertContractExecutionRenderer} from '../src/v267/components/contract-execution-package.js';
import {createDialog,node,field} from '../src/v267/components/dialog.js';
import {SUPABASE_PUBLIC_CONFIG} from '../lib/release-config.js';
import {isExecutionMfaChallenge,assertExecutionPaymentInput} from '../src/v267/pages/contract-execution.js';
const body={workspaceId:'workspace',contractRef:'contract',settlementId:'settlement',packageId:'package'};
function fixture(overrides={}){
 const calls=[];const result={...body,expiresAt:new Date(Date.now()+600000).toISOString(),...overrides};
 const session={bound:{workspace:'workspace',user:'user'},check(){},operation:fn=>fn(new AbortController().signal)};
 globalThis.window={AQARI_SUPABASE:{getSession:async()=>({access_token:'token',user:{id:'user'}})}};
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,headers:new Headers({'Content-Type':'application/json'}),text:async()=>JSON.stringify(result)};};
 return {session,calls};
}
test('prepares through scoped authenticated endpoint and confirms exact package',async()=>{
 const f=fixture();assert.equal(await prepareContractExecutionPackage(f.session,body),'package');
 assert.equal(f.calls[0].url,'/api/contract-execution-package');
 assert.equal(f.calls[0].options.headers.Authorization,'Bearer token');
 assert.equal(f.calls[0].options.redirect,'error');
 assert.deepEqual(JSON.parse(f.calls[0].options.body),body);
});
test('workspace and identity changes prevent the request',async()=>{
 const f=fixture();await assert.rejects(prepareContractExecutionPackage(f.session,{...body,workspaceId:'other'}));
 window.AQARI_SUPABASE.getSession=async()=>({access_token:'token',user:{id:'other'}});
 await assert.rejects(prepareContractExecutionPackage(f.session,body));assert.equal(f.calls.length,0);
});
test('mismatched package, scope or settlement and expired responses never authorize finalization',async()=>{
 for(const overrides of [{packageId:'other'},{workspaceId:'other'},{contractRef:'other'},{settlementId:'other'},
 {expiresAt:new Date(Date.now()-1000).toISOString()},{expiresAt:new Date(Date.now()+3600000).toISOString()},{expiresAt:'invalid'}]){
  const f=fixture(overrides);await assert.rejects(prepareContractExecutionPackage(f.session,body));
 }
});
test('HTTP failure, malformed or oversized response remain blocking',async()=>{
 for(const response of [{ok:false},{ok:true,headers:new Headers({'Content-Type':'text/html'})},
 {ok:true,headers:new Headers({'Content-Type':'application/json'}),text:async()=>'{broken'},
 {ok:true,headers:new Headers({'Content-Type':'application/json'}),text:async()=>' '.repeat(16385)}]){
  const f=fixture();globalThis.fetch=async()=>response;await assert.rejects(prepareContractExecutionPackage(f.session,body));
 }
});
test('revoked session after preparation never returns an accepted package',async()=>{
 const f=fixture();let checks=0;f.session.check=()=>{if(++checks===3)throw Error('session revoked');};
 await assert.rejects(prepareContractExecutionPackage(f.session,body),/session revoked/);
});
test('network failure propagates without an automatic duplicate request',async()=>{
 const f=fixture();let requests=0;globalThis.fetch=async()=>{requests++;throw Error('connection lost');};
 await assert.rejects(prepareContractExecutionPackage(f.session,body),/connection lost/);assert.equal(requests,1);
});
function finalization(prepare,{saveError,postSaveError,rendererError}={}){
 const source=readFileSync(new URL('../src/v267/pages/contract-execution.js',import.meta.url),'utf8');
 const start=source.indexOf('async function finalize('),end=source.indexOf('async function start(',start);
 let saved=null,n=0;const initial={contractsV202:[{id:'contract',status:'signing',tenantId:'tenant',contract_no:'CT-1'}],tenantProfilesV267:[{id:'tenant'}]};
 const session={bound:{workspace:'workspace',user:'user'},check(){},request:async x=>x,
 client:{from:()=>({select(){return this;},eq(){return this;},single:async()=>({id:'lease',contract_no:'CT-1',status:'signed'})})}};
 const context={scope:()=>({}),d:{session},contractId:'contract',copy:structuredClone,crypto:{randomUUID:()=>String(++n)},settlementSent:false,isExecutionMfaChallenge,assertExecutionPaymentInput,
 currentContract:structuredClone(initial.contractsV202[0]),currentProfile:structuredClone(initial.tenantProfilesV267[0]),currentDue:{rent:0},
 api:{primary:x=>x,directoryFields:()=>({})},assertContractExecutionService:async()=>{},assertContractExecutionRenderer:async()=>{if(rendererError)throw rendererError;},executionDue:()=>({rent:0}),
 executionManifest:({ids})=>({id:ids.settlement}),prepareContractExecutionPackage:prepare,same:(a,b)=>JSON.stringify(a)===JSON.stringify(b),
 window:{AQARI_SUPABASE:{loadAppState:async()=>({payload:saved||initial,revision:1}),saveAppState:async x=>{if(saveError)throw saveError;saved=x;}}},
 rpc:async name=>{if(postSaveError)throw postSaveError;return name==='aqari_contract_execution_artifacts'?{settlement_id:saved.contractExecutionSettlementsV267[0].id,contract_no:'CT-1',tenant_document_id:'tenant-doc',owner_document_id:'owner-doc'}:{periods:[]};}};
 vm.createContext(context);vm.runInContext(source.slice(start,end)+'\nthis.finalize=finalize;',context);
 return {run:()=>context.finalize({}),saved:()=>saved,sent:()=>context.settlementSent,initial,context};
}
test('invalid payment input cannot reserve a receipt, prepare documents or write a settlement',async()=>{
 for(const payment of [{method:'cash',transactionNo:'x'},{method:'cash',transactionNo:'   '},{method:'cash',transactionNo:' Ａ '},{method:'cash',transactionNo:'x'.repeat(151)},{method:'unknown',transactionNo:'REF-123'}]){
  const f=finalization(async()=>{throw Error('package must not run');});let reservations=0;
  f.context.currentDue={rent:100,total:100};f.context.executionDue=()=>({rent:100,total:100});
  f.context.api.kuwaitDate=()=> '2026-10-10';f.context.rpc=async()=>{reservations++;throw Error('reservation attempted');};
  await assert.rejects(f.context.finalize(payment),/طريقة الدفع ورقم العملية مطلوبان/);
  assert.equal(reservations,0);assert.equal(f.saved(),null);assert.equal(f.sent(),false);
 }
});
test('actual finalization performs no business write when package preparation fails',async()=>{
 const f=finalization(async()=>{throw Error('PDF unavailable');});
 await assert.rejects(f.run(),/PDF unavailable/);assert.equal(f.saved(),null);assert.equal(f.initial.contractsV202[0].status,'signing');
});
test('actual finalization persists confirmed package with settlement and verifies readback',async()=>{
 let request;const f=finalization(async(session,body)=>{assert.equal(f.saved(),null);request=body;return body.packageId;});
 const result=await f.run();assert.equal(result.manifest.executionPackageId,request.packageId);
 assert.equal(f.saved().contractsV202[0].status,'signed');assert.equal(request.receiptArtifacts,null);
 assert.equal(f.saved().contractExecutionSettlementsV267.length,1);
});
test('one archived document cannot confirm both official contract copies after settlement',async()=>{
 const f=finalization(async(session,body)=>body.packageId);
 const originalRpc=f.context.rpc;
 f.context.rpc=async name=>{
  const result=await originalRpc(name);
  if(name==='aqari_contract_execution_artifacts')result.owner_document_id=result.tenant_document_id;
  return result;
 };
 await assert.rejects(f.run(),/لم تتأكد إعادة قراءة نسختي العقد الرسميتين/);
 assert.equal(f.sent(),true,'a rejected readback must not authorize resubmission');
 assert.equal(f.saved().contractsV202[0].status,'signed','the saved settlement must remain recorded');
 assert.equal(f.saved().contractExecutionSettlementsV267.length,1);
});

test('exact source MFA rejection reaches the dialog contract without an automatic retry',async()=>{
 for(const message of ['MFA_REQUIRED','MFA_RECENT_REAUTH_REQUIRED']){
  const f=fixture();let calls=0;
  globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:message,code:'42501'}),{status:403,headers:{'Content-Type':'application/json'}});};
  await assert.rejects(prepareContractExecutionPackage(f.session,body),e=>e.message===message&&e.code==='42501'&&e.status===403);
  assert.equal(calls,1);
 }
});
test('generic denials and misleading MFA bodies remain authorization failures',async()=>{
 for(const [status,data] of [[401,{error:'MFA_REQUIRED',code:'42501'}],[403,{error:'MFA_REQUIRED_extra',code:'42501'}],[403,{error:'MFA_REQUIRED',code:'P0001'}],[403,{error:'ACCESS_DENIED'}],[403,null]]){
  const f=fixture();globalThis.fetch=async()=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  await assert.rejects(prepareContractExecutionPackage(f.session,body),e=>e.status===status&&e.code!=='42501'&&!e.message.includes('MFA_REQUIRED'));
 }
});
test('session change while reading an MFA body rejects the stale response',async()=>{
 const f=fixture();let revoked=false;f.session.check=()=>{if(revoked)throw Error('session revoked');};
 globalThis.fetch=async()=>({ok:false,status:403,headers:new Headers({'Content-Type':'application/json'}),text:async()=>{revoked=true;return JSON.stringify({error:'MFA_REQUIRED',code:'42501'});}});
 await assert.rejects(prepareContractExecutionPackage(f.session,body),/session revoked/);
});

async function submissionFixture(error){
 const original={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch};
 class Element{
  constructor(tag,text=''){this.tagName=tag;this.children=[];this.attrs={};this.textContent=text;this.disabled=false;this.value='';}
  get isConnected(){return this.parent?this.parent.isConnected:this.connected===true;}
  append(...nodes){for(const n of nodes){this.children.push(n);n.parent=this;}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(){} showModal(){} close(){} reportValidity(){return true;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
 }
 const root=new Element('body');root.connected=true;
 globalThis.document={body:root,createElement:t=>new Element(t),documentElement:{classList:{contains:()=>true}}};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:SUPABASE_PUBLIC_CONFIG.url},AQARI_DATA_GATE:{scope:{userId:'user',workspaceId:'workspace'}},AQARI_SUPABASE:{getClient:async()=>({}),context:{user:{id:'user'},workspace:{id:'workspace'},membership:{user_id:'user',workspace_id:'workspace',role:'general_manager',is_active:true}}},addEventListener(){},removeEventListener(){}};
 const d=createDialog('اختبار اعتماد العقد');let calls=0,pending;
 const actualRun=d.run;d.run=task=>(pending=actualRun(task));
 const source=readFileSync(new URL('../src/v267/pages/contract-execution.js',import.meta.url),'utf8');
 const begin=source.indexOf('async function start()'),end=source.indexOf('\n d.run(start);',begin);
 const context={d,node,field,load:async()=>{},translateStatic:x=>x,money:String,settlementSent:false,isExecutionMfaChallenge,assertExecutionPaymentInput,
  input:(type,value='')=>Object.assign(node('input'),{type,value}),select:()=>Object.assign(node('select'),{value:'cash'}),
  currentContract:{contract_no:'CT-TEST',property:'Test',unit:'1'},currentProfile:{nameAr:'اختبار',nameEn:'Test'},
  currentDue:{rent:1,total:1,deposit:0,advance:0,fees:0,breakdown:{}},api:{kuwaitDate:()=> '2026-10-07'},executionMethods:[],
  finalize:async()=>{calls++;if(typeof error==='function')return error(d,context);throw error;}};
 vm.createContext(context);vm.runInContext(source.slice(begin,end)+'\nthis.start=start;',context);
 await d.run(context.start);
 const form=d.body.children.at(-1),submit=form.children.at(-1),reference=form.children[1].children.at(-1);reference.value='KEEP-REFERENCE';
 return {d,submit,reference,calls:()=>calls,async run(){form.onsubmit({preventDefault(){}});await pending;},cleanup(){d.close();Object.assign(globalThis,original);}};
}
test('invalid reference leaves the form editable and a corrected reference can be deliberately submitted',async()=>{
 const f=await submissionFixture(Object.assign(Error('MFA_REQUIRED'),{status:403,code:'42501'}));
 try{
  for(const reference of ['x','   ',' Ａ ','x'.repeat(151)]){
   f.reference.value=reference;await f.run();
   assert.equal(f.calls(),0);assert.equal(f.submit.disabled,false);assert.equal(f.reference.value,reference);assert.equal(f.d.closed,false);
   assert.match(f.d.status.textContent,/طريقة الدفع ورقم العملية مطلوبان/);
  }
  f.reference.value='CORRECTED-REFERENCE';await f.run();assert.equal(f.calls(),1);assert.equal(f.submit.disabled,false);
 }finally{f.cleanup();}
});
test('payment input normalization preserves valid references and zero-payment handling',()=>{
 assert.equal(assertExecutionPaymentInput({total:100,method:'cash',transactionNo:' ＡＢＣ-123 '}),'ABC-123');
 assert.equal(assertExecutionPaymentInput({total:0,method:'none',transactionNo:''}),'');
});
test('actual contract submit remains usable after exact MFA denial and keeps payment input',async()=>{
 for(const message of ['MFA_REQUIRED','MFA_RECENT_REAUTH_REQUIRED']){
  const f=await submissionFixture(Object.assign(Error(message),{status:403,code:'42501'}));
  try{await f.run();assert.equal(f.d.closed,false);assert.equal(f.submit.disabled,false);assert.equal(f.reference.value,'KEEP-REFERENCE');assert.match(f.d.status.textContent,/التحقق الثنائي/);assert.equal(f.calls(),1);
   await f.run();assert.equal(f.calls(),2,'retry is explicit only');
  }finally{f.cleanup();}
 }
});
test('unknown outcome stays locked and expired or changed scope disposes private input',async()=>{
 for(const kind of ['timeout','denied','expired','workspace','after-save']){
  const f=await submissionFixture((d,context)=>{if(kind==='workspace')window.AQARI_DATA_GATE.scope.workspaceId='other';if(kind==='after-save')context.settlementSent=true;throw Object.assign(Error(kind==='denied'?'ACCESS_DENIED':kind==='timeout'?'connection lost':'MFA_REQUIRED'),kind==='timeout'?{}:{status:kind==='expired'?401:403,code:'42501'});});
  try{await f.run();assert.equal(f.submit.disabled,true,kind);assert.equal(f.calls(),1);assert.equal(f.d.closed,!['timeout','after-save'].includes(kind),kind);await f.run();assert.equal(f.calls(),1,'locked submission must not repeat');}finally{f.cleanup();}
 }
});
test('server access loss during any final document read closes the private view and stops later reads',async()=>{
 for(const status of [401,403])for(const deniedAt of [0,1,2]){
  const reads=[];
  const f=await submissionFixture((d,context)=>{
   context.settlementSent=true;
   context.pdf=async(path,body)=>{reads.push({path,body});if(reads.length-1===deniedAt)throw Object.assign(Error('access revoked'),{status});return {blob:new Blob(['%PDF-test'])};};
   context.downloadLink=label=>node('a',label);
   return {contract:{contract_no:'CT-TEST'},receiptNo:'AQ-R-2026-00000001',contractReceiptSequence:1,officialArtifacts:{tenant_document_id:'tenant-doc',owner_document_id:'owner-doc'}};
  });
  try{
   await f.run();
   assert.equal(f.d.closed,true,`HTTP ${status} on artifact ${deniedAt} must close the private view`);
   assert.equal(document.body.children.includes(f.d.el),false,'private document names and download links are removed from the page');
   assert.equal(reads.length,deniedAt+1,'no later document request after access was denied');
   assert.equal(f.submit.disabled,true);await f.run();assert.equal(f.calls(),1,'saved settlement cannot be repeated');
  }finally{f.cleanup();}
 }
});
test('temporary final PDF failure preserves the saved settlement and checks remaining documents',async()=>{
 const reads=[];
 const f=await submissionFixture((d,context)=>{
  context.settlementSent=true;
  context.pdf=async(path,body)=>{reads.push({path,body});if(reads.length===1)throw Object.assign(Error('temporarily unavailable'),{status:503});return {blob:new Blob(['%PDF-test'])};};
  context.downloadLink=label=>node('a',label);
  return {contract:{contract_no:'CT-TEST'},receiptNo:'AQ-R-2026-00000001',contractReceiptSequence:1,officialArtifacts:{tenant_document_id:'tenant-doc',owner_document_id:'owner-doc'}};
 });
 try{
  await f.run();assert.equal(f.d.closed,false);assert.equal(reads.length,3);
  assert.match(f.d.status.textContent,/بقي التحقق/);assert.equal(f.submit.disabled,true);
  await f.run();assert.equal(f.calls(),1,'a temporary PDF outage cannot repeat the saved settlement');
 }finally{f.cleanup();}
});
test('actual finalization distinguishes rejected settlement from timeout and post-save MFA',async()=>{
 const mfa=()=>Object.assign(Error('MFA_REQUIRED'),{status:403,code:'42501'});
 for(const [options,expectedSent,expectedSaved] of [[{saveError:Object.assign(mfa(),{aqariStateWriteRejected:true})},false,false],[{saveError:mfa()},true,false],[{saveError:Error('timeout')},true,false],[{postSaveError:mfa()},true,true]]){
  const f=finalization(async(session,body)=>body.packageId,options);await assert.rejects(f.run());assert.equal(f.sent(),expectedSent);assert.equal(Boolean(f.saved()),expectedSaved);
 }
});

function stateWriteFixture({role='general_manager',exists=true,response,lateError}={}){
 const source=readFileSync(new URL('../supabase-adapter.js',import.meta.url),'utf8');
 const start=source.indexOf('async function saveAppState('),end=source.indexOf('\n  window.AQARI_SUPABASE',start);
 let checks=0,writes=0;
 const reply=async()=>{writes++;return response||{data:{workspace_id:'workspace'},error:null,status:200};};
 const query={update(){return this;},insert(){return this;},eq(){return this;},select(){return this;},maybeSingle:reply,single:reply};
 const context={bindAccess:async()=>({workspaceId:'workspace',role}),loadAppState:async()=>exists?{revision:1}:null,
  recheckBoundAccess:async()=>{if(++checks===2&&lateError)throw lateError;},revisionConflict:()=>Error('revision'),accessError:()=>Error('access'),
  state:{client:{from:()=>query,rpc:reply}}};
 vm.createContext(context);vm.runInContext(source.slice(start,end)+'\nthis.save=saveAppState;',context);
 return {run:()=>context.save({},exists?1:0,{}),writes:()=>writes};
}
test('actual state adapter marks only exact MFA write rejection on update, insert and staff RPC',async()=>{
 for(const scope of [{},{exists:false},{role:'employee'}])for(const message of ['MFA_REQUIRED','MFA_RECENT_REAUTH_REQUIRED']){
  const f=stateWriteFixture({...scope,response:{data:null,error:{code:'42501',message},status:403}});
  await assert.rejects(f.run(),e=>e.message===message&&e.status===403&&e.aqariStateWriteRejected===true);assert.equal(f.writes(),1);
 }
});
test('state adapter never calls a late check or generic denial a rejected transaction',async()=>{
 for(const setup of [
  {response:{error:{code:'42501',message:'MFA_REQUIRED'},status:401}},
  {response:{error:{code:'42501',message:'ACCESS_DENIED'},status:403}},
  {response:{error:{code:'42501',message:'MFA_REQUIRED'}}},
  {lateError:Object.assign(Error('MFA_REQUIRED'),{code:'42501',status:403})}
 ]){const f=stateWriteFixture(setup);await assert.rejects(f.run(),e=>e.aqariStateWriteRejected!==true);assert.equal(f.writes(),1);}
});

test('renderer configuration probe blocks before preparing or saving a settlement',async()=>{
 let prepared=0;const error=Error('renderer configuration missing');
 const f=finalization(async()=>{prepared++;},{rendererError:error});
 await assert.rejects(f.run(),e=>e===error);assert.equal(prepared,0);assert.equal(f.saved(),null);assert.equal(f.sent(),false);
});
test('renderer configuration response is bounded and does not claim a signing result',async()=>{
 for(const response of [new Response('{"configured":false}',{status:503}),new Response('{"configured":false}',{headers:{'Content-Type':'application/json'}}),new Response('not json',{headers:{'Content-Type':'application/json'}}),new Response(' '.repeat(1025),{headers:{'Content-Type':'application/json'}})]){
  const f=fixture();globalThis.fetch=async()=>response;
  await assert.rejects(assertContractExecutionRenderer(f.session),e=>e.code==='EXECUTION_RENDERER_UNAVAILABLE');
 }
 const f=fixture();globalThis.fetch=async(url,options)=>{assert.equal(options.method,'GET');assert.equal(options.redirect,'error');return new Response('{"configured":true}',{headers:{'Content-Type':'application/json'}});};
 await assertContractExecutionRenderer(f.session);
});

 test('changed contract or tenant after review blocks before package, reservation or settlement',async()=>{
 for(const change of [f=>{f.initial.contractsV202[0].rent=200;},f=>{f.initial.contractsV202[0].unit='202';},f=>{f.initial.tenantProfilesV267[0].nameAr='Changed tenant';}]){
  let prepared=0,reserved=0;const f=finalization(async()=>{prepared++;return 'package';});
  f.context.rpc=async()=>{reserved++;};change(f);
  await assert.rejects(f.run(),/تغيرت بيانات العقد أو المستأجر/);
  assert.equal(prepared,0);assert.equal(reserved,0);assert.equal(f.saved(),null);assert.equal(f.sent(),false);
 }
});
test('changed calculated amount after review cannot silently replace the approved summary',async()=>{
 let prepared=0,reserved=0;const f=finalization(async()=>{prepared++;return 'package';});
 f.context.executionDue=()=>({rent:100});f.context.rpc=async()=>{reserved++;};
 await assert.rejects(f.run(),/تغير المبلغ المستحق/);
 assert.equal(prepared,0);assert.equal(reserved,0);assert.equal(f.saved(),null);assert.equal(f.sent(),false);
});
