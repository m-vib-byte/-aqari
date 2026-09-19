import { withSupabase } from 'npm:@supabase/server'

const EXPECTED_URL = 'https://ofgmcsmxmdswlovsckqs.supabase.co'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const AUTOMATION_ROLES = new Set(['collector','accountant','maintenance','property_manager','viewer','partner'])

type JsonObject = Record<string,unknown>
function reply(status:number, body:JsonObject){return Response.json(body,{status,headers:{'cache-control':'no-store, max-age=0','pragma':'no-cache','x-content-type-options':'nosniff'}})}
function randomHex(bytes=8){const raw=new Uint8Array(bytes);crypto.getRandomValues(raw);return Array.from(raw,b=>b.toString(16).padStart(2,'0')).join('')}
function randomPassword(){const raw=new Uint8Array(32);crypto.getRandomValues(raw);return btoa(String.fromCharCode(...raw)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')}
function safeErrorCode(error:unknown){
 const value=String((error as {message?:unknown})?.message||'')
 if(value.includes('MFA_RECENT_REAUTH_REQUIRED'))return 'MFA_RECENT_REAUTH_REQUIRED'
 if(value.includes('MFA_REQUIRED'))return 'MFA_REQUIRED'
 if(value.includes('ACCESS_DENIED')||value.includes('JWT'))return 'ACCESS_DENIED'
 if(value.includes('QA_'))return value.match(/QA_[A-Z0-9_]+/)?.[0]||'QA_OPERATION_REJECTED'
 return 'QA_OPERATION_REJECTED'
}
async function purgeQaAuth(admin:any,accountId:string,userId:string,finalizeDisable:boolean){
 if(!UUID.test(accountId)||!UUID.test(userId))throw new Error('QA_CLEANUP_ID_INVALID')
 const {error:banError}=await admin.auth.admin.updateUserById(userId,{ban_duration:'876000h'})
 if(banError)throw new Error('QA_AUTH_BAN_FAILED')
 if(finalizeDisable){
  const {data:final,error:finalError}=await admin.rpc('aqari_qa_account_server_result',{p_account_id:accountId,p_action:'disable',p_user_id:userId,p_error:null})
  if(finalError)throw finalError
  if(final?.status!=='disabled')throw new Error('QA_DISABLE_FINALIZE_FAILED')
 }
 const {data:clean,error:cleanupError}=await admin.rpc('aqari_qa_account_server_cleanup',{p_account_id:accountId,p_user_id:userId})
 if(cleanupError)throw cleanupError
 if(clean?.ok!==true)throw new Error('QA_LINK_CLEANUP_FAILED')
 const {error:deleteError}=await admin.auth.admin.deleteUser(userId)
 if(deleteError)throw new Error('QA_AUTH_DELETE_FAILED')
 return true
}

const fetch=withSupabase({auth:'user'},async(req:any,ctx:any)=>{
 if(req.method!=='POST')return reply(405,{ok:false,error:'METHOD_NOT_ALLOWED'})
 if(Number(req.headers.get('content-length')||'0')>32768)return reply(413,{ok:false,error:'REQUEST_TOO_LARGE'})
 if((Deno.env.get('SUPABASE_URL')||'')!==EXPECTED_URL)return reply(503,{ok:false,error:'QA_STAGING_ADMIN_NOT_CONFIGURED'})
 let body:any;try{body=await req.json()}catch{return reply(400,{ok:false,error:'INVALID_REQUEST'})}
 const workspaceId=String(body?.workspaceId||''),action=String(body?.action||'')
 if(!UUID.test(workspaceId)||!['provision','disable','cleanup'].includes(action))return reply(400,{ok:false,error:'INVALID_REQUEST'})
 const user=ctx.supabase,admin=ctx.supabaseAdmin
 const userClaimsId=String(ctx.userClaims?.id||''),jwtSubject=String(ctx.jwtClaims?.sub||'')
 const callerId=userClaimsId||jwtSubject
 if(!user||!admin||!UUID.test(callerId)||(userClaimsId&&jwtSubject&&userClaimsId!==jwtSubject))return reply(403,{ok:false,error:'ACCESS_DENIED'})

 if(action==='cleanup'){
  const {data:stale,error:staleError}=await user.rpc('aqari_qa_account',{p_workspace_id:workspaceId,p_action:'cleanup',p_data:{}})
  if(staleError)return reply(staleError?.code==='42501'?403:409,{ok:false,error:safeErrorCode(staleError)})
  const accounts=Array.isArray(stale?.accounts)?stale.accounts:[]
  if(accounts.length>50)return reply(409,{ok:false,error:'QA_CLEANUP_BATCH_TOO_LARGE'})
  let deletedCount=0
  for(const item of accounts){
   const accountId=String(item?.id||''),userId=String(item?.auth_user_id||'')
   if(!UUID.test(accountId)||!UUID.test(userId))return reply(409,{ok:false,error:'QA_CLEANUP_ID_INVALID'})
   try{await purgeQaAuth(admin,accountId,userId,false);deletedCount++}
   catch(error){return reply(409,{ok:false,error:safeErrorCode(error)})}
  }
  return reply(200,{ok:true,deletedCount})
 }

 if(action==='provision'){
  const source=body?.data;if(!source||typeof source!=='object'||Array.isArray(source))return reply(400,{ok:false,error:'INVALID_REQUEST'})
  const role=String(source.qa_role||'');if(![...AUTOMATION_ROLES,'tenant'].includes(role))return reply(400,{ok:false,error:'INVALID_QA_ROLE'})
  const data:any={};for(const key of ['display_name','qa_role','property_ids','tenant_id','expires_at','reason'])if(key in source)data[key]=source[key];data.qa_role=role
  if(AUTOMATION_ROLES.has(role)){if(source.email)return reply(400,{ok:false,error:'QA_AUTOMATION_EMAIL_FORBIDDEN'});data.email=`qa-${role}-${randomHex(8)}@example.com`}
  else{const email=String(source.email||'').toLowerCase();if(!EMAIL.test(email))return reply(400,{ok:false,error:'QA_TENANT_EMAIL_REQUIRED'});data.email=email}
  const {data:prepared,error:prepareError}=await user.rpc('aqari_qa_account',{p_workspace_id:workspaceId,p_action:'prepare',p_data:data})
  if(prepareError||!prepared?.id||!EMAIL.test(String(prepared.email||'')))return reply(prepareError?.code==='42501'?403:409,{ok:false,error:safeErrorCode(prepareError)})
  const accountId=String(prepared.id),email=String(prepared.email).toLowerCase(),password=randomPassword();let createdUserId=''
  try{
   const {data:created,error:createError}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{aqari_qa:true,qa_role:role}});if(createError)throw createError
   createdUserId=String(created?.user?.id||'');if(!UUID.test(createdUserId)||String(created?.user?.email||'').toLowerCase()!==email)throw new Error('QA_AUTH_PROVISION_NOT_CONFIRMED')
   const {data:confirmed,error:confirmError}=await admin.rpc('aqari_qa_account_server_result',{p_account_id:accountId,p_action:'provision',p_user_id:createdUserId,p_error:null});if(confirmError)throw confirmError
   if(confirmed?.status!=='active'||String(confirmed?.auth_user_id||'')!==createdUserId)throw new Error('QA_AUTH_BIND_NOT_CONFIRMED')
   return reply(201,{ok:true,id:accountId,status:'active',qaRole:role,expiresAt:prepared.expires_at,email,password})
  }catch(error){
   if(createdUserId){try{await admin.auth.admin.deleteUser(createdUserId)}catch{}}
   try{await admin.rpc('aqari_qa_account_server_result',{p_account_id:accountId,p_action:'provision',p_user_id:null,p_error:safeErrorCode(error)})}catch{}
   return reply(409,{ok:false,error:safeErrorCode(error)})
  }
 }

 const accountId=String(body?.accountId||''),reason=String(body?.reason||'')
 if(!UUID.test(accountId)||reason.length<3||reason.length>500)return reply(400,{ok:false,error:'INVALID_QA_DISABLE'})
 const {data:prepared,error:disableError}=await user.rpc('aqari_qa_account',{p_workspace_id:workspaceId,p_action:'disable',p_data:{id:accountId,reason}})
 if(disableError||!prepared?.id)return reply(disableError?.code==='42501'?403:409,{ok:false,error:safeErrorCode(disableError)})
 const userId=prepared.auth_user_id?String(prepared.auth_user_id):''
 if(!userId)return reply(200,{ok:true,id:accountId,status:'disabled',deleted:true})
 try{
  await purgeQaAuth(admin,accountId,userId,prepared.status==='disable_pending')
  return reply(200,{ok:true,id:accountId,status:'disabled',deleted:true})
 }catch(error){return reply(409,{ok:false,error:safeErrorCode(error)})}
})
export default {fetch}
