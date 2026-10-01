import { createClient } from 'npm:@supabase/supabase-js@2';

const SOURCE_URL='https://djkpkkgoibruaezdrchb.supabase.co';
const SOURCE_KEY='sb_publishable_IZsu-9m2XQCyzDFo1-R3Gw_sfSHHBLL';
const RUN_ID='08ea462d-64b7-4901-a817-d9f827571035';
const WORKSPACE='c05fcb74-8315-43aa-86b7-0b420c05d2cd';
const RESTORE_BUCKET='stage-c-restore-20261001';
const BUCKETS=new Set(['aqari-documents','aqari-hr-private','aqari-maintenance-private']);

function reply(status:number,body:unknown){return Response.json(body,{status,headers:{'cache-control':'no-store','pragma':'no-cache','x-content-type-options':'nosniff'}})}
function b64decode(value:string){const raw=atob(value);const out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
async function sha256(bytes:Uint8Array){const d=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));return Array.from(d,b=>b.toString(16).padStart(2,'0')).join('')}
function safeName(name:string){return name.startsWith(WORKSPACE+'/')&&name.length<=1024&&!name.includes('..')&&!/[\u0000-\u001f\u007f]/.test(name)}
function claims(token:string){try{let v=token.split('.')[1].replaceAll('-','+').replaceAll('_','/');while(v.length%4)v+='=';return JSON.parse(atob(v))}catch{return null}}

// Retry only transient failures in read-only authorization calls. Never cache
// authorization or retry a definitive rejection; both checks remain mandatory.
async function sourceJson(url:string,init:RequestInit,deadline:number){
 for(let attempt=0;attempt<2;attempt++){
  const remaining=deadline-Date.now();
  if(remaining<=0)throw Error('SOURCE_AUTH_UNAVAILABLE');
  try{
   const response=await fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(Math.min(10000,remaining))});
   if(response.status===200)return {status:200,data:await response.json()};
   if(![502,503,504].includes(response.status))return {status:response.status,data:null};
   await response.body?.cancel();
  }catch{}
 }
 throw Error('SOURCE_AUTH_UNAVAILABLE');
}
async function verifySourceManager(req:Request){
 const authorization=req.headers.get('authorization')||'';
 if(!authorization.startsWith('Bearer '))return null;
 const token=authorization.slice(7),claim=claims(token),deadline=Date.now()+25000;
 const userRes=await sourceJson(SOURCE_URL+'/auth/v1/user',{headers:{apikey:SOURCE_KEY,authorization}},deadline);
 if(userRes.status!==200)return null;
 const user=userRes.data;
 if(!user?.id||claim?.sub!==user.id||claim?.aal!=='aal2')return null;
 const accessRes=await sourceJson(SOURCE_URL+'/rest/v1/rpc/aqari_workspace_access',{
  method:'POST',headers:{apikey:SOURCE_KEY,authorization,'content-type':'application/json'},
  body:JSON.stringify({p_workspace_id:WORKSPACE})
 },deadline);
 if(accessRes.status!==200)return null;
 const access=accessRes.data;
 if(access?.workspace_id!==WORKSPACE||access?.user_id!==user.id||access?.role!=='general_manager')return null;
 return {authorization,userId:user.id};
}

Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return reply(405,{ok:false,error:'METHOD_NOT_ALLOWED'});
 if(Number(req.headers.get('content-length')||'0')>8*1024*1024)return reply(413,{ok:false,error:'REQUEST_TOO_LARGE'});
 let caller;
 try{caller=await verifySourceManager(req)}catch{return reply(503,{ok:false,error:'SOURCE_AUTH_UNAVAILABLE'})}
 if(!caller)return reply(403,{ok:false,error:'ACCESS_DENIED'});
 let body:any;try{body=await req.json()}catch{return reply(400,{ok:false,error:'INVALID_JSON'})}
 if(String(body?.runId||'')!==RUN_ID)return reply(409,{ok:false,error:'RUN_MISMATCH'});
 const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 if(!url||!key)return reply(503,{ok:false,error:'SERVER_CONTEXT_MISSING'});
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const action=String(body?.action||'object');
 try{
  const existing=await admin.storage.getBucket(RESTORE_BUCKET);
  if(existing.error){
   const created=await admin.storage.createBucket(RESTORE_BUCKET,{public:false,fileSizeLimit:32*1024*1024});
   if(created.error&&!String(created.error.message||'').toLowerCase().includes('already'))throw created.error;
  }
  if(action==='finalize'){
   const expectedCount=Number(body?.expectedCount),expectedBytes=Number(body?.expectedBytes);
   if(!Number.isSafeInteger(expectedCount)||expectedCount<0||!Number.isSafeInteger(expectedBytes)||expectedBytes<0)return reply(400,{ok:false,error:'INVALID_FINALIZE'});
   const {data,error}=await admin.rpc('v267_stage_c_restore_storage_finalize',{p_run_id:RUN_ID,p_expected_count:expectedCount,p_expected_bytes:expectedBytes});
   if(error)throw error;
   return reply(200,{ok:true,summary:data});
  }
  const bucket=String(body?.bucket||''),name=String(body?.name||''),claimedSha=String(body?.sha256||''),etag=String(body?.etag||'');
  const claimedBytes=Number(body?.bytes),content=String(body?.base64||''),mime=String(body?.mime||'application/octet-stream');
  if(!BUCKETS.has(bucket)||!safeName(name)||!/^[0-9a-f]{64}$/.test(claimedSha)||!Number.isSafeInteger(claimedBytes)||claimedBytes<0)return reply(400,{ok:false,error:'INVALID_OBJECT'});
  const bytes=b64decode(content);if(bytes.length!==claimedBytes)return reply(409,{ok:false,error:'LENGTH_MISMATCH'});
  const hash=await sha256(bytes);if(hash!==claimedSha)return reply(409,{ok:false,error:'SOURCE_HASH_MISMATCH'});
  const targetPath=`${RUN_ID}/storage/${bucket}/${name}`;
  const up=await admin.storage.from(RESTORE_BUCKET).upload(targetPath,bytes,{contentType:mime,upsert:true});if(up.error)throw up.error;
  const down=await admin.storage.from(RESTORE_BUCKET).download(targetPath);if(down.error||!down.data)throw down.error||new Error('READBACK_MISSING');
  const readBytes=new Uint8Array(await down.data.arrayBuffer()),readHash=await sha256(readBytes);
  if(readBytes.length!==claimedBytes||readHash!==claimedSha)return reply(409,{ok:false,error:'READBACK_HASH_MISMATCH'});
  const rec=await admin.rpc('v267_stage_c_restore_storage_record',{p_run_id:RUN_ID,p_bucket:bucket,p_name:name,p_bytes:claimedBytes,p_sha256:readHash,p_etag:etag});
  if(rec.error)throw rec.error;
  return reply(200,{ok:true,bucket,name,bytes:claimedBytes,sha256:readHash});
 }catch(error){return reply(500,{ok:false,error:'RESTORE_RECEIVER_FAILED',detail:String((error as any)?.message||error).slice(0,180)})}
});
