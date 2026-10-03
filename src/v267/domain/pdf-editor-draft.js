const copy=value=>JSON.parse(JSON.stringify(value));
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])])):value;
export const pdfEditorFingerprint=value=>JSON.stringify(ordered(value));
const same=(a,b)=>pdfEditorFingerprint(a)===pdfEditorFingerprint(b);

// One working copy per editor. No browser storage, document issuance or app-state
// writes. Retain the exact request after an ambiguous response, including when
// typing continues. Only a confirmed revision conflict permits an explicit fork.
export function createPdfEditorDraft({propertyId,initial=null,read,write,onStatus=()=>{},delay=900}){
 let id=initial?.id||crypto.randomUUID(),revision=initial?.revision||0;
 let timer=null,running=null,pending=null,dirty=false,changes=0,disposed=false,conflict=false;
 function changed(){if(disposed)return;dirty=true;changes++;clearTimeout(timer);if(conflict)return;onStatus('dirty');timer=setTimeout(()=>flush().catch(()=>{}),delay);}
 async function flush(){
  clearTimeout(timer);if(disposed)return;if(running)return running;if(conflict)throw Error('PDF_DRAFT_REVISION_CONFLICT');
  running=(async()=>{
   while(!disposed&&(dirty||pending)){
    let replied=false;
    try{
     pending||={data:{...copy(read()),id,property_id:propertyId,expected_revision:revision,request_id:crypto.randomUUID()},changes};
     onStatus('saving');const sent=pending.data,saved=await write(sent);replied=true;if(disposed)return;
     if(!saved||saved.id!==id||saved.property_id!==propertyId||saved.document_id!==sent.document_id||saved.revision!==revision+1||saved.last_request!==sent.request_id||!same(saved.snapshot,sent.snapshot))throw Error('PDF_DRAFT_READBACK_FAILED');
     revision=saved.revision;dirty=changes!==pending.changes;pending=null;onStatus(dirty?'dirty':'saved');
    }catch(error){
     if(disposed)return;
     if(!replied&&error?.message==='INVALID_PDF_DRAFT')pending=null;
     conflict=error?.message==='PDF_DRAFT_REVISION_CONFLICT';dirty=true;onStatus(conflict?'conflict':'error',error);throw error;
    }
   }
  })();
  try{return await running;}finally{running=null;}
 }
 async function fork(){
  if(disposed||running||!conflict)throw Error('PDF_DRAFT_FORK_UNAVAILABLE');
  id=crypto.randomUUID();revision=0;pending=null;conflict=false;changed();return flush();
 }
 return {changed,flush,fork,get dirty(){return dirty||!!pending;},get saving(){return !!running;},get conflict(){return conflict;},get id(){return id;},get revision(){return revision;},dispose(){disposed=true;clearTimeout(timer);pending=null;}};
}
