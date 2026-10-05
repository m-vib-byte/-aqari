import test from 'node:test';
import assert from 'node:assert/strict';
import {openPropertyMasterFile} from '../src/v267/pages/property-master-file.js';
import {SUPABASE_PUBLIC_CONFIG} from '../lib/release-config.js';

// Run the real page, dialog and session modules against a synthetic DOM and
// controlled server replies. These are regression tests, not hosted acceptance.
function fixture(options={}) {
 const original={window:globalThis.window,document:globalThis.document};
 class Element {
  constructor(tag,text=''){this.tagName=tag;this.textContent=text;this.children=[];this.attrs={};this.classList={add(){},remove(){}};}
  append(...nodes){for(const n of nodes){this.children.push(n);n.parent=this;}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(){} showModal(){} close(){}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
 }
 const body=new Element('body'),calls=[],scope={user:'test-user',workspace:'test-workspace',role:'general_manager'};
 const record={workspace_id:scope.workspace,property:{id:'property-a',name:'عقار الاختبار'},permissions:{collections:false,finance:false,employees:false,...options.permissions},contracts:options.contracts??[{id:'lease-a'},{id:'lease-b'}],units:[]};
 const row={id:'request-a',request_no:21,lease_id:'lease-a',description:'صيانة الاختبار',status:'open',cost:12,category_code:'plumbing'};
 let maintenanceReads=0;
 let nextReadError=null;
 function query(kind,name,args){
  const call={kind,name,args,filters:[]};
  return {
   select(columns){call.columns=columns;return this;},
   eq(key,value){call.filters.push([key,value]);return this;},
   in(key,value){call.filters.push([key,value]);return this;},
   order(key,value){call.order=[key,value];return this;},
   limit(value){call.limit=value;return this;},
   abortSignal(){
    calls.push(call);
    if(kind==='table'){
     maintenanceReads++;
     if(maintenanceReads===1&&options.error){
      if(options.changeScope)window.AQARI_DATA_GATE.scope.userId='other-user';
      return Promise.resolve({error:options.error,status:options.status??400});
     }
     if(maintenanceReads>1&&options.retryError)return Promise.resolve({error:options.retryError,status:400});
     const selected={...row};if(!call.columns.includes('category_code'))delete selected.category_code;
     return Promise.resolve({data:[selected],status:200});
    }
    if(name==='aqari_property_full_file'){
     return Promise.resolve(nextReadError?{error:nextReadError,status:400}:{data:record,status:200});
    }
    if(name==='aqari_workspace_access')return Promise.resolve({data:{workspace_id:scope.workspace,user_id:scope.user,role:scope.role,permissions:{properties:{write:true},documents:{write:true},finance:{write:options.financeWritable===true}}},status:200});
    if(name==='aqari_property_financial_summary')return Promise.resolve({data:{workspace_id:scope.workspace,property_id:'property-a',available:true,month:{},year:{}},status:200});
    if(name==='aqari_property_cost_allocation')return Promise.resolve({data:{workspace_id:scope.workspace,user_id:scope.user,properties:[{id:'property-a',name:'عقار الاختبار'}],sources:[],manager:true},status:200});
    if(name==='aqari_property_tenant_ledger'&&options.ledger)return Promise.resolve({data:options.ledger,status:200});
    if(name==='aqari_property_tenant_ledger')return Promise.resolve({error:{code:'PGRST202',message:'Could not find the function public.aqari_property_tenant_ledger'},status:404});
    throw Error('Unexpected RPC: '+name);
   }
  };
 }
 const client={rpc:(name,args)=>query('rpc',name,args),from:name=>query('table',name)};
 globalThis.document={body,activeElement:null,createElement:tag=>new Element(tag),createTextNode:text=>new Element('#text',text),documentElement:{classList:{contains:()=>true}}};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:SUPABASE_PUBLIC_CONFIG.url,releaseStage:options.releaseStage||'preview'},AQARI_DATA_GATE:{scope:{userId:scope.user,workspaceId:scope.workspace}},AQARI_SUPABASE:{getClient:async()=>client,context:{user:{id:scope.user},workspace:{id:scope.workspace},membership:{user_id:scope.user,workspace_id:scope.workspace,role:scope.role,is_active:true}}},addEventListener(){},removeEventListener(){}};
 assert.equal(openPropertyMasterFile('property-a',options.openOptions||{}),true);
 const dialog=body.children[0];
 const descendants=el=>[el,...el.children.flatMap(descendants)];
 return {
  calls,dialog,body,descendants,
  status:()=>dialog.children[2].textContent,
  text:()=>descendants(dialog).map(el=>el.textContent).join('\n'),
  tables:()=>calls.filter(c=>c.kind==='table'),
  rpcs:()=>calls.filter(c=>c.kind==='rpc'),
  button:label=>descendants(dialog).find(el=>el.tagName==='button'&&el.textContent===label),
  failNextRead(error){nextReadError=error;},
  async settled(){for(let i=0;i<10&&dialog.attrs['aria-busy']==='true';i++)await new Promise(setImmediate);assert.equal(dialog.attrs['aria-busy'],'false');},
  async cleanup(){for(const el of [...body.children])if(el.tagName==='dialog')await el.children[0].onclick();Object.assign(globalThis,original);}
 };
}
const missingCategory={code:'42703',message:'column aqari_maintenance_requests.category_code does not exist'};

