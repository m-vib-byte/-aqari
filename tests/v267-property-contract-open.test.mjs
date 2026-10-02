import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('src/v267/components/property-contract-upload.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const descendants=el=>[el,...el.children.flatMap(descendants)];
function node(tag,text=''){
 return {tag,textContent:text,style:{},children:[],append(...parts){for(const part of parts){if(part.parentElement)part.parentElement.children=part.parentElement.children.filter(x=>x!==part);part.parentElement=this;this.children.push(part);}},
  replaceChildren(...parts){this.children=[];this.append(...parts);},prepend(...parts){this.children.unshift(...parts);},setAttribute(k,v){this[k]=v;},
  insertBefore(part,before){part.parentElement=this;this.children.splice(this.children.indexOf(before),0,part);},scrollIntoView(){this.scrolled=true;}};
}
async function fixture({blocked=false,skip=false}={}){
 const events=[],read=deferred(),connect=deferred(),cleanup=[],urls=[],revoked=[];
 const popup={closed:false,opener:{},document:{body:{}},location:{replace(url){events.push('navigate');popup.url=url;}},close(){this.closed=true;events.push('close');}};
 const property={id:'property-id',externalRef:'ref',name:'Test property'};
 const d={closed:false,status:node('p'),session:{check(){if(d.closed)throw Error('session changed');}},onDispose(fn){cleanup.push(fn);},
  async run(task){events.push('connect');if(skip)return;await connect.promise;try{await task();}catch(error){d.status.textContent=error.message;}},dispose(){this.closed=true;cleanup.forEach(fn=>fn());}};
 const context={node,field(label,control){const el=node('label',label);el.append(control);return el;},t:x=>x,
  createTemplateLogoContext:()=>({getAccess:async()=>({canUpload:true}),listProperties:async()=>[property]}),createOriginalDocumentUpload:()=>()=>{},
  listPropertyContractArchive:async()=>({items:[{id:'document',original_filename:'عقد.pdf',created_at:'2026-10-02'}],nextOffset:100,hasMore:false}),
  readPropertyContractArchive:async()=>{events.push('read');return read.promise;},
  window:{open(){events.push('reserve');return blocked?null:popup;}},URL:{createObjectURL(blob){urls.push(blob);return 'blob:verified';},revokeObjectURL(url){revoked.push(url);}}};
 vm.createContext(context);const target=node('div');
 await vm.runInContext(source+'\nmountPropertyContractUpload',context)(d,target,{propertyId:property.id,archiveOnly:true});
 const button=descendants(target).find(x=>x.tag==='button'&&x.textContent==='عرض PDF المحفوظ');
 return {button,d,events,read,connect,popup,target,urls,revoked};
}

test('a single tap reserves a tab before async authentication and opens only verified bytes',async()=>{
 const f=await fixture();const action=f.button.onclick();
 assert.deepEqual(f.events,['reserve','connect']);assert.equal(f.popup.opener,null);assert.equal(f.popup.url,undefined);
 await f.button.onclick();assert.equal(f.events.filter(x=>x==='reserve').length,1);
 f.connect.resolve();await Promise.resolve();assert.ok(f.events.includes('read'));assert.equal(f.popup.url,undefined);
 const blob=new Blob(['%PDF-1.7\ncontract'],{type:'application/pdf'});f.read.resolve(blob);await action;
 assert.equal(f.popup.url,'blob:verified');assert.equal(f.urls[0],blob);assert.equal(f.button.disabled,false);
 const links=descendants(f.target).filter(x=>x.tag==='a');assert.equal(links.length,3);assert.ok(links.every(x=>x.href===f.popup.url));
 assert.equal(links.find(x=>x.target==='_self').textContent,'فتح العقد في هذه الصفحة');
 assert.equal(links.find(x=>x.download).download,'عقد.pdf');
 f.d.dispose();assert.deepEqual(f.revoked,['blob:verified']);assert.equal(f.popup.closed,false);
});

test('blocked popup provides a same-tab link next to the selected contract',async()=>{
 const f=await fixture({blocked:true});const action=f.button.onclick();f.connect.resolve();f.read.resolve(new Blob(['%PDF-1.7']));await action;
 const entry=f.button.parentElement,viewer=entry.children.find(x=>x.tag==='section');
 assert.ok(viewer.scrolled);assert.ok(descendants(viewer).some(x=>x.tag==='a'&&x.target==='_self'&&x.href==='blob:verified'));
 assert.ok(descendants(viewer).some(x=>x.textContent.includes('إذا لم يفتح العقد')));assert.equal(f.popup.url,undefined);
});

test('storage failure closes the reserved tab and keeps a visible retry message',async()=>{
 const f=await fixture();const action=f.button.onclick();f.connect.resolve();f.read.reject(Error('checksum mismatch'));await action;
 assert.equal(f.popup.closed,true);assert.equal(f.urls.length,0);assert.equal(f.button.disabled,false);
 assert.ok(descendants(f.target).some(x=>x.role==='alert'&&x.textContent.includes('إعادة المحاولة')));
});

test('session disposal during retrieval cannot open or retain a private PDF',async()=>{
 const f=await fixture();const action=f.button.onclick();f.connect.resolve();await Promise.resolve();f.d.dispose();
 assert.equal(f.popup.closed,true);f.read.resolve(new Blob(['%PDF-1.7']));await action;
 assert.equal(f.urls.length,0);assert.equal(f.popup.url,undefined);
});

test('a skipped busy dialog task does not leave a blank tab',async()=>{
 const f=await fixture({skip:true});await f.button.onclick();assert.equal(f.popup.closed,true);assert.equal(f.button.disabled,false);
});

test('manual tab close and failed navigation still expose usable fallback links',async()=>{
 for(const failure of ['closed','navigate']){
  const f=await fixture();const action=f.button.onclick();
  if(failure==='closed')f.popup.closed=true;else f.popup.location.replace=()=>{throw Error('navigation blocked');};
  f.connect.resolve();f.read.resolve(new Blob(['%PDF-1.7']));await action;
  assert.equal(f.popup.url,undefined);assert.ok(descendants(f.target).some(x=>x.tag==='a'&&x.target==='_self'));
  assert.equal(f.popup.closed,true);
 }
});
