// One-use, memory-only recovery boundary. SDK calls stay outside auth callbacks.
export function createRecoveryTransport(fetcher, timeoutMs=20000){
 let stopped=false;const active=new Set();
 return {
  stop(){stopped=true;for(const c of active)c.abort();active.clear();},
  async fetch(url,options={}){
   if(stopped)throw Error('RECOVERY_CLOSED');
   const c=new AbortController();active.add(c);
   const abort=()=>c.abort();options.signal?.addEventListener('abort',abort,{once:true});
   if(options.signal?.aborted)c.abort();
   const timer=setTimeout(abort,timeoutMs);
   try{
    const response=await fetcher(url,{...options,signal:c.signal});
    // Include response-body consumption in the network deadline.
    const body=await response.arrayBuffer();
    if(stopped||c.signal.aborted)throw Error('RECOVERY_CLOSED');
    return new Response([204,205,304].includes(response.status)?null:body,{status:response.status,statusText:response.statusText,headers:response.headers});
   }finally{clearTimeout(timer);active.delete(c);options.signal?.removeEventListener('abort',abort);}
  }
 };
}

export function createPasswordRecovery(client,transport,changed,timeoutMs=20000){
 let phase='loading',identity=null,recovered=null,epoch=0,resolveRecovery;
 const recoveryEvent=new Promise(resolve=>{resolveRecovery=resolve;});
 const emit=next=>{phase=next;changed(next);};
 function close(next='expired'){epoch++;identity=null;recovered=null;resolveRecovery(null);transport.stop();emit(next);}
 const subscription=client.auth.onAuthStateChange((event,session)=>{
  if(!['loading','ready','saving','signing-out'].includes(phase))return;
  if(event==='PASSWORD_RECOVERY'&&phase==='loading'&&session?.user?.id){recovered=session.user.id;resolveRecovery(recovered);}
  else if(event==='SIGNED_OUT'&&phase==='signing-out')identity=null;
  else if(event==='SIGNED_OUT'||(identity&&session?.user?.id!==identity))close();
 });
 async function bounded(task){
  let timer;try{return await Promise.race([task(),new Promise((_,reject)=>{timer=setTimeout(()=>{close(phase==='loading'?'expired':phase==='signing-out'?'saved-signout-failed':'uncertain');reject(Error('RECOVERY_TIMEOUT')); },timeoutMs);})]);}
  finally{clearTimeout(timer);}
 }
 function check(ticket){if(ticket!==epoch)throw Error('RECOVERY_CLOSED');}
 async function verify(ticket){
  const s=await client.auth.getSession();check(ticket);
  if(s.error||!s.data?.session?.user?.id||s.data.session.user.id!==identity)throw Error('RECOVERY_IDENTITY');
  const u=await client.auth.getUser();check(ticket);
  if(u.error||u.data?.user?.id!==identity)throw Error('RECOVERY_IDENTITY');
 }
 return {
  async initialize(){
   const ticket=epoch;
   try{await bounded(async()=>{
    const s=await client.auth.getSession();check(ticket);
    if(s.error||!s.data?.session)throw Error('RECOVERY_REQUIRED');
    await recoveryEvent;check(ticket);
    if(!recovered||s.data.session.user?.id!==recovered)throw Error('RECOVERY_REQUIRED');
    identity=recovered;await verify(ticket);emit('ready');
   });}catch{if(ticket===epoch)close('expired');}
  },
  async save(password,confirmation){
   if(phase!=='ready')return false;
   if(typeof password!=='string'||password.length<10||password.length>128||password!==confirmation){changed('validation');return false;}
   const ticket=epoch;emit('saving');
   try{return await bounded(async()=>{
    await verify(ticket);check(ticket);
    const r=await client.auth.updateUser({password});check(ticket);
    if(r.error)throw Error('RECOVERY_SAVE_FAILED');
    if(r.data?.user?.id!==identity)throw Error('RECOVERY_IDENTITY');
    await verify(ticket);check(ticket);
    // Confirm only a verified update. Revoke refresh sessions before completion.
    emit('signing-out');
    const out=await client.auth.signOut({scope:'global'});
    check(ticket);
    if(out.error){if(phase!=='expired')close('saved-signout-failed');return false;}
    close('complete');return true;
   });}catch{if(ticket===epoch)close('uncertain');return false;}
  },
  close(){close();subscription.data?.subscription?.unsubscribe();},
  get phase(){return phase;}
 };
}
