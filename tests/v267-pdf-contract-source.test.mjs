import test from 'node:test';
import assert from 'node:assert/strict';
import {pdfContractSources,pdfContractSourceKey,setPdfContractSource,planPdfContractValues} from '../src/v267/domain/pdf-contract-source.js';
import {createPdfContractSource} from '../src/v267/api/pdf-contract-source.js';
import {mountPdfContractAutofill} from '../src/v267/components/pdf-contract-autofill.js';

test('sources require explicit persisted bindings; labels and arbitrary data keys do not opt in',()=>{
 const fields=[{id:'a',label:'اسم المستأجر',type:'text'},{id:'b',label:'copy',type:'text',dataKey:'tenant_name'}];
 assert.throws(()=>planPdfContractValues(fields,{}, {values:{tenant_name:'Tenant'}}),/حدد/);
 setPdfContractSource(fields,fields[0],'tenant_name');assert.equal(pdfContractSourceKey(fields[0]),'tenant_name');
 assert.deepEqual(planPdfContractValues(fields,{}, {values:{tenant_name:'Tenant'}}).map(x=>x.id),['a']);
 assert.ok(!pdfContractSources.some(x=>['amount','receipt_date','rent_period'].includes(x.key)));
 assert.throws(()=>setPdfContractSource(fields,fields[0],'unknown'),/معروف/);
});
test('linked groups keep consistent types and values; rejected rebind is atomic',()=>{
 const fields=[{id:'a',type:'text',dataKey:'group'},{id:'b',type:'text',dataKey:'group'},{id:'c',type:'date',dataKey:'aqari_source_tenant_name'}];
 const before=JSON.stringify(fields);assert.throws(()=>setPdfContractSource(fields,fields[0],'tenant_name'),/النوع/);assert.equal(JSON.stringify(fields),before);
 fields.pop();setPdfContractSource(fields,fields[0],'tenant_name');assert.equal(fields[1].dataKey,fields[0].dataKey);
 fields.push({id:'c',type:'text'});assert.throws(()=>setPdfContractSource(fields,fields[2],'tenant_name',{a:'OLD',b:'OLD'}),/القيم مختلفة/);assert.equal(fields[2].dataKey,undefined);
 setPdfContractSource(fields,fields[0],'');assert.equal(pdfContractSourceKey(fields[0]),'');assert.equal(pdfContractSourceKey(fields[1]),'tenant_name');
});
test('planning clears missing source values, preserves zero and leaves manual fields untouched',()=>{
 const fields=[{id:'a',label:'Tenant',type:'text',dataKey:'aqari_source_tenant_name'},{id:'b',label:'Deposit',type:'money',dataKey:'aqari_source_deposit_amount'},{id:'c',type:'text'}],values={a:'PREVIOUS TENANT',b:'100',c:'MANUAL'};
 const plan=planPdfContractValues(fields,values,{values:{deposit_amount:0}});
 assert.deepEqual(plan.map(x=>[x.id,x.value,x.missing]),[['a','',true],['b','0',false]]);assert.equal(values.a,'PREVIOUS TENANT');assert.equal(values.c,'MANUAL');
 assert.throws(()=>planPdfContractValues(fields,values,{values:{deposit_amount:'1.0001'}}),/نوع الحقل/);
});

