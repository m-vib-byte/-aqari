import {t as translateStatic,t as visibleText,message as visibleMessage,dateLocale} from '../src/v267/components/locale.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createVerifiedUpload} from '../src/v267/components/verified-upload.js';
import * as payroll from '../src/v267/domain/payroll.js';

const file=()=>new File(['%PDF-1.4\nfixture-A'],'signed.pdf',{type:'application/pdf'});
function fixture(mode){
 const all=e=>[e,...e.children.flatMap(all)];
 class Element{
  constructor(tag,text=''){this.tag=tag;this.children=[];this._text=text;this.value='';this.checked=false;}
  append(...items){this.children.push(...items);if(this.tag==='select'&&!this.value)this.value=items[0]?.value||'';}
  prepend(...items){this.children.unshift(...items);}
  replaceChildren(...items){this.children=items;}
  get textContent(){return this._text+this.children.map(e=>e.textContent).join('');}
  set textContent(value){this._text=value;this.children=[];}
  querySelectorAll(selector){return all(this).filter(e=>e!==this&&e.tag===selector.split(':')[0]&&(!selector.endsWith(':checked')||e.checked));}
 }
 const node=(tag,text)=>new Element(tag,text),field=(label,control)=>{const e=node('label',label);e.append(control);return e;};
 const docs=[],objects=new Map(),calls=[],state={corrupt:false,lostReply:false,readDenied:false,readbackMissing:false};
 const employee={id:'employee-1',profile:{name_ar:'موظف اختبار',name_en:'Fixture',phone:'0000',job_ar:'صيانة'},status:'active',property_ids:[],basic:0,allowances:0};
 const lease={id:123,contract_no:'C-123',tenant:'مستأجر اختبار',tenantId:'tenant-1',property:'عقار اختبار',unit:'101',status:'signing'};
 const getEmployee=()=>({employee,permissions:{read:true,add:true,edit:false},payroll:[],events:[],documents:state.readbackMissing?[]:structuredClone(docs),audit:[],advance_balance:0});
 function reserve(args,hr){
  const id=hr?args.id:'doc-'+(docs.length+1),existing=docs.find(x=>x.id===id);if(existing)return structuredClone(existing);
  const doc={id,workspace_id:'w',created_by:'u',status:hr?'reserved':'draft',storage_path:'w/'+id,filename:args.filename,employee_id:args.employee_id,payroll_id:args.payroll_id??null,kind:args.kind,entity_type:args.p_entity_type,entity_ref:args.p_entity_ref};docs.push(doc);
  return hr?structuredClone(doc):{document_id:id,storage_bucket:'aqari-documents',storage_path:doc.storage_path};
 }
 const rpc=(name,args)=>{
  calls.push({name,args});
  if(name==='aqari_read_state_v267')return {payload:{contractsV202:[lease]}};
  if(name==='aqari_contract_history')return [];
  if(name==='aqari_reserve_document')return reserve(args,false);
  if(name==='aqari_finalize_document'){const doc=docs.find(x=>x.id===args.p_document_id);doc.status='uploaded';doc.checksum_sha256=args.p_checksum;return doc.id;}
  if(name==='aqari_hr'){
   const action=args.p_action,data=args.p_data;
   if(action==='list')return {employees:[employee],properties:[],members:[],manager:false};
   if(action==='get')return getEmployee();
   if(action==='reserve')return reserve(data,true);
   if(action==='finalize'){const doc=docs.find(x=>x.id===data.id);doc.status='ready';return structuredClone(doc);}
  }
  throw Error('Unexpected RPC '+name);
 };
 const from=name=>{
  const filters={},query={select(){return query;},eq(k,v){filters[k]=v;return query;},order(){return name==='aqari_documents'?structuredClone(docs.filter(x=>x.status==='uploaded')):[];},single(){return state.readbackMissing?null:structuredClone(docs.find(x=>x.id===filters.id));}};return query;
 };
 const session={bound:{workspace:'w',user:'u',role:'general_manager'},check(){},client:{rpc,from},request:async value=>value,async storage(method,path,blob,bucket){
  calls.push({name:method,path,bucket});
  if(method==='POST'){if(objects.has(path))throw Object.assign(Error('Asset exists'),{status:400});objects.set(path,state.corrupt?new Blob(['%PDF-1.4\nfixture-B']):blob);if(state.lostReply)throw Error('lost response');return {};}
  if(state.readDenied)throw Object.assign(Error('denied'),{status:403});
  if(!objects.has(path))throw Object.assign(Error('missing'),{status:404});return objects.get(path);
 }};
 const d={body:node('div'),status:node('p'),session,disposers:[],onDispose(fn){this.disposers.push(fn);},run(task){d.pending=Promise.resolve().then(task).catch(error=>{d.status.textContent=error.message;});return d.pending;}};
 const api={primary:x=>x,contractMarkup:()=>'<p>Saved fixture contract</p>'};
 const context={translateStatic,visibleText,visibleMessage,dateLocale,...payroll,node,field,createDialog:()=>d,createVerifiedUpload,createPrivateUrls:()=>({clear(){},create(){return 'blob:fixture';}}),window:{AQARI_RENTAL_RECORDS:api},crypto,Blob};
 vm.createContext(context);const source=fs.readFileSync('src/v267/pages/'+(mode==='hr'?'employees':'rental-contracts')+'.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');vm.runInContext(source,context);
 const find=(tag,label)=>all(d.body).find(e=>e.tag===tag&&e.textContent===label);
 const uploadForm=()=>all(d.body).find(e=>e.tag==='form'&&all(e).some(c=>c.type==='file'));
 const input=type=>all(uploadForm()).find(e=>e.type===type);
 return {d,state,calls,docs,objects,uploadForm,input,
  async start(){context[mode==='hr'?'openEmployees':'openRentalContracts']();await d.pending;const button=mode==='hr'?find('button','فتح ملف موظف اختبار'):all(d.body).find(e=>e.tag==='button'&&e.textContent.startsWith('C-123'));assert.ok(button);await button.onclick();await d.pending;input('file').files=[file()];input('file').onchange();if(mode==='contract')input('checkbox').checked=true;},
  async save(){uploadForm().onsubmit({preventDefault(){}});await d.pending;},
  finalized:()=>calls.filter(c=>c.name==='aqari_finalize_document'||c.name==='aqari_hr'&&c.args.p_action==='finalize'),
  reservations:()=>calls.filter(c=>c.name==='aqari_reserve_document'||c.name==='aqari_hr'&&c.args.p_action==='reserve')
 };
}
for(const mode of ['contract','hr']){
 test(mode+' upload recovers a lost reply, verifies bytes, finalizes, and reads the bound document',async()=>{
  const f=fixture(mode);await f.start();f.state.lostReply=true;await f.save();
  assert.equal(f.docs.length,1);assert.equal(f.finalized().length,1);assert.equal(f.calls.filter(c=>c.name==='POST').length,1);
  assert.ok(f.calls.findIndex(c=>c.name==='GET')<f.calls.findIndex(c=>c===f.finalized()[0]));
  assert.match(f.d.status.textContent,mode==='hr'?/تم تأكيد الملف/:/حُفظت النسخة الموقعة/);
  if(mode==='contract')assert.match(f.docs[0].checksum_sha256,/^[a-f0-9]{64}$/);
 });
 test(mode+' never finalizes same-size mismatched content or overwrites it on retry',async()=>{
  const f=fixture(mode);await f.start();f.state.corrupt=true;await f.save();await f.save();
  assert.equal(f.finalized().length,0);assert.equal(f.docs.length,1);assert.equal(f.calls.filter(c=>c.name==='POST').length,1);assert.match(f.d.status.textContent,/لم تتطابق/);
 });
 test(mode+' denied storage read blocks finalization and duplicate upload',async()=>{
  const f=fixture(mode);await f.start();f.state.readDenied=true;await f.save();await f.save();
  assert.equal(f.finalized().length,0);assert.equal(f.calls.filter(c=>c.name==='POST').length,1);assert.match(f.d.status.textContent,/denied/);
 });
 test(mode+' missing authoritative document cannot report success after finalization',async()=>{
  const f=fixture(mode);await f.start();f.state.readbackMissing=true;await f.save();
  assert.equal(f.finalized().length,1);assert.match(f.d.status.textContent,/لم تتأكد إعادة قراءة/);
  f.state.readbackMissing=false;await f.save();assert.equal(f.docs.length,1);assert.equal(f.calls.filter(c=>c.name==='POST').length,1);
  assert.match(f.d.status.textContent,mode==='hr'?/تم تأكيد الملف/:/حُفظت النسخة الموقعة/);
 });
}
test('changing HR document type after an interrupted upload creates a separate matching reservation',async()=>{
 const f=fixture('hr');await f.start();f.state.readDenied=true;await f.save();const previous=f.docs[0].id;
 const kind=f.uploadForm().children.find(e=>e.tag==='label').children[0];kind.value='employment_contract';kind.onchange();f.state.readDenied=false;await f.save();
 assert.equal(f.docs.length,2);assert.notEqual(f.docs[1].id,previous);assert.equal(f.docs[1].kind,'employment_contract');assert.equal(f.docs[1].status,'ready');assert.equal(f.docs[0].status,'reserved');
});
test('choosing a different signed contract requires reviewing the new file again',async()=>{
 const f=fixture('contract');await f.start();f.input('file').files=[file()];f.input('file').onchange();assert.equal(f.input('checkbox').checked,false);
 await f.save();assert.equal(f.reservations().length,0);assert.match(f.d.status.textContent,/أكد مطابقة/);
});
