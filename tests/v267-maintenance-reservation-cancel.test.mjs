import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaintenanceAttachments,MAINTENANCE_BUCKET} from '../src/v267/components/maintenance-attachments.js';

const file=()=>new File([new Uint8Array([255,216,255,224]),'abandoned reservation'], 'abandoned.jpg',{type:'image/jpeg'});

function fixture(){
 const docs=new Map(),objects=new Map(),calls=[];
 const state={failPost:false,lostPost:false,readFail:false};
 const options={
  workspaceId:'w',requestId:'r',userId:'tenant-a',check(){},
  async rpc(name,args){
   assert.equal(name,'aqari_maintenance_attachments');calls.push({action:args.p_action,data:structuredClone(args.p_data)});
   if(args.p_action==='list')return {
    can_upload:true,
    attachments:[...docs.values()].filter(d=>d.status==='uploaded').map(row=>structuredClone(row)),
    pending_reservations:[...docs.values()].filter(d=>d.status==='reserved'&&d.created_by==='tenant-a').map(row=>structuredClone(row))
   };
   if(args.p_action==='reserve'){
    const data=args.p_data,existing=[...docs.values()].find(d=>d.status!=='cancelled'&&d.filename===data.filename&&d.mime_type===data.mime_type&&d.size_bytes===data.size_bytes&&d.checksum_sha256===data.checksum_sha256);
    if(existing)return {...structuredClone(existing),reservation_reused:true};
    if([...docs.values()].filter(d=>d.status!=='cancelled').length>=8)throw Error('ATTACHMENT_LIMIT_REACHED');
    const doc={...structuredClone(data),workspace_id:'w',request_id:'r',storage_bucket:MAINTENANCE_BUCKET,storage_path:`w/r/${data.id}`,status:'reserved',created_by:'tenant-a'};docs.set(doc.id,doc);return {...structuredClone(doc),reservation_reused:false};
   }
   if(args.p_action==='cancel'){
    const doc=docs.get(args.p_data.id);if(!doc)throw Error('ATTACHMENT_NOT_CONFIRMED');if(doc.status==='uploaded')throw Error('ATTACHMENT_ALREADY_FINALIZED');
    if(objects.has(doc.storage_path))throw Error('ATTACHMENT_OBJECT_PRESENT');
    doc.status='cancelled';doc.cancelled_at=new Date().toISOString();doc.cancelled_by='tenant-a';doc.cancel_reason=args.p_data.reason;return {...structuredClone(doc),cancellation_reused:false};
   }
   const doc=docs.get(args.p_data.id);assert.ok(doc);assert.ok(objects.has(doc.storage_path));doc.status='uploaded';return structuredClone(doc);
  },
  async storage(method,path,blob,bucket){
   assert.equal(bucket,MAINTENANCE_BUCKET);
   if(method==='POST'){
    if(state.failPost)throw Error('storage unavailable');
    objects.set(path,blob);if(state.lostPost)throw Error('lost storage response');return;
   }
   if(state.readFail)throw Error('storage read unavailable');
   if(!objects.has(path))throw Object.assign(Error('missing'),{status:404});return objects.get(path);
  }
 };
 return {api:createMaintenanceAttachments(options),options,docs,objects,calls,state};
}

test('abandoned reservation is visible after reload and cancellation is audited before freeing the slot',async()=>{
 const f=fixture(),original=file();f.state.failPost=true;
 await assert.rejects(f.api.upload(original),/storage unavailable/);
 const before=await f.api.list();assert.equal(before.pending_reservations.length,1);assert.equal(before.attachments.length,0);
 const id=before.pending_reservations[0].id,result=await f.api.cancel(id);assert.equal(result.status,'cancelled');assert.equal(result.cancelled_by,'tenant-a');assert.equal(result.cancel_reason,'user_cancelled_incomplete_upload');assert.ok(result.cancelled_at);
 const after=await f.api.list();assert.equal(after.pending_reservations.length,0);assert.equal(after.attachments.length,0);
});

test('cancelling clears the in-memory reservation so the same File object gets a fresh path',async()=>{
 const f=fixture(),original=file();f.state.failPost=true;await assert.rejects(f.api.upload(original),/storage unavailable/);
 const oldId=(await f.api.list()).pending_reservations[0].id;await f.api.cancel(oldId);f.state.failPost=false;
 const saved=await f.api.upload(original);assert.notEqual(saved.id,oldId);assert.equal(saved.status,'uploaded');assert.equal(f.docs.get(oldId).status,'cancelled');assert.equal(f.objects.has(`w/r/${oldId}`),false);assert.equal(f.objects.has(saved.storage_path),true);
});

test('cancelled drafts no longer consume the eight-file limit',async()=>{
 const f=fixture();f.state.failPost=true;
 for(let i=0;i<8;i++){
  const candidate=new File([new Uint8Array([255,216,255,224]),String(i)],`f-${i}.jpg`,{type:'image/jpeg'});await assert.rejects(f.api.upload(candidate));
 }
 assert.equal((await f.api.list()).pending_reservations.length,8);
 const first=(await f.api.list()).pending_reservations[0];await f.api.cancel(first.id);
 const ninth=new File([new Uint8Array([255,216,255,224]),'ninth'],'ninth.jpg',{type:'image/jpeg'});await assert.rejects(f.api.upload(ninth),/storage unavailable/);
 assert.equal((await f.api.list()).pending_reservations.length,8);
});

test('bytes that reached Storage are preserved and cancellation is refused until they are verified',async()=>{
 const f=fixture(),original=file();f.state.lostPost=true;f.state.readFail=true;
 await assert.rejects(f.api.upload(original),/lost storage response/);const pending=(await f.api.list()).pending_reservations[0];assert.ok(f.objects.has(pending.storage_path));
 await assert.rejects(f.api.cancel(pending.id),/ATTACHMENT_OBJECT_PRESENT/);assert.ok(f.objects.has(pending.storage_path));assert.equal(f.docs.get(pending.id).status,'reserved');
 f.state.lostPost=false;f.state.readFail=false;const saved=await f.api.upload(original);assert.equal(saved.id,pending.id);assert.equal(saved.status,'uploaded');assert.ok(f.objects.has(saved.storage_path));
});

test('finalized originals are never cancellable',async()=>{
 const f=fixture(),saved=await f.api.upload(file());
 await assert.rejects(f.api.cancel(saved.id),/الحجز غير المكتمل غير متاح للإلغاء/);
 assert.equal((await f.api.list()).attachments.length,1);
});

test('forged pending metadata is rejected before cancellation',async()=>{
 const f=fixture(),original=file();f.state.failPost=true;await assert.rejects(f.api.upload(original));f.state.failPost=false;
 const id=[...f.docs.keys()][0],doc=f.docs.get(id);doc.request_id='other';
 await assert.rejects(f.api.list(),/الحجوزات غير المكتملة|ارتباط المرفق/);
 assert.equal(f.calls.some(call=>call.action==='cancel'),false);
});
