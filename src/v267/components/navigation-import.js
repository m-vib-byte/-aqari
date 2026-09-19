// A slow page download must not open a dialog after a newer destination wins.
let generation=0,pendingCancel=null;
export function cancelPendingNavigation(){
 generation++;
 pendingCancel?.();
}
if(typeof window!=='undefined'){
 window.addEventListener('aqari:navigation-start',cancelPendingNavigation);
 window.addEventListener('aqari:auth-boundary',cancelPendingNavigation);
}
export async function guardPageImport(load){
 cancelPendingNavigation();
 const ticket=generation;
 let timer,cancel;
 const stopped=new Promise((_,reject)=>{
  cancel=()=>reject(Error('NAVIGATION_SUPERSEDED'));
  pendingCancel=cancel;
  timer=setTimeout(()=>reject(Error('انتهت مهلة فتح الصفحة. أعد المحاولة.')),15000);
 });
 try{
  const work=Promise.resolve().then(()=>{
   if(ticket!==generation)throw Error('NAVIGATION_SUPERSEDED');
   return load();
  });
  const page=await Promise.race([work,stopped]);
  if(ticket!==generation)throw Error('NAVIGATION_SUPERSEDED');
  return page;
 }finally{
  clearTimeout(timer);
  if(pendingCancel===cancel)pendingCancel=null;
 }
}
