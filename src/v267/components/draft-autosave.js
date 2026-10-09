// Explicit actions share the autosave queue, so a review cannot race its write.
export function createDraftAutosave({snapshot,save,onPending=()=>{},onSaved=()=>{},onError=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}){
 let timer=null,pending=false,disposed=false,revision=0,confirmed=0,tail=Promise.resolve();
 function enqueue(){
  if(!pending||disposed)return;
  const value=snapshot(),version=revision;pending=false;
  tail=tail.catch(()=>{}).then(async()=>{
   if(disposed)throw Error('أغلقت مسودة التأسيس. أعد فتحها قبل الحفظ.');
   await save(value);if(!disposed){confirmed=version;if(confirmed===revision)onSaved();}
  });
  tail.catch(error=>{if(!disposed)onError(error);});
 }
 return {
  schedule(){if(disposed)return;revision++;pending=true;onPending();if(timer!==null)clearTimer(timer);timer=setTimer(()=>{timer=null;enqueue();},500);},
  hasUnsavedChanges(){return !disposed&&revision!==confirmed;},
  async flush(){
   let current;
   do{
    if(disposed)throw Error('أغلقت مسودة التأسيس. أعد فتحها قبل الحفظ.');
    if(timer!==null){clearTimer(timer);timer=null;}enqueue();current=tail;await current;
    if(disposed)throw Error('أغلقت مسودة التأسيس. أعد فتحها قبل الحفظ.');
   }while(pending||current!==tail);
  },
  dispose(){disposed=true;pending=false;if(timer!==null)clearTimer(timer);timer=null;}
 };
}
