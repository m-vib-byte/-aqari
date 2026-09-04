(function(){
  'use strict';

  const DESIGN='V211.1-follow-up-cloud-contract';
  const WRITE_ROLES=new Set(['general_manager','property_manager','accountant']);
  const ACTIONS=new Set(['reminder_copied','statement_opened','contract_opened','receipt_opened','collection_opened','reviewed']);
  const STATES=new Set(['due','pending','readonly','unlinked','resolved']);
  const PERIOD=/^\d{4}-(0[1-9]|1[0-2])$/;
  const HASH=/^[0-9a-f]{64}$/;
  const ALLOWED_EVENT_KEYS=new Set(['recordKey','period','actionKind','state']);

  function aqariError(code,message){const error=new Error(message||code);error.code=code;return error}
  function identity(value,maxLength){
    if(typeof value!=='string'||value!==value.trim()||!value||value.length>maxLength||/(?:\p{Cc}|\p{Cf}|\p{Zl}|\p{Zp}|\p{Default_Ignorable_Code_Point})/u.test(value))return '';
    return value;
  }
  function cleanAccess(context){
    const userId=identity(context?.user?.id,128);
    const workspaceId=identity(context?.workspace?.id,128);
    const membership=context?.membership;
    const membershipUserId=identity(membership?.user_id,128);
    const membershipWorkspaceId=identity(membership?.workspace_id,128);
    const role=identity(membership?.role,64);
    if(!userId||!workspaceId||!role||membership?.is_active!==true||membershipUserId!==userId||membershipWorkspaceId!==workspaceId)return null;
    return Object.freeze({userId,workspaceId,role});
  }
  function sameAccess(left,right){return Boolean(left&&right&&left.userId===right.userId&&left.workspaceId===right.workspaceId&&left.role===right.role)}
  function gatesMatch(access){
    const dataScope=window.AQARI_DATA_GATE?.scope;
    const storageScope=window.AQARI_EARLY_STORAGE_GATE?.scope;
    return Boolean(access&&dataScope&&storageScope&&
      String(dataScope.userId||'')===access.userId&&String(dataScope.workspaceId||'')===access.workspaceId&&
      String(storageScope.userId||'')===access.userId&&String(storageScope.workspaceId||'')===access.workspaceId);
  }
  function assertLiveAccess(expected,{write=false}={}){
    const live=cleanAccess(window.AQARI_SUPABASE?.context);
    if(!live||!gatesMatch(live))throw aqariError('AQARI_ACCESS_CHANGED','Authenticated AQARI workspace access is required');
    if(expected&&!sameAccess(live,expected))throw aqariError('AQARI_ACCESS_CHANGED','AQARI account, workspace, or role changed');
    if(write&&!WRITE_ROLES.has(live.role))throw aqariError('AQARI_WRITE_FORBIDDEN','Current AQARI role cannot record follow-up events');
    return live;
  }
  async function bindAccess(expected,{write=false}={}){
    if(!window.AQARI_SUPABASE?.refreshContext)throw aqariError('AQARI_FOLLOW_UP_UNAVAILABLE','Supabase access bridge is unavailable');
    const expectedAccess=expected||cleanAccess(window.AQARI_SUPABASE.context);
    const context=await window.AQARI_SUPABASE.refreshContext(expectedAccess||undefined);
    const live=cleanAccess(context);
    if(!live||!gatesMatch(live)||(expectedAccess&&!sameAccess(live,expectedAccess)))throw aqariError('AQARI_ACCESS_CHANGED','AQARI access changed while follow-up data was loading');
    if(write&&!WRITE_ROLES.has(live.role))throw aqariError('AQARI_WRITE_FORBIDDEN','Current AQARI role cannot record follow-up events');
    return live;
  }
  function validateEvent(input){
    if(!input||typeof input!=='object'||Array.isArray(input))throw aqariError('AQARI_FOLLOW_UP_INVALID','Follow-up event must be an object');
    for(const key of Object.keys(input))if(!ALLOWED_EVENT_KEYS.has(key))throw aqariError('AQARI_FOLLOW_UP_FORBIDDEN_FIELD','Follow-up payload contains a forbidden field');
    const recordKey=identity(input.recordKey,1200);
    const period=String(input.period||'');
    const actionKind=String(input.actionKind||'');
    const state=String(input.state||'');
    if(!recordKey||!PERIOD.test(period)||!ACTIONS.has(actionKind)||!STATES.has(state))throw aqariError('AQARI_FOLLOW_UP_INVALID','Follow-up event failed validation');
    return Object.freeze({recordKey,period,actionKind,state});
  }
  async function hashRecordKey(recordKey){
    const value=identity(recordKey,1200);
    if(!value)throw aqariError('AQARI_FOLLOW_UP_INVALID','Record key is invalid');
    const subtle=window.crypto?.subtle;
    if(!subtle||typeof TextEncoder!=='function')throw aqariError('AQARI_FOLLOW_UP_CRYPTO_UNAVAILABLE','Web Crypto is required for private follow-up identifiers');
    const digest=await subtle.digest('SHA-256',new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest)).map(byte=>byte.toString(16).padStart(2,'0')).join('');
  }
  function normalizeRpcError(error){
    const code=String(error?.code||'');const message=String(error?.message||'');
    if(code==='PGRST202'||code==='42883'||code==='42P01')return aqariError('AQARI_FOLLOW_UP_SCHEMA_UNAVAILABLE','V211.1 database contract is not installed');
    if(code==='40001'||/revision_conflict/i.test(message))return aqariError('AQARI_REVISION_CONFLICT','AQARI app-state revision changed before the follow-up event was recorded');
    if(code==='42501'||/not authorized|permission denied/i.test(message))return aqariError('AQARI_FOLLOW_UP_FORBIDDEN','Follow-up cloud access is not authorized');
    const wrapped=aqariError('AQARI_FOLLOW_UP_RPC_FAILED',message||'Follow-up cloud request failed');wrapped.cause=error;return wrapped;
  }
  async function currentRevision(access){
    if(!window.AQARI_SUPABASE?.loadAppState)throw aqariError('AQARI_FOLLOW_UP_UNAVAILABLE','AQARI cloud state is unavailable');
    const snapshot=await window.AQARI_SUPABASE.loadAppState(access);assertLiveAccess(access);
    const revision=Number(snapshot?.revision);
    if(!Number.isInteger(revision)||revision<1)throw aqariError('AQARI_REVISION_UNAVAILABLE','AQARI cloud revision is unavailable');
    return revision;
  }
  function safeResult(data,recordHash){
    const row=Array.isArray(data)?data[0]:data;
    if(!row||typeof row!=='object')throw aqariError('AQARI_FOLLOW_UP_RPC_INVALID','Follow-up RPC returned an invalid result');
    const resultHash=String(row.record_hash||row.recordHash||recordHash||'');
    const actionKind=String(row.action_kind||'');const state=String(row.state||'');const period=String(row.period||'');
    if(!HASH.test(resultHash)||resultHash!==recordHash||!ACTIONS.has(actionKind)||!STATES.has(state)||!PERIOD.test(period))throw aqariError('AQARI_FOLLOW_UP_RPC_INVALID','Follow-up RPC returned an invalid event');
    return Object.freeze({id:row.id??row.event_id??null,recordHash:resultHash,actionKind,state,period,appStateRevision:Number(row.app_state_revision||0)||null,createdAt:String(row.created_at||'')});
  }
  async function append(input,expectedAccess){
    const event=validateEvent(input);
    const access=await bindAccess(expectedAccess,{write:true});
    const revision=await currentRevision(access);
    const recordHash=await hashRecordKey(event.recordKey);
    assertLiveAccess(access,{write:true});
    const client=await window.AQARI_SUPABASE.getClient();
    const response=await client.rpc('aqari_record_follow_up_event',{p_workspace_id:access.workspaceId,p_record_hash:recordHash,p_period:event.period,p_action_kind:event.actionKind,p_state:event.state,p_expected_revision:revision});
    if(response?.error)throw normalizeRpcError(response.error);
    await bindAccess(access,{write:true});
    return safeResult(response?.data,recordHash);
  }
  async function list(options,expectedAccess){
    const access=await bindAccess(expectedAccess);
    const recordKey=identity(options?.recordKey,1200);const period=String(options?.period||'');const limit=Math.max(1,Math.min(50,Number(options?.limit)||20));
    if(!recordKey||!PERIOD.test(period))throw aqariError('AQARI_FOLLOW_UP_INVALID','Follow-up timeline filter is invalid');
    const recordHash=await hashRecordKey(recordKey);assertLiveAccess(access);
    const client=await window.AQARI_SUPABASE.getClient();
    const response=await client.rpc('aqari_list_follow_up_events',{p_workspace_id:access.workspaceId,p_record_hash:recordHash,p_period:period,p_limit:limit});
    if(response?.error)throw normalizeRpcError(response.error);
    await bindAccess(access);
    const rows=Array.isArray(response?.data)?response.data:[];
    return Object.freeze(rows.map(row=>Object.freeze({id:row?.event_id??row?.id??null,actionKind:String(row?.action_kind||''),state:String(row?.state||''),period:String(row?.period||''),appStateRevision:Number(row?.app_state_revision||0)||null,createdAt:String(row?.created_at||'')})).filter(row=>ACTIONS.has(row.actionKind)&&STATES.has(row.state)&&row.period===period));
  }
  window.AQARI_FOLLOW_UP_CLOUD=Object.freeze({version:DESIGN,append,list,hashRecordKey,testing:Object.freeze({validateEvent,cleanAccess,sameAccess,normalizeRpcError})});
})();
