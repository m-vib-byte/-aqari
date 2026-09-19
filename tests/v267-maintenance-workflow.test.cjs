const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
let localeBindings;
test.before(async()=>{const locale=await import('../src/v267/components/locale.js');localeBindings={translateStatic:locale.t,visibleText:locale.t,visibleMessage:locale.message,dateLocale:locale.dateLocale};});
function fixture(overrides={}){
 class Element{
  constructor(tag,value=''){this.tag=tag;this._text=value;this.children=[];this.value='';this.disabled=false;this.checked=false;this.hidden=false;}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}set textContent(v){this._text=v;}
  querySelectorAll(tags){return this.children.flatMap(x=>[...(tags.split(',').includes(x.tag)?[x]:[]),...x.querySelectorAll(tags)]);}
 }
 const node=(tag,value)=>new Element(tag,value),field=(label,el)=>{const n=node('label',label);n.append(el);return n;};
 let saved={workflow_version:2,can_write:true,manager:true,properties:[{id:'p1',name:'العقار الأول'},{id:'p2',name:'العقار الثاني'}],vendors:[{id:'v1',name:'مورد المصعد'},{id:'v2',name:'مورد آخر'}],contracts:[{id:'c1',contract_no:'CONTRACT-1',property_id:'p1',vendor_id:'v1',ends_on:'2027-01-01'},{id:'c2',contract_no:'CONTRACT-2',property_id:'p2',vendor_id:'v2',ends_on:'2027-01-01'}],plans:[],tasks:[],alerts:[],runs:[],documents:[],...overrides};
 const calls=[],state={wrongRead:false,failRead:false},cleanups=[];
 const d={body:node('div'),status:node('p'),closed:false,onDispose(fn){cleanups.push(fn);},close(){this.closed=true;for(const c of cleanups)c();},session:{bound:{workspace:'w'},async request(x){return x;},client:{async rpc(name,{p_action:action,p_data:data}){
  calls.push({action,data:structuredClone(data)});
  if(action==='list'){if(state.failRead)throw Error('read unavailable');const result=structuredClone(saved);if(state.wrongRead&&result.plans[0])result.plans[0].title='different server row';if(state.wrongRead&&result.tasks[0])result.tasks[0].assigned_vendor_id='other';return result;}
  if(action==='save'){const row={...data,revision:data.revision+1};saved.plans=saved.plans.filter(p=>p.id!==data.id).concat(row);return row;}
  if(action==='assign_task'){const row=saved.tasks.find(t=>t.id===data.id);Object.assign(row,{revision:row.revision+1,status:'assigned',assigned_vendor_id:data.vendor_id,assigned_by:'u',assigned_at:'2026-09-12'});return structuredClone(row);}
  throw Error('unexpected action: '+action);
 }}},run(fn){this.last=Promise.resolve().then(fn).catch(e=>{this.status.textContent=e.message;});return this.last;}};
 const context={...localeBindings,createDialog:()=>d,node,field,crypto:{randomUUID:()=> 'new-plan'},Date,JSON,Number,Object,Array,String,Error};vm.createContext(context);
 vm.runInContext(fs.readFileSync('src/v267/pages/maintenance-plans.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,''),context);
 const elements=tag=>d.body.querySelectorAll(tag),button=label=>elements('button').find(x=>x._text===label),control=(label,container=d.body)=>container.querySelectorAll('label').find(x=>x._text===label)?.children[0];
 return {d,calls,state,button,control,elements,saved,get data(){return saved;},async start(){context.openMaintenancePlans();await d.last;},async submit(label){const b=button(label);const form=elements('form').find(f=>f.querySelectorAll('button').includes(b));assert.ok(form,'form '+label);await form.onsubmit({preventDefault(){}});}};
}
test('saving a plan verifies all submitted fields and blocks duplicate writes after an uncertain reread',async()=>{
 const f=fixture();await f.start();f.control('العقار').value='p1';f.control('العقار').onchange();
 assert.deepEqual(f.control('عقد المورد المرتبط').children.map(x=>x.value),['','c1']);
 f.control('عقد المورد المرتبط').value='c1';f.control('عنوان الخطة').value='صيانة المصعد';f.control('موعد الصيانة القادمة').value='2026-09-12';f.state.wrongRead=true;
 await f.submit('حفظ الخطة');assert.equal(f.calls.filter(x=>x.action==='save').length,1);assert.match(f.d.status.textContent,/لم يتأكد الحفظ/);assert.equal(f.button('حفظ الخطة').disabled,true);
 await f.submit('حفظ الخطة');assert.equal(f.calls.filter(x=>x.action==='save').length,1);
 f.state.wrongRead=false;await f.button('تحديث السجل').onclick();assert.match(f.d.status.textContent,/تم استرجاع/);assert.equal(f.data.plans.length,1);assert.equal(f.data.plans[0].vendor_contract_id,'c1');assert.ok(f.button('تعديل الخطة'));
});
test('edit keeps the property fixed and persists pause instead of deleting the plan',async()=>{
 const p={id:'plan1',revision:4,property_id:'p1',asset_kind:'elevator',title:'مصعد العقار',frequency_days:30,next_due_on:'2026-09-12',vendor_contract_id:'c1',warning_days:[30],is_active:true};
 const f=fixture({plans:[p]});await f.start();await f.button('تعديل الخطة').onclick();assert.equal(f.control('العقار').disabled,true);f.control('الخطة فعالة').checked=false;
 await f.submit('حفظ التعديلات');assert.match(f.d.status.textContent,/تم الحفظ والتحقق/);assert.equal(f.data.plans.length,1);assert.equal(f.data.plans[0].is_active,false);assert.equal(f.data.plans[0].revision,5);assert.equal(f.button('إنشاء مهمة من الموعد'),undefined);
});
test('assignment offers the contract vendor and rejects success when reread names another vendor',async()=>{
 const f=fixture({plans:[{id:'plan1',property_id:'p1',vendor_contract_id:'c1',is_active:true,next_due_on:'2026-09-12'}],tasks:[{id:'task1',plan_id:'plan1',property_id:'p1',revision:1,status:'scheduled',due_on:'2026-09-12',task_no:'MT1',cost:0}]});
 await f.start();const assignment=f.elements('form').find(x=>x.querySelectorAll('button').some(b=>b._text==='حفظ التكليف'));
 assert.deepEqual(f.control('الجهة المنفذة',assignment).children.map(x=>x.value),['','v1']);f.control('الجهة المنفذة',assignment).value='v1';f.control('بيان التكليف',assignment).value='تكليف الشركة المتعاقدة';f.state.wrongRead=true;
 await f.submit('حفظ التكليف');assert.match(f.d.status.textContent,/لم يتأكد الحفظ/);assert.equal(f.calls.filter(x=>x.action==='assign_task').length,1);assert.equal(f.button('حفظ التكليف').disabled,true);
 f.state.wrongRead=false;await f.button('تحديث السجل').onclick();assert.ok(f.button('بدء التنفيذ'));assert.equal(f.button('اعتماد إكمال المهمة'),undefined,'cannot complete before starting');
});
test('read-only users and an older database do not get unavailable write actions',async()=>{
 for(const overrides of [{can_write:false,manager:false},{workflow_version:undefined}]){const f=fixture(overrides);await f.start();assert.equal(f.button('حفظ الخطة'),undefined);assert.equal(f.button('حفظ التكليف'),undefined);assert.equal(f.calls.some(x=>x.action!=='list'),false);if(overrides.manager===false)assert.equal(f.button('تجهيز تنبيهات اليوم').hidden,true);}
});
test('invalid calendar date cannot be sent and disposal clears maintenance records',async()=>{
 const f=fixture();await f.start();f.control('العقار').value='p1';f.control('عنوان الخطة').value='خطة اختبار';f.control('موعد الصيانة القادمة').value='2026-02-30';await f.submit('حفظ الخطة');assert.equal(f.calls.filter(x=>x.action==='save').length,0);assert.match(f.d.status.textContent,/راجع العقار/);f.d.close();assert.equal(f.elements('form').length,0);
});
