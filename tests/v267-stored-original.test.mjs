import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {readStoredOriginal,originalDocumentExtension} from '../src/v267/components/stored-original.js';
import {checksum} from '../src/v267/components/scan-image.js';

test('original download extensions follow saved MIME without guessing a JPEG extension',()=>{
 for(const inherited of ['constructor','__proto__','toString'])assert.equal(originalDocumentExtension(inherited),'','inherited object keys are not MIME types');
 for(const [mime,expected]of [['application/pdf','.pdf'],['image/jpeg','.jpg'],['image/png','.png'],['image/webp','.webp'],['image/heic','.heic'],['image/heif','.heif'],['application/vnd.openxmlformats-officedocument.wordprocessingml.document','.docx'],['IMAGE/PNG; charset=binary','.png'],['application/octet-stream',''],[null,'']])assert.equal(originalDocumentExtension(mime),expected);
});

async function fixture(blob=new Blob(['%PDF-1.7\noriginal-A'],{type:'application/pdf'})){
 const row={id:'document',workspace_id:'workspace',entity_type:'lease',entity_ref:'contract-a',status:'uploaded',storage_bucket:'aqari-documents',storage_path:'workspace/document.pdf',size_bytes:blob.size,checksum_sha256:await checksum(blob)},calls=[];
 const state={row,blob,closed:false,afterMetadata:false,afterBody:false};
 const session={bound:{workspace:'workspace',user:'user'},check(){if(state.closed)throw Error('SESSION_CHANGED');},client:{from(table){const filters={};const query={select(){return query;},eq(key,value){filters[key]=value;return query;},single(){calls.push({table,filters});return state.row;}};return query;}},async request(query){if(state.afterMetadata)state.closed=true;return query;},async storage(method,path){calls.push({method,path});if(state.afterBody)state.closed=true;return state.blob;}};
 const target={id:'document',storagePath:'workspace/document.pdf',entityType:'lease',entityRef:'contract-a'};
 return {state,row,calls,session,target,read:()=>readStoredOriginal(session,target)};
}

test('stored PDF, JPEG and PNG reads preserve exact bytes and verify saved checksum and size',async()=>{
 for(const blob of [new Blob(['%PDF-1.7\noriginal-A'],{type:'application/pdf'}),new Blob([new Uint8Array([255,216,255,1,255,217])],{type:'image/jpeg'}),new Blob([new Uint8Array([137,80,78,71,13,10,26,10,1])],{type:'image/png'})]){
  const f=await fixture(blob),result=await f.read();assert.equal(result.blob,blob);assert.equal(result.verified,true);assert.match(result.note,/التحقق/);
  assert.deepEqual(f.calls[0],{table:'aqari_documents',filters:{workspace_id:'workspace',id:'document'}});assert.deepEqual(f.calls[1],{method:'GET',path:'workspace/document.pdf'});
 }
});

test('same-size corrupt bytes and size mismatch are rejected before any original can be displayed',async()=>{
 const f=await fixture();f.state.blob=new Blob(['%PDF-1.7\noriginal-B'],{type:'application/pdf'});assert.equal(f.state.blob.size,f.row.size_bytes);await assert.rejects(f.read(),/بصمة الملف المسترجع/);
 f.state.blob=new Blob(['short']);await assert.rejects(f.read(),/حجم الملف المسترجع/);
});

test('legacy originals without a stored checksum remain readable with an explicit unverified note',async()=>{
 for(const hash of [null,undefined,'']){
  const f=await fixture();f.row.checksum_sha256=hash;f.row.size_bytes=null;const result=await f.read();assert.equal(result.blob,f.state.blob);assert.equal(result.verified,false);assert.match(result.note,/بلا بصمة محفوظة/);
 }
 const f=await fixture();f.row.checksum_sha256=null;f.state.blob=new Blob(['wrong size']);await assert.rejects(f.read(),/حجم/);
});

test('foreign workspace, entity, document, bucket, path and non-uploaded metadata cannot trigger storage reads',async()=>{
 for(const patch of [{workspace_id:'foreign'},{entity_type:'tenant'},{entity_ref:'contract-b'},{id:'different'},{storage_bucket:'aqari-hr-private'},{storage_path:'workspace/other.pdf'},{status:'draft'},{checksum_sha256:'invalid'}]){
  const f=await fixture();Object.assign(f.row,patch);await assert.rejects(f.read());assert.equal(f.calls.some(call=>call.method),false);
 }
 const f=await fixture();f.target.storagePath='other/document.pdf';await assert.rejects(f.read(),/نطاق/);assert.equal(f.calls.length,0);
});

