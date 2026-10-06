import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {inspectQuality} from '../src/v267/components/data-quality.mjs';

const source=readFileSync(process.env.AQARI_QUALITY_PAGE||new URL('../src/v267/pages/data-quality.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
async function fixture({role='general_manager',many=false,limit=false,failTable=null,revoke=false,documents=[],documentLimit=false}={}){
 const nodes=[],calls=[],tasks=[];let failure=failTable,revoked=false,created=0;
 const node=(tag,text)=>{const n={tag,textContent:text||'',children:[],append(...x){this.children.push(...x);},replaceChildren(...x){this.children=x;}};nodes.push(n);return n;};
 const data={aqari_properties:[],aqari_units:many?Array.from({length:251},(_,i)=>({id:'u'+i,property_id:'p',unit_no:String(i)})):[],aqari_tenants:[{id:'t',full_name:'Tenant'}],aqari_leases:[{id:'l',status:'signed',unit_id:many?'u250':null,tenant_id:'t',start_date:'2026-01-01',end_date:'2026-12-31'}]};
 data.aqari_documents=documents;
 const check=()=>{if(revoked)throw Error('session changed');};
 const session={bound:{workspace:'test-workspace'},check,client:{from(table){const q={table,select(columns){this.columns=columns;return this;},eq(key,value){assert.equal(key,'workspace_id');assert.equal(value,'test-workspace');this.scoped=true;return this;},order(key){assert.equal(key,'id');return this;},range(from,to){this.from=from;this.to=to;return this;}};return q;}},async request(q){
  check();assert.equal(q.scoped,true);assert.equal(q.to-q.from,249);calls.push({...q});if(failure===q.table)throw Error('read failed');
  const rows=((limit&&q.table==='aqari_units')||(documentLimit&&q.table==='aqari_documents'))?Array.from({length:250},(_,i)=>({id:'u'+(q.from+i)})):data[q.table].slice(q.from,q.to+1);
  if(revoke&&q.table==='aqari_leases')revoked=true;
  return rows.map(row=>Object.fromEntries(q.columns.split(',').map(k=>[k,row[k]])));
 }};
 const d={body:node('body'),status:node('status'),session,run(fn){const p=(async()=>{try{await fn();}catch(e){d.status.textContent=e.message;}})();tasks.push(p);return p;}};
 const scope={currentScope:()=>({role}),createDialog(){created++;return d;},node,t:s=>s,message:(s,x)=>s.replace(/\{(\w+)\}/g,(_,k)=>String(x[k])),inspectQuality};vm.createContext(scope);vm.runInContext(source,scope);
 let denied;try{scope.openDataQuality();}catch(e){denied=e;}await Promise.all(tasks);
 const output=()=>d.body.children.at(-1),texts=n=>[n.textContent,...n.children.flatMap(texts)];
 return {calls,denied,created,status:()=>d.status.textContent,texts:()=>texts(output()),fail(table){failure=table;},refresh:()=>d.body.children.find(n=>n.tag==='button').onclick()};
}

test('quality page requests and displays contract relationship observations without writes',async()=>{
 const f=await fixture();assert.ok(f.calls.find(c=>c.table==='aqari_leases').columns.includes('unit_id,tenant_id'));
 assert.ok(f.texts().some(s=>s.includes('عقود بلا ربط بوحدة')));assert.match(f.status(),/اكتمل الفحص/);
});
test('relationships are inspected only after all scoped pages are read',async()=>{
 const f=await fixture({many:true});assert.deepEqual(f.calls.filter(c=>c.table==='aqari_units').map(c=>c.from),[0,250]);
 assert.ok(!f.texts().some(s=>s.includes('مرجع وحدة غير موجود')));assert.match(f.status(),/اكتمل الفحص/);
});
test('failed refresh clears old findings and never publishes a complete report',async()=>{
 const f=await fixture();f.fail('aqari_leases');await f.refresh();assert.deepEqual(f.texts(),['']);assert.equal(f.status(),'read failed');
});
test('scan cap stops before contract findings instead of reporting incomplete scope as missing',async()=>{
 const f=await fixture({limit:true});assert.match(f.status(),/لم يكتمل التقرير/);assert.deepEqual(f.texts(),['']);assert.ok(!f.calls.some(c=>c.table==='aqari_leases'));
});
test('session revocation before rendering prevents findings',async()=>{
 const f=await fixture({revoke:true});assert.equal(f.status(),'session changed');assert.deepEqual(f.texts(),['']);
});
test('non-manager cannot open or query the quality scan',async()=>{
 const f=await fixture({role:'staff'});assert.match(f.denied.message,/صلاحية/);assert.equal(f.created,0);assert.equal(f.calls.length,0);
});

test('quality page reads document links and uses archive numbers in review findings',async()=>{
 const f=await fixture({documents:[{id:'d',document_no:'DOC-1',entity_type:'property',entity_ref:null,status:'uploaded'}]});
 assert.equal(f.calls.at(-1).table,'aqari_documents');assert.equal(f.calls.at(-1).columns,'id,document_no,entity_type,entity_ref,status');
 for(const table of ['aqari_properties','aqari_tenants','aqari_leases'])assert.ok(f.calls.find(c=>c.table===table).columns.includes('external_ref'));
 assert.ok(f.texts().some(s=>s.includes('مستندات بلا مرجع سجل')));assert.ok(f.texts().some(s=>s.includes('DOC-1')));
});
test('document scan includes findings from the second page',async()=>{
 const documents=Array.from({length:251},(_,i)=>({id:'d'+i,document_no:'DOC-'+i,entity_type:'property',entity_ref:'unknown',status:'uploaded'}));
 const f=await fixture({documents});assert.deepEqual(f.calls.filter(c=>c.table==='aqari_documents').map(c=>c.from),[0,250]);assert.ok(f.texts().some(s=>s.includes('DOC-250')));assert.match(f.status(),/اكتمل الفحص/);
});
test('failed document read cannot publish earlier contract findings as a complete report',async()=>{
 const f=await fixture({failTable:'aqari_documents'});assert.equal(f.status(),'read failed');assert.deepEqual(f.texts(),['']);
});
test('document scan cap also prevents partial findings from appearing complete',async()=>{
 const f=await fixture({documentLimit:true});assert.match(f.status(),/لم يكتمل التقرير/);assert.deepEqual(f.texts(),['']);
});
