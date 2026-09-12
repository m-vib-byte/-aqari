import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaintenanceAttachments,MAINTENANCE_BUCKET} from '../src/v267/components/maintenance-attachments.js';

const file=()=>new File([new Uint8Array([255,216,255,224]),'abandoned reservation'], 'abandoned.jpg',{type:'image/jpeg'});

function fixture(){
 const docs=new Map(),objects=new Map(),calls=[];
 const state={failPost:false};
 const options={
  workspaceId:'w',requestId:'r',userId:'tenant-a',check(){},
  async rpc(name,args){
   assert.equal(name,'aqari_maintenance_attachments');calls.push(args.p_action);
   if(args.p_action==='list')return {
    can_upload:true,
    attachments:[...docs.values()].filter(d=>d.status==='uploaded').map(structuredClone),
    pending_reservations:[...docs.values()].filter(d=>d.status==='reserved'&&d.created_by==='tenant-a').map(structuredClone)
   };
   if(args.p_action==='reserve'){
    const data=args.p_data,existing=[...docs.values()].find(d=>d.status!=='cancelled'&&d.filename===data.filename&&d.mime_type===data.mime_type&&d.size_bytes===data.size_bytes&&d.checksum_sha256===data.checksum_sha256);
    if(existing)return {...structuredClone(existing),reservation_reused:true};
    if([...docs.values()].filter(d=>d.status!=='cancelled').length>=8)throw Error('ATTACHMENT_LIMIT_REACHED');
    const doc={...structuredClone(data),workspace_id:'w',request_id:'r',storage_bucket:MAINTENANCE_BUCKET,storage_path:`w/r/${data.id}`,status:'reserved',created_by:'tenant-a'};docs.set(doc.id,doc);return {...structuredClone(doc),reservation_reused:false};
   }
   if(args.p_action==='cancel'){
    const doc=docs.get(args.p_data.id);if(!doc)throw Error('ATTACHMENT_NOT_CONFIRMED');if(doc.status==='uploaded')throw Error('ATTACHMENT_ALREADY_FINALIZED');
    objects.delete(doc.storage_path);doc.status='cancelled';return structuredClone(doc);
   }
   const doc=docs.get(args.p_data.id);assert.ok(doc);assert.ok(objects.has(doc.storage_path));doc.status='uploaded';return structuredClone(doc);
  },
  async storage(method,path,blob,bucket){
   assert.equal(bucket,MAINTENANCE_BUCKET);
   if(method==='POST'){if(state.failPost)throw Error('storage unavailable');objects.set(path,blob);return;}
   if(!objects.has(path))throw Object.assign(Error('missing'),{status:404});return objects.get(path);
  }
 };
 return {api:createMaintenanceAttachments(options),options,docs,objects,calls,state};
}

test('abandoned reservation is visible after reload and can be cancelled to free the slot',async()=>{
 const f=fixture(),original=file();f.state.failPost=true;
 await assert.rejects(f.api.upload(original),/storage unavailable/);
 const reopened=createMaintenanceAttachments(f.options),before=await reopened.list();
 assert.equal(before.pending_reservations.length,1);assert.equal(before.attachments.length,0);
 const id=before.pending_reservations[0].id,result=await reopened.cancel(id);assert.equal(result.status,'cancelled');
 const after=await reopened.list();assert.equal(after.pending_reservations.length,0);assert.equal(after.attachments.length,0);
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

test('finalized originals are never cancellable',async()=>{
 const f=fixture(),saved=await f.api.upload(file());
 await assert.rejects(f.api.cancel(saved.id),/الحجز غير المكتمل غير متاح للإلغاء/);
 assert.equal((await f.api.list()).attachments.length,1);
});

test('forged pending metadata is rejected before cancellation',async()=>{
 const f=fixture(),original=file();f.state.failPost=true;await assert.rejects(f.api.upload(original));f.state.failPost=false;
 const id=[...f.docs.keys()][0],doc=f.docs.get(id);doc.request_id='other';
 await assert.rejects(f.api.list(),/الحجوزات غير المكتملة|ارتباط المرفق/);
 assert.equal(f.calls.includes('cancel'),false);
});
