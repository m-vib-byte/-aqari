'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const {TextEncoder}=require('node:util');

function access(user='user-a',workspace='workspace-a',role='general_manager'){
  return {user:{id:user},membership:{user_id:user,workspace_id:workspace,role,is_active:true},workspace:{id:workspace}};
}
function runtime(role='general_manager'){
  let live=access('user-a','workspace-a',role);const calls=[];let rpcImpl=async(name,args)=>({data:{id:7,record_hash:args.p_record_hash,action_kind:args.p_action_kind,state:args.p_state,period:args.p_period,app_state_revision:11,created_at:'2026-09-04T00:00:00Z'},error:null});
  const client={rpc(name,args){calls.push({name,args});return rpcImpl(name,args)}};
  const window={crypto:webcrypto,AQARI_DATA_GATE:{get scope(){return {userId:live.user.id,workspaceId:live.workspace.id}}},AQARI_EARLY_STORAGE_GATE:{get scope(){return {userId:live.user.id,workspaceId:live.workspace.id}}},AQARI_SUPABASE:{get context(){return live},async refreshContext(expected){if(expected&&(expected.userId!==live.user.id||expected.workspaceId!==live.workspace.id||expected.role!==live.membership.role)){const error=new Error('access changed');error.code='AQARI_ACCESS_CHANGED';throw error}return live},async loadAppState(){return {workspace_id:live.workspace.id,revision:11,payload:{}}},async getClient(){return client}}};
  const sandbox=vm.createContext({window,TextEncoder,Uint8Array,Array,Object,String,Number,Set,Error,console});
  vm.runInContext(fs.readFileSync('v211-follow-up-cloud.js','utf8'),sandbox);
  return {window,calls,setAccess(next){live=next},setRpc(fn){rpcImpl=fn}};
}
const baseEvent={recordKey:'["TOWER","contract-1","1","C-1","PRIVATE TENANT"]',period:'2026-09',actionKind:'reminder_copied',state:'due'};

test('V211.1 hashes the V202 record key and sends no identifying text to RPC',async()=>{
  const rt=runtime();const result=await rt.window.AQARI_FOLLOW_UP_CLOUD.append(baseEvent);assert.equal(rt.calls.length,1);assert.equal(rt.calls[0].name,'aqari_record_follow_up_event');const args=rt.calls[0].args;assert.match(args.p_record_hash,/^[0-9a-f]{64}$/);assert.doesNotMatch(JSON.stringify(args),/PRIVATE TENANT|property|tenant|email|phone|civil/i);assert.equal(args.p_workspace_id,'workspace-a');assert.equal(args.p_expected_revision,11);assert.equal(result.recordHash,args.p_record_hash);assert.equal('property' in result,false);
});

test('V211.1 rejects property, PII, notes, and caller supplied authority before RPC',async()=>{
  for(const extra of [{property:'برج سري'},{tenant:'PRIVATE TENANT'},{email:'private@example.test'},{phone:'555'},{civilId:'123456789012'},{note:'free text'},{workspaceId:'workspace-b'},{userId:'user-b'}]){const rt=runtime();await assert.rejects(rt.window.AQARI_FOLLOW_UP_CLOUD.append({...baseEvent,...extra}),error=>error?.code==='AQARI_FOLLOW_UP_FORBIDDEN_FIELD');assert.equal(rt.calls.length,0)}
});

test('V211.1 blocks viewer writes before database access',async()=>{const rt=runtime('viewer');await assert.rejects(rt.window.AQARI_FOLLOW_UP_CLOUD.append(baseEvent),error=>error?.code==='AQARI_WRITE_FORBIDDEN');assert.equal(rt.calls.length,0)});

test('V211.1 fails closed when user or workspace changes in flight',async()=>{
  const rt=runtime();let resolveRpc;rt.setRpc(()=>new Promise(resolve=>{resolveRpc=resolve}));const pending=rt.window.AQARI_FOLLOW_UP_CLOUD.append(baseEvent);while(rt.calls.length===0)await new Promise(resolve=>setImmediate(resolve));rt.setAccess(access('user-b','workspace-b','general_manager'));resolveRpc({data:{id:7,record_hash:rt.calls[0].args.p_record_hash,action_kind:'reminder_copied',state:'due',period:'2026-09',app_state_revision:11,created_at:'now'},error:null});await assert.rejects(pending,error=>error?.code==='AQARI_ACCESS_CHANGED');
});

test('timeline uses opaque hash and returns only whitelisted fields',async()=>{
  const rt=runtime();rt.setRpc(async(name,args)=>{assert.equal(name,'aqari_list_follow_up_events');assert.match(args.p_record_hash,/^[0-9a-f]{64}$/);return {data:[{event_id:9,action_kind:'statement_opened',state:'pending',period:'2026-09',app_state_revision:11,created_at:'2026-09-04T01:00:00Z',property:'SHOULD NOT LEAK',tenant:'SHOULD NOT LEAK'}],error:null}});const rows=await rt.window.AQARI_FOLLOW_UP_CLOUD.list({recordKey:baseEvent.recordKey,period:'2026-09'});assert.equal(rows.length,1);assert.deepEqual(Object.keys(rows[0]).sort(),['actionKind','appStateRevision','createdAt','id','period','state'].sort());assert.doesNotMatch(JSON.stringify(rows),/SHOULD NOT LEAK/);
});

test('SQL draft keeps audit private and has no identifying RPC parameter',()=>{
  const sql=fs.readFileSync('supabase/migrations/20260904205555_v211_1_secure_follow_up_cloud_rpc.sql','utf8');assert.match(sql,/create schema if not exists aqari_internal/);assert.match(sql,/security definer/);assert.match(sql,/security invoker/);assert.match(sql,/set search_path = ''/);assert.match(sql,/revoke all on function public\.aqari_record_follow_up_event/);assert.match(sql,/grant execute on function public\.aqari_record_follow_up_event/);assert.doesNotMatch(sql,/grant\s+insert\s+on\s+(?:table\s+)?public\.aqari_access_audit/i);assert.match(sql,/p_record_hash !~ '\^\[0-9a-f\]\{64\}\$'/);assert.match(sql,/p_expected_revision/);assert.match(sql,/auth\.uid\(\)/);assert.match(sql,/a\.metadata->>'state' in \(/);assert.doesNotMatch(sql,/p_property|p_tenant|p_email|p_phone|p_civil/i);
});