function fixture(){
 const workspace='w',user='actor',property={id:'p'},profile={id:'tenant-local',nameAr:'Tenant',civilId:'123456789012'};
 const contract={id:'contract',contract_no:'C-1',tenantId:profile.id,propertyId:'p',unitId:'unit',start_date:'2026-01-01',end_date:'2026-12-31',contractRent:350};
 const data={contractsV202:[contract],tenantProfilesV267:[profile]},calls=[];
 const tables={aqari_leases:[{id:'lease',workspace_id:workspace,external_ref:contract.id,tenant_id:'tenant',unit_id:'unit',snapshot:contract,status:'signed'}],aqari_units:[{id:'unit',workspace_id:workspace,property_id:'p',unit_no:'101'}],aqari_tenants:[{id:'tenant',workspace_id:workspace,external_ref:profile.id,profile}],aqari_properties:[{id:'p',workspace_id:workspace,name:'Property'}]};
 const master={workspace_id:workspace,user_id:user,property:{id:'p',owners:[{id:'owner',name:'Owner'}]},unit:{id:'unit',propertyId:'p'}};
 let revoked=false;
 const session={bound:{workspace,user,role:'general_manager'},check(){if(revoked)throw Error('REVOKED');},request:async x=>await x,client:{
  from(table){const filters=[];return {select(){return this;},eq(k,v){filters.push([k,v]);return this;},limit(n){assert.equal(n,2);assert.ok(filters.some(([k,v])=>k==='workspace_id'&&v===workspace));calls.push(table);return Promise.resolve(structuredClone(tables[table].filter(row=>filters.every(([k,v])=>row[k]===v))));}};},
  rpc(name,args){assert.equal(args.p_workspace_id,workspace);calls.push(name);if(name==='aqari_read_state_v267')return Promise.resolve({workspace_id:workspace,payload:structuredClone(data)});if(name==='aqari_property_contract_context')return Promise.resolve(structuredClone(master));if(name==='aqari_pdf_contract_bindings')return Promise.resolve({items:[{external_ref:'contract'}],has_more:false,next_offset:50});throw Error(name);}
 }};
 return {session,source:createPdfContractSource(session,property),tables,master,data,calls,revoke(){revoked=true;}};
}
test('reader resolves the actual linked identity and master using scoped read-only APIs',async()=>{
 const f=fixture(),before=JSON.stringify([f.tables,f.data]);const result=await f.source.read('contract');
 assert.equal(result.values.tenant_name,'Tenant');assert.equal(result.values.owner_name,'Owner');assert.equal(result.values.unit_no,'101');assert.equal(result.values.start_date,'2026-01-01');
 assert.equal(JSON.stringify([f.tables,f.data]),before);assert.equal((await f.source.list()).items[0].external_ref,'contract');
});
test('foreign property/workspace, ambiguous lease, cancelled lease and forged master are refused',async()=>{
 for(const mutate of [f=>f.tables.aqari_units[0].property_id='other',f=>f.tables.aqari_tenants[0].workspace_id='other',f=>f.tables.aqari_leases.push({...f.tables.aqari_leases[0],id:'duplicate'}),f=>f.tables.aqari_leases[0].status='cancelled',f=>f.master.user_id='other',f=>f.master.unit.propertyId='other',f=>f.data.contractsV202[0].tenantId='wrong']){
  const f=fixture();mutate(f);await assert.rejects(()=>f.source.read('contract'));
 }
});
test('staff and revoked sessions cannot list or read source records',async()=>{
 for(const mutate of [f=>f.session.bound.role='property_manager',f=>f.revoke()]){
  const f=fixture();mutate(f);await assert.rejects(()=>f.source.list());await assert.rejects(()=>f.source.read('contract'));assert.deepEqual(f.calls,[]);
 }
});

class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.style={};this.value='';this.checked=false;this.disabled=false;this.textContent='';}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(k,v){this[k]=v;}
}
const walk=el=>[el,...el.children.flatMap(walk)];
test('review never applies automatically and stale editor/source values require another confirmation',async()=>{
 const previous=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
 try{
  const f=fixture(),root=new Element('section'),state={fields:[{id:'name',type:'text',label:'Tenant',dataKey:'aqari_source_tenant_name'}],values:{name:'OLD',manual:'UNCHANGED'}};
  let applied=0;const dispose=[];const d={session:f.session,closed:false,run:fn=>fn(),onDispose:fn=>dispose.push(fn)};
  mountPdfContractAutofill(d,root,{property:{id:'p'},read:()=>structuredClone(state),apply:changes=>{applied++;for(const c of changes)state.values[c.id]=c.value;}});
  const button=text=>walk(root).find(el=>el.tagName==='button'&&el.textContent===text);
  const control=text=>walk(root).find(el=>el.children.some(c=>c.tagName==='label'&&c.textContent===text)).children[1];
  await button('تحميل عقود التعبئة').onclick();const select=control('العقد مصدر التعبئة');select.value='contract';select.onchange();
  const preview=button('معاينة بيانات العقد للتعبئة'),apply=button('تعبئة الحقول من البيانات المعروضة'),confirm=control('راجعت القيم وأوافق على تعبئة الحقول المرتبطة');
  await preview.onclick();assert.equal(state.values.name,'OLD');assert.equal(applied,0);await apply.onclick();assert.equal(applied,0);
  confirm.checked=true;confirm.onchange();state.values.manual='EDITED';await assert.rejects(()=>apply.onclick(),/تغيرت الحقول/);assert.equal(applied,0);
  await preview.onclick();confirm.checked=true;confirm.onchange();f.data.tenantProfilesV267[0].nameAr='UPDATED';await assert.rejects(()=>apply.onclick(),/تغيرت بيانات العقد/);assert.equal(state.values.name,'OLD');
  await preview.onclick();confirm.checked=true;confirm.onchange();await apply.onclick();assert.equal(applied,1);assert.equal(state.values.name,'UPDATED');assert.equal(state.values.manual,'EDITED');assert.equal(apply.disabled,true);
  await preview.onclick();confirm.checked=true;confirm.onchange();f.revoke();await assert.rejects(()=>apply.onclick(),/REVOKED/);assert.equal(applied,1);
  d.closed=true;dispose.forEach(fn=>fn());assert.equal(apply.disabled,true);
 }finally{globalThis.document=previous;}
});
