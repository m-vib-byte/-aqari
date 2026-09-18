const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let localeBindings;
test.before(async()=>{
 const locale=await import('../src/v267/components/locale.js');
 const errors=await import('../src/v267/components/ui-error.js');
 localeBindings={translateStatic:locale.t,visibleMessage:locale.message,uiError:errors.uiError};
});
const requestFixture={id:'request-1',request_no:101,revision:3,description:'إصلاح تسرب اصطناعي',property_id:'property-1',unit_id:'unit-1',unit_no:'101',status:'received'};
function fixture(initial={}){
 const state={orders:[],requests:[{...requestFixture},{...requestFixture,id:'request-2',request_no:102,property_id:'property-2',unit_id:'unit-2',unit_no:'202'}],wrongReadback:false},calls=[];let serial=0;
 class Element{
  constructor(tag,text=''){this.tag=tag;this._text=text;this.children=[];this.value='';this.disabled=false;}
  append(...children){for(const c of children){c.parent=this;this.children.push(c);}if(this.tag==='select'&&!this.value)this.value=children[0]?.value||'';}
  replaceChildren(...children){this.children=[];this.append(...children);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
  querySelectorAll(selector){assert.equal(selector,':scope > :not(h2):not(p)');return this.children.filter(c=>!['h2','p'].includes(c.tag));}
  get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}set textContent(value){this._text=value;this.children=[];}
 }
 const node=(tag,text)=>new Element(tag,text),field=(text,control)=>{const box=node('label',text);box.append(control);return box;};
 const session={bound:{workspace:'workspace-1'},request:async value=>value,client:{async rpc(name,args){
  assert.equal(name,'aqari_operations_register');assert.equal(args.p_workspace_id,'workspace-1');calls.push(structuredClone(args));const domain=args.p_domain;
  if(args.p_action==='list'){
   if(domain==='overview')return {health:{},properties:[{id:'property-1',name:'عقار ١'},{id:'property-2',name:'عقار ٢'}],documents:[],leases:[]};
   if(domain==='vendors')return {items:[{id:'vendor-1',name:'مورد فعال',status:'active'},{id:'vendor-2',name:'مورد موقوف',status:'suspended'}],contracts:[]};
   if(domain==='work_orders')return {items:state.orders.map(o=>({...structuredClone(o),unit_id:state.wrongReadback?'wrong-unit':o.unit_id})),requests:state.requests.map(r=>({...r,work_order_id:state.orders.find(o=>o.maintenance_request_id===r.id)?.id,work_order_no:state.orders.find(o=>o.maintenance_request_id===r.id)?.order_no}))};
   return {items:[],events:[],costs:[],funds:[],entries:[]};
  }
  assert.equal(domain,'work_orders');assert.equal(args.p_action,'create');const payload=structuredClone(args.p_data),r=state.requests.find(r=>r.id===payload.maintenance_request_id);
  if(r&&state.orders.some(o=>o.maintenance_request_id===r.id))throw Error('REQUEST_ALREADY_HAS_WORK_ORDER');
  const row={...payload,status:'draft',revision:1,request_snapshot:r?{id:r.id,request_no:r.request_no,revision:r.revision,unit_no:r.unit_no}:null};state.orders.push(row);return row;
 }}};
 let busy=false;const d={body:node('div'),status:node('p'),session,onDispose(){},run(fn){if(busy)return;busy=true;d.last=Promise.resolve().then(fn).catch(error=>{d.status.textContent=error.message;}).finally(()=>{busy=false;});return d.last;}};
 const context=vm.createContext({...localeBindings,node,field,createDialog:()=>d,crypto:{randomUUID:()=>`order-${++serial}`}});vm.runInContext(fs.readFileSync('src/v267/pages/operations-center.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,''),context);
 const walk=e=>[e,...e.children.flatMap(walk)],orders=()=>d.body.children.find(e=>e.tag==='section'&&e.children[0]?._text==='أوامر الشغل');
 const control=label=>walk(orders()).find(e=>e.tag==='label'&&e._text===label).children[0],button=text=>walk(orders()).find(e=>e.tag==='button'&&e.textContent===text);
 return {state,d,calls,control,button,async start(){context.openOperationsCenter(initial);await d.last;},async submit(){await walk(orders()).find(e=>e.tag==='form').onsubmit({preventDefault(){}});}};
}
test('opening a maintenance request locks its property and unit and excludes suspended vendors',async()=>{
 const f=fixture({requestId:'request-1'});await f.start();assert.equal(f.control('العقار').value,'property-1');assert.ok(f.control('العقار').disabled);assert.equal(f.control('بلاغ الصيانة المرتبط').value,'request-1');assert.ok(f.control('بلاغ الصيانة المرتبط').disabled);assert.equal(f.control('وحدة البلاغ').value,'101');assert.ok(f.control('وحدة البلاغ').readOnly);assert.deepEqual(f.control('المورد').children.map(o=>o.value),['','vendor-1']);assert.equal(f.control('رقم أمر الشغل').value,'WO-101');
});
test('request choices belong to the selected property and changing property clears the unit',async()=>{
 const f=fixture();await f.start();f.control('العقار').value='property-1';f.control('العقار').onchange();assert.deepEqual(f.control('بلاغ الصيانة المرتبط').children.map(o=>o.value),['','request-1']);f.control('بلاغ الصيانة المرتبط').value='request-1';f.control('بلاغ الصيانة المرتبط').onchange();assert.equal(f.control('وحدة البلاغ').value,'101');f.control('العقار').value='property-2';f.control('العقار').onchange();assert.equal(f.control('بلاغ الصيانة المرتبط').value,'');assert.equal(f.control('وحدة البلاغ').value,'');assert.deepEqual(f.control('بلاغ الصيانة المرتبط').children.map(o=>o.value),['','request-2']);
});
test('saving sends the request revision and exact unit, then reads the linked order back',async()=>{
 const f=fixture({requestId:'request-1'});await f.start();f.control('المورد').value='vendor-1';f.control('القيمة المعتمدة د.ك').value='25.125';await f.submit();const write=f.calls.find(c=>c.p_action==='create');assert.equal(write.p_data.maintenance_request_id,'request-1');assert.equal(write.p_data.request_revision,3);assert.equal(write.p_data.unit_id,'unit-1');assert.equal(f.state.orders.length,1);assert.match(f.d.status.textContent,/تم الحفظ والتحقق/);assert.ok(f.button('إنشاء أمر الشغل').disabled);await f.submit();assert.equal(f.calls.filter(c=>c.p_action==='create').length,1);assert.match(f.d.status.textContent,/مرتبط بأمر شغل محفوظ/);
});
test('a mismatched readback cannot claim the linked work order was verified',async()=>{
 const f=fixture({requestId:'request-1'});await f.start();f.control('المورد').value='vendor-1';f.control('القيمة المعتمدة د.ك').value='25.125';f.state.wrongReadback=true;await f.submit();assert.match(f.d.status.textContent,/نتيجة إعادة القراءة لا تطابق/);assert.equal(f.state.orders.length,1);
});
test('an unavailable request fails before presenting an unrelated create form',async()=>{
 const f=fixture({requestId:'closed-or-foreign'});await f.start();assert.match(f.d.status.textContent,/البلاغ غير متاح/);assert.equal(f.calls.some(c=>c.p_action==='create'),false);
});