test('cost allocation replaces the property dialog and preserves its property filter',async()=>{
 const f=fixture({permissions:{collections:true,finance:true},financeWritable:true});try{
  await f.settled();await f.button('توزيع الرواتب والمصاريف على العقارات').onclick();
  for(let i=0;i<10&&f.body.children[0]?.attrs['aria-busy']==='true';i++)await new Promise(setImmediate);
  const allocation=f.body.children[0];assert.equal(f.body.children.length,1);
  assert.equal(allocation.attrs['aria-label'],'توزيع التكاليف حسب العقار');
  assert.equal(allocation.attrs['aria-busy'],'false');
  assert.equal(f.descendants(allocation).find(el=>el.tagName==='select').value,'property-a');
  assert.deepEqual(f.calls.filter(c=>c.name==='aqari_property_cost_allocation').map(c=>c.args),[{p_workspace_id:'test-workspace',p_action:'list',p_data:{}}]);
 }finally{await f.cleanup();}
});

test('cost allocation rejects a changed session before opening another dialog',async()=>{
 const f=fixture({permissions:{collections:true,finance:true},financeWritable:true});try{
  await f.settled();window.AQARI_DATA_GATE.scope.userId='other-user';
  await assert.doesNotReject(async()=>await f.button('توزيع الرواتب والمصاريف على العقارات').onclick());
  assert.equal(f.body.children[0],f.dialog);assert.match(f.status(),/تغيرت جلسة الدخول/);
  assert.equal(f.calls.filter(c=>c.name==='aqari_property_cost_allocation').length,0);
 }finally{await f.cleanup();}
});

