import { createClient } from 'npm:@supabase/supabase-js@2.114.0'

const EXPECTED_URL = 'https://ofgmcsmxmdswlovsckqs.supabase.co'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const JWT = /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LEGACY_SERVICE_JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
const AUTOMATION_ROLES = new Set(['collector','accountant','maintenance','property_manager','viewer','partner'])

type JsonObject = Record<string,unknown>

function reply(status:number, body:JsonObject) {
  return Response.json(body, {
    status,
    headers:{'cache-control':'no-store, max-age=0','pragma':'no-cache','x-content-type-options':'nosniff'}
  })
}
function randomHex(bytes=8) { const raw=new Uint8Array(bytes);crypto.getRandomValues(raw);return Array.from(raw,b=>b.toString(16).padStart(2,'0')).join('') }
function randomPassword() { const raw=new Uint8Array(32);crypto.getRandomValues(raw);return btoa(String.fromCharCode(...raw)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','') }
function safeErrorCode(error:unknown) {
 const value=String((error as {message?:unknown})?.message||'')
 if(value.includes('MFA_RECENT_REAUTH_REQUIRED'))return 'MFA_RECENT_REAUTH_REQUIRED'
 if(value.includes('MFA_REQUIRED'))return 'MFA_REQUIRED'
 if(value.includes('ACCESS_DENIED')||value.includes('JWT'))return 'ACCESS_DENIED'
 if(value.includes('QA_'))return value.match(/QA_[A-Z0-9_]+/)?.[0]||'QA_OPERATION_REJECTED'
 if(value.includes('AUTH_ADMIN_'))return value.match(/AUTH_ADMIN_[A-Z0-9_]+/)?.[0]||'QA_OPERATION_REJECTED'
 return 'QA_OPERATION_REJECTED'
}
function namedKey(jsonName:string,legacyName:string,prefix:string) {
  const packed=Deno.env.get(jsonName)||''
  if(packed){
    try{const value=JSON.parse(packed)?.default;if(typeof value==='string'&&value.startsWith(prefix))return value}catch{}
  }
  const legacy=Deno.env.get(legacyName)||''
  if(prefix==='sb_secret_'&&(legacy.startsWith(prefix)||LEGACY_SERVICE_JWT.test(legacy)))return legacy
  if(prefix==='sb_publishable_'&&legacy)return legacy
  return ''
}
function adminHeaders(secret:string) {
  const headers:Record<string,string>={'apikey':secret,'Content-Type':'application/json','Accept':'application/json'}
  // Opaque sb_secret_ keys are API keys, not JWTs. Only legacy service-role JWTs are bearer tokens.
  if(!secret.startsWith('sb_secret_'))headers.Authorization='Bearer '+secret
  return headers
}
async function serverRequest(url:string,secret:string,path:string,method:string,body?:unknown) {
  const response=await fetch(url+path,{method,headers:adminHeaders(secret),body:body===undefined?undefined:JSON.stringify(body),redirect:'error'})
  let data:any=null
  try{data=await response.json()}catch{}
  if(response.status<200||response.status>=300){
    const code=String(data?.code||data?.error_code||'').toUpperCase().replace(/[^A-Z0-9_]/g,'').slice(0,80)
    throw new Error('AUTH_ADMIN_HTTP_'+response.status+(code?'_'+code:''))
  }
  return data
}
async function serverRpc(url:string,secret:string,name:string,payload:JsonObject) {
  return serverRequest(url,secret,'/rest/v1/rpc/'+name,'POST',payload)
}

Deno.serve(async (req:Request)=>{
 if(req.method!=='POST')return reply(405,{ok:false,error:'METHOD_NOT_ALLOWED'})
 if(Number(req.headers.get('content-length')||'0')>32768)return reply(413,{ok:false,error:'REQUEST_TOO_LARGE'})
 const url=Deno.env.get('SUPABASE_URL')||''
 const publishable=namedKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY','sb_publishable_')
 const secret=namedKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY','sb_secret_')
 if(url!==EXPECTED_URL||!publishable||!secret)return reply(503,{ok:false,error:'QA_STAGING_ADMIN_NOT_CONFIGURED'})
 const authorization=req.headers.get('authorization')||''
 if(!JWT.test(authorization)||authorization.length>8192)return reply(403,{ok:false,error:'ACCESS_DENIED'})
 let body:any;try{body=await req.json()}catch{return reply(400,{ok:false,error:'INVALID_REQUEST'})}
 const workspaceId=String(body?.workspaceId||''),action=String(body?.action||'')
 if(!UUID.test(workspaceId)||!['provision','disable'].includes(action))return reply(400,{ok:false,error:'INVALID_REQUEST'})
 const user=createClient(url,publishable,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization}}})
 if(action==='provision'){
  const source=body?.data;if(!source||typeof source!=='object'||Array.isArray(source))return reply(400,{ok:false,error:'INVALID_REQUEST'})
  const role=String(source.qa_role||'');if(![...AUTOMATION_ROLES,'tenant'].includes(role))return reply(400,{ok:false,error:'INVALID_QA_ROLE'})
  const data:any={};for(const key of ['display_name','qa_role','property_ids','tenant_id','expires_at','reason'])if(key in source)data[key]=source[key];data.qa_role=role
  if(AUTOMATION_ROLES.has(role)){if(source.email)return reply(400,{ok:false,error:'QA_AUTOMATION_EMAIL_FORBIDDEN'});data.email=`qa-${role}-${randomHex(8)}@example.invalid`}
  else{const email=String(source.email||'').toLowerCase();if(!EMAIL.test(email))return reply(400,{ok:false,error:'QA_TENANT_EMAIL_REQUIRED'});data.email=email}
  const {data:prepared,error:prepareError}=await user.rpc('aqari_qa_account',{p_workspace_id:workspaceId,p_action:'prepare',p_data:data})
  if(prepareError||!prepared?.id||!EMAIL.test(String(prepared.email||'')))return reply(prepareError?.code==='42501'?403:409,{ok:false,error:safeErrorCode(prepareError)})
  const accountId=String(prepared.id),email=String(prepared.email).toLowerCase(),password=randomPassword();let createdUserId=''
  try{
   const created=await serverRequest(url,secret,'/auth/v1/admin/users','POST',{email,password,email_confirm:true,user_metadata:{aqari_qa:true,qa_role:role}})
   createdUserId=String(created?.id||'')
   if(!UUID.test(createdUserId)||String(created?.email||'').toLowerCase()!==email)throw new Error('AUTH_ADMIN_CREATE_FAILED')
   const confirmed=await serverRpc(url,secret,'aqari_qa_account_server_result',{p_account_id:accountId,p_action:'provision',p_user_id:createdUserId,p_error:null})
   if(confirmed?.status!=='active'||String(confirmed?.auth_user_id||'')!==createdUserId)throw new Error('QA_AUTH_BIND_NOT_CONFIRMED')
   return reply(201,{ok:true,id:accountId,status:'active',qaRole:role,expiresAt:prepared.expires_at,email,password})
  }catch(error){
   if(createdUserId){try{await serverRequest(url,secret,'/auth/v1/admin/users/'+createdUserId,'DELETE')}catch{}}
   try{await serverRpc(url,secret,'aqari_qa_account_server_result',{p_account_id:accountId,p_action:'provision',p_user_id:null,p_error:safeErrorCode(error)})}catch{}
   return reply(409,{ok:false,error:safeErrorCode(error)})
  }
 }
 const accountId=String(body?.accountId||''),reason=String(body?.reason||'')
 if(!UUID.test(accountId)||reason.length<3||reason.length>500)return reply(400,{ok:false,error:'INVALID_QA_DISABLE'})
 const {data:prepared,error:disableError}=await user.rpc('aqari_qa_account',{p_workspace_id:workspaceId,p_action:'disable',p_data:{id:accountId,reason}})
 if(disableError||!prepared?.id)return reply(disableError?.code==='42501'?403:409,{ok:false,error:safeErrorCode(disableError)})
 const userId=prepared.auth_user_id?String(prepared.auth_user_id):''
 if(!userId)return reply(200,{ok:true,id:accountId,status:'disabled'})
 try{
  await serverRequest(url,secret,'/auth/v1/admin/users/'+userId,'PUT',{ban_duration:'876000h'})
  const final=await serverRpc(url,secret,'aqari_qa_account_server_result',{p_account_id:accountId,p_action:'disable',p_user_id:userId,p_error:null})
  if(final?.status!=='disabled')throw new Error('QA_DISABLE_FINALIZE_FAILED')
  return reply(200,{ok:true,id:accountId,status:'disabled'})
 }catch(error){
  try{await serverRpc(url,secret,'aqari_qa_account_server_result',{p_account_id:accountId,p_action:'disable',p_user_id:userId,p_error:safeErrorCode(error)})}catch{}
  return reply(409,{ok:false,error:safeErrorCode(error)})
 }
})
