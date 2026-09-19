import test from 'node:test';
import assert from 'node:assert/strict';
import {DOCUMENT_CATEGORIES,documentCategory} from '../src/v267/components/document-catalog.js';
import {scanGeometry,MAX_SOURCE_BYTES} from '../src/v267/components/scan-image.js';
import {MAX_SCAN_PAGES,MAX_SCAN_BYTES} from '../src/v267/components/scan-pdf.js';
import {originalDocument,createOriginalDocumentUpload} from '../src/v267/components/original-document-upload.js';
test('all requested document families have explicit permitted record links',()=>{
 assert.equal(Object.keys(DOCUMENT_CATEGORIES).length,47);
 for(const [category,spec]of Object.entries(DOCUMENT_CATEGORIES))for(const entity of ['property','tenant','lease']){
  if(spec.entities.includes(entity))assert.equal(documentCategory(category,entity).documentType,category==='signed_lease'?'signed_contract':'supporting_document');
  else assert.throws(()=>documentCategory(category,entity));
 }
 assert.throws(()=>documentCategory('other','lease'));
 for(const category of ['exit_notice','damage_invoice','utility_clearance'])assert.notEqual(documentCategory(category,'lease').documentType,'signed_contract');
});
test('original image/PDF bytes are preserved and spoofed file types are refused',async()=>{
 for(const bytes of [new TextEncoder().encode('%PDF-1.7\noriginal'),new Uint8Array([137,80,78,71,13,10,26,10,1]),new Uint8Array([255,216,255,10,20])]){
  const b=await originalDocument(new File([bytes],'original.bin'));assert.deepEqual(new Uint8Array(await b.arrayBuffer()),bytes);
 }
 await assert.rejects(originalDocument(new File(['<html>bad'],'x.pdf',{type:'application/pdf'})));
 await assert.rejects(originalDocument(new File([''],'empty.pdf')));
});
test('original PDF accepts the private bucket limit and refuses excess before reservation',async()=>{
 for(const size of [11302174,25*1024*1024]){
  const file=new File(['%PDF-1.7\n',new Uint8Array(size-9)],'large-original.pdf');
  const blob=await originalDocument(file);assert.equal(blob.size,size);assert.equal(blob.type,'application/pdf');
  assert.deepEqual(await blob.arrayBuffer(),await file.arrayBuffer());
 }
 const f=fixture();
 await assert.rejects(createOriginalDocumentUpload(f.s)(new File(['%PDF-1.7\n',new Uint8Array(25*1024*1024-8)],'oversize.pdf'),target),/٢٥/);
 assert.equal(f.calls.length,0);
});
function fixture(){
 let row,bytes;const calls=[],s={bound:{workspace:'w',user:'u'},check(){},request:async q=>q,
  client:{rpc(name,args){calls.push({name,args});if(name==='aqari_reserve_document'){row={id:'d',entity_type:args.p_entity_type,entity_ref:args.p_entity_ref,document_type:args.p_document_type,metadata:args.p_metadata,created_by:'u'};return {document_id:'d',storage_bucket:'aqari-documents',storage_path:'w/d.pdf'};}row.status='uploaded';row.checksum_sha256=args.p_checksum;return 'd';},from(){const q={select(){return q;},eq(){return q;},single(){return row;}};return q;}},
  async storage(method,path,b){calls.push({name:method});if(method==='POST'){bytes=b;return {};}return bytes;}};
 return {s,calls,get row(){return row;}};
}
const target={type:'lease',ref:'contract-1',category:'exit_notice',title:'إشعار اختبار'};
test('original upload verifies stored bytes and authoritative category before linking',async()=>{
 const f=fixture(),save=createOriginalDocumentUpload(f.s),file=new File(['%PDF-1.7\noriginal'],'notice.pdf');
 assert.equal((await save(file,target)).metadata.category,'exit_notice');await save(file,target);
 assert.equal(f.calls.filter(x=>x.name==='POST').length,1);assert.equal(f.calls.filter(x=>x.name==='aqari_reserve_document').length,1);
 assert.equal(f.calls[0].args.p_document_type,'supporting_document');assert.ok(f.calls.findIndex(x=>x.name==='GET')<f.calls.findIndex(x=>x.name==='aqari_finalize_document'));
});
test('a saved record with another category or identity cannot confirm the original',async()=>{
 const f=fixture(),request=f.s.request;f.s.request=async q=>{const r=await request(q);return r?.status==='uploaded'?{...r,metadata:{category:'signed_lease'}}:r;};
 await assert.rejects(createOriginalDocumentUpload(f.s)(new File(['%PDF-1.7'],'x.pdf'),target));
});
test('wrong entity category fails before reserving or uploading',async()=>{
 const f=fixture();await assert.rejects(createOriginalDocumentUpload(f.s)(new File(['%PDF-1.7'],'x.pdf'),{...target,type:'tenant'}));assert.equal(f.calls.length,0);
});

