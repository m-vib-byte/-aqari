import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import {receiverHandler} from '../_shared/storage-restore-v2.js';
// Deployment is intentionally disabled until an isolated source AND target are approved.
const env=(name:string)=>Deno.env.get(name)||'';
// Accept surrounding paste whitespace and one root slash; the exact project allowlist below still applies.
const source=env('AQARI_RESTORE_SOURCE_URL').trim().replace(/\/$/,''),sourceKey=env('AQARI_RESTORE_SOURCE_PUBLIC_KEY');
const workspace=env('AQARI_RESTORE_WORKSPACE'),bucket=env('AQARI_RESTORE_BUCKET');
const target=env('SUPABASE_URL');
const enabled=env('AQARI_STORAGE_RESTORE_V2_ENABLED')==='true';
// Report configuration names only, never values or credentials. This lets an
// operator identify the blocked setup without exporting the secret inventory.
const configurationIssues=[
 ...(!enabled?['AQARI_STORAGE_RESTORE_V2_ENABLED']:[]),
 ...(source!=='https://ofgmcsmxmdswlovsckqs.supabase.co'?['AQARI_RESTORE_SOURCE_URL']:[]),
 ...(!sourceKey?['AQARI_RESTORE_SOURCE_PUBLIC_KEY']:[]),
 ...(!workspace?['AQARI_RESTORE_WORKSPACE']:[]),
 ...(!bucket?['AQARI_RESTORE_BUCKET']:[]),
 ...(target!=='https://nlqynpmilcdqztwrrvyu.supabase.co'?['SUPABASE_URL']:[])
];
function sourceUrlIssue(){
 if(!source)return 'missing';
 try{
  const parsed=new URL(source);
  if(parsed.protocol!=='https:')return 'https_required';
  if(parsed.hostname!=='ofgmcsmxmdswlovsckqs.supabase.co')return 'wrong_project';
  if(parsed.username||parsed.password)return 'credentials_not_allowed';
  if(parsed.port)return 'port_not_allowed';
  if(parsed.pathname!=='/'||parsed.search||parsed.hash)return 'root_url_required';
  return source==='https://ofgmcsmxmdswlovsckqs.supabase.co'?null:'noncanonical_url';
 }catch{return 'malformed_url';}
}
function claims(token:string){try{return JSON.parse(atob(token.split('.')[1].replaceAll('-','+').replaceAll('_','/')))}catch{return null}}
Deno.serve(async(req:Request)=>{
 if(configurationIssues.length)return Response.json({ok:false,error:'RESTORE_CONFIGURATION_PENDING',configuration_issues:configurationIssues,source_url_issue:sourceUrlIssue()},{status:503});
 const admin=createClient(target,env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
 const rpc=async(action:string,data:any)=>{
  const {data:result,error}=await admin.rpc('aqari_storage_restore_v2',{p_action:action,p_data:{...data,workspace,sourceProject:new URL(source).hostname.split('.')[0]}});
  if(error)throw Error('RESTORE_DATABASE_UNCONFIRMED');return result;
 };
 const path=(run:string,o:any)=>`${run}/storage/${o.bucket}/${o.name}`;
 const handler=receiverHandler({workspace,sourceProject:new URL(source).hostname.split('.')[0],
  authenticate:async(request:Request)=>{
   const authorization=request.headers.get('authorization')||'';if(!authorization.startsWith('Bearer '))return false;
   const token=authorization.slice(7),claim=claims(token);if(claim?.aal!=='aal2')return false;
   const headers={apikey:sourceKey,authorization};
   // Both are authoritative read-only checks; no credential state is retained.
   const response=await fetch(source+'/auth/v1/user',{headers,redirect:'error',signal:AbortSignal.timeout(10000)});
   if(response.status!==200)return false;const user=await response.json();if(user?.id!==claim?.sub)return false;
   const access=await fetch(source+'/rest/v1/rpc/aqari_workspace_access',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({p_workspace_id:workspace}),redirect:'error',signal:AbortSignal.timeout(10000)});
   if(access.status!==200)return false;const a=await access.json();return a?.workspace_id===workspace&&a?.user_id===user.id&&a?.role==='general_manager';
  },
  store:{
   begin:async(plan:any)=>{
    const {data,error}=await admin.storage.getBucket(bucket);
    // Bucket limits apply per object, while the protocol caps the whole snapshot.
    const limit=Number(data?.file_size_limit??data?.fileSizeLimit??0);
    if(error||!data||data.public||!Number.isSafeInteger(limit)||limit<=0)throw Error('RESTORE_BUCKET_CONFIGURATION_PENDING');
    if(plan.objects.some((object:any)=>object.bytes>limit))throw Error('BACKUP_SIZE_LIMIT');
    return rpc('begin',plan);
   },
   check:(runId:string,object:any)=>rpc('check',{runId,object}),
   read:async(runId:string,object:any)=>{
    const {data,error}=await admin.storage.from(bucket).download(path(runId,object));
    if(error){if(String((error as any).statusCode)==='404')return null;throw Error('RESTORE_READ_UNCONFIRMED');}
    return new Uint8Array(await data.arrayBuffer());
   },
   write:async(runId:string,object:any,bytes:Uint8Array)=>{
    const {error}=await admin.storage.from(bucket).upload(path(runId,object),bytes,{contentType:'application/octet-stream',upsert:false});
    if(error)throw Error('RESTORE_WRITE_UNCONFIRMED');
   },
   record:(runId:string,object:any)=>rpc('record',{runId,object}),
   finalize:(runId:string)=>rpc('finalize',{runId})
  }
 });
 return handler(req);
});
