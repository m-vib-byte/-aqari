import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/v267/pages/rental-contracts.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
function fixture({imported=false,closedAfterRead=false}={}){
 const calls=[],tasks=[],urls=[];let closed=false;
 class Element{constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.value='';this.classList={add(){}};}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}}
 const node=(tag,text)=>new Element(tag,text);
 const contract={id:123,contract_no:'C-123',tenant:'Test Tenant',property:'Test property',unit:'1',status:'signed',source:imported?'statement-import':'v267-cloud'};
 const api={primary:x=>x,contractMarkup:()=>'<p>saved contract</p>'};
 const session={bound:{workspace:'workspace',role:'staff'},check(){if(closed)throw Error('closed');},client:{rpc(name){calls.push(name);return {name};},from(table){calls.push(table);const query={table};for(const method of ['select','eq','order'])query[method]=()=>query;return query;}},async request(query){if(query.name==='aqari_read_state_v267'){if(closedAfterRead)closed=true;return {payload:{contractsV202:[contract]}};}if(query.name==='aqari_contract_history')return [];if(query.table==='aqari_documents')return [{id:'doc',original_filename:'original.pdf',storage_path:'workspace/original.pdf'}];throw Error('unrelated property read denied');},async storage(method,path){calls.push(method+':'+path);return new Blob(['saved original']);}};
 const d={el:node('dialog'),body:node('div'),status:node('p'),session,run(fn){const task=Promise.resolve().then(fn);tasks.push(task);return task;},navigate(fn){return this.run(fn);},close(){closed=true;}};
 const context={Blob,node,field:(label,control)=>control,translateStatic:x=>x,createDialog:()=>d,createPrivateUrls:()=>({clear(){},create(blob){urls.push(blob);return 'blob:verified-original';}}),window:{AQARI_RENTAL_RECORDS:api}};
 vm.runInNewContext(source,context);
 const all=(root=d.body)=>[root,...root.children.flatMap(x=>all(x))];
 return {calls,d,urls,all,open:async initial=>{context.openRentalContracts(initial);await tasks.at(-1);},click:async el=>{el.onclick();await tasks.at(-1);}};
}
test('saved contract list does not depend on property or unit reads',async()=>{
 const f=fixture();await f.open({});assert.ok(f.all().some(x=>x.textContent.includes('C-123')));assert.deepEqual(f.calls,['aqari_read_state_v267']);
});
test('selected contract can be previewed when unrelated property reads would fail',async()=>{
 const f=fixture();await f.open({id:123});assert.ok(f.all().some(x=>x.innerHTML==='<p>saved contract</p>'));assert.ok(f.calls.includes('aqari_documents'));assert.equal(f.calls.includes('aqari_units'),false);
});
test('imported contract exposes its original attachment without enabling official issuance',async()=>{
 const f=fixture({imported:true});await f.open({id:123});const file=f.all().find(x=>x.textContent==='original.pdf');assert.ok(file);assert.equal(f.all().some(x=>x.textContent.includes('Prepare approved copy')),false);await f.click(file);assert.ok(f.calls.includes('GET:workspace/original.pdf'));assert.equal(f.urls.length,1);assert.equal(f.all().find(x=>x.tag==='a').href,'blob:verified-original');
});
test('a closed session cannot render contracts from a late state response',async()=>{
 const f=fixture({closedAfterRead:true});await assert.rejects(f.open({}),/closed/);assert.equal(f.all().some(x=>x.textContent.includes('C-123')),false);
});

test('editing still loads property and unit bindings concurrently and checks the session before applying them',async()=>{
 const block=source.slice(source.indexOf(' async function loadBindings(){'),source.indexOf(' async function showDocuments'));
 for(const closed of [false,true]){
  const started=[],pending=[];
  const d={session:{bound:{workspace:'w'},client:{from(table){const q={table};for(const key of ['select','eq','order'])q[key]=()=>q;return q;}},request(q){started.push(q.table);return new Promise(resolve=>pending.push(resolve));},check(){if(closed)throw Error('closed');}}};
  const box={d};vm.runInNewContext('let properties=[],units=[];'+block+';this.load=loadBindings;this.result=()=>({properties,units});',box);
  const task=box.load();assert.deepEqual(started,['aqari_properties','aqari_units']);pending[0]([{id:'p'}]);pending[1]([{id:'u'}]);
  if(closed){await assert.rejects(task,/closed/);assert.equal(box.result().properties.length,0);}else{await task;assert.equal(box.result().properties[0].id,'p');assert.equal(box.result().units[0].id,'u');}
 }
});
