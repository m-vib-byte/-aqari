import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";
import { zipSync, strToU8 } from "npm:fflate@0.8.2";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUCKETS=["aqari-documents","aqari-hr-private","aqari-maintenance-private"];
const MAX_OBJECTS=5000;
const MAX_BYTES=64*1024*1024;
const MAX_CATALOG_ENTRIES=10000;
const ALLOWED_ORIGINS=new Set(["https://myaqari.com","https://www.myaqari.com"]);
const RESTORE_TARGET="https://ofgmcsmxmdswlovsckqs.supabase.co/functions/v1/stage-c-storage-receiver-20261001";
const RESTORE_RUN_ID="08ea462d-64b7-4901-a817-d9f827571035";

function originHeaders(req:Request){
  const origin=req.headers.get("origin")||"";
  const allowed=ALLOWED_ORIGINS.has(origin)?origin:"https://myaqari.com";
  return {
    "access-control-allow-origin":allowed,
    "access-control-allow-headers":"authorization, apikey, content-type",
    "access-control-allow-methods":"POST, OPTIONS",
    "access-control-expose-headers":"content-disposition, x-aqari-backup-sha256, x-aqari-backup-object-count, x-aqari-backup-total-bytes, x-aqari-restore-verified, x-aqari-restore-object-count, x-aqari-restore-total-bytes",
    "vary":"origin",
    "cache-control":"no-store, max-age=0",
    "pragma":"no-cache",
    "x-content-type-options":"nosniff"
  };
}
function json(req:Request,status:number,body:unknown){
  return Response.json(body,{status,headers:originHeaders(req)});
}
async function sha256(bytes:Uint8Array){
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
  return Array.from(digest,b=>b.toString(16).padStart(2,"0")).join("");
}
function safePath(name:string,workspaceId:string){
  if(!name.startsWith(workspaceId+"/")||name.startsWith("/")||name.includes("\\")||/[\u0000-\u001f\u007f]/.test(name))return false;
  const parts=name.split("/");
  return parts.every(part=>part&&part!=="."&&part!=="..");
}
// Storage's API can list private objects without exposing its internal schema
// through PostgREST. Walk every folder and continue past server-capped pages.
async function storageCatalog(admin:any,workspaceId:string){
  const objects:any[]=[];
  const seen=new Set<string>();
  for(const bucket of BUCKETS){
    const pending=[workspaceId];
    while(pending.length){
      const prefix=pending.pop()!;
      let offset=0;
      while(true){
        const {data:rows,error}=await admin.storage.from(bucket).list(prefix,{
          limit:500,offset,sortBy:{column:"name",order:"asc"}
        });
        if(error||!Array.isArray(rows)||rows.length>500)throw Error("STORAGE_CATALOG_FAILED");
        if(rows.length===0)break;
        for(const row of rows){
          if(typeof row?.name!=="string"||row.name.includes("/"))throw Error("INVALID_STORAGE_PATH");
          const name=prefix+"/"+row.name;
          if(!safePath(name,workspaceId))throw Error("INVALID_STORAGE_PATH");
          const key=JSON.stringify([bucket,name]);
          if(seen.has(key))throw Error("STORAGE_CATALOG_CHANGED");
          seen.add(key);
          if(seen.size>MAX_CATALOG_ENTRIES||name.split("/").length>64)throw Error("BACKUP_CATALOG_LIMIT");
          if(row.id===null&&row.metadata==null){
            pending.push(name);
          }else{
            const size=Number(row.metadata?.size);
            if(typeof row.id!=="string"||!row.id||row.metadata?.size==null||!Number.isSafeInteger(size)||size<0){
              throw Error("STORAGE_CATALOG_FAILED");
            }
            objects.push({...row,bucket_id:bucket,name});
            if(objects.length>MAX_OBJECTS)throw Error("BACKUP_OBJECT_LIMIT");
          }
        }
        offset+=rows.length;
      }
    }
  }
  return objects.sort((a,b)=>a.bucket_id<b.bucket_id?-1:a.bucket_id>b.bucket_id?1:a.name<b.name?-1:a.name>b.name?1:0);
}
function catalogFingerprint(objects:any[]){
  return JSON.stringify(objects.map(row=>[
    row.bucket_id,row.name,row.id,Number(row.metadata.size),
    row.metadata.eTag||row.metadata.etag||"",row.metadata.mimetype||"",
    row.created_at||null,row.updated_at||null
  ]));
}
function catalogFailure(req:Request,error:any){
  const reason=String(error?.message||"");
  const conflicts=["INVALID_STORAGE_PATH","STORAGE_CATALOG_CHANGED","BACKUP_OBJECT_LIMIT","BACKUP_CATALOG_LIMIT"];
  return json(req,conflicts.includes(reason)?409:500,{ok:false,error:conflicts.includes(reason)?reason:"STORAGE_CATALOG_FAILED"});
}
function b64encode(bytes:Uint8Array){
  let raw="";const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk)raw+=String.fromCharCode(...bytes.subarray(i,i+chunk));
  return btoa(raw);
}
async function restoreObject(authorization:string,item:any,bytes:Uint8Array){
  const response=await fetch(RESTORE_TARGET,{
    method:"POST",
    headers:{"content-type":"application/json",authorization},
    body:JSON.stringify({
      runId:RESTORE_RUN_ID,action:"object",bucket:item.bucket,name:item.name,bytes:item.bytes,
      sha256:item.sha256,etag:item.etag,mime:item.content_type,base64:b64encode(bytes)
    }),
    redirect:"error",signal:AbortSignal.timeout(60000)
  });
  const result=await response.json().catch(()=>null);
  if(response.status!==200||result?.ok!==true||result?.sha256!==item.sha256)throw Error("ISOLATED_STORAGE_RESTORE_FAILED");
}
async function finalizeRestore(authorization:string,count:number,bytes:number){
  const response=await fetch(RESTORE_TARGET,{
    method:"POST",
    headers:{"content-type":"application/json",authorization},
    body:JSON.stringify({runId:RESTORE_RUN_ID,action:"finalize",expectedCount:count,expectedBytes:bytes}),
    redirect:"error",signal:AbortSignal.timeout(30000)
  });
  const result=await response.json().catch(()=>null);
  if(response.status!==200||result?.ok!==true||result?.summary?.verified!==true||
     Number(result?.summary?.count)!==count||Number(result?.summary?.bytes)!==bytes){
    throw Error("ISOLATED_STORAGE_FINALIZE_FAILED");
  }
  return result.summary;
}

