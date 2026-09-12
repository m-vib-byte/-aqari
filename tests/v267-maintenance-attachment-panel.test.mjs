import test from 'node:test';
import assert from 'node:assert/strict';
import {mountMaintenanceAttachments} from '../src/v267/components/maintenance-attachment-panel.js';
import {MAINTENANCE_BUCKET} from '../src/v267/components/maintenance-attachments.js';

const photo=name=>new File([new Uint8Array([255,216,255,224]),name],name,{type:'image/jpeg'});
function fixture(t){
 const docs=new Map(),objects=new Map(),calls=[],revoked=[],created=[],disposers=[],state={active:true,canUpload:true};
 class Element{
  constructor(tag,text=''){this.tag=tag;this.children=[];this._text=text;this.hidden=false;this.disabled=false;this.value='';this.files=[];this.attributes={};}
  append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
  replaceChildren(...children){this.children=[];this._text='';this.append(...children);}
  set textContent(value){this._text=value;this.children=[];}
  get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
  setAttribute(key,value){this.attributes[key]=value;}
  querySelectorAll(selector){return this.children.flatMap(child=>[...(selector.split(',').includes(child.tag)?[child]:[]),...child.querySelectorAll(selector)]);}
  replaceWith(...children){const i=this.parent.children.indexOf(this);this.parent.children.splice(i,1,...children);for(const child of children)child.parent=this.parent;}
 }
 const previousDocument=globalThis.document,oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
 globalThis.document={createElement:tag=>new Element(tag)};URL.createObjectURL=()=>{const url='blob:private-'+created.length;created.push(url);return url;};URL.revokeObjectURL=url=>revoked.push(url);
 t.after(()=>{for(const dispose of disposers)dispose();globalThis.document=previousDocument;URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;});
 const container=new Element('div');
 const options={workspaceId:'w',requestId:'r',userId:'tenant-a',check(){if(!state.active)throw Error('session changed');},onDispose:fn=>disposers.push(fn),async rpc(name,args){
  assert.equal(name,'aqari_maintenance_attachments');calls.push({action:args.p_action,...args.p_data});if(state.denied)throw Object.assign(Error('denied'),{status:403});
  if(args.p_action==='list')return {can_upload:state.canUpload,attachments:[...docs.values()].filter(d=>d.status==='uploaded').map(d=>({...d}))};
  const id=args.p_data.id;
  if(args.p_action==='reserve'){const matching=[...docs.values()].find(doc=>['filename','mime_type','size_bytes','checksum_sha256'].every(key=>doc[key]===args.p_data[key]));if(matching)return {...matching,reservation_reused:true};if(!docs.has(id))docs.set(id,{...args.p_data,workspace_id:'w',request_id:'r',created_by:'tenant-a',status:'reserved',storage_bucket:MAINTENANCE_BUCKET,storage_path:'w/r/'+id});return {...docs.get(id),reservation_reused:false};}
  docs.get(id).status='uploaded';return {...docs.get(id)};
 },async storage(method,path,blob){calls.push({action:method,path});if(method==='POST'){if(state.failSecond&&objects.size===1)throw Error('second unavailable');assert.equal(objects.has(path),false);objects.set(path,blob);return;}if(!objects.has(path))throw Object.assign(Error('missing'),{status:404});return objects.get(path);}};
 const button=label=>container.querySelectorAll('button').find(el=>el.textContent===label),inputs=()=>container.querySelectorAll('input');
 return {container,state,calls,docs,objects,revoked,created,disposers,inputs,button,start:()=>mountMaintenanceAttachments(container,options)};
}
test('tenant/staff shared panel uploads multiple originals, reopens each and revokes private URLs on close',async t=>{
 const f=fixture(t);await f.start();const files=f.inputs()[0];assert.equal(files.multiple,true);assert.equal(f.inputs()[1].attributes.capture,'environment');assert.equal(f.button('رفع المرفقات والتحقق منها').disabled,true);
 files.files=[photo('tap-1.jpg'),photo('tap-2.jpg')];files.onchange();await f.button('رفع المرفقات والتحقق منها').onclick();assert.equal(f.docs.size,2);assert.match(f.container.textContent,/تم حفظ 2 مرفق/);
 await f.button('استرجاع المرفق').onclick();assert.equal(f.created.length,1);const link=f.container.querySelectorAll('a')[0];assert.equal(link.href,f.created[0]);assert.equal(link.download,'tap-1.jpg');
 f.disposers[0]();assert.equal(f.container.textContent,'');assert.deepEqual(f.revoked,f.created);assert.equal(files.value,'');
});
test('partial upload keeps only the unconfirmed file selected and retries without resending a saved original',async t=>{
 const f=fixture(t);await f.start();const files=f.inputs()[0];files.files=[photo('first.jpg'),photo('second.jpg')];files.onchange();f.state.failSecond=true;await f.button('رفع المرفقات والتحقق منها').onclick();
 assert.equal(f.objects.size,1);assert.equal(f.docs.size,2);f.state.failSecond=false;await f.button('رفع المرفقات والتحقق منها').onclick();assert.equal(f.objects.size,2);assert.equal(f.docs.size,2);assert.equal(f.calls.filter(call=>call.action==='reserve').length,2);
 const first=[...f.objects.keys()][0];assert.equal(f.calls.filter(call=>call.action==='POST'&&call.path===first).length,1);assert.match(f.container.textContent,/تم حفظ 1 مرفق/);
});
test('revoked permission clears rendered originals and private URLs immediately',async t=>{
 const f=fixture(t);await f.start();const files=f.inputs()[0];files.files=[photo('private.jpg')];files.onchange();await f.button('رفع المرفقات والتحقق منها').onclick();await f.button('استرجاع المرفق').onclick();f.state.denied=true;await f.button('تحديث مرفقات البلاغ').onclick();
 assert.equal(f.container.textContent,'');assert.deepEqual(f.revoked,f.created);assert.equal(files.value,'');
});
test('completed requests expose retrieval but hide upload controls; excess selection is rejected before requests',async t=>{
 const f=fixture(t);f.state.canUpload=false;await f.start();assert.equal(f.button('رفع المرفقات والتحقق منها').hidden,true);assert.equal(f.inputs()[0].parent.hidden,true);
 f.state.canUpload=true;await f.button('تحديث مرفقات البلاغ').onclick();const count=f.calls.length,files=f.inputs()[0];files.files=Array.from({length:9},(_,i)=>photo('photo-'+i+'.jpg'));files.onchange();assert.match(f.container.textContent,/حتى ٨ ملفات فقط/);assert.equal(f.button('رفع المرفقات والتحقق منها').disabled,true);assert.equal(f.calls.length,count);
});
test('closing the panel after a partial batch and selecting a new File object resumes the saved reservation',async t=>{
 const f=fixture(t);await f.start();let files=f.inputs()[0];files.files=[photo('first.jpg'),photo('second.jpg')];files.onchange();f.state.failSecond=true;await f.button('رفع المرفقات والتحقق منها').onclick();
 const second=[...f.docs.values()].find(doc=>doc.filename==='second.jpg').id;f.disposers[0]();f.state.failSecond=false;await f.start();files=f.inputs()[0];files.files=[photo('second.jpg')];files.onchange();await f.button('رفع المرفقات والتحقق منها').onclick();
 assert.equal(f.docs.size,2);assert.equal(f.objects.size,2);assert.equal(f.docs.get(second).status,'uploaded');assert.match(f.container.textContent,/تم حفظ 1 مرفق/);
});
