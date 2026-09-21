import test from 'node:test';
import assert from 'node:assert/strict';
import {createTemplateLogoContext,MAX_TEMPLATE_LOGO_BYTES} from '../src/v267/components/template-property-logo.js';
import {checksum} from '../src/v267/components/scan-image.js';

const png=()=>new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==','base64')],'logo.png',{type:'image/png'});
const jpeg=()=>new File([Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDi6KKK+ZP3E//Z','base64')],'logo.jpg',{type:'image/jpeg'});
const webp=()=>new File([Buffer.from('UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoCAAIAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=','base64')],'logo.webp',{type:'image/webp'});
// Node has no image decoder. Production requires a real browser decoding path;
// each test explicitly supplies that platform capability, never a service bypass.
const originalBitmap=globalThis.createImageBitmap;
test.before(()=>{globalThis.createImageBitmap=async()=>({width:2,height:2,close(){}});});
test.after(()=>{if(originalBitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=originalBitmap;});
const property=id=>({id,externalRef:'legacy-'+id,name:'عقار '+id,address:'عنوان '+id,type:'residential',status:'active',statedIncome:'120.000',owners:[{name:'مالك',bps:10000}],email:'owner@example.test',phone:'123',whatsapp:'456',description:'وصف محفوظ',locationUrl:'https://example.test/map',propertyAutomaticRef:'automatic-'+id,tenantVisibility:{logo:true,phone:false},tenantInfo:{notes:'معلومة للمستأجر'},revision:4,assets:{logo:null,mainPhoto:'photo',photos:['photo','second'],titleDeed:'deed',plans:['plan'],licenses:['license'],certificates:['certificate'],insurances:['insurance'],documents:['doc'],custom:{kept:true}}});

function fixture(count=2){
 const properties=new Map(Array.from({length:count},(_,i)=>{const id='p'+(i+1);return [id,property(id)];})),documents=new Map(),objects=new Map(),calls=[];
 const state={closed:false,hook:null,lostSave:false,deny:false};
 const session={bound:{workspace:'workspace',user:'user',role:'general_manager'},check(){if(state.closed)throw Error('closed');},client:{
  rpc(name,args){return {rpc:name,args};},
  from(table){const q={table,filters:{},start:0,end:Infinity,select(){return q;},eq(k,v){q.filters[k]=v;return q;},order(){return q;},range(a,b){q.start=a;q.end=b;return q;},single(){q.singleRow=true;return q;}};return q;}
 },async request(q){
  session.check();calls.push(q);let result;
  if(q.rpc){const a=q.args;
   assert.equal(a.p_workspace_id??'workspace','workspace');
   if(q.rpc==='aqari_workspace_access')result={workspace_id:'workspace',user_id:'user',role:'general_manager',permissions:{properties:{read:true,write:!state.deny},documents:{read:true,write:!state.deny}}};
   else if(q.rpc==='aqari_property_full_file')result={workspace_id:'workspace',user_id:'user',property:properties.get(a.p_property_id)};
   else if(q.rpc==='aqari_reserve_document'){
    const id='document-'+(documents.size+1),path='workspace/'+id+'/original';
    documents.set(id,{id,workspace_id:'workspace',status:'draft',entity_type:a.p_entity_type,entity_ref:a.p_entity_ref,document_type:a.p_document_type,metadata:a.p_metadata,storage_bucket:'aqari-documents',storage_path:path,mime_type:a.p_mime_type,created_by:'user'});
    result={document_id:id,storage_bucket:'aqari-documents',storage_path:path};
   }else if(q.rpc==='aqari_finalize_document'){
    Object.assign(documents.get(a.p_document_id),{status:'uploaded',checksum_sha256:a.p_checksum,size_bytes:a.p_size_bytes,mime_type:a.p_mime_type});result=a.p_document_id;
   }else if(q.rpc==='aqari_property_master_save'){
    const p=properties.get(a.p_property_id);assert.equal(a.p_expected_revision,p.revision);
    properties.set(p.id,{...p,...structuredClone(a.p_data),revision:p.revision+1});
    if(state.lostSave){state.lostSave=false;throw Error('lost save response');}
    result={workspace_id:'workspace',user_id:'user',property:properties.get(p.id)};
   }else throw Error(q.rpc);
  }else{
   assert.equal(q.filters.workspace_id,'workspace','all reads must be workspace scoped');
   if(q.table==='aqari_properties')result=[...properties.values()].map(p=>({id:p.id,workspace_id:'workspace',external_ref:p.externalRef,name:p.name})).slice(q.start,q.end+1);
   else if(q.table==='aqari_documents')result=documents.get(q.filters.id);
   else throw Error(q.table);
  }
  result=structuredClone(result);if(state.hook)await state.hook(q,result);return result;
 },async storage(method,path,blob,bucket){
  session.check();const call={storage:method,path,bucket};calls.push(call);assert.equal(bucket,'aqari-documents');
  if(method==='POST'){assert.equal(objects.has(path),false,'objects are insert-only');objects.set(path,blob);return {};}
  if(!objects.has(path))throw Object.assign(Error('not found'),{status:404});
  if(state.hook)await state.hook(call,objects.get(path));return objects.get(path);
 }};
 const context=createTemplateLogoContext(session);
 async function logo(id='p1',file=png()){
  const doc={id:'existing-'+id,workspace_id:'workspace',status:'uploaded',entity_type:'property',entity_ref:properties.get(id).externalRef,document_type:'supporting_document',metadata:{category:'property_logo',asset_role:'property_logo'},storage_bucket:'aqari-documents',storage_path:'workspace/existing-'+id+'/original',mime_type:file.type,size_bytes:file.size,checksum_sha256:await checksum(file),created_by:'user'};
  documents.set(doc.id,doc);objects.set(doc.storage_path,file);properties.get(id).assets.logo=doc.id;return doc;
 }
 return {context,session,state,properties,documents,objects,calls,logo};
}

test('lists all scoped property IDs across pages and opens records without a write',async()=>{
 const f=fixture(201),rows=await f.context.listProperties();assert.equal(rows.length,201);assert.equal(f.calls.length,2);
 assert.deepEqual(rows[0],{id:'p1',name:'عقار p1',externalRef:'legacy-p1'});
 const record=await f.context.readProperty('p1');assert.deepEqual(record,f.properties.get('p1'));
 record.assets.photos.push('caller change');assert.equal(f.properties.get('p1').assets.photos.length,2);
 assert.equal(await f.context.loadLogo('p1'),null);
 assert.equal(f.calls.some(c=>/save|reserve|finalize/.test(c.rpc||'')||c.storage),false);
});

test('returns only the selected property protected logo bytes with their verified identity',async()=>{
 const f=fixture(),a=await f.logo('p1'),b=await f.logo('p2',jpeg());
 for(const [id,doc] of [['p1',a],['p2',b]]){
  const result=await f.context.loadLogo(id);assert.equal(result.documentId,doc.id);assert.equal(result.propertyId,id);assert.equal(result.mimeType,doc.mime_type);assert.equal(result.checksum,doc.checksum_sha256);
  assert.deepEqual(await result.blob.arrayBuffer(),await f.objects.get(doc.storage_path).arrayBuffer());
 }
 assert.deepEqual(f.calls.filter(c=>c.storage).map(c=>c.path),[a.storage_path,b.storage_path]);
});

test('metadata cannot redirect a logo to another property, workspace, category or unsafe object',async()=>{
 const mutations=[{workspace_id:'another'},{id:'another'},{entity_type:'tenant'},{entity_ref:'legacy-p2'},{status:'cancelled'},{document_type:'signed_contract'},{metadata:{category:'property_photo'}},{metadata:{category:'property_logo',asset_role:'property_photo'}},{storage_bucket:'public'},{storage_path:'another/original'},{storage_path:'workspace/../other'},{storage_path:'workspace/%2e%2e/other'},{storage_path:'workspace/a\\b'},{storage_path:'workspace//other'},{storage_path:'workspace/a?download=1'},{checksum_sha256:'bad'},{mime_type:'application/pdf'},{size_bytes:0},{size_bytes:MAX_TEMPLATE_LOGO_BYTES+1}];
 for(const patch of mutations){const f=fixture(),doc=await f.logo();Object.assign(doc,patch);await assert.rejects(f.context.loadLogo('p1'),undefined,JSON.stringify(patch));assert.equal(f.calls.some(c=>c.storage),false,JSON.stringify(patch));}
});

test('UUID property references are accepted while names never establish a property binding',async()=>{
 const f=fixture(),doc=await f.logo();doc.entity_ref='p1';assert.ok(await f.context.loadLogo('p1'));
 doc.entity_ref=f.properties.get('p1').name;await assert.rejects(f.context.loadLogo('p1'));
});

test('corrupt stored bytes and forged image metadata cannot be displayed',async()=>{
 for(const mutation of ['size','hash','mime']){
  const f=fixture(),doc=await f.logo();
  if(mutation==='size')f.objects.set(doc.storage_path,new Blob(['short']));
  if(mutation==='hash'){const raw=new Uint8Array(await png().arrayBuffer());raw[11]=99;f.objects.set(doc.storage_path,new Blob([raw],{type:'image/png'}));}
  if(mutation==='mime')doc.mime_type='image/jpeg';
  await assert.rejects(f.context.loadLogo('p1'));
 }
});

test('cross-scope property, access and list replies fail closed',async()=>{
 for(const operation of ['list','property','access']){
  const f=fixture();f.state.hook=(_q,r)=>{if(Array.isArray(r))r[0].workspace_id='other';else r.workspace_id='other';};
  await assert.rejects(operation==='list'?f.context.listProperties():operation==='property'?f.context.readProperty('p1'):f.context.getAccess());
 }
 const f=fixture();f.state.hook=(q,r)=>{if(q.rpc==='aqari_property_full_file')r.property.id='p2';};await assert.rejects(f.context.readProperty('p1'));
});

test('upload requires both property and document write access before reserving a document',async()=>{
 for(const denied of ['properties','documents']){
  const f=fixture();f.state.hook=(q,r)=>{if(q.rpc==='aqari_workspace_access')r.permissions[denied].write=false;};
  assert.equal((await f.context.getAccess()).canUpload,false);
  await assert.rejects(f.context.uploadLogo('p1',png()),/صلاحية/);assert.equal(f.calls.some(c=>c.rpc==='aqari_reserve_document'),false);
 }
});

test('PNG, JPEG and WebP upload original bytes and preserve every other property value',async()=>{
 for(const file of [png(),jpeg(),webp()]){
  const f=fixture(),before=structuredClone(f.properties.get('p1')),other=structuredClone(f.properties.get('p2'));
  const {property:p,logo}=await f.context.uploadLogo('p1',file);
  assert.equal(p.revision,before.revision+1);assert.equal(p.assets.logo,logo.documentId);assert.equal(logo.mimeType,file.type);
  assert.deepEqual(await logo.blob.arrayBuffer(),await file.arrayBuffer());
  assert.deepEqual({...p,revision:before.revision,assets:{...p.assets,logo:before.assets.logo}},before);assert.deepEqual(f.properties.get('p2'),other);
  const save=f.calls.find(c=>c.rpc==='aqari_property_master_save');assert.equal(save.args.p_expected_revision,4);
  const reserve=f.calls.find(c=>c.rpc==='aqari_reserve_document');assert.equal(reserve.args.p_entity_ref,'legacy-p1');assert.equal(reserve.args.p_metadata.category,'property_logo');
  assert.ok(f.calls.filter(c=>c.storage==='GET').length>=3,'verified original, pre-link, and persisted logo readbacks');
 }
});

test('empty, non-image and larger than 25 MiB files never reserve a document',async()=>{
 for(const file of [null,new File([],'empty.png'),new File(['%PDF-1.4 fake'],'not-logo.pdf',{type:'application/pdf'}),new File(['<svg></svg>'],'logo.png',{type:'image/png'}),new File([new Uint8Array(MAX_TEMPLATE_LOGO_BYTES+1)],'large.png',{type:'image/png'})]){
  const f=fixture();await assert.rejects(f.context.uploadLogo('p1',file));assert.equal(f.calls.some(c=>c.rpc==='aqari_reserve_document'),false);
 }
});

test('a changed session after an asynchronous read cannot expose a logo or continue uploading',async()=>{
 for(const at of ['aqari_property_full_file','aqari_documents','GET','aqari_finalize_document']){
  const f=fixture();await f.logo();f.state.hook=(q)=>{if(q.rpc===at||q.table===at||q.storage===at)f.state.closed=true;};
  await assert.rejects(at==='aqari_finalize_document'?f.context.uploadLogo('p1',png()):f.context.loadLogo('p1'),/closed/);
  assert.equal(f.calls.some(c=>c.rpc==='aqari_property_master_save'),false);
 }
 const f=fixture();f.session.bound.workspace='other';await assert.rejects(f.context.listProperties(),/تغيرت/);assert.equal(f.calls.length,0);
});

test('a lost master-save reply recovers by reading the persisted asset without another revision',async()=>{
 const f=fixture();f.state.lostSave=true;const file=png();
 await assert.rejects(f.context.uploadLogo('p1',file),/lost save response/);
 assert.equal(f.properties.get('p1').revision,5);
 const result=await f.context.uploadLogo('p1',file);assert.equal(result.property.revision,5);
 assert.equal(f.calls.filter(c=>c.rpc==='aqari_reserve_document').length,1);assert.equal(f.calls.filter(c=>c.storage==='POST').length,1);assert.equal(f.calls.filter(c=>c.rpc==='aqari_property_master_save').length,1);
});

test('revision conflicts do not overwrite intervening property changes and retry uses current data',async()=>{
 const f=fixture(),request=f.session.request;let conflict=true;
 f.session.request=async q=>{if(q.rpc==='aqari_property_master_save'&&conflict){conflict=false;Object.assign(f.properties.get('p1'),{description:'تعديل متزامن',revision:5});throw Error('PROPERTY_MASTER_REVISION_CONFLICT');}return request(q);};
 const file=png();await assert.rejects(f.context.uploadLogo('p1',file),/REVISION_CONFLICT/);
 assert.equal(f.properties.get('p1').assets.logo,null);const result=await f.context.uploadLogo('p1',file);
 assert.equal(result.property.description,'تعديل متزامن');assert.equal(result.property.revision,6);assert.equal(f.calls.filter(c=>c.rpc==='aqari_reserve_document').length,1);
});

test('unsafe reservation paths and mismatched finalized records never link an asset',async()=>{
 for(const mode of ['path','binding']){
  const f=fixture();f.state.hook=(q,r)=>{if(mode==='path'&&q.rpc==='aqari_reserve_document')r.storage_path='workspace/%2e%2e/stolen';if(mode==='binding'&&q.table==='aqari_documents')r.workspace_id='other';};
  await assert.rejects(f.context.uploadLogo('p1',png()));assert.equal(f.properties.get('p1').assets.logo,null);assert.equal(f.calls.some(c=>c.rpc==='aqari_property_master_save'),false);
  if(mode==='path')assert.equal(f.calls.some(c=>c.storage),false);
 }
});

test('a save response or final property readback that loses other fields cannot report success',async()=>{
 for(const phase of ['save','readback']){
  const f=fixture();let saved=false;f.state.hook=(q,r)=>{if(q.rpc==='aqari_property_master_save'){saved=true;if(phase==='save')r.property.assets.photos=[];}if(phase==='readback'&&saved&&q.rpc==='aqari_property_full_file')r.property.description='lost';};
  await assert.rejects(f.context.uploadLogo('p1',png()),/لم يتأكد|لم يظهر/);
 }
});

test('concurrent uploads for one property are refused while another property remains independent',async()=>{
 const f=fixture();let release;const blocked=new Promise(resolve=>{release=resolve;});let reached;const started=new Promise(resolve=>{reached=resolve;});
 f.state.hook=async q=>{if(q.rpc==='aqari_property_full_file'&&q.args.p_property_id==='p1'){reached();await blocked;}};
 const first=f.context.uploadLogo('p1',png());await started;
 await assert.rejects(f.context.uploadLogo('p1',jpeg()),/جارٍ/);const other=await f.context.uploadLogo('p2',jpeg());assert.equal(other.logo.propertyId,'p2');
 release();assert.equal((await first).logo.propertyId,'p1');
});

test('oversized PNG/JPEG/WebP headers are rejected before decoding or upload',async t=>{
 let decodes=0;t.mock.method(globalThis,'createImageBitmap',async()=>{decodes++;throw Error('must not decode');});
 const cases=[];
 for(const [width,height]of [[4097,1],[4032,3024]]){const raw=Buffer.from(await png().arrayBuffer());raw.writeUInt32BE(width,16);raw.writeUInt32BE(height,20);cases.push(new File([raw],'large.png',{type:'image/png'}));}
 const jpg=Buffer.from(await jpeg().arrayBuffer()),sof=jpg.indexOf(Buffer.from([255,192]));jpg.writeUInt16BE(5000,sof+7);cases.push(new File([jpg],'large.jpg',{type:'image/jpeg'}));
 const wp=Buffer.from(await webp().arrayBuffer());wp.writeUInt16LE(5000,26);cases.push(new File([wp],'large.webp',{type:'image/webp'}));
 for(const file of cases){const f=fixture();await assert.rejects(f.context.uploadLogo('p1',file),/٤٠٩٦|٨ ملايين/);assert.equal(f.calls.some(c=>c.rpc==='aqari_reserve_document'),false);}
 assert.equal(decodes,0);
});

test('APNG and animated WebP are rejected before decoder exposes only the first frame',async t=>{
 let decodes=0;t.mock.method(globalThis,'createImageBitmap',async()=>{decodes++;throw Error('must not decode');});
 const pngRaw=Buffer.from(await png().arrayBuffer()),apng=Buffer.concat([pngRaw.subarray(0,33),Buffer.from([0,0,0,0,97,99,84,76,0,0,0,0]),pngRaw.subarray(33)]);
 const webpRaw=Buffer.from(await webp().arrayBuffer()),animated=Buffer.concat([webpRaw,Buffer.from('ANIM\0\0\0\0','latin1')]);animated.writeUInt32LE(animated.length-8,4);
 for(const file of [new File([apng],'animated.png',{type:'image/png'}),new File([animated],'animated.webp',{type:'image/webp'})]){const f=fixture();await assert.rejects(f.context.uploadLogo('p1',file),/ثابتة/);assert.equal(f.calls.some(c=>c.rpc==='aqari_reserve_document'),false);}
 assert.equal(decodes,0);
});

test('real decoder rejection, decoded-size limits and missing decoder all stop before reserving',async t=>{
 for(const decoder of [async()=>{throw Error('invalid pixels');},async()=>({width:4096,height:4096,close(){}}),undefined]){
  t.mock.method(globalThis,'createImageBitmap',decoder||(()=>{}));if(!decoder)globalThis.createImageBitmap=undefined;
  const f=fixture();await assert.rejects(f.context.uploadLogo('p1',png()),/قراءة|٤٠٩٦|المتصفح/);assert.equal(f.calls.some(c=>c.rpc==='aqari_reserve_document'),false);t.mock.restoreAll();
 }
});

test('Image.decode fallback verifies pixels and releases its private object URL',async t=>{
 t.mock.method(globalThis,'createImageBitmap',()=>{});globalThis.createImageBitmap=undefined;
 const originalImage=globalThis.Image;let decoded=0;
 globalThis.Image=class{naturalWidth=2;naturalHeight=2;async decode(){decoded++;}};
 try{const f=fixture();assert.ok((await f.context.uploadLogo('p1',png())).logo);assert.ok(decoded>=3);}finally{if(originalImage===undefined)delete globalThis.Image;else globalThis.Image=originalImage;}
});

test('session invalidation while decoding closes the bitmap and cannot save',async t=>{
 const f=fixture();let closed=0;t.mock.method(globalThis,'createImageBitmap',async()=>{f.state.closed=true;return {width:2,height:2,close(){closed++;}};});
 await assert.rejects(f.context.uploadLogo('p1',png()),/closed/);assert.equal(closed,1);assert.equal(f.calls.some(c=>c.rpc==='aqari_reserve_document'),false);
});

test('historical oversized logos produce an actionable size error without changing stored bytes',async()=>{
 const f=fixture(),raw=Buffer.from(await png().arrayBuffer());raw.writeUInt32BE(6000,16);const file=new File([raw],'old.png',{type:'image/png'}),doc=await f.logo('p1',file),before=structuredClone(f.properties.get('p1'));
 await assert.rejects(f.context.loadLogo('p1'),/٤٠٩٦/);assert.deepEqual(f.properties.get('p1'),before);assert.equal(f.objects.get(doc.storage_path),file);assert.equal(f.calls.some(c=>/save|reserve|finalize/.test(c.rpc||'')),false);
});
