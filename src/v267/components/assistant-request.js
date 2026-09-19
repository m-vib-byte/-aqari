// Bound the complete operation, including session lookup and response body.
export async function runAssistantTask(task,controller,timeoutMs=20000){
 let timer,onAbort;
 const check=()=>{if(controller.signal.aborted)throw Error('ASSISTANT_CANCELLED');};
 try{
  const stopped=new Promise((_,reject)=>{
   onAbort=()=>reject(Error('ASSISTANT_CANCELLED'));
   controller.signal.addEventListener('abort',onAbort,{once:true});
   if(controller.signal.aborted){onAbort();return;}
   timer=setTimeout(()=>{reject(Error('ASSISTANT_TIMEOUT'));controller.abort();},timeoutMs);
  });
  const work=Promise.resolve().then(()=>{check();return task(controller.signal,check);});
  return await Promise.race([work,stopped]);
 }finally{clearTimeout(timer);controller.signal.removeEventListener('abort',onAbort);}
}
