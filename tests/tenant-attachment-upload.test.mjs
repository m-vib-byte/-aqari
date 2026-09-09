import test from 'node:test';
import assert from 'node:assert/strict';
import {createTenantAttachmentUploader} from '../src/v267/components/tenant-attachment-upload.js';

function fixture(){
 const docs=[],objects=new Map(),calls=[],state={};
 const client={async rpc(name,args){
  calls.push({name,args});
  if(name==='aqari_reserve_document'){
   const id='doc-'+(docs.length+1),doc={id,workspace_id:'w',created_by:'u',entity_type:args.p_entity_type,entity_ref:args.p_entity_ref,document_type:args.p_document_type,metadata:args.p_metadata,storage_bucket:'aqari-documents',storage_path:'w/'+id,status:'draft'};
   docs.push(doc);return {data:{document_id:id,storage_bucket:doc.storage_bucket,storage_path:doc.storage_path}};
  }
  const doc=docs.find(x=>x.id===args.p_document_id);doc.status='uploaded';doc.checksum_sha256=args.p_checksum;
  if(state.lostFinalize)return {error:{message:'lost finalize reply'}};
  return {data:doc.id};
 },storage:{from(bucket){return {
  async upload(path,blob,options){calls.push({name:'POST',path,bucket,options});
   if(state.failPost)return {error:{message:'unavailable',status:503}};
   assert.equal(objects.has(path),false);objects.set(path,state.corrupt?new Blob(['other']):blob);
   if(state.lostUpload)return {error:{message:'lost upload reply'}};return {data:{path}};
  },
  async download(path){calls.push({name:'GET',path,bucket});
   if(state.readDenied)return {error:{message:'denied',statusCode:'403'}};
   if(!objects.has(path))return {error:{message:'missing',statusCode:'404'}};
   if(state.switchOnRead)state.invalid=true;
   return {data:objects.get(path)};
  }
 };}},from(){const filters={};const query={select(){return query;},eq(key,value){filters[key]=value;return query;},async single(){
  calls.push({name:'metadata'});if(state.metadataUnavailable)return {error:{message:'metadata unavailable',status:503}};
  const doc=structuredClone(docs.find(x=>x.id===filters.id));return {data:{...doc,...state.metadataOverride}};
 }};return query;}};
 const upload=createTenantAttachmentUploader({getClient:async()=>client,check(){if(state.invalid)throw Error('session changed');},bounded:task=>task(),workspaceId:'w',userId:'u'});
 return {upload,state,docs,objects,calls,posts:()=>calls.filter(x=>x.name==='POST'),finalized:()=>calls.filter(x=>x.name==='aqari_finalize_document')};
}
const file=()=>new File(['value'],'id.pdf',{type:'application/pdf'});
test('tenant attachment recovers a lost upload response using bytes before finalizing and linking',async()=>{
 const f=fixture();f.state.lostUpload=true;const saved=await f.upload(file(),'civilFront','tenant-1');
 assert.equal(f.docs.length,1);assert.equal(f.posts().length,1);assert.equal(saved.id,'doc-1');assert.match(f.docs[0].checksum_sha256,/^[a-f0-9]{64}$/);
 assert.ok(f.calls.findIndex(x=>x.name==='GET')<f.calls.findIndex(x=>x.name==='aqari_finalize_document'));
 assert.deepEqual(f.posts()[0].options,{contentType:'application/pdf',upsert:false});
});
test('lost finalize response reuses the same tenant reservation without uploading another object',async()=>{
 const f=fixture(),chosen=file();f.state.lostFinalize=true;await assert.rejects(f.upload(chosen,'civilFront','tenant-1'),/lost finalize/);
 assert.equal(f.docs[0].status,'uploaded');f.state.lostFinalize=false;const saved=await f.upload(chosen,'civilFront','tenant-1');
 assert.equal(saved.id,'doc-1');assert.equal(f.docs.length,1);assert.equal(f.posts().length,1);assert.equal(f.finalized().length,2);
});
test('failed upload before storage can retry only after a confirmed missing object',async()=>{
 const f=fixture(),chosen=file();f.state.failPost=true;await assert.rejects(f.upload(chosen,'civilFront','tenant-1'),/unavailable/);
 f.state.failPost=false;await f.upload(chosen,'civilFront','tenant-1');assert.equal(f.docs.length,1);assert.equal(f.posts().length,2);
 assert.deepEqual(f.calls.filter(x=>['POST','GET'].includes(x.name)).map(x=>x.name),['POST','GET','GET','POST','GET']);
});
test('same-size corrupted object is never finalized or overwritten on retry',async()=>{
 const f=fixture(),chosen=file();f.state.corrupt=true;
 for(let i=0;i<2;i++)await assert.rejects(f.upload(chosen,'civilFront','tenant-1'),/لم تتطابق/);
 assert.equal(f.docs.length,1);assert.equal(f.posts().length,1);assert.equal(f.finalized().length,0);
});
test('denied storage reads normalize SDK statusCode and prevent another upload',async()=>{
 const f=fixture(),chosen=file();f.state.readDenied=true;
 for(let i=0;i<2;i++)await assert.rejects(f.upload(chosen,'civilFront','tenant-1'),e=>e.status===403);
 assert.equal(f.posts().length,1);assert.equal(f.finalized().length,0);
});
test('metadata confirmation failure retains the verified reservation for retry',async()=>{
 const f=fixture(),chosen=file();f.state.metadataUnavailable=true;await assert.rejects(f.upload(chosen,'civilFront','tenant-1'),/metadata unavailable/);
 f.state.metadataUnavailable=false;await f.upload(chosen,'civilFront','tenant-1');assert.equal(f.docs.length,1);assert.equal(f.posts().length,1);
});
test('wrong authoritative tenant attachment identity, scope or hash cannot be linked',async()=>{
 for(const metadataOverride of [{id:'other'},{status:'draft'},{workspace_id:'other'},{entity_type:'lease'},{entity_ref:'other'},{created_by:'other'},{document_type:'signed_contract'},{storage_bucket:'other'},{storage_path:'w/other'},{checksum_sha256:'0'.repeat(64)},{metadata:{tenantProfileId:'other',attachmentKind:'civilFront'}},{metadata:{tenantProfileId:'tenant-1',attachmentKind:'civilBack'}}]){
  const f=fixture();f.state.metadataOverride=metadataOverride;await assert.rejects(f.upload(file(),'civilFront','tenant-1'),/لم تتأكد/);
 }
});
test('one file used for different attachment kinds or tenants gets separate matching reservations',async()=>{
 const f=fixture(),chosen=file();await f.upload(chosen,'civilFront','tenant-1');await f.upload(chosen,'civilBack','tenant-1');await f.upload(chosen,'civilFront','tenant-2');
 assert.equal(f.docs.length,3);assert.deepEqual(f.docs.map(x=>[x.entity_ref,x.metadata.attachmentKind]),[['tenant-1','civilFront'],['tenant-1','civilBack'],['tenant-2','civilFront']]);
});
test('changing the selected file cannot reuse the previous reservation',async()=>{
 const f=fixture();await f.upload(file(),'civilFront','tenant-1');await f.upload(file(),'civilFront','tenant-1');assert.equal(f.docs.length,2);
});
test('session loss during byte readback blocks finalization and all later requests',async()=>{
 const f=fixture(),chosen=file();f.state.switchOnRead=true;await assert.rejects(f.upload(chosen,'civilFront','tenant-1'),/session changed/);
 const count=f.calls.length;await assert.rejects(f.upload(chosen,'civilFront','tenant-1'),/session changed/);assert.equal(f.calls.length,count);assert.equal(f.finalized().length,0);
});
