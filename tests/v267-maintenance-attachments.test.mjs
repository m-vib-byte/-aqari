import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaintenanceAttachments,validateMaintenanceAttachment,MAINTENANCE_BUCKET} from '../src/v267/components/maintenance-attachments.js';

const photo=()=>new File([new Uint8Array([255,216,255,224]),'Synthetic leaking tap'], 'leak.jpg',{type:'image/jpeg'});
function fixture(){
 const docs=new Map(),objects=new Map(),calls=[],state={active:true};
 const check=()=>{if(!state.active)throw Error('session changed');};
 const options={workspaceId:'w',requestId:'r',userId:'tenant-a',check,
  async rpc(name,args){
   calls.push({name:args.p_action,args:structuredClone(args)});assert.equal(name,'aqari_maintenance_attachments');assert.equal(args.p_workspace_id,'w');assert.equal(args.p_request_id,'r');
   if(state.denied)throw Object.assign(Error('ACCESS_DENIED'),{status:403});
   if(args.p_action==='list'){if(state.listUnavailable)throw Error('list unavailable');return {can_upload:!state.completed,attachments:[...docs.values()].filter(d=>d.status==='uploaded').map(d=>({...structuredClone(d),...state.listOverride})),pending:[...docs.values()].filter(d=>d.status==='reserved'&&d.created_by==='tenant-a').map(d=>({...structuredClone(d),...state.pendingOverride})),cancelled:[...docs.values()].filter(d=>d.status==='cancelled'&&d.created_by==='tenant-a').map(d=>structuredClone(d))};}
   if(args.p_action==='inspect'){if(state.inspectUnavailable)throw Error('inspect unavailable');return {...structuredClone(docs.get(args.p_data.id)),...state.inspectOverride};}
   if(args.p_action==='cancel'){
    const doc=docs.get(args.p_data.id);if(!doc||doc.created_by!=='tenant-a')throw Object.assign(Error('ACCESS_DENIED'),{status:403});
    if(doc.status==='uploaded')throw Error('UPLOADED_ATTACHMENT_IMMUTABLE');
    if(doc.status==='cancelled'&&doc.cancel_reason!==args.p_data.reason)throw Error('CANCELLATION_CONFLICT');
    if(doc.status!=='cancelled'){
     if(state.completed)throw Object.assign(Error('ACCESS_DENIED'),{status:403});
     Object.assign(doc,{status:'cancelled',cancelled_by:'tenant-a',cancelled_at:'2026-09-12T20:00:00.000Z',cancel_reason:args.p_data.reason});
    }
    if(state.lostCancel)throw Error('lost cancel reply');return structuredClone(doc);
   }
   if(args.p_action==='reserve'){
    const d=args.p_data;if(docs.get(d.id)?.status==='cancelled')throw Error('ATTACHMENT_CANCELLED');
    const match=[...docs.values()].find(doc=>doc.status!=='cancelled'&&doc.created_by==='tenant-a'&&doc.workspace_id==='w'&&doc.request_id==='r'&&['filename','mime_type','size_bytes','checksum_sha256'].every(key=>doc[key]===d[key])),id=match?.id||d.id,reused=docs.has(id);
    if(!reused)docs.set(id,{...structuredClone(d),workspace_id:'w',request_id:'r',storage_bucket:MAINTENANCE_BUCKET,storage_path:'w/r/'+id,status:'reserved',created_by:'tenant-a'});
    if(state.lostReserve)throw Error('lost reserve reply');return {...structuredClone(docs.get(id)),reservation_reused:reused,...state.reserveOverride};
   }
   const d=docs.get(args.p_data.id);if(d.status==='cancelled')throw Error('ATTACHMENT_CANCELLED');assert.ok(objects.has(d.storage_path));d.status='uploaded';if(state.lostFinalize)throw Error('lost finalize reply');return {...structuredClone(d),...state.finalizeOverride};
  },
  async storage(method,path,blob,bucket){
   calls.push({name:method,path,bucket});assert.equal(bucket,MAINTENANCE_BUCKET);
   if(state.denied)throw Object.assign(Error('denied'),{status:403});
   if(method==='POST'){
    assert.equal(objects.has(path),false,'original is immutable');if(state.failPost)throw Error('storage unavailable');
    objects.set(path,state.corrupt?new Blob([new Uint8Array(blob.size)]):blob);if(state.lostUpload)throw Error('lost upload reply');return;
   }
   if(state.readDenied)throw Object.assign(Error('denied'),{status:403});
   if(!objects.has(path))throw Object.assign(Error('missing'),{status:404});
   if(state.revokeDuringRead)state.active=false;return objects.get(path);
  }
 };
 return {options,api:createMaintenanceAttachments(options),state,docs,objects,calls,count:name=>calls.filter(c=>c.name===name).length};
}
test('maintenance upload binds exact request, verifies stored bytes before finalizing and survives a new client',async()=>{
 const f=fixture(),saved=await f.api.upload(photo());
 assert.equal(saved.request_id,'r');assert.equal(saved.created_by,'tenant-a');assert.equal(saved.status,'uploaded');assert.equal(f.count('POST'),1);
 assert.ok(f.calls.findIndex(c=>c.name==='GET')<f.calls.findIndex(c=>c.name==='finalize'));
 const reopened=createMaintenanceAttachments(f.options),download=await reopened.download(saved.id);assert.equal(download.doc.id,saved.id);assert.deepEqual(await download.blob.arrayBuffer(),await photo().arrayBuffer());
});
test('lost reservation reply retries the same id rather than reserving another original',async()=>{
 const f=fixture(),file=photo();f.state.lostReserve=true;await assert.rejects(f.api.upload(file),/lost reserve/);f.state.lostReserve=false;await f.api.upload(file);
 assert.equal(f.docs.size,1);assert.equal(f.count('reserve'),2);assert.equal(f.count('POST'),1);
});
test('lost upload or finalization replies recover by rereading the same immutable object',async()=>{
 for(const phase of ['lostUpload','lostFinalize']){const f=fixture(),file=photo();f.state[phase]=true;
  if(phase==='lostFinalize'){await assert.rejects(f.api.upload(file),/lost finalize/);f.state[phase]=false;}
  await f.api.upload(file);assert.equal(f.docs.size,1);assert.equal(f.count('POST'),1);assert.equal((await f.api.list()).attachments.length,1);
 }
});
test('unavailable post retries only after confirmed absence, while denied reads forbid overwrite',async()=>{
 const f=fixture(),file=photo();f.state.failPost=true;await assert.rejects(f.api.upload(file),/storage unavailable/);f.state.failPost=false;await f.api.upload(file);
 assert.deepEqual(f.calls.filter(c=>['POST','GET'].includes(c.name)).map(c=>c.name),['POST','GET','GET','POST','GET']);
 const g=fixture(),other=photo();g.state.readDenied=true;for(let i=0;i<2;i++)await assert.rejects(g.api.upload(other),e=>e.status===403);assert.equal(g.count('POST'),1);assert.equal(g.count('finalize'),0);
});
test('same-size corruption is never finalized or overwritten, including retries',async()=>{
 const f=fixture(),file=photo();f.state.corrupt=true;for(let i=0;i<2;i++)await assert.rejects(f.api.upload(file),/لم تتطابق/);assert.equal(f.count('POST'),1);assert.equal(f.count('finalize'),0);
});
test('wrong reservation identity, account, path, scope or checksum cannot trigger an upload',async()=>{
 for(const override of [{id:'other'},{workspace_id:'other'},{request_id:'other'},{created_by:'other'},{storage_bucket:'public'},{storage_path:'w/other'},{mime_type:'text/html'},{size_bytes:1},{filename:'other.jpg'},{checksum_sha256:'0'.repeat(64)}]){
  const f=fixture();f.state.reserveOverride=override;await assert.rejects(f.api.upload(photo()));assert.equal(f.count('POST'),0);
 }
});
test('wrong finalization and independent metadata reread never claim verified success',async()=>{
 for(const override of [{id:'other'},{request_id:'other'},{created_by:'other'},{status:'reserved'},{checksum_sha256:'0'.repeat(64)}]){
  const f=fixture();f.state.finalizeOverride=override;await assert.rejects(f.api.upload(photo()));
 }
 const f=fixture(),file=photo();f.state.listUnavailable=true;await assert.rejects(f.api.upload(file),/list unavailable/);f.state.listUnavailable=false;await f.api.upload(file);assert.equal(f.count('POST'),1);
});
test('malformed, oversized and active-content file types fail before reservation',async()=>{
 for(const file of [new File(['<svg/>'],'x.svg',{type:'image/svg+xml'}),new File(['<script>'],'x.jpg',{type:'image/jpeg'}),new File(['wrong'],'x.pdf',{type:'application/pdf'}),new File([],'x.png',{type:'image/png'}),{type:'image/jpeg',size:10*1024*1024+1}]){
  const f=fixture();await assert.rejects(f.api.upload(file));assert.equal(f.calls.length,0);
 }
 await validateMaintenanceAttachment(new File(['%PDF-1.4 synthetic'],'x.pdf',{type:'application/pdf'}));
 await validateMaintenanceAttachment(new File([new Uint8Array([137,80,78,71,13,10,26,10])],'x.png',{type:'image/png'}));
 await validateMaintenanceAttachment(new File(['RIFF0000WEBP'],'x.webp',{type:'image/webp'}));
});
test('account change during private byte readback blocks finalization and every later call',async()=>{
 const f=fixture(),file=photo();f.state.revokeDuringRead=true;await assert.rejects(f.api.upload(file),/session changed/);const count=f.calls.length;await assert.rejects(f.api.upload(file),/session changed/);assert.equal(f.calls.length,count);assert.equal(f.count('finalize'),0);
});
test('retrieval rereads authority and rejects revoked or another request identity without fetching bytes',async()=>{
 for(const override of [{id:'other'},{request_id:'other'},{workspace_id:'other'},{storage_path:'w/forged'}]){const f=fixture(),doc=await f.api.upload(photo()),before=f.count('GET');f.state.listOverride=override;await assert.rejects(f.api.download(doc.id));assert.equal(f.count('GET'),before);}
 const f=fixture(),doc=await f.api.upload(photo()),before=f.count('GET');f.state.denied=true;await assert.rejects(f.api.download(doc.id),e=>e.status===403);assert.equal(f.count('GET'),before);
});
test('changed downloaded bytes are rejected even after valid metadata readback',async()=>{
 const f=fixture(),doc=await f.api.upload(photo());f.objects.set(doc.storage_path,new Blob([new Uint8Array(doc.size_bytes)]));await assert.rejects(f.api.download(doc.id),/لم تتطابق بصمة/);
});
test('reloading and reselecting the same bytes recovers a lost reservation without consuming another slot',async()=>{
 const f=fixture();f.state.lostReserve=true;await assert.rejects(f.api.upload(photo()),/lost reserve/);const id=[...f.docs.keys()][0];f.state.lostReserve=false;
 const reopened=createMaintenanceAttachments(f.options),saved=await reopened.upload(photo());assert.equal(saved.id,id);assert.equal(f.docs.size,1);assert.equal(f.count('POST'),1);
 assert.deepEqual(f.calls.filter(c=>['GET','POST'].includes(c.name)).map(c=>c.name),['GET','POST','GET']);
});
test('reloading after interrupted storage or a lost finalization reply reuses the same original and reads before posting',async()=>{
 for(const phase of ['failPost','lostFinalize','listUnavailable']){
  const f=fixture();f.state[phase]=true;await assert.rejects(f.api.upload(photo()));const id=[...f.docs.keys()][0],count=f.count('POST');f.state[phase]=false;
  const saved=await createMaintenanceAttachments(f.options).upload(photo());assert.equal(saved.id,id);assert.equal(f.docs.size,1);assert.equal(f.count('POST'),phase==='failPost'?count+1:count);assert.equal(saved.status,'uploaded');
 }
});
test('an unmarked replacement reservation id or a reused reservation with another uploader cannot be accepted',async()=>{
 const f=fixture();await f.api.upload(photo());f.state.reserveOverride={reservation_reused:false};await assert.rejects(createMaintenanceAttachments(f.options).upload(photo()),/حجز المرفق/);
 f.state.reserveOverride={reservation_reused:true,created_by:'other'};await assert.rejects(createMaintenanceAttachments(f.options).upload(photo()),/حجز المرفق/);assert.equal(f.count('POST'),1);
});
test('pending reservations survive reload and can be explicitly resumed only with the same original file',async()=>{
 const f=fixture();f.state.failPost=true;await assert.rejects(f.api.upload(photo()));f.state.failPost=false;
 const reopened=createMaintenanceAttachments(f.options),pending=(await reopened.list()).pending[0],count=f.count('reserve');
 await assert.rejects(reopened.resume(pending.id,new File([new Uint8Array([255,216,255]),'wrong'],'leak.jpg',{type:'image/jpeg'})),/الملف الأصلي/);
 assert.equal(f.count('reserve'),count);const saved=await reopened.resume(pending.id,photo());assert.equal(saved.id,pending.id);assert.equal(f.docs.size,1);
});
test('cancelling an interrupted upload preserves stored bytes and confirms the immutable actor, reason and time through independent reads',async()=>{
 const f=fixture(),file=photo();f.state.corrupt=true;await assert.rejects(f.api.upload(file));const doc=[...f.docs.values()][0],original=await f.objects.get(doc.storage_path).arrayBuffer(),posts=f.count('POST');
 const saved=await f.api.cancel(doc.id,'لم يعد الملف الأصلي متاحًا');assert.equal(saved.status,'cancelled');assert.equal(saved.cancelled_by,'tenant-a');assert.equal(f.count('inspect'),1);
 assert.equal((await f.api.list()).pending.length,0);assert.equal((await f.api.list()).cancelled[0].id,doc.id);assert.deepEqual(await f.objects.get(doc.storage_path).arrayBuffer(),original);
 await assert.rejects(f.api.upload(file),/ATTACHMENT_CANCELLED/);assert.equal(f.count('POST'),posts);
 assert.deepEqual(await f.api.cancel(doc.id,'لم يعد الملف الأصلي متاحًا'),saved);
 await assert.rejects(f.api.cancel(doc.id,'سبب مختلف للإلغاء'),/CANCELLATION_CONFLICT/);
});
test('a lost cancellation reply is confirmed by reads without repeating the mutation and survives a new client',async()=>{
 const f=fixture();f.state.failPost=true;await assert.rejects(f.api.upload(photo()));const id=[...f.docs.keys()][0];f.state.lostCancel=true;
 const saved=await f.api.cancel(id,'رفع متروك بسبب انقطاع الاتصال');assert.equal(f.count('cancel'),1);assert.equal(f.count('inspect'),2);
 f.state.lostCancel=false;const reopened=createMaintenanceAttachments(f.options);assert.deepEqual((await reopened.list()).cancelled[0],saved);
});
test('cancellation cannot report success without independent matching readback or current authority',async()=>{
 for(const mode of ['inspectUnavailable','listUnavailable']){
  const f=fixture();f.state.failPost=true;await assert.rejects(f.api.upload(photo()));const id=[...f.docs.keys()][0];f.state[mode]=true;
  await assert.rejects(f.api.cancel(id,'رفع متروك'),/unavailable/);assert.equal(f.docs.get(id).status,'cancelled');f.state[mode]=false;
  assert.equal((await createMaintenanceAttachments(f.options).list()).cancelled[0].id,id);
 }
 for(const override of [{created_by:'other'},{cancelled_by:'other'},{workspace_id:'other'},{request_id:'other'},{status:'reserved'},{cancelled_at:null},{cancel_reason:'different reason'},{filename:'other.jpg'},{size_bytes:99},{mime_type:'application/pdf'}]){
  const f=fixture();f.state.failPost=true;await assert.rejects(f.api.upload(photo()));const id=[...f.docs.keys()][0];f.state.inspectOverride=override;
  await assert.rejects(f.api.cancel(id,'رفع متروك'));
 }
 const f=fixture();f.state.failPost=true;await assert.rejects(f.api.upload(photo()));f.state.denied=true;await assert.rejects(f.api.cancel([...f.docs.keys()][0],'رفع متروك'),e=>e.status===403);assert.equal(f.count('inspect'),0);
});
test('uploaded originals, closed requests and invalid cancellation reasons cannot be cancelled',async()=>{
 const f=fixture(),saved=await f.api.upload(photo());await assert.rejects(f.api.cancel(saved.id,'لا نحتاجه'),/UPLOADED_ATTACHMENT_IMMUTABLE/);assert.equal(f.docs.get(saved.id).status,'uploaded');
 const g=fixture();g.state.failPost=true;await assert.rejects(g.api.upload(photo()));const id=[...g.docs.keys()][0],before=g.calls.length;
 for(const reason of ['', 'ab', 'a'.repeat(241),'سبب\nغير صالح'])await assert.rejects(g.api.cancel(id,reason),/سبب إلغاء/);
 assert.equal(g.calls.length,before);g.state.completed=true;await assert.rejects(g.api.cancel(id,'رفع متروك'),e=>e.status===403);assert.equal(g.docs.get(id).status,'reserved');
});
test('another uploader pending record is rejected, and cancelled IDs are never reused for a newly chosen file',async()=>{
 const f=fixture();f.state.failPost=true;await assert.rejects(f.api.upload(photo()));const id=[...f.docs.keys()][0];
 f.state.pendingOverride={created_by:'other'};await assert.rejects(f.api.list(),/قائمة مرفقات/);f.state.pendingOverride=null;
 await f.api.cancel(id,'الأصل غير متاح');f.state.failPost=false;const saved=await createMaintenanceAttachments(f.options).upload(photo());assert.notEqual(saved.id,id);assert.equal(f.docs.size,2);assert.equal(f.docs.get(id).status,'cancelled');
});
