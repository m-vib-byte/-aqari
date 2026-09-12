import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMaintenanceAttachments,MAINTENANCE_BUCKET} from '../src/v267/components/maintenance-attachments.js';

const baseDoc=(id,status='reserved')=>({
 id,workspace_id:'w',request_id:'r',storage_bucket:MAINTENANCE_BUCKET,storage_path:`w/r/${id}`,
 filename:`${id}.jpg`,mime_type:'image/jpeg',size_bytes:4,checksum_sha256:'a'.repeat(64),
 status,created_by:'tenant-a',created_at:'2026-09-12T19:30:00.000Z',uploaded_at:status==='uploaded'?'2026-09-12T19:31:00.000Z':null,
 cancelled_at:null,cancelled_by:null,cancel_reason:null
});

function fixture(initial){
 const docs=new Map(initial.map(doc=>[doc.id,structuredClone(doc)])),calls=[],storageCalls=[];
 const api=createMaintenanceAttachments({workspaceId:'w',requestId:'r',userId:'tenant-a',check(){},
  async rpc(name,args){
   assert.equal(name,'aqari_maintenance_attachments');calls.push({action:args.p_action,data:structuredClone(args.p_data)});
   if(args.p_action==='list')return {can_upload:true,attachments:[...docs.values()].filter(d=>d.status==='uploaded'),pending_reservations:[...docs.values()].filter(d=>d.status==='reserved')};
   if(args.p_action==='cancel'){
    const doc=docs.get(args.p_data.id);if(!doc)throw Error('ATTACHMENT_NOT_CONFIRMED');
    doc.status='cancelled';doc.cancelled_at='2026-09-12T19:32:00.000Z';doc.cancelled_by='tenant-a';doc.cancel_reason=args.p_data.reason;
    return structuredClone(doc);
   }
   throw Error('unexpected rpc action');
  },
  async storage(...args){storageCalls.push(args);throw Error('storage must not be called by cancel');}
 });
 return {api,docs,calls,storageCalls};
}

test('cancelling an empty reservation is audited, disappears from pending list and never calls Storage delete',async()=>{
 const f=fixture([baseDoc('lost')]);
 const result=await f.api.cancel('lost');
 assert.equal(result.status,'cancelled');assert.equal(result.cancelled_by,'tenant-a');assert.equal(result.cancel_reason,'user_cancelled_incomplete_upload');
 assert.equal(f.storageCalls.length,0);
 assert.deepEqual(f.calls.map(c=>c.action),['list','cancel','list']);
 assert.equal((await f.api.list()).pending_reservations.length,0);
});

test('an uploaded immutable original cannot be routed through cancellation',async()=>{
 const f=fixture([baseDoc('saved','uploaded')]);
 await assert.rejects(f.api.cancel('saved'),/الحجز غير المكتمل غير متاح للإلغاء/);
 assert.equal(f.calls.filter(c=>c.action==='cancel').length,0);assert.equal(f.storageCalls.length,0);
 assert.equal(f.docs.get('saved').status,'uploaded');
});

test('client rejects a cancellation response that is not tied to the authenticated actor',async()=>{
 const f=fixture([baseDoc('lost')]);
 const original=f.api;
 const bad=createMaintenanceAttachments({workspaceId:'w',requestId:'r',userId:'tenant-a',check(){},
  async rpc(name,args){
   if(args.p_action==='list')return {can_upload:true,attachments:[],pending_reservations:[baseDoc('lost')]};
   if(args.p_action==='cancel')return {...baseDoc('lost','cancelled'),cancelled_at:'2026-09-12T19:32:00.000Z',cancelled_by:'other',cancel_reason:'user_cancelled_incomplete_upload'};
   throw Error('unexpected rpc action');
  },async storage(){throw Error('storage must not be called');}
 });
 await assert.rejects(bad.cancel('lost'),/لم يتأكد توثيق إلغاء الحجز غير المكتمل/);
 assert.ok(original);
});

test('server source keeps cancellation fail-closed when Storage bytes exist and declares no DELETE policy',()=>{
 const sql=fs.readFileSync('staging-database/sql/maintenance-attachments.sql','utf8');
 assert.match(sql,/ATTACHMENT_OBJECT_PRESENT/);
 assert.match(sql,/if exists\(select 1 from storage\.objects[\s\S]*?raise invalid_parameter_value using message='ATTACHMENT_OBJECT_PRESENT'/);
 assert.match(sql,/if doc\.status='uploaded' then raise invalid_parameter_value using message='ATTACHMENT_ALREADY_FINALIZED'/);
 assert.doesNotMatch(sql,/create policy[^;]*for delete/iu);
 assert.match(sql,/No UPDATE or DELETE policy/);
});
