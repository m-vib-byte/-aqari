import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaintenanceAttachments,MAINTENANCE_BUCKET} from '../src/v267/components/maintenance-attachments.js';

const file=()=>new File([new Uint8Array([255,216,255,224]),'abandoned reservation'], 'abandoned.jpg',{type:'image/jpeg'});
const reason='تعذر استكمال رفع الملف الأصلي وتم تحرير الحجز من واجهة الصيانة.';

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
    pending_reservations:[...docs.values()].filter(d=>d.status==='reserved'&&d.created_by==='tenant-a').map(d=>({...structuredClone(d),can_abandon:true})),
    abandoned_count:[...docs.values()].filter(d=>d.status==='abandoned').length
   };
   if(args.p_action==='reserve'){
    const data=args.p_data,existing=[...docs.values()].find(d=>['reserved','uploaded'].includes(d.status)&&d.filename===data.filename&&d.mime_type===data.mime_type&&d.size_bytes===data.size_bytes&&d.checksum_sha256===data.checksum_sha256);
    if(existing)return {...structuredClone(existing),reservation_reused:true};
    if([...docs.values()].filter(d=>['reserved','uploaded'].includes(d.status)).length>=8)throw Error('ATTACHMENT_LIMIT_REACHED');
    const doc={...structuredClone(data),workspace_id:'w',request_id:'r',storage_bucket:MAINTENANCE_BUCKET,storage_path:`w/r/${data.id}`,status:'reserved',created_by:'tenant-a'};docs.set(doc.id,doc);return {...structuredClone(doc),reservation_reused:false};
   }
   if(args.p_action==='abandon'){
    const doc=docs.get(args.p_data.id);if(!doc)throw Error('ATTACHMENT_NOT_FOUND');if(doc.status==='uploaded')throw Error('ATTACHMENT_ALREADY_UPLOADED');if(objects.has(doc.storage_path))throw Error('ATTACHMENT_OBJECT_PRESENT');
    assert.equal(args.p_data.reason,reason);doc.status='abandoned';doc.abandoned_at='2026-09-12T18:00:00Z';doc.abandoned_by='tenant-a';doc.abandon_reason=args.p_data.reason;return {...structuredClone(doc),abandonment_reused:false};
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

test('abandoned reservation is visible after reload and can be archived to free the slot',async()=>{
 const f=fixture(),original=file();f.state.failPost=true;
 await assert.rejects(f.api.upload(original),/storage unavailable/);
 const reopened=createMaintenanceAttachments(f.options),before=await reopened.list();
 assert.equal(before.pending_reservations.length,1);assert.equal(before.attachments.length,0);
 const id=before.pending_reservations[0].id,result=await reopened.abandon(id,reason);assert.equal(result.status,'abandoned');assert.equal(result.abandon_reason,reason);
 const after=await reopened.list();assert.equal(after.pending_reservations.length,0);assert.equal(after.attachments.length,0);assert.equal(after.abandoned_count,1);
});

test('abandoned reservations no longer consume the eight-file limit',async()=>{
 const f=fixture();f.state.failPost=true;
 for(let i=0;i<8;i++){
  const candidate=new File([new Uint8Array([255,216,255,224]),String(i)],`f-${i}.jpg`,{type:'image/jpeg'});await assert.rejects(f.api.upload(candidate));
 }
 assert.equal((await f.api.list()).pending_reservations.length,8);
 const first=(await f.api.list()).pending_reservations[0];await f.api.abandon(first.id,reason);
 const ninth=new File([new Uint8Array([255,216,255,224]),'ninth'],'ninth.jpg',{type:'image/jpeg'});await assert.rejects(f.api.upload(ninth),/storage unavailable/);
 assert.equal((await f.api.list()).pending_reservations.length,8);
});

test('finalized originals and reservations with stored objects cannot be abandoned',async()=>{
 const f=fixture(),saved=await f.api.upload(file());
 await assert.rejects(f.api.abandon(saved.id,reason),/الحجز غير المكتمل غير متاح للتخلي/);assert.equal((await f.api.list()).attachments.length,1);
 const g=fixture(),draft=file();g.state.failPost=true;await assert.rejects(g.api.upload(draft));g.state.failPost=false;const id=[...g.docs.keys()][0],doc=g.docs.get(id);g.objects.set(doc.storage_path,draft);
 await assert.rejects(g.api.abandon(id,reason),/ATTACHMENT_OBJECT_PRESENT/);assert.equal(g.docs.get(id).status,'reserved');
});

test('forged pending metadata or missing abandon authority is rejected before mutation',async()=>{
 const f=fixture(),original=file();f.state.failPost=true;await assert.rejects(f.api.upload(original));f.state.failPost=false;
 const id=[...f.docs.keys()][0],doc=f.docs.get(id);doc.request_id='other';
 await assert.rejects(f.api.list(),/الحجوزات غير المكتملة|ارتباط المرفق/);assert.equal(f.calls.includes('abandon'),false);
 doc.request_id='r';const originalRpc=f.options.rpc;f.options.rpc=async(name,args)=>{const result=await originalRpc(name,args);if(args.p_action==='list')result.pending_reservations=result.pending_reservations.map(d=>({...d,can_abandon:false}));return result;};
 const noAuthority=createMaintenanceAttachments(f.options);await assert.rejects(noAuthority.abandon(id,reason),/الحجوزات غير المكتملة|غير متاح للتخلي/);
});
