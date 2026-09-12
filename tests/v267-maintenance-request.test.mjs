import test from 'node:test';
import assert from 'node:assert/strict';
import {MAINTENANCE_TYPES,maintenanceTypeLabel,validateMaintenanceFiles,uploadMaintenanceFiles} from '../src/v267/components/maintenance-request.js';

const photo=(name='photo.jpg',type='image/jpeg',bytes='abc')=>({name,type,size:new TextEncoder().encode(bytes).length,arrayBuffer:async()=>new TextEncoder().encode(bytes).buffer});

test('maintenance type catalogue is explicit and Arabic-labelled',()=>{
 assert.deepEqual(MAINTENANCE_TYPES.map(([key])=>key),['general','electrical','plumbing','air_conditioning','elevator','fire_safety','other']);
 assert.equal(maintenanceTypeLabel('air_conditioning'),'تكييف');
 assert.equal(maintenanceTypeLabel('unknown'),'أخرى');
});

test('maintenance photo validation rejects excessive count, size and unsafe mime',()=>{
 assert.throws(()=>validateMaintenanceFiles(Array.from({length:5},(_,i)=>photo(String(i)+'.jpg'))),/أربع صور/);
 assert.throws(()=>validateMaintenanceFiles([{...photo(),size:10*1024*1024+1}]),/١٠ ميجابايت/);
 assert.throws(()=>validateMaintenanceFiles([photo('x.svg','image/svg+xml')]),/JPEG/);
});

test('maintenance upload reserves private path, uploads without upsert and finalizes checksum',async()=>{
 const calls=[];
 const id='11111111-1111-4111-8111-111111111111';
 const client={
  rpc:async(name,args)=>{calls.push(['rpc',name,args]);if(name==='aqari_maintenance_attachment_reserve')return {data:{attachment_id:id,storage_bucket:'aqari-documents',storage_path:'w/maintenance/r/'+id+'.jpg'},error:null};if(name==='aqari_maintenance_attachment_finalize')return {data:id,error:null};throw Error('unexpected rpc');},
  storage:{from:bucket=>({upload:async(path,file,options)=>{calls.push(['upload',bucket,path,file.name,options]);return {error:null};},remove:async paths=>{calls.push(['remove',bucket,paths]);return {error:null};}})}
 };
 let checks=0;
 const result=await uploadMaintenanceFiles({client,workspaceId:'w',requestId:'r',files:[photo()],check:()=>checks++});
 assert.equal(result.length,1);assert.equal(result[0].id,id);assert.match(result[0].checksum,/^[a-f0-9]{64}$/);assert.ok(checks>=3);
 assert.equal(calls[0][1],'aqari_maintenance_attachment_reserve');
 assert.deepEqual(calls[1].slice(0,4),['upload','aqari-documents','w/maintenance/r/'+id+'.jpg','photo.jpg']);
 assert.equal(calls[1][4].upsert,false);
 assert.equal(calls[2][1],'aqari_maintenance_attachment_finalize');
 assert.equal(calls[2][2].p_size_bytes,3);
 assert.match(calls[2][2].p_checksum,/^[a-f0-9]{64}$/);
});

test('failed maintenance finalization removes Storage bytes before cancelling draft metadata and keeps original error',async()=>{
 const calls=[];
 const id='22222222-2222-4222-8222-222222222222';
 const path='w/maintenance/r/'+id+'.jpg';
 const failure=Error('STORED_FILE_NOT_CONFIRMED');
 const client={
  rpc:async(name,args)=>{
   calls.push(['rpc',name,args]);
   if(name==='aqari_maintenance_attachment_reserve')return {data:{attachment_id:id,storage_bucket:'aqari-documents',storage_path:path},error:null};
   if(name==='aqari_maintenance_attachment_finalize')return {data:null,error:failure};
   if(name==='aqari_maintenance_attachment_cancel')return {data:id,error:null};
   throw Error('unexpected rpc');
  },
  storage:{from:bucket=>({upload:async()=>({error:null}),remove:async paths=>{calls.push(['remove',bucket,paths]);return {error:null};}})}
 };
 await assert.rejects(uploadMaintenanceFiles({client,workspaceId:'w',requestId:'r',files:[photo()]}),error=>error===failure);
 assert.deepEqual(calls.at(-2),['remove','aqari-documents',[path]]);
 assert.equal(calls.at(-1)[1],'aqari_maintenance_attachment_cancel');
 assert.deepEqual(calls.at(-1)[2],{p_attachment_id:id});
});

test('failed Storage cleanup never cancels metadata while bytes may still exist',async()=>{
 const calls=[];
 const id='33333333-3333-4333-8333-333333333333';
 const failure=Error('STORED_FILE_NOT_CONFIRMED');
 const client={
  rpc:async(name,args)=>{calls.push(['rpc',name,args]);if(name==='aqari_maintenance_attachment_reserve')return {data:{attachment_id:id,storage_bucket:'aqari-documents',storage_path:'w/maintenance/r/'+id+'.jpg'},error:null};if(name==='aqari_maintenance_attachment_finalize')return {data:null,error:failure};if(name==='aqari_maintenance_attachment_cancel')throw Error('metadata must not cancel');throw Error('unexpected rpc');},
  storage:{from:()=>({upload:async()=>({error:null}),remove:async()=>({error:Error('storage unavailable')})})}
 };
 await assert.rejects(uploadMaintenanceFiles({client,workspaceId:'w',requestId:'r',files:[photo()]}),error=>error===failure);
 assert.equal(calls.filter(call=>call[1]==='aqari_maintenance_attachment_cancel').length,0);
});
