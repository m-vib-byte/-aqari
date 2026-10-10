import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

// Exercise the real hub render and click handlers with controlled server replies.
const source=readFileSync(new URL('../src/v267/pages/property-hub.js',import.meta.url),'utf8')
 .replace(/^import .*;\n/gm,'').replace('export function openPropertyHub','function openPropertyHub');
function fixture({archived=false,manager=true,writable=true}={}){
 class Element{
  constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.style={};this.dataset={};}
  append(...nodes){this.children.push(...nodes);}
  prepend(...nodes){this.children.unshift(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  querySelector(tag){return this.children.find(x=>x.tag===tag);}
 }
 const node=(tag,text)=>new Element(tag,text),calls=[],opened=[],errors=[];
 let state=archived?'archived':'active',pending;
 const file=()=>({property:{id:'p',name:'عقار الاختبار',lifecycle:{state}},permissions:{},
  units:[{id:'unit',unitNo:'1'}],contracts:[{id:'lease',contractNo:'OLD-LEASE',status:'signed'}],
  documents:[{no:'OLD-DOC',title:'مستند سابق',status:'uploaded'}],
  collections:[{reference:'OLD-RECEIPT',amount:100}],summary:{}});
 const data=name=>{
  if(name==='aqari_property_full_file')return file();
  if(name==='aqari_property_dashboard_header')return {property_id:'p'};
  if(name==='aqari_workspace_access')return {workspace_id:'w',user_id:'u',role:manager?'general_manager':'employee',permissions:{properties:{write:writable},contracts:{write:true}}};
  if(name==='aqari_property_channel_settings')return {propertyId:'p',items:[]};
  if(name==='aqari_ui_presentation_settings')return {workspace_id:'w',user_id:'u',items:[]};
  if(name==='aqari_property_contract_context')return {property:{id:'p',name:'عقار الاختبار'},unit:{id:'unit',unitNo:'1'}};
  throw Error('Unexpected RPC '+name);
 };
 const d={body:node('div'),status:node('p'),session:{bound:{workspace:'w',user:'u'},check(){},
  client:{rpc(name,args){calls.push({name,args});return Promise.resolve(data(name));}},request:x=>x},
  run(fn){pending=Promise.resolve().then(fn).catch(e=>errors.push(e));return pending;},close(){}};
 const context={window:{AQARI_PUBLIC_CONFIG:{releaseStage:'preview'}},createDialog:()=>d,node,
  field:(label,control)=>{const e=node('label',label);e.append(control);return e;},
  translateStatic:x=>x,translateMessage:x=>x,mountPropertyPortfolioAdditions:async()=>{},
  openPropertyPage:async(dialog,loader,name,initial)=>opened.push({name,initial}),
  openPropertyContract(){},openPropertySavedStatements(){},openTenantCompleteFile(){}};
 vm.runInNewContext(source+'\nopenPropertyHub("p");',context);
 const descendants=e=>[e,...e.children.flatMap(descendants)];
 return {calls,opened,errors,settled:()=>pending,archive(){state='archived';},
  text:()=>descendants(d.body).map(e=>e.textContent).join('\n'),
  button:label=>descendants(d.body).find(e=>e.tag==='button'&&e.textContent===label)};
}

test('archived hub hides new activity while keeping history and management accessible',async()=>{
 const f=fixture({archived:true});await f.settled();assert.deepEqual(f.errors,[]);
 assert.match(f.text(),/العقار مؤرشف/);
 assert.equal(f.button('+ إضافة وحدة'),undefined);
 assert.equal(f.button('إبرام عقد من هذه الوحدة'),undefined);
 for(const text of ['OLD-LEASE','OLD-DOC','OLD-RECEIPT'])assert.ok(f.text().includes(text));
 assert.ok(f.button('تعديل الوحدة'));assert.ok(f.button('عرض العقد'));
 await f.button('أرشفة العقار وإعادة تفعيله').onclick();
 assert.equal(f.opened[0].name,'openPropertyLifecycle');assert.equal(f.opened[0].initial,'p');
});

test('active hub keeps new-unit and contract navigation bound to the property',async()=>{
 const f=fixture();await f.settled();await f.button('+ إضافة وحدة').onclick();
 assert.equal(f.opened[0].name,'openPropertyUnitCreate');assert.equal(f.opened[0].initial,'p');
 await f.button('إبرام عقد من هذه الوحدة').onclick();
 assert.equal(f.opened[1].name,'openContractFoundation');assert.equal(f.opened[1].initial.unitId,'unit');
 assert.deepEqual(f.errors,[]);
});

for(const [label,message] of [['+ إضافة وحدة','وحدة جديدة'],['إبرام عقد من هذه الوحدة','عقد جديد']]){
 test('hub rechecks archived status before stale action: '+label,async()=>{
  const f=fixture();await f.settled();const action=f.button(label);f.archive();await action.onclick();
  assert.equal(f.opened.length,0);assert.equal(f.errors.length,1);
  assert.ok(f.errors[0].message.includes(message));
  assert.equal(f.calls.filter(x=>x.name==='aqari_property_contract_context').length,0);
 });
}

test('lifecycle management is restricted to managers with property write access',async()=>{
 for(const options of [{manager:false},{writable:false}]){
  const f=fixture(options);await f.settled();assert.deepEqual(f.errors,[]);
  assert.equal(f.button('أرشفة العقار وإعادة تفعيله'),undefined);
 }
});
