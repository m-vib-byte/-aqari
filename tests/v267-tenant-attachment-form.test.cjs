const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const clone=value=>structuredClone(value);
const source=fs.readFileSync('v267-rental-records.js','utf8');
const tenant={nameAr:'مستأجر اختبار',nameEn:'Synthetic Tenant',civilId:'123456789012',phone:'55555555',nationality:'اختبار',email:'',passportNo:'TEST-P123',address:''};
async function fixture({loseFinalizeKind=null}={}){
 const tenantAttachmentModule=await import('../src/v267/components/tenant-attachment-upload.js');
 // Only module loading is supplied by the fixture; the form and upload code run unchanged.
 const importCall="import('./src/v267/components/tenant-attachment-upload.js')";
 assert.equal(source.split(importCall).length,2);
 const runtime=source.replace(importCall,'Promise.resolve(tenantAttachmentModule)');
 const elements=new Map(),calls=[],docs=[],objects=new Map(),bound={userId:'user-form',workspaceId:'workspace-form'};
 let saved={tenants:[],tenantProfilesV267:[],tenantDirectoryV202:[],tenantPreparationDraftsV267:[],audit:[]},revision=0,lost=false;
 class Element{
  constructor(){this.children=[];this.value='';this.files=[];this.textContent='';this.innerHTML='';this.disabled=false;const classes=new Set();this.classList={add:value=>classes.add(value),remove:value=>classes.delete(value),contains:value=>classes.has(value)};}
  append(...children){this.children.push(...children);}
  appendChild(child){this.append(child);return child;}
  prepend(...children){this.children.unshift(...children);}
  replaceChildren(...children){this.children=children;}
  setAttribute(){}
 }
 const $=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 const client={
  async rpc(name,args){
   calls.push({name,args:clone(args)});
   if(name==='aqari_reserve_document'){
    const id='doc-form-'+(docs.length+1),doc={id,workspace_id:args.p_workspace_id,created_by:bound.userId,document_type:args.p_document_type,entity_type:args.p_entity_type,entity_ref:args.p_entity_ref,metadata:clone(args.p_metadata),storage_bucket:'aqari-documents',storage_path:bound.workspaceId+'/'+id,status:'draft'};
    docs.push(doc);return {data:{document_id:id,storage_bucket:doc.storage_bucket,storage_path:doc.storage_path}};
   }
   assert.equal(name,'aqari_finalize_document');const doc=docs.find(item=>item.id===args.p_document_id);assert.ok(doc);
   doc.status='uploaded';doc.checksum_sha256=args.p_checksum;
   if(!lost&&doc.metadata.attachmentKind===loseFinalizeKind){lost=true;return {error:{message:'SYNTHETIC_LOST_FINALIZE_RESPONSE'}};}
   return {data:doc.id};
  },
  from(name){assert.equal(name,'aqari_documents');const filters={};const query={select(){return query;},eq(key,value){filters[key]=value;return query;},async single(){return {data:clone(docs.find(doc=>doc.id===filters.id&&doc.workspace_id===filters.workspace_id))};}};return query;},
  storage:{from(bucket){assert.equal(bucket,'aqari-documents');return {
   async upload(path,file,options){calls.push({name:'upload',path});assert.equal(options.upsert,false);assert.equal(objects.has(path),false);objects.set(path,file);return {data:{path}};},
   async download(path){calls.push({name:'download',path});return objects.has(path)?{data:objects.get(path)}:{error:{message:'missing',statusCode:'404'}};}
  };}}
 };
 const document={documentElement:{classList:{contains:name=>name==='aqari-auth-unlocked'}},getElementById:$,createElement:()=>new Element()};
 const context={module:{exports:{}},document,crypto,Blob,File,setTimeout,clearTimeout,tenantAttachmentModule,db:clone(saved),
  AQARI_DATA_GATE:{scope:clone(bound)},AQARI_EARLY_STORAGE_GATE:{scope:clone(bound)},
  AQARI_SUPABASE:{context:{user:{id:bound.userId},workspace:{id:bound.workspaceId},membership:{user_id:bound.userId,workspace_id:bound.workspaceId,is_active:true,role:'general_manager'}},getClient:async()=>client,
   async loadAppState(){return {workspace_id:bound.workspaceId,revision,payload:clone(saved)};},
   async saveAppState(payload,expectedRevision){assert.equal(expectedRevision,revision);saved=clone(payload);revision++;return {revision};}}
 };
 context.window=context;vm.runInNewContext(runtime,context);assert.equal(context.module.exports.openTenant(),true);
 for(const [key,value]of Object.entries(tenant))$('v267Tenant_'+key).value=value;
 return {$,docs,calls,objects,saved:()=>clone(saved),save:()=>$('saveBtn').onclick(),attach(kind,file){$('v267File_'+kind).files=[file];}};
}
const file=()=>new File(['%PDF-1.4\nsynthetic tenant attachment'],'tenant.pdf',{type:'application/pdf'});
test('the original tenant form retries a lost finalize response using the same stored document',async()=>{
 const f=await fixture({loseFinalizeKind:'civilFront'});f.attach('civilFront',file());await f.save();
 assert.equal(f.saved().tenants.length,1);assert.equal(f.saved().tenantProfilesV267[0].attachments.length,0);
 assert.equal(f.docs.length,1);assert.equal(f.docs[0].status,'uploaded');assert.match(f.$('v267TenantStatus').textContent,/SYNTHETIC_LOST_FINALIZE_RESPONSE/);
 assert.equal(f.$('modal').classList.contains('on'),true);assert.equal(f.$('saveBtn').disabled,false);
 await f.save();const saved=f.saved();assert.equal(saved.tenants.length,1);assert.equal(saved.tenantProfilesV267.length,1);
 assert.equal(saved.tenantProfilesV267[0].attachments.length,1);assert.equal(saved.tenantProfilesV267[0].attachments[0].id,f.docs[0].id);
 assert.equal(f.docs.length,1);assert.equal(f.objects.size,1);assert.equal(f.calls.filter(call=>call.name==='upload').length,1);
 assert.equal(f.calls.filter(call=>call.name==='aqari_finalize_document').length,2);assert.match(f.docs[0].checksum_sha256,/^[a-f0-9]{64}$/);
 assert.equal(f.$('modal').classList.contains('on'),false);
});
test('one File selected for two tenant attachment types retains two correctly bound originals',async()=>{
 const f=await fixture(),shared=file();f.attach('civilFront',shared);f.attach('civilBack',shared);await f.save();
 const attachments=f.saved().tenantProfilesV267[0].attachments;assert.deepEqual(attachments.map(item=>item.kind),['civilFront','civilBack']);
 assert.equal(new Set(attachments.map(item=>item.id)).size,2);assert.equal(f.docs.length,2);assert.equal(f.objects.size,2);
 for(const attachment of attachments){const doc=f.docs.find(item=>item.id===attachment.id);assert.equal(doc.metadata.attachmentKind,attachment.kind);assert.equal(doc.entity_ref,f.saved().tenantProfilesV267[0].id);assert.equal(doc.status,'uploaded');}
});
test('a lost response for the second attachment does not resend the first or allocate a third original',async()=>{
 const f=await fixture({loseFinalizeKind:'civilBack'}),shared=file();f.attach('civilFront',shared);f.attach('civilBack',shared);await f.save();
 assert.equal(f.docs.length,2);assert.equal(f.calls.filter(call=>call.name==='upload').length,2);await f.save();
 const attachments=f.saved().tenantProfilesV267[0].attachments;assert.equal(attachments.length,2);assert.equal(f.saved().tenants.length,1);
 assert.equal(f.docs.length,2);assert.equal(f.calls.filter(call=>call.name==='upload').length,2);
 const confirmations=f.calls.filter(call=>call.name==='aqari_finalize_document');
 assert.equal(confirmations.filter(call=>call.args.p_document_id===f.docs[0].id).length,1);
 assert.equal(confirmations.filter(call=>call.args.p_document_id===f.docs[1].id).length,2);
 assert.equal(f.$('modal').classList.contains('on'),false);
});