test('missing optional category still renders the property and maintenance without inventing a category',async()=>{
 const f=fixture({error:missingCategory});try{
  await f.settled();assert.match(f.text(),/عقار الاختبار/);assert.match(f.text(),/صيانة الاختبار/);assert.match(f.text(),/غير متاح/);
  const reads=f.tables();assert.equal(reads.length,2);assert.ok(reads[0].columns.includes('category_code'));assert.ok(!reads[1].columns.includes('category_code'));
  for(const q of reads){assert.equal(q.name,'aqari_maintenance_requests');assert.deepEqual(q.filters,[['workspace_id','test-workspace'],['lease_id',['lease-a','lease-b']]]);assert.deepEqual(q.order,['created_at',{ascending:false}]);assert.equal(q.limit,100);}
  assert.match(f.status(),/المصادر الخادمة الفعلية/);
 }finally{await f.cleanup();}
});
test('a modern schema keeps the stored category and performs a single scoped read',async()=>{
 const f=fixture();try{await f.settled();assert.equal(f.tables().length,1);assert.match(f.text(),/plumbing/);}finally{await f.cleanup();}
});
test('production basic property file reads optional ledger and skips missing category column',async()=>{
 const f=fixture({releaseStage:'production'});try{
  await f.settled();
  const reads=f.tables();assert.equal(reads.length,1);assert.ok(!reads[0].columns.includes('category_code'));
  assert.equal(f.rpcs().some(call=>call.name==='aqari_property_tenant_ledger'),true);
  assert.match(f.text(),/غير متاح/);
 }finally{await f.cleanup();}
});
test('production property edit opens directly through the basic file',async()=>{
 const f=fixture({releaseStage:'production',openOptions:{section:'edit'}});try{
  await f.settled();assert.match(f.text(),/تعديل بيانات العقار الرئيسية/);
  assert.equal(f.rpcs().some(call=>call.name==='aqari_property_tenant_ledger'),true);
 }finally{await f.cleanup();}
});
for(const permissions of [{maintenance:false},{contracts:false}])test('permission-denied details never read the maintenance table: '+JSON.stringify(permissions),async()=>{
 const f=fixture({permissions});try{await f.settled();assert.equal(f.tables().length,0);assert.doesNotMatch(f.text(),/صيانة الاختبار/);}finally{await f.cleanup();}
});
test('a property with no leases does not issue an unscoped maintenance read',async()=>{
 const f=fixture({contracts:[]});try{await f.settled();assert.equal(f.tables().length,0);}finally{await f.cleanup();}
});
for(const error of [
 {code:'42703',message:'column aqari_maintenance_requests.cost does not exist'},
 {code:'42703',message:'column another_table.category_code does not exist'},
 {code:'PGRST000',message:'Database connection unavailable'},
 {code:'42501',message:'ACCESS_DENIED'}
])test('other read errors are not hidden or retried: '+error.message,async()=>{
 const f=fixture({error});try{await new Promise(setImmediate);assert.equal(f.tables().length,1);assert.doesNotMatch(f.text(),/صيانة الاختبار/);assert.doesNotMatch(f.status(),/المصادر الخادمة الفعلية/);}finally{await f.cleanup();}
});
test('a failed compatibility read stays an error instead of an empty success',async()=>{
 const f=fixture({error:missingCategory,retryError:{code:'PGRST000',message:'Database connection unavailable'}});try{await f.settled();assert.equal(f.tables().length,2);assert.doesNotMatch(f.status(),/المصادر الخادمة الفعلية/);assert.doesNotMatch(f.text(),/صيانة الاختبار/);}finally{await f.cleanup();}
});
test('changing the session while reading never retries with another user scope',async()=>{
 const f=fixture({error:missingCategory,changeScope:true});try{await f.settled();assert.equal(f.tables().length,1);assert.match(f.status(),/تغيرت جلسة الدخول/);}finally{await f.cleanup();}
});
for(const label of ['تعديل بيانات العقار','+ إضافة وحدة وربط الدور','+ رفع وأرشفة مرفق'])test('property action reports read failure through the dialog: '+label,async()=>{
 const f=fixture();try{
  await f.settled();f.failNextRead({code:'P0001',message:'تعذر قراءة بيانات العقار للاختبار.'});
  const button=f.button(label);assert.ok(button,'action must exist');
  await assert.doesNotReject(async()=>await button.onclick());await f.settled();
  assert.equal(f.status(),'تعذر قراءة بيانات العقار للاختبار.');
 }finally{await f.cleanup();}
});
for(const [label,heading] of [
 ['تعديل بيانات العقار','تعديل بيانات العقار الرئيسية'],
 ['+ إضافة وحدة وربط الدور','إضافة وحدة إلى عقار الاختبار'],
 ['+ رفع وأرشفة مرفق','إضافة مستند أو صورة إلى عقار الاختبار']
])test('property form opens and cancel reports a read failure: '+label,async()=>{
 const f=fixture();try{
  await f.settled();await f.button(label).onclick();await f.settled();assert.ok(f.text().includes(heading));
  f.failNextRead({code:'P0001',message:'تعذر تحديث الملف للاختبار.'});
  await assert.doesNotReject(async()=>await f.button('إلغاء').onclick());await f.settled();
  assert.equal(f.status(),'تعذر تحديث الملف للاختبار.');
 }finally{await f.cleanup();}
});

// The Production route must render stored balances and reject foreign scope.
test('production ledger renders authoritative amounts without recalculation',async()=>{
 const f=fixture({releaseStage:'production',ledger:{available:true,workspace_id:'test-workspace',property_id:'property-a',permissions:{contracts:true,tenants:true,collections:true},tenants:[{fullName:'Synthetic tenant',contracts:[{contractNo:'TEST-LEDGER'}]}],rentDues:[{period:'2026-10-01',contractNo:'TEST-LEDGER',unitNo:'A-1',dueAmount:100,paidAmount:64.5,balance:25.5,status:'partial'}]}});
 try{await f.settled();assert.match(f.text(),/Synthetic tenant/);assert.match(f.text(),/25\.500/);assert.doesNotMatch(f.text(),/35\.500/);const q=f.rpcs().find(x=>x.name==='aqari_property_tenant_ledger');assert.equal(q.args.p_workspace_id,'test-workspace');assert.equal(q.args.p_property_id,'property-a');}finally{await f.cleanup();}
});
test('production ledger rejects a different property response',async()=>{
 const f=fixture({releaseStage:'production',ledger:{available:true,workspace_id:'test-workspace',property_id:'property-b',tenants:[{fullName:'PRIVATE OTHER PROPERTY'}]}});
 try{await f.settled();assert.match(f.status(),/تعذر تأكيد نطاق/);assert.doesNotMatch(f.text(),/PRIVATE OTHER PROPERTY/);}finally{await f.cleanup();}
});
