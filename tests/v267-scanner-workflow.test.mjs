import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {scanPdf,MAX_SCAN_PAGES,MAX_SCAN_BYTES} from '../src/v267/components/scan-pdf.js';
import {scanGeometry,checksum,MAX_SOURCE_BYTES} from '../src/v267/components/scan-image.js';
import {readStoredOriginal,originalDocumentExtension} from '../src/v267/components/stored-original.js';
import {documentTarget} from '../src/v267/components/document-target.js';
import {createVerifiedUpload} from '../src/v267/components/verified-upload.js';
const jpeg=n=>new Blob([new Uint8Array([255,216,255,n,255,217])],{type:'image/jpeg'});
const source=n=>new File([new Uint8Array([n])],'page-'+n+'.png',{type:'image/png'});
function fixture(initial={}){
 const nodes=[],calls=[],rows=[],objects=new Map(),objectUrls=[];let disposed=false;const cleanups=[];
 class Element{
  constructor(tag,text=''){this.tag=tag;this.style={};this._text=text;this.children=[];this.value='';this.disabled=false;this.checked=false;this.hidden=false;this.isConnected=true;this.classList={add(){}};nodes.push(this);}
  append(...items){this.children.push(...items);if(this.tag==='select'&&!this.value)this.value=items[0]?.value||'';}
  replaceChildren(...items){this.children=items;this.value='';}
  setAttribute(){} removeAttribute(){} click(){} get options(){return this.children;}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
  set textContent(x){this._text=x;}
  querySelectorAll(tag){return this.children.flatMap(x=>[...(x.tag===tag?[x]:[]),...x.querySelectorAll(tag)]);}
 }
 const node=(tag,text)=>new Element(tag,text),field=(label,input)=>{const box=node('label',label);box.append(input);return box;};
 const state={lost:false,corrupt:false,denied:false,wrongId:false,decodeFailure:null,renderFailure:null,confirmDiscard:false,confirmCalls:[]};
 const session={bound:{workspace:'w',user:'u'},check(){if(disposed)throw Error('closed');},async request(q){this.check();return q;},client:{
  rpc(name,args){calls.push({name,args});if(name==='aqari_document_entities')return [{entity_ref:'saved',title:'Saved fixture'}];
   if(name==='aqari_document_listing')return rows.filter(r=>r.status==='uploaded');
   if(name==='aqari_reserve_document'){const id='d'+(rows.length+1),row={id,workspace_id:'w',storage_bucket:'aqari-documents',status:'draft',entity_type:args.p_entity_type,entity_ref:args.p_entity_ref,created_by:'u',mime_type:args.p_mime_type,metadata:args.p_metadata,title:args.p_title,storage_path:'w/'+id+'.pdf',created_at:'2026-09-12T00:00:00Z'};rows.push(row);return {document_id:id,storage_bucket:'aqari-documents',storage_path:row.storage_path};}
   if(name==='aqari_finalize_document'){const row=rows.find(r=>r.id===args.p_document_id);row.status='uploaded';row.checksum_sha256=args.p_checksum;row.size_bytes=args.p_size_bytes;return row.id;}
   throw Error(name);
  },
  from(table){const filters={},q={select(){return q;},eq(k,v){filters[k]=v;return q;},single(){calls.push({name:'select',table,filters});if(table!=='aqari_documents')return {id:filters.id||'id-'+filters.external_ref,external_ref:filters.id?'external-'+filters.id:filters.external_ref,name:'Linked property',full_name:'Linked tenant',contract_no:'Linked contract'};const row=rows.find(r=>r.id===filters.id);return state.wrongId?{...row,id:'wrong'}:row;}};return q;}
 },async storage(method,path,blob){calls.push({name:method,path});this.check();if(method==='POST'){if(objects.has(path))throw Object.assign(Error('exists'),{status:409});objects.set(path,state.corrupt?new Blob(['corrupt']):blob);if(state.lost)throw Error('lost');return {};}
  if(state.denied)throw Object.assign(Error('denied'),{status:403});if(!objects.has(path))throw Object.assign(Error('missing'),{status:404});return objects.get(path);}};
 const d={el:node('dialog'),body:node('div'),status:node('p'),session,get closed(){return disposed;},onDispose(f){cleanups.push(f);},setBeforeClose(fn){this.beforeClose=fn;},async requestClose(){if(this.beforeClose&&await this.beforeClose()===false)return;this.close();},close(){disposed=true;for(const f of cleanups)f();},async run(task){const controls=nodes.filter(n=>['button','input','select'].includes(n.tag)),before=controls.map(n=>n.disabled);controls.forEach(n=>n.disabled=true);try{await task();}catch(e){d.status.textContent=e.message;}finally{controls.forEach((n,i)=>n.disabled=before[i]);}}};
 const context={readStoredOriginal,originalDocumentExtension,window:{confirm:message=>{state.confirmCalls.push(message);return state.confirmDiscard;}},node,field,createDialog:()=>d,createPrivateUrls:()=>({create:blob=>{objectUrls.push(blob);return 'blob:fixture';},clear(){},release(){}}),t:x=>x,dateLocale:()=> 'en',scanPdf,MAX_SCAN_PAGES,MAX_SCAN_BYTES,scanGeometry,MAX_SOURCE_BYTES,checksum,documentTarget,createVerifiedUpload,Blob,
  decodeImage:async file=>{const marker=new Uint8Array(await file.arrayBuffer())[0];if(marker===state.decodeFailure)throw Error('تعذر قراءة الصورة.');return {naturalWidth:100,naturalHeight:200,marker};},renderScan:async img=>{if(img.marker===state.renderFailure)throw Error('تعذر تجهيز صورة المستند.');return jpeg(img.marker);}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('src/v267/components/pdf-viewer.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,''),context);vm.runInContext('const createStoredVisualReview=(()=>{'+fs.readFileSync('src/v267/components/stored-visual-review.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'')+';return createStoredVisualReview;})();',context);vm.runInContext(fs.readFileSync('src/v267/pages/document-scanner.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,''),context);
 const button=text=>nodes.find(n=>n.tag==='button'&&n.textContent===text),control=label=>nodes.find(n=>n.tag==='label'&&n._text===label).children[0];
 return {d,state,calls,rows,objects,objectUrls,nodes,button,control,async start(){await context.openDocumentScanner(initial);if(!initial.ref)control('السجل المرتبط').value='saved';},async choose(files){const file=control('اختيار ملف أو صور من الجهاز');file.files=files;await file.onchange();},async save(){
  let settled=false;const pending=button('رفع نسخة جديدة والتحقق منها').onclick().finally(()=>{settled=true;});
  for(let attempt=0;attempt<100&&!settled;attempt++){
   const confirm=button('اعتماد النسخة المرفوعة وإقفال المستند');
   if(confirm?.onclick&&!confirm.disabled&&nodes.some(node=>node.className==='aq267-stored-visual-review'&&!node.hidden)){
    assert.equal(button('رفع نسخة جديدة والتحقق منها').disabled,true,'upload remains locked during stored review');
    assert.equal(control('راجعت النسخة المرفوعة فعلياً وجميع صفحاتها وأؤكد وضوح النصوص والصور وعدم فقدان الجودة.').disabled,false,'quality confirmation must be interactive');
    control('راجعت النسخة المرفوعة فعلياً وجميع صفحاتها وأؤكد وضوح النصوص والصور وعدم فقدان الجودة.').checked=true;
    await confirm.onclick();
   }
   await new Promise(resolve=>setTimeout(resolve,1));
  }
  assert.ok(settled,'scanner must finish after stored-copy review or an explicit error');await pending;
 }};
}
test('multipage scan keeps page order, checks stored bytes and recovers a lost upload reply',async()=>{
 const f=fixture({type:'property',ref:'outside-first-50'});await f.start();assert.equal(f.control('السجل المرتبط').value,'outside-first-50');assert.ok(f.control('السجل المرتبط').disabled);assert.equal(f.calls.some(c=>c.name==='aqari_document_entities'),false);
 await f.choose([source(1),source(2)]);f.state.lost=true;await f.save();assert.equal(f.rows.length,1);assert.equal(f.rows[0].metadata.page_count,2);assert.equal(f.rows[0].entity_ref,'outside-first-50');assert.equal(f.rows[0].status,'uploaded');assert.match(f.d.status.textContent,/تم حفظ النسخة/);assert.equal(f.calls.filter(c=>c.name==='POST').length,1);
 const bytes=Buffer.from(await [...f.objects.values()][0].arrayBuffer());assert.ok(bytes.indexOf(Buffer.from([255,216,255,1]))<bytes.indexOf(Buffer.from([255,216,255,2])));
 assert.match(bytes.toString('latin1'),/\/Count 2/);
});
test('corrupt or denied reread cannot finalize, overwrite or duplicate a reservation',async()=>{
 for(const mode of ['corrupt','denied']){const f=fixture();await f.start();await f.choose([source(1)]);f.state[mode]=true;await f.save();await f.save();assert.equal(f.rows.length,1);assert.equal(f.rows[0].status,'draft');assert.equal(f.calls.filter(c=>c.name==='POST').length,1);assert.equal(f.calls.filter(c=>c.name==='aqari_finalize_document').length,0);}
});
test('mismatched authoritative document identity cannot claim success',async()=>{
 const f=fixture();await f.start();await f.choose([source(1)]);f.state.wrongId=true;await f.save();assert.match(f.d.status.textContent,/لم تتأكد/);f.state.wrongId=false;await f.save();assert.equal(f.rows.length,1);assert.match(f.d.status.textContent,/تم حفظ النسخة/);
});
test('signed-contract scan requires review and never changes lease status',async()=>{
 const f=fixture({type:'lease',ref:'contract-900',category:'lease_contract'});await f.start();await f.choose([source(1)]);await f.save();assert.equal(f.rows.length,0);assert.match(f.d.status.textContent,/أكد مراجعة/);
 f.control('راجعت الصفحات وهي العقد الموقّع الفعلي لهذا السجل').checked=true;await f.save();assert.equal(f.rows[0].entity_type,'lease');assert.equal(f.rows[0].entity_ref,'contract-900');assert.equal(f.calls.find(c=>c.name==='aqari_reserve_document').args.p_document_type,'signed_contract');assert.equal(f.calls.some(c=>/save_lease|update_lease/.test(c.name)),false);
});
test('PDF and DOCX cannot be mixed with queued image pages; malformed PDF is rejected',async()=>{
 const f=fixture();await f.start();await f.choose([source(1),source(2)]);await f.choose([new File(['%PDF-1.4'],'x.pdf',{type:'application/pdf'})]);assert.match(f.d.status.textContent,/منفرداً/);
 const g=fixture();await g.start();await g.choose([new File(['<html>'],'x.pdf',{type:'application/pdf'})]);await g.save();assert.equal(g.rows.length,0);
});
test('page reorder/removal changes the saved PDF and closing discards the scan',async()=>{
 const f=fixture();await f.start();await f.choose([source(1),source(2)]);await f.button('إضافة هذه الصفحة وتصوير التالية').onclick();await f.button('تأخير الصفحة').onclick();await f.save();const bytes=Buffer.from(await [...f.objects.values()][0].arrayBuffer());assert.ok(bytes.indexOf(Buffer.from([255,216,255,2]))<bytes.indexOf(Buffer.from([255,216,255,1])));
 await f.choose([source(3)]);f.d.close();await f.save();assert.equal(f.rows.length,1);
});
test('PDF writer uses byte-accurate xref offsets, orientation and bounded input',async()=>{
 const blob=await scanPdf([{blob:jpeg(1),width:100,height:200},{blob:jpeg(2),width:200,height:100}]);const bytes=Buffer.from(await blob.arrayBuffer()),text=bytes.toString('latin1'),xref=Number(text.match(/startxref\n(\d+)/)[1]);assert.equal(text.slice(xref,xref+4),'xref');assert.match(text,/\/MediaBox \[0 0 842 595\]/);
 const entries=text.slice(xref).split('\n').slice(3,11);for(let i=0;i<entries.length;i++)assert.equal(text.slice(Number(entries[i].slice(0,10))).startsWith((i+1)+' 0 obj'),true);
 await assert.rejects(scanPdf([]));await assert.rejects(scanPdf(Array(21).fill({blob:jpeg(1),width:100,height:100})));await assert.rejects(scanPdf([{blob:jpeg(1),width:2401,height:10}]));await assert.rejects(scanPdf([{blob:new Blob(['bad'],{type:'image/jpeg'}),width:100,height:100}]));
});
test('linked entity cannot accept a different reference returned by the database',async()=>{
 const q={select(){return q;},eq(){return q;},single(){return {external_ref:'other'};}};await assert.rejects(documentTarget({bound:{workspace:'w'},check(){},request:async x=>x,client:{from:()=>q}},'property','expected'));
});

test('property and tenant file shortcuts resolve row IDs before listing or uploading documents',async()=>{
 for(const type of ['property','tenant','lease']){
  const f=fixture({type,ref:'row-uuid',referenceKey:'id'});await f.start();
  assert.equal(f.control('السجل المرتبط').value,'external-row-uuid');
  assert.equal(f.control('السجل المرتبط').disabled,true);
  const lookup=f.calls.find(c=>c.name==='select');
  assert.deepEqual(lookup.filters,{workspace_id:'w',id:'row-uuid'});
  assert.equal(f.calls.find(c=>c.name==='aqari_document_listing').args.p_entity_ref,'external-row-uuid');
  await f.choose([source(1)]);f.control('راجعت الصفحات وهي العقد الموقّع الفعلي لهذا السجل').checked=true;await f.save();
  assert.equal(f.rows[0].entity_ref,'external-row-uuid');assert.equal(f.rows[0].entity_type,type);
  assert.equal(f.rows[0].status,'uploaded');assert.match(f.d.status.textContent,/تم حفظ النسخة/);
 }
});

test('ID resolution rejects mismatched, missing or inaccessible targets without fallback',async()=>{
 for(const row of [null,{id:'other',external_ref:'expected'},{id:'expected',external_ref:null}]){
  let queries=0;const q={select(){return q;},eq(){return q;},single(){queries++;return row;}};
  const session={bound:{workspace:'w'},check(){},request:async x=>x,client:{from:()=>q}};
  await assert.rejects(documentTarget(session,'lease','expected','id'));
  assert.equal(queries,1);await assert.rejects(documentTarget(session,'lease','expected','contract_no'));assert.equal(queries,1);
 }
});

test('complete-file scanner entry points explicitly identify canonical row IDs',()=>{
 for(const file of ['property-hub','property-portfolio-additions','imported-tenant']){
  const source=fs.readFileSync('src/v267/pages/'+file+'.js','utf8');
  assert.match(source,/openDocumentScanner\(\{\.\.\.initial,referenceKey:'id'\}\)/);
 }
});

test('invalid replacement files preserve the current image and its reviewed signed-contract state',async()=>{
 for(const replacement of [new File(['<html>'],'broken.pdf',{type:'application/pdf'}),new File(['bad'],'unsupported.txt',{type:'text/plain'}),new File([],'empty.png',{type:'image/png'})]){
  const f=fixture({type:'lease',ref:'contract-900',category:'lease_contract'});await f.start();await f.choose([source(1)]);f.control('راجعت الصفحات وهي العقد الموقّع الفعلي لهذا السجل').checked=true;
  await f.choose([replacement]);assert.match(f.d.status.textContent,/تعذر قراءة الملف|غير مدعوم|حجم/);assert.equal(f.control('راجعت الصفحات وهي العقد الموقّع الفعلي لهذا السجل').checked,true);
  await f.save();assert.equal(f.rows.length,1);assert.equal(f.rows[0].metadata.page_count,1);const bytes=Buffer.from(await [...f.objects.values()][0].arrayBuffer());assert.ok(bytes.includes(Buffer.from([255,216,255,1])));
 }
});

test('a corrupt or unrenderable image in a selected batch leaves every previous page unchanged',async()=>{
 for(const failure of ['decodeFailure','renderFailure']){
  const f=fixture();await f.start();await f.choose([source(1)]);f.state[failure]=9;
  await f.choose([source(2),source(9)]);assert.match(f.d.status.textContent,/تعذر/);
  await f.save();assert.equal(f.rows[0].metadata.page_count,1);const bytes=Buffer.from(await [...f.objects.values()][0].arrayBuffer());assert.ok(bytes.includes(Buffer.from([255,216,255,1])));assert.equal(bytes.includes(Buffer.from([255,216,255,2])),false);
 }
});

test('a malformed replacement preserves a selected PDF and a pending upload reservation',async()=>{
 const pdf=new File(['%PDF-1.4\nprevious document'],'original.pdf',{type:'application/pdf'}),f=fixture();await f.start();await f.choose([pdf]);f.state.denied=true;await f.save();assert.equal(f.rows.length,1);
 await f.choose([new File(['bad ZIP'],'broken.docx',{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})]);f.state.denied=false;await f.save();
 assert.equal(f.rows.length,1);assert.equal(f.rows[0].status,'uploaded');assert.equal(f.calls.filter(c=>c.name==='POST').length,1);assert.equal(await [...f.objects.values()][0].text(),await pdf.text());
});

test('closing and returning from the scanner protect unsaved pages until explicit discard',async()=>{
 let returned=0;const f=fixture({onBack:()=>{returned++;}});await f.start();await f.choose([source(1)]);
 await f.d.requestClose();assert.equal(f.d.closed,false);assert.equal(f.state.confirmCalls.length,1);
 await f.button('العودة إلى الملف').onclick();assert.equal(f.d.closed,false);assert.equal(returned,0);
 f.state.confirmDiscard=true;await f.button('العودة إلى الملف').onclick();assert.equal(f.d.closed,true);assert.equal(returned,1);assert.equal(f.rows.length,0);
});

test('a completed upload closes without an unsaved-scan confirmation',async()=>{
 const f=fixture();await f.start();await f.choose([source(1)]);await f.save();await f.d.requestClose();assert.equal(f.d.closed,true);assert.equal(f.state.confirmCalls.length,0);assert.equal(f.rows[0].status,'uploaded');
});

test('reopening a saved scan checks original bytes while legacy scans remain readable with a note',async()=>{
 const f=fixture();await f.start();await f.choose([source(1)]);await f.save();const original=[...f.objects.values()][0],path=f.rows[0].storage_path;
 const bytes=new Uint8Array(await original.arrayBuffer());bytes[20]^=1;f.objects.set(path,new Blob([bytes],{type:original.type}));const before=f.objectUrls.length;
 await f.button('تحميل النسخة الأصلية').onclick();assert.match(f.d.status.textContent,/بصمة الملف المسترجع/);assert.equal(f.objectUrls.length,before);
 f.objects.set(path,original);f.rows[0].checksum_sha256=null;await f.button('تحميل النسخة الأصلية').onclick();assert.equal(f.objectUrls.length,before+1);assert.equal(f.objectUrls.at(-1),original);assert.match(f.d.status.textContent,/بلا بصمة محفوظة/);
});

test('scanner downloads saved PNG and WebP originals with their actual extensions and unchanged bytes',async()=>{
 for(const [mime,extension]of [['image/png','.png'],['image/webp','.webp']]){
  const f=fixture(),blob=new Blob(['saved original image'],{type:mime}),row={id:'image',workspace_id:'w',storage_bucket:'aqari-documents',storage_path:'w/image',status:'uploaded',entity_type:'property',entity_ref:'saved',document_no:'DOC-IMAGE',mime_type:mime,title:'Saved image',created_at:'2026-09-22T00:00:00Z',size_bytes:blob.size,checksum_sha256:await checksum(blob)};
  f.rows.push(row);f.objects.set(row.storage_path,blob);await f.start();await f.control('السجل المرتبط').onchange();await f.button('تحميل النسخة الأصلية').onclick();
  assert.equal(f.nodes.find(node=>node.tag==='a'&&node.textContent==='تحميل الملف').download,'DOC-IMAGE'+extension);assert.equal(f.objectUrls.at(-1),blob);assert.equal(await f.objectUrls.at(-1).text(),'saved original image');
 }
});
