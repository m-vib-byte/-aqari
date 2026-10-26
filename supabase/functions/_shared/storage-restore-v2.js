// Shared executable protocol. No credentials, network, or database side effects on import.
export const MAX_BYTES = 64 * 1024 * 1024;
export const MAX_CONTROL_BYTES = 8 * 1024 * 1024;
export const PROTOCOL = 'storage-snapshot-v2';
const buckets = new Set(['aqari-documents','aqari-hr-private','aqari-maintenance-private']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function digest(bytes) {return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
export async function snapshot(workspace,sourceProject,objects) {
 if(!uuid.test(workspace)||!String(sourceProject).match(/^[a-z0-9-]{3,64}$/)||!Array.isArray(objects)||objects.length>5000)throw Error('INVALID_SNAPSHOT');
 const list=objects.map(o=>({bucket:o.bucket,name:o.name,bytes:o.bytes,sha256:o.sha256})).sort((a,b)=>a.bucket<b.bucket?-1:a.bucket>b.bucket?1:a.name<b.name?-1:a.name>b.name?1:0);
 const seen=new Set();let total=0;
 for(const o of list){
  if(!buckets.has(o.bucket)||typeof o.name!=='string'||o.name.length>1024||!o.name.startsWith(workspace+'/')||/[\\\u0000-\u001f\u007f]/.test(o.name)||o.name.split('/').some(p=>!p||p==='.'||p==='..')||!Number.isSafeInteger(o.bytes)||o.bytes<0||!/^[0-9a-f]{64}$/.test(o.sha256))throw Error('INVALID_OBJECT');
  const key=JSON.stringify([o.bucket,o.name]);if(seen.has(key))throw Error('DUPLICATE_OBJECT');seen.add(key);total+=o.bytes;
 }
 if(total>MAX_BYTES)throw Error('BACKUP_SIZE_LIMIT');
 const hash=await digest(new TextEncoder().encode(JSON.stringify({workspace,sourceProject,objects:list})));
 // Content-addressed UUID: identical snapshot/retry = same run; deletion/change = new run.
 const runId=`${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
 return {protocol:PROTOCOL,runId,snapshotHash:hash,workspace,sourceProject,objects:list,count:list.length,bytes:total};
}
export async function readLimited(request,limit){
 const declared=request.headers.get('content-length');
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>limit))throw Error('REQUEST_TOO_LARGE');
 const reader=request.body?.getReader();if(!reader)return new Uint8Array();
 const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('REQUEST_TOO_LARGE');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
async function exchange(fetcher,url,init){
 for(let attempt=0;attempt<2;attempt++){
  try{
   const response=await fetcher(url,{...init,redirect:'error',signal:AbortSignal.timeout(60000)});
   const body=await response.json();
   if(response.status===200&&body?.ok===true&&body.protocol===PROTOCOL)return body;
   if(response.status<500||attempt)throw Error('RESTORE_REJECTED');
  }catch(error){if(attempt||error.message==='RESTORE_REJECTED')throw error;}
 }
 throw Error('RESTORE_UNCONFIRMED');
}
export async function transferSnapshot(fetcher,url,authorization,plan,bytesFor){
 const control=body=>exchange(fetcher,url,{method:'POST',headers:{'content-type':'application/json',authorization},body:JSON.stringify(body)});
 const begun=await control({action:'begin',...plan});
 if(begun.runId!==plan.runId)throw Error('RUN_MISMATCH');
 for(const object of plan.objects){
  const bytes=bytesFor(object);
  if(bytes.length!==object.bytes||await digest(bytes)!==object.sha256)throw Error('SOURCE_HASH_MISMATCH');
  // Binary body avoids base64 expansion for encrypted/incompressible objects.
  const result=await exchange(fetcher,url,{method:'POST',headers:{authorization,'content-type':'application/octet-stream','x-aqari-run':plan.runId,'x-aqari-object':encodeURIComponent(JSON.stringify(object))},body:bytes});
  if(result.runId!==plan.runId||result.sha256!==object.sha256)throw Error('READBACK_HASH_MISMATCH');
 }
 const done=await control({action:'finalize',runId:plan.runId});
 if(done.runId!==plan.runId||done.verified!==true||done.count!==plan.count||done.bytes!==plan.bytes||done.snapshotHash!==plan.snapshotHash)throw Error('FINALIZE_MISMATCH');
 return done;
}
export function receiverHandler({authenticate,store,sourceProject,workspace}){
 return async request=>{
  const reply=(status,body)=>Response.json({protocol:PROTOCOL,...body},{status,headers:{'cache-control':'no-store'}});
  if(request.method!=='POST')return reply(405,{ok:false,error:'METHOD_NOT_ALLOWED'});
  try{
   if(!await authenticate(request))return reply(403,{ok:false,error:'ACCESS_DENIED'});
   if(request.headers.get('content-type')==='application/octet-stream'){
    const runId=request.headers.get('x-aqari-run');if(!uuid.test(runId||''))throw Error('RUN_MISMATCH');
    const header=request.headers.get('x-aqari-object')||'';if(header.length>16000)throw Error('INVALID_OBJECT');
    const object=JSON.parse(decodeURIComponent(header));
    await snapshot(workspace,sourceProject,[object]);
    await store.check(runId,object); // reject foreign/unknown run before reading/writing bytes
    const bytes=await readLimited(request,object.bytes);
    if(bytes.length!==object.bytes||await digest(bytes)!==object.sha256)throw Error('SOURCE_HASH_MISMATCH');
    let existing=await store.read(runId,object);
    if(existing===null){
     try{await store.write(runId,object,bytes);}catch(error){
      // Upload may have succeeded before response loss, or raced an identical retry.
      existing=await store.read(runId,object);if(existing===null)throw error;
     }
    }
    const readback=existing??await store.read(runId,object);
    if(readback===null||readback.length!==object.bytes||await digest(readback)!==object.sha256)throw Error('READBACK_HASH_MISMATCH');
    await store.record(runId,object);
    return reply(200,{ok:true,runId,sha256:object.sha256});
   }
   const body=JSON.parse(new TextDecoder().decode(await readLimited(request,MAX_CONTROL_BYTES)));
   if(body.action==='begin'){
    const plan=await snapshot(workspace,sourceProject,body.objects);
    if(body.workspace!==workspace||body.sourceProject!==sourceProject||body.runId!==plan.runId||body.snapshotHash!==plan.snapshotHash||body.protocol!==PROTOCOL)throw Error('SNAPSHOT_MISMATCH');
    await store.begin(plan);return reply(200,{ok:true,runId:plan.runId});
   }
   if(body.action==='finalize'&&uuid.test(body.runId||''))return reply(200,{ok:true,...await store.finalize(body.runId)});
   throw Error('INVALID_ACTION');
  }catch(error){
   const code=error.message||'RESTORE_FAILED';
   const validation=/^(INVALID_|DUPLICATE_|RUN_|SNAPSHOT_|SOURCE_HASH_|READBACK_HASH_|BACKUP_SIZE_|FINALIZE_)/.test(code);
   return reply(code==='REQUEST_TOO_LARGE'?413:validation?409:503,{ok:false,error:validation||code==='REQUEST_TOO_LARGE'?code:'RESTORE_UNCONFIRMED'});
  }
 };
}