// Reproduce the actual dialog's temporary disabled-state restoration around scanner tasks.
test('scanner rotation follows the selected image after dialog controls are restored',async()=>{
 const {readFileSync}=await import('node:fs');const nodes=[];let rotated=0;
 const node=(tag,text='')=>{const n={tag,textContent:text,value:'',disabled:false,hidden:false,children:[],setAttribute(){},removeAttribute(){},append(...v){this.children.push(...v)},replaceChildren(...v){this.children=v},querySelectorAll(){return []},get options(){return this.children}};nodes.push(n);return n;};
 const d={closed:false,body:node('div'),status:node('p'),onDispose(){},session:{bound:{workspace:'test'},check(){},client:{rpc:(name,args)=>({name,args})},async request(){return [];}},async run(task){const controls=nodes.filter(n=>['button','input','select','textarea'].includes(n.tag));const before=controls.map(n=>n.disabled);controls.forEach(n=>n.disabled=true);try{await task();}finally{controls.forEach((n,i)=>n.disabled=before[i]);}}};
 const mocks={scanGeometry,MAX_SOURCE_BYTES,MAX_SCAN_PAGES,MAX_SCAN_BYTES,node,field:(_label,input)=>input,createDialog:()=>d,createPrivateUrls:()=>({create:()=> 'blob:synthetic',release(){},clear(){}}),t:s=>s,dateLocale:()=> 'ar',decodeImage:async()=>({naturalWidth:100,naturalHeight:200}),renderScan:async()=>{rotated++;return new Blob(['image']);},checksum:async()=>'',createVerifiedUpload:()=>async()=>{}};
 globalThis.__scannerControlTest=mocks;
 try{
  const source=readFileSync(new URL('../src/v267/pages/document-scanner.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
  const review=readFileSync(new URL('../src/v267/components/stored-visual-review.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
  const module=await import('data:text/javascript;base64,'+Buffer.from('const {'+Object.keys(mocks).join(',')+'}=globalThis.__scannerControlTest;\nconst createStoredVisualReview=(()=>{'+review+';return createStoredVisualReview;})();\n'+source).toString('base64'));
  await module.openDocumentScanner();
  const rotate=nodes.find(n=>n.tag==='button'&&n.textContent==='تدوير الصورة'),file=nodes.find(n=>n.type==='file');
  assert.equal(rotate.disabled,true);
  file.files=[new File(['fixture'],'scan.png',{type:'image/png'})];await file.onchange();
  assert.equal(rotate.disabled,false,'decoded image enables rotation after dialog finally');
  await rotate.onclick();assert.equal(rotated,2);assert.equal(rotate.disabled,false);
  file.files=[new File(['%PDF-1.4'],'original.pdf',{type:'application/pdf'})];await file.onchange();
  assert.equal(rotate.disabled,true,'PDF must not inherit image rotation controls');
 }finally{delete globalThis.__scannerControlTest;}
});
