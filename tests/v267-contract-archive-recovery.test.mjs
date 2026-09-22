import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createOriginalDocumentUpload,originalDocument} from '../src/v267/components/original-document-upload.js';

const source=readFileSync(new URL('../src/v267/pages/contract-archive.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
const original=()=>new File(['%PDF-1.7\nfixture original'],'original.pdf');

async function fixture(){
 class Element{
  constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.value='';this.disabled=false;this.style={};}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  setAttribute(){}
 }
 const node=(tag,text)=>new Element(tag,text),all=e=>[e,...e.children.flatMap(all)];
 const calls=[],documents=[],archives=[],objects=new Map(),state={lostArchiveReply:false};
 const tables={aqari_tenants:[{id:'tenant',external_ref:'tenant-ref',full_name:'Fixture tenant'}],aqari_properties:[{id:'property',name:'Fixture property'}],aqari_units:[{id:'unit',property_id:'property',unit_no:'1'}]};
 const session={bound:{workspace:'workspace',user:'user',role:'general_manager'},check(){},request:async query=>query,client:{
  rpc(name,args){
   calls.push({name,args});
   if(name==='aqari_reserve_document'){
    const id='document-'+(documents.length+1),storage_path='workspace/'+id;
    documents.push({id,storage_path,entity_type:args.p_entity_type,entity_ref:args.p_entity_ref,document_type:args.p_document_type,metadata:args.p_metadata,created_by:'user',status:'draft'});
    return {document_id:id,storage_bucket:'aqari-documents',storage_path};
   }
   if(name==='aqari_finalize_document'){
    Object.assign(documents.find(row=>row.id===args.p_document_id),{status:'uploaded',checksum_sha256:args.p_checksum});return args.p_document_id;
   }
   throw Error('Unexpected RPC '+name);
  },
  from(table){const filters={},query={select(){return query;},eq(key,value){filters[key]=value;return query;},single(){return documents.find(row=>row.id===filters.id);},then(resolve){resolve(tables[table]);}};return query;}
 },async storage(method,path,blob){calls.push({name:method,path});if(method==='POST'){assert.equal(objects.has(path),false,'saved original is never overwritten');objects.set(path,blob);return {};}assert.ok(objects.has(path));return objects.get(path);}};
 const d={body:node('div'),status:node('p'),session,run(task){return d.pending=Promise.resolve().then(async()=>{d.body.inert=true;try{await task();}catch(error){d.status.textContent=error.message;}finally{d.body.inert=false;}});}};
 const context={node,field:(_,control)=>control,t:x=>x,crypto:{randomUUID},originalDocument,createOriginalDocumentUpload,createDialog:()=>d,createPrivateUrls:()=>({clear(){}}),signatureLabel:x=>x,mountSignatureReview:async()=>{},
  async contractAdministration(_,action,data){
   if(action==='archives')return archives;
   assert.equal(action,'archive');calls.push({name:'archive',args:structuredClone(data)});
   if(!archives.some(row=>row.id===data.id))archives.push({...data,document_status:'uploaded'});
   if(state.lostArchiveReply){state.lostArchiveReply=false;throw Error('lost archive reply');}
   return data;
  }
 };
 vm.runInNewContext(source,context);context.openContractArchive();await d.pending;
 await all(d.body).find(el=>el.textContent==='أرشفة عقد سابق').onclick();
 const [tenant,property,unit]=all(d.body).filter(el=>el.tag==='select'),inputs=all(d.body).filter(el=>el.tag==='input');
 const reference=inputs.find(el=>!el.type),date=inputs.find(el=>el.type==='date'),file=inputs.find(el=>el.type==='file'),form=all(d.body).find(el=>el.tag==='form');
 tenant.value='tenant';property.value='property';property.onchange();unit.value='unit';reference.value='Fixture reference';date.value='2020-02-29';file.files=[original()];
 const fields={tenant,property,unit,reference,date,file};
 return {d,calls,documents,archives,objects,state,tables,fields,save:()=>form.onsubmit({preventDefault(){}}),assertEditable(){for(const field of Object.values(fields))assert.equal(field.disabled,false);assert.equal(d.body.inert,false);}};
}

test('overlong archive reference stays editable and can be corrected without reserving a rejected operation',async()=>{
 const f=await fixture();assert.equal(f.fields.reference.maxLength,180);
 f.fields.reference.value='A'.repeat(181);await f.save();
 assert.match(f.d.status.textContent,/١٨٠/);assert.equal(f.calls.length,0);f.assertEditable();
 f.fields.reference.value='B'.repeat(180);await f.save();
 assert.equal(f.documents.length,1);assert.equal(f.archives.length,1);assert.equal(f.archives[0].reference,'B'.repeat(180));
 assert.equal(f.calls.filter(call=>call.name==='POST').length,1);assert.match(f.d.status.textContent,/حُفظ الأصل/);
});

test('invalid original file is checked before pending is frozen and its replacement uses the same form',async()=>{
 for(const file of [new File(['HTML pretending to be PDF'],'bad.pdf'),new File(['%PDF-1.7'],'A'.repeat(251))]){
  const f=await fixture();f.fields.file.files=[file];await f.save();
  assert.equal(f.calls.length,0);f.assertEditable();
  f.fields.file.files=[original()];await f.save();
  assert.equal(f.documents.length,1);assert.equal(f.archives.length,1);assert.match(f.d.status.textContent,/حُفظ الأصل/);
  assert.equal(await [...f.objects.values()][0].text(),'%PDF-1.7\nfixture original');
 }
});

test('missing saved tenant reference is rejected before pinning the archive context',async()=>{
 const f=await fixture();f.tables.aqari_tenants[0].external_ref='';await f.save();
 assert.equal(f.calls.length,0);f.assertEditable();assert.match(f.d.status.textContent,/أكمل ربط/);
 f.tables.aqari_tenants[0].external_ref='corrected-tenant-ref';await f.save();
 assert.equal(f.documents.length,1);assert.equal(f.documents[0].entity_ref,'corrected-tenant-ref');assert.equal(f.archives.length,1);
});

test('uncertain archive response retains its original identity and bytes on retry',async()=>{
 const f=await fixture();f.state.lostArchiveReply=true;await f.save();
 assert.match(f.d.status.textContent,/lost archive reply/);assert.equal(f.documents.length,1);assert.equal(f.archives.length,1);
 for(const field of Object.values(f.fields))assert.equal(field.disabled,true);
 const first=f.calls.find(call=>call.name==='archive').args;
 f.fields.reference.value='Programmatic replacement';f.fields.file.files=[new File(['%PDF-1.7\nother bytes'],'other.pdf')];await f.save();
 const attempts=f.calls.filter(call=>call.name==='archive');assert.equal(attempts.length,2);assert.deepEqual(attempts[1].args,first);
 assert.equal(f.documents.length,1);assert.equal(f.archives.length,1);assert.equal(f.calls.filter(call=>call.name==='POST').length,1);
 assert.equal(await [...f.objects.values()][0].text(),'%PDF-1.7\nfixture original');assert.match(f.d.status.textContent,/حُفظ الأصل/);
});