const handleRequest=withSupabase({auth:"user"},async(req:any,ctx:any)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:originHeaders(req)});
  if(req.method!=="POST")return json(req,405,{ok:false,error:"METHOD_NOT_ALLOWED"});
  if(Number(req.headers.get("content-length")||"0")>8192)return json(req,413,{ok:false,error:"REQUEST_TOO_LARGE"});
  const caller=String(ctx.userClaims?.id||ctx.jwtClaims?.sub||"");
  const aal=String(ctx.jwtClaims?.aal||"");
  if(!UUID.test(caller)||aal!=="aal2")return json(req,403,{ok:false,error:"MFA_REQUIRED"});
  let body:any;try{body=await req.json()}catch{return json(req,400,{ok:false,error:"INVALID_REQUEST"})}
  const workspaceId=String(body?.workspaceId||"");
  const restoreToIsolated=body?.restoreToIsolated===true;
  if(!UUID.test(workspaceId))return json(req,400,{ok:false,error:"INVALID_WORKSPACE"});
  const authorization=String(req.headers.get("authorization")||"");
  if(restoreToIsolated&&!authorization.startsWith("Bearer "))return json(req,403,{ok:false,error:"ACCESS_DENIED"});
  const user=ctx.supabase,admin=ctx.supabaseAdmin;
  if(!user||!admin)return json(req,503,{ok:false,error:"SERVER_CONTEXT_MISSING"});
  const {data:access,error:accessError}=await user.rpc("aqari_workspace_access",{p_workspace_id:workspaceId});
  if(accessError||access?.workspace_id!==workspaceId||access?.user_id!==caller||access?.role!=="general_manager"){
    return json(req,403,{ok:false,error:"ACCESS_DENIED"});
  }
  let objects:any[];
  try{objects=await storageCatalog(admin,workspaceId)}catch(error){return catalogFailure(req,error)}
  if(objects.reduce((bytes,row)=>bytes+Number(row.metadata.size),0)>MAX_BYTES){
    return json(req,409,{ok:false,error:"BACKUP_SIZE_LIMIT"});
  }
  const files:Record<string,Uint8Array>={};
  const manifestObjects:any[]=[];
  let totalBytes=0;
  for(const row of objects){
    const bucket=String(row?.bucket_id||""),name=String(row?.name||"");
    if(!BUCKETS.includes(bucket)||!safePath(name,workspaceId))return json(req,409,{ok:false,error:"INVALID_STORAGE_PATH"});
    const {data:blob,error:downloadError}=await admin.storage.from(bucket).download(name);
    if(downloadError||!blob)return json(req,500,{ok:false,error:"STORAGE_DOWNLOAD_FAILED",bucket,name});
    if(blob.size!==Number(row.metadata.size))return json(req,409,{ok:false,error:"STORAGE_CATALOG_CHANGED"});
    const bytes=new Uint8Array(await blob.arrayBuffer());
    if(bytes.length!==Number(row.metadata.size))return json(req,409,{ok:false,error:"STORAGE_CATALOG_CHANGED"});
    totalBytes+=bytes.length;
    if(totalBytes>MAX_BYTES)return json(req,409,{ok:false,error:"BACKUP_SIZE_LIMIT"});
    const hash=await sha256(bytes);
    const entry="storage/"+bucket+"/"+name;
    files[entry]=bytes;
    const manifestItem={
      bucket,name,bytes:bytes.length,sha256:hash,
      content_type:String(row?.metadata?.mimetype||blob.type||"application/octet-stream"),
      etag:String(row?.metadata?.eTag||row?.metadata?.etag||""),
      created_at:row?.created_at||null,updated_at:row?.updated_at||null
    };
    manifestObjects.push(manifestItem);
    if(restoreToIsolated){
      try{await restoreObject(authorization,manifestItem,bytes)}
      catch{return json(req,502,{ok:false,error:"ISOLATED_STORAGE_RESTORE_FAILED",bucket,name})}
    }
  }
  // Do not finalize or label the ZIP complete if objects were added, removed,
  // replaced or changed while reading the original bytes.
  try{
    const current=await storageCatalog(admin,workspaceId);
    if(catalogFingerprint(current)!==catalogFingerprint(objects))return json(req,409,{ok:false,error:"STORAGE_CATALOG_CHANGED"});
  }catch(error){return catalogFailure(req,error)}
  let restoreSummary:any=null;
  if(restoreToIsolated){
    try{restoreSummary=await finalizeRestore(authorization,manifestObjects.length,totalBytes)}
    catch{return json(req,502,{ok:false,error:"ISOLATED_STORAGE_FINALIZE_FAILED"})}
  }
  const createdAt=new Date().toISOString();
  const manifest={
    format:"aqari-stage-c-storage-backup-v1",
    project_ref:new URL(Deno.env.get("SUPABASE_URL")||"https://invalid.local").hostname.split(".")[0],
    workspace_id:workspaceId,created_at:createdAt,
    object_count:manifestObjects.length,total_bytes:totalBytes,objects:manifestObjects,
    isolated_restore:restoreToIsolated?{run_id:RESTORE_RUN_ID,verified:true,count:restoreSummary.count,bytes:restoreSummary.bytes}:null
  };
  files["manifest.json"]=strToU8(JSON.stringify(manifest,null,2));
  const zip=zipSync(files,{level:0});
  const zipHash=await sha256(zip);
  const stamp=createdAt.replace(/[-:]/g,"").replace(/\..+/,"Z");
  const headers=new Headers(originHeaders(req));
  headers.set("content-type","application/zip");
  headers.set("content-disposition",`attachment; filename="aqari-storage-backup-${stamp}.zip"`);
  headers.set("x-aqari-backup-sha256",zipHash);
  headers.set("x-aqari-backup-object-count",String(manifestObjects.length));
  headers.set("x-aqari-backup-total-bytes",String(totalBytes));
  if(restoreToIsolated){
    headers.set("x-aqari-restore-verified","true");
    headers.set("x-aqari-restore-object-count",String(restoreSummary.count));
    headers.set("x-aqari-restore-total-bytes",String(restoreSummary.bytes));
  }
  return new Response(zip,{status:200,headers});
});
export default {fetch:handleRequest};
