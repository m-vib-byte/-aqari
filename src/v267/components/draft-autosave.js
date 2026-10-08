// Explicit actions share the autosave queue, so a review cannot race its write.
export function createDraftAutosave({snapshot,save,onPending=()=>{},onSaved=()=>{},onError=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}){
 let timer=null,pending=false,disposed=false,tail=Promise.resolve();
 function enqueue(){
  if(!pending||disposed)return;
  pending=false;const value=snapshot();
  tail=tail.catch(()=>{}).then(async()=>{
   if(disposed)throw Error('أغلقت مسودة التأسيس. أعد فتحها قبل الحفظ.');
   await save(value);if(!disposed)onSaved();
  });
  tail.catch(error=>{if(!disposed)onError(error);});
 }
 return {
  schedule(){if(disposed)return;pending=true;onPending();if(timer!==null)clearTimer(timer);timer=setTimer(()=>{timer=null;enqueue();},500);},
  async flush(){if(disposed)throw Error('أغلقت مسودة التأسيس. أعد فتحها قبل الحفظ.');if(timer!==null){clearTimer(timer);timer=null;}enqueue();await tail;},
  dispose(){disposed=true;pending=false;if(timer!==null)clearTimer(timer);timer=null;}
 };
}
