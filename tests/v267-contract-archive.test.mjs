import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const source=readFileSync(new URL('../src/v267/pages/contract-archive.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
test('archive uploads to tenant and binds saved file to property and unit without operational contract writes',async()=>{
 class El{constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.value='';}append(...els){this.children.push(...els);}replaceChildren(...els){this.children=els;}}
 const calls=[],rows=[],tasks=[],node=(tag,text)=>new El(tag,text),tables={aqari_tenants:[{id:'tenant-id',external_ref:'tenant-ref',full_name:'Synthetic tenant'}],aqari_properties:[{id:'property-id',name:'Synthetic property'}],aqari_units:[{id:'unit-id',property_id:'property-id',unit_no:'1'}]};
 const d={body:node('div'),status:node('p'),run:fn=>{const task=Promise.resolve().then(fn);tasks.push(task);return task;},session:{bound:{role:'general_manager',workspace:'workspace'},check(){},request:async q=>tables[q.table],client:{from(table){const q={table,select(){return q;},eq(){return q;}};return q;}}}};
 const context={t:x=>x,node,field:(_,el)=>el,createDialog:()=>d,createPrivateUrls:()=>({clear(){}}),crypto:{randomUUID},signatureLabel:x=>x,mountSignatureReview:async()=>{},createOriginalDocumentUpload:()=>async(file,target)=>{calls.push({upload:target,file});return {id:'document-id'};},contractAdministration:async(_,act,data)=>{calls.push({act,data});if(act==='archives')return rows;if(act==='archive'){rows.push({...data,document_status:'uploaded',signature_status:'unverified'});return data;}throw Error('unexpected action');}};
 vm.runInNewContext(source,context);context.openContractArchive();await tasks.at(-1);
 const all=(e=d.body)=>[e,...e.children.flatMap(all)];await all().find(x=>x.textContent==='أرشفة عقد سابق').onclick();
 const [tenant,property,unit]=all().filter(x=>x.tag==='select');tenant.value='tenant-id';property.value='property-id';property.onchange();unit.value='unit-id';
 all().find(x=>x.tag==='input'&&x.type!=='file').value='HISTORICAL-1';all().find(x=>x.type==='file').files=[{name:'synthetic.pdf'}];
 await all().find(x=>x.tag==='form').onsubmit({preventDefault(){}});
 const upload=calls.find(x=>x.upload).upload;assert.equal(upload.type,'tenant');assert.equal(upload.ref,'tenant-ref');assert.equal(upload.category,'archived_contract');
 const archive=calls.find(x=>x.act==='archive').data;assert.equal(archive.tenant_id,'tenant-id');assert.equal(archive.property_id,'property-id');assert.equal(archive.unit_id,'unit-id');assert.equal(archive.document_id,'document-id');
 assert.ok(calls.every(x=>!x.act||['archives','archive'].includes(x.act)));assert.match(d.status.textContent,/لم يُنشأ عقد أو إرسال/);
});