test('closing or changing session while metadata or body resolves cannot expose bytes',async()=>{
 for(const boundary of ['afterMetadata','afterBody']){const f=await fixture();f.state[boundary]=true;await assert.rejects(f.read(),/SESSION_CHANGED/);if(boundary==='afterMetadata')assert.equal(f.calls.some(call=>call.method),false);}
 const f=await fixture();f.state.closed=true;await assert.rejects(f.read(),/SESSION_CHANGED/);assert.equal(f.calls.length,0);
});

test('storage denial remains a failed download and uppercase saved hashes remain verifiable',async()=>{
 const f=await fixture();f.row.checksum_sha256=f.row.checksum_sha256.toUpperCase();assert.equal((await f.read()).verified,true);
 f.session.storage=async()=>{throw Object.assign(Error('ACCESS_DENIED'),{status:403});};await assert.rejects(f.read(),{status:403});
});

test('original-document page refuses a same-workspace foreign entity before creating a link and shows verified or legacy notes',async()=>{
 const source=readFileSync(new URL('../src/v267/pages/original-documents.js',import.meta.url),'utf8');
 for(const mode of ['foreign-entity','corrupt','verified','legacy']){
  const f=await fixture(),created=[];
  const node=(tag,text='')=>({tag,textContent:text,children:[],append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;}}),list=node('section'),d={session:f.session,status:node('p'),run:task=>task()};
  const listed={...f.row,title:'Saved original',document_no:'DOC-1'};
  if(mode==='foreign-entity')f.row.entity_ref='contract-b';
  if(mode==='corrupt')f.state.blob=new Blob(['%PDF-1.7\noriginal-B']);
  if(mode==='legacy')f.row.checksum_sha256=null;
  const context={readStoredOriginal,originalDocumentExtension,d,node,list,urls:{clear(){},create(blob){created.push(blob);return 'blob:original';}},records:{value:'contract-a'},type:{value:'lease'},page:0,previous:{},next:{},rpc:async()=>[listed],translateStatic:value=>value,visibleText:value=>value,mountDocumentHandovers(){},button:(label,fn)=>({...node('button',label),onclick:fn})};
  vm.runInNewContext(source.slice(source.indexOf(' async function load(){'),source.indexOf(' async function search(){'))+';this.load=load;',context);await context.load();
  const button=list.children[0].children.find(child=>child.tag==='button');
  if(['foreign-entity','corrupt'].includes(mode)){await assert.rejects(button.onclick());assert.equal(created.length,0);if(mode==='foreign-entity')assert.equal(f.calls.some(call=>call.method),false);}
  else{await button.onclick();assert.equal(created[0],f.state.blob);assert.match(d.status.textContent,mode==='legacy'?/بلا بصمة محفوظة/:/التحقق/);}
 }
});

test('original-document page downloads stored DOCX and PNG with correct filenames and identical blobs',async()=>{
 const source=readFileSync(new URL('../src/v267/pages/original-documents.js',import.meta.url),'utf8');
 for(const [mime,extension]of [['application/vnd.openxmlformats-officedocument.wordprocessingml.document','.docx'],['image/png','.png']]){
  const blob=new Blob(['original unchanged bytes'],{type:mime}),f=await fixture(blob),created=[];f.row.mime_type=mime;
  const node=(tag,text='')=>({tag,textContent:text,children:[],append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;}}),list=node('section'),d={session:f.session,status:node('p'),run:task=>task()};
  const context={readStoredOriginal,originalDocumentExtension,d,node,list,urls:{clear(){},create(value){created.push(value);return 'blob:original';}},records:{value:'contract-a'},type:{value:'lease'},page:0,previous:{},next:{},rpc:async()=>[{...f.row,title:'Saved original',document_no:'DOC-1'}],translateStatic:value=>value,visibleText:value=>value,mountDocumentHandovers(){},button:(label,fn)=>({...node('button',label),onclick:fn})};
  vm.runInNewContext(source.slice(source.indexOf(' async function load(){'),source.indexOf(' async function search(){'))+';this.load=load;',context);await context.load();
  await list.children[0].children.find(child=>child.tag==='button').onclick();const link=list.children[0].children.find(child=>child.tag==='a');assert.equal(link.download,'DOC-1'+extension);assert.equal(created[0],blob);
 }
});
