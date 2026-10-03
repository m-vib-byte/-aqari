// Version-pinned assets are served from our origin. Document pixels stay in this worker.
let library;
function loadLibrary(){
 if(globalThis.Tesseract?.createWorker)return Promise.resolve(globalThis.Tesseract);
 if(!library)library=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='/vendor/ocr/tesseract.min.js';
  const timer=setTimeout(()=>{script.remove();library=null;reject(Error('OCR_LOAD_TIMEOUT'));},30000);
  script.onload=()=>{clearTimeout(timer);if(globalThis.Tesseract?.createWorker)resolve(globalThis.Tesseract);else{library=null;reject(Error('OCR_UNAVAILABLE'));}};
  script.onerror=()=>{clearTimeout(timer);script.remove();library=null;reject(Error('OCR_UNAVAILABLE'));};document.head.append(script);
 });return library;
}
export async function recognizePdfPage(image,{signal,onProgress=()=>{}}={}){
 let worker,timer,abort;let stopped=false;
 const cancelled=new Promise((_,reject)=>{abort=()=>{stopped=true;worker?.terminate();reject(Error('OCR_CANCELLED'));};signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(abort,120000);if(signal?.aborted)abort();});
 try{
  const task=(async()=>{
   const Tesseract=await loadLibrary();if(stopped)throw Error('OCR_CANCELLED');
   worker=await Tesseract.createWorker('ara+eng',1,{workerPath:'/vendor/ocr/worker.min.js',corePath:'/vendor/ocr/core',langPath:'/vendor/ocr/lang',workerBlobURL:false,cacheMethod:'none',logger:m=>{if(!stopped)onProgress(Math.round((m.progress||0)*100));}});
   if(stopped){await worker.terminate();throw Error('OCR_CANCELLED');}
   const {data}=await worker.recognize(image);return data.text||'';
  })();return await Promise.race([task,cancelled]);
 }finally{stopped=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);await worker?.terminate();}
}
