// Read-only partner RPCs. No staff state, raw table reads or cached business data.
export function createPartnerSession(client,onBoundary=()=>{},timeoutMs=20000){
 let epoch=0,version=0,user=null,closed=false;const jobs=new Set();
 function invalidate(){epoch++;version++;user=null;for(const job of jobs)job.abort();jobs.clear();onBoundary();}
 const subscription=client.auth.onAuthStateChange((event,session)=>{
  if(event==='SIGNED_OUT'||event==='PASSWORD_RECOVERY'||(user&&session?.user?.id!==user))invalidate();
 });
 async function read({propertyId=null,workspaceId=null,month=null}={}){
  for(const job of jobs)job.abort();const turn=++version,scope=epoch,controller=new AbortController();jobs.add(controller);
  let timer,rejectAbort;const check=()=>{if(closed||scope!==epoch||turn!==version||controller.signal.aborted)throw Error('PARTNER_SESSION_CHANGED');};
  const aborted=new Promise((_,reject)=>{rejectAbort=()=>reject(Error('PARTNER_READ_ABORTED'));controller.signal.addEventListener('abort',rejectAbort,{once:true});});
  timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await Promise.race([(async()=>{
   check();const auth=await client.auth.getSession();check();
   const id=auth.data?.session?.user?.id;
   if(auth.error||!id)throw Error('PARTNER_SIGN_IN_REQUIRED');
   if(user&&user!==id){invalidate();throw Error('PARTNER_SESSION_CHANGED');}user=id;
   const response=await client.rpc('aqari_partner_summary',{p_property_id:propertyId,p_month:month}).abortSignal(controller.signal);check();
   if(response.error)throw Error('PARTNER_ACCESS_DENIED');
   const data=response.data;
   if(!data||data.user_id!==id)throw Error('PARTNER_SCOPE_MISMATCH');
   if(propertyId){
    if(data.property_id!==propertyId||data.workspace_id!==workspaceId||data.month!==month)throw Error('PARTNER_SCOPE_MISMATCH');
   }else if(!Array.isArray(data.properties)||data.properties.some(p=>!p?.id||!p.workspace_id||typeof p.name!=='string'))throw Error('PARTNER_SCOPE_MISMATCH');
   const verified=await client.auth.getSession();check();
   if(verified.error||verified.data?.session?.user?.id!==id){invalidate();throw Error('PARTNER_SESSION_CHANGED');}
   return data;
  })(),aborted]);}finally{clearTimeout(timer);controller.signal.removeEventListener('abort',rejectAbort);jobs.delete(controller);}
 }
 function close(){closed=true;invalidate();subscription?.data?.subscription?.unsubscribe();}
 return {read,invalidate,close};
}
