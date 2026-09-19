const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/v267/pages/staff-access.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
function fixture(initial=[]){
 const assignments=structuredClone(initial),calls=[],audit=[],state={manager:true,skipSave:false,lostSaveReply:false,failRead:false,confirm:true,properties:[{id:'property-a',name:'برج <أ>'},{id:'property-b',name:'برج ب'}]};let cleanup;
 const descendants=element=>[element,...element.children.flatMap(descendants)];
 class Element{
  constructor(tag,value){this.tag=tag;this.children=[];this._value='';this._text=value??'';this.hidden=false;this.disabled=false;this.checked=false;}
  append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
  replaceChildren(...children){this.children=[];this.append(...children);}
  get textContent(){return String(this._text)+this.children.map(child=>child.textContent).join('');}
  set textContent(value){this._text=value;this.children=[];}
  get value(){return this._value;}
  set value(value){this._value=value;}
  querySelectorAll(selector){assert.ok(['input','input:checked'].includes(selector));return descendants(this).filter(child=>child.tag==='input'&&(selector==='input'||child.checked));}
  focus(){}
 }
 const node=(tag,value)=>new Element(tag,value),field=(label,control)=>{const group=node('div');group.label=label;group.append(control);return group;};
 const members=[{user_id:'user-a',display_name:'موظف <اختبار>',role:'accountant',is_active:true},{user_id:'user-b',display_name:'مشرف اختبار',role:'property_manager',is_active:true},{user_id:'user-disabled',display_name:'موظف سابق',role:'property_manager',is_active:false}];
 const rpc=async(name,args)=>{
  assert.equal(name,'aqari_staff_access');assert.equal(args.p_workspace_id,'workspace-fixture');calls.push(structuredClone(args));
  if(args.p_action==='list'){if(state.failRead)throw Object.assign(Error('تعذر اتصال القراءة'),state.readError||{});return {manager:state.manager,properties:structuredClone(state.properties),members:structuredClone(members),assignments:structuredClone(assignments),audit:structuredClone(audit)};}
  assert.equal(args.p_action,'save');const values=args.p_data,row=assignments.find(item=>item.user_id===values.user_id);
  if(state.saveError)throw state.saveError;
  assert.equal(values.revision,row?.revision||0,'save sends the previous revision');
  if(!state.skipSave){const updated={...values,revision:values.revision+1,updated_at:'2026-09-09T11:00:00Z'};if(row)Object.assign(row,updated);else assignments.push(updated);audit.push({actor_name:'مدير <اختبار>',recorded_at:updated.updated_at,reason:values.reason,before_snapshot:null,after_snapshot:updated});}
  if(state.failReadAfterSave)state.failRead=true;if(state.lostSaveReply)throw Error('انقطع الرد بعد الحفظ');return {...values,revision:values.revision+1};
 };
 const d={body:node('div'),status:node('p'),session:{bound:{workspace:'workspace-fixture'},client:{rpc},request:query=>query},onDispose(fn){cleanup=fn;},run(task){d.pending=Promise.resolve().then(task).catch(error=>{d.status.textContent=error.message;});return d.pending;}};
 // Imports are stripped by this isolated permissions harness. Supply the Arabic
 // locale boundary while leaving the real authorization/write/readback code intact.
 const context={node,field,translateStatic:value=>value,visibleText:value=>value,dateLocale:()=> 'ar-KW',createDialog:()=>d,window:{confirm:()=>state.confirm}};vm.createContext(context);vm.runInContext(source+'\nopenStaffAccess();',context);
 const control=label=>descendants(d.body).find(element=>element.label===label)?.children[0];
 const form=()=>descendants(d.body).find(element=>element.tag==='form');
 const choose=()=>{control('حساب الموظف').value='user-a';control('حساب الموظف').onchange();control('الدور الوظيفي').value='collector';control('سبب منح الصلاحيات أو تعديلها أو إيقافها').value='إسناد التحصيل لهذا العقار';};
 const submit=async()=>{form().onsubmit({preventDefault(){}});await d.pending;};
 const button=label=>descendants(d.body).find(element=>element.tag==='button'&&element.textContent===label);
 return {d,state,calls,assignments,members,control,form,choose,submit,button,propertyInputs:()=>descendants(d.body).find(element=>element.tag==='fieldset').querySelectorAll('input'),dispose:()=>cleanup()};
}
test('no property or role is granted by default and activation requires a property',async()=>{
 const f=fixture();await f.d.pending;assert.equal(f.control('حساب الموظف').value,'');f.choose();assert.equal(f.control('برج <أ>').checked,false);assert.equal(f.control('برج ب').checked,false);
 f.control('تفعيل الوصول إلى العقارات المحددة').checked=true;await f.submit();assert.equal(f.calls.filter(call=>call.p_action==='save').length,0);assert.match(f.d.status.textContent,/اختر عقاراً واحداً/);
});
test('grant verifies persisted role, status, revision and explicit properties after save',async()=>{
 const f=fixture();await f.d.pending;f.choose();f.control('برج ب').checked=true;f.control('تفعيل الوصول إلى العقارات المحددة').checked=true;await f.submit();
 const save=f.calls.find(call=>call.p_action==='save');assert.equal(save.p_data.revision,0);assert.deepEqual(save.p_data.property_ids,['property-b']);assert.equal(save.p_data.operational_role,'collector');assert.equal(f.calls.at(-1).p_action,'list');assert.match(f.d.status.textContent,/تم حفظ الصلاحيات والتحقق/);assert.equal(f.assignments[0].revision,1);assert.match(f.d.body.textContent,/مدير <اختبار>/);
});
test('active account grant can be disabled with zero properties and documented reason',async()=>{
 const f=fixture([{user_id:'user-a',operational_role:'accountant',is_active:true,property_ids:['property-a'],revision:4}]);await f.d.pending;f.control('حساب الموظف').value='user-a';f.control('حساب الموظف').onchange();assert.equal(f.control('الدور الوظيفي').value,'accountant');
 f.control('تفعيل الوصول إلى العقارات المحددة').checked=false;f.control('برج <أ>').checked=false;f.control('سبب منح الصلاحيات أو تعديلها أو إيقافها').value='إيقاف تكليف الحساب';await f.submit();
 assert.equal(f.calls.find(call=>call.p_action==='save').p_data.revision,4);assert.equal(f.assignments[0].revision,5);assert.deepEqual(Array.from(f.assignments[0].property_ids),[]);assert.equal(f.assignments[0].is_active,false);assert.match(f.d.status.textContent,/تم إيقاف الوصول/);
});
test('save acknowledgement without matching database read is not reported as success',async()=>{
 const f=fixture();await f.d.pending;f.choose();f.state.skipSave=true;f.control('برج <أ>').checked=true;f.control('تفعيل الوصول إلى العقارات المحددة').checked=true;await f.submit();
 assert.match(f.d.status.textContent,/لم تتأكد مطابقة الصلاحيات/);assert.equal(f.control('سبب منح الصلاحيات أو تعديلها أو إيقافها').value,'إسناد التحصيل لهذا العقار');assert.equal(f.assignments.length,0);
});
test('reason, known role and active membership are required before making a save request',async()=>{
 const f=fixture();await f.d.pending;f.choose();f.control('سبب منح الصلاحيات أو تعديلها أو إيقافها').value='x';await f.submit();assert.match(f.d.status.textContent,/سبباً موثقاً/);
 f.control('سبب منح الصلاحيات أو تعديلها أو إيقافها').value='سبب موثق';f.control('الدور الوظيفي').value='general_manager';await f.submit();assert.match(f.d.status.textContent,/اختر الدور الوظيفي/);
 f.control('الدور الوظيفي').value='viewer';f.control('حساب الموظف').value='user-disabled';await f.submit();assert.match(f.d.status.textContent,/اختر حساب موظف نشطاً/);assert.equal(f.calls.filter(call=>call.p_action==='save').length,0);
});
test('non-manager response hides assignment data and controls',async()=>{
 const f=fixture();f.state.manager=false;await f.d.pending;assert.equal(f.form().hidden,true);assert.equal(f.control('حساب الموظف').children.length,0);assert.match(f.d.status.textContent,/متاحة للمدير العام/);
});
test('dialog disposal clears private account, property, history and draft data',async()=>{
 const f=fixture([{user_id:'user-a',operational_role:'viewer',is_active:false,property_ids:['property-a'],revision:1}]);await f.d.pending;f.choose();f.dispose();assert.equal(f.form().hidden,true);assert.equal(f.control('حساب الموظف').children.length,0);assert.equal(f.control('سبب منح الصلاحيات أو تعديلها أو إيقافها').value,'');assert.doesNotMatch(f.d.body.textContent,/موظف <اختبار>|برج <أ>/);
});
test('role choices match saved membership ceilings and never offer a rejected promotion',async()=>{
 const f=fixture();await f.d.pending;f.choose();const options=()=>f.control('الدور الوظيفي').children.map(option=>option.value);
 assert.deepEqual(options(),['','collector','accountant','viewer']);
 f.control('الدور الوظيفي').value='maintenance';await f.submit();assert.match(f.d.status.textContent,/يتجاوز حدود/);assert.equal(f.calls.filter(call=>call.p_action==='save').length,0);
 f.state.confirm=true;f.control('حساب الموظف').value='user-b';f.control('حساب الموظف').onchange();assert.deepEqual(options(),['','collector','maintenance','property_manager','viewer']);
});
test('lost save reply blocks duplicate grants and refresh confirms the persisted operation',async()=>{
 const f=fixture();await f.d.pending;f.choose();f.control('برج <أ>').checked=true;f.control('تفعيل الوصول إلى العقارات المحددة').checked=true;f.state.lostSaveReply=true;await f.submit();
 assert.equal(f.assignments.length,1);assert.match(f.d.status.textContent,/انقطع الرد/);await f.submit();assert.match(f.d.status.textContent,/العملية السابقة/);assert.equal(f.calls.filter(call=>call.p_action==='save').length,1);
 await f.button('تحديث الصلاحيات من قاعدة البيانات').onclick();assert.match(f.d.status.textContent,/دون تكرارها/);assert.equal(f.control('سبب منح الصلاحيات أو تعديلها أو إيقافها').value,'');
});
test('ordinary refresh preserves dirty fields and the original revision to prevent overwriting another manager',async()=>{
 const f=fixture([{user_id:'user-a',operational_role:'accountant',is_active:true,property_ids:['property-a'],revision:3}]);await f.d.pending;f.choose();f.control('برج <أ>').checked=false;f.control('برج ب').checked=true;
 f.assignments[0].revision=4;await f.button('تحديث الصلاحيات من قاعدة البيانات').onclick();assert.equal(f.control('الدور الوظيفي').value,'collector');assert.equal(f.control('برج ب').checked,true);assert.equal(f.control('برج <أ>').checked,false);assert.match(f.control('سبب منح الصلاحيات أو تعديلها أو إيقافها').value,/إسناد التحصيل/);
 await f.submit();assert.equal(f.calls.find(call=>call.p_action==='save').p_data.revision,3);assert.equal(f.assignments[0].revision,4);assert.doesNotMatch(f.d.status.textContent,/تم حفظ/);
});
test('switching accounts can be cancelled and failed refresh retains the selected employee draft',async()=>{
 const f=fixture();await f.d.pending;f.choose();f.state.confirm=false;f.control('حساب الموظف').value='user-b';f.control('حساب الموظف').onchange();assert.equal(f.control('حساب الموظف').value,'user-a');
 f.state.failRead=true;await f.button('تحديث الصلاحيات من قاعدة البيانات').onclick();assert.match(f.d.status.textContent,/تعذر اتصال/);assert.match(f.control('سبب منح الصلاحيات أو تعديلها أو إيقافها').value,/إسناد التحصيل/);
});
test('confirmed interrupted save retains newer permission edits and advances only their expected revision',async()=>{
 const f=fixture();await f.d.pending;f.choose();f.control('برج <أ>').checked=true;f.control('تفعيل الوصول إلى العقارات المحددة').checked=true;f.state.lostSaveReply=true;await f.submit();
 f.control('الدور الوظيفي').value='viewer';f.control('برج <أ>').checked=false;f.control('برج ب').checked=true;f.control('تفعيل الوصول إلى العقارات المحددة').checked=false;f.control('سبب منح الصلاحيات أو تعديلها أو إيقافها').value='  تعديل أحدث بعد انقطاع الرد  ';
 await f.button('تحديث الصلاحيات من قاعدة البيانات').onclick();
 assert.equal(f.control('الدور الوظيفي').value,'viewer');assert.equal(f.control('برج <أ>').checked,false);assert.equal(f.control('برج ب').checked,true);assert.equal(f.control('تفعيل الوصول إلى العقارات المحددة').checked,false);assert.equal(f.control('سبب منح الصلاحيات أو تعديلها أو إيقافها').value,'  تعديل أحدث بعد انقطاع الرد  ');assert.match(f.d.status.textContent,/دون تكرارها/);assert.equal(f.calls.filter(call=>call.p_action==='save').length,1);
 f.state.confirm=false;f.control('حساب الموظف').value='user-b';f.control('حساب الموظف').onchange();assert.equal(f.control('حساب الموظف').value,'user-a');
 f.state.lostSaveReply=false;await f.submit();assert.equal(f.calls.filter(call=>call.p_action==='save')[1].p_data.revision,1);assert.equal(f.assignments[0].revision,2);assert.deepEqual(Array.from(f.assignments[0].property_ids),['property-b']);assert.equal(f.assignments[0].reason,'تعديل أحدث بعد انقطاع الرد');assert.equal(f.assignments[0].is_active,false);
});
test('refresh preserves unavailable selected properties until the manager explicitly removes them',async()=>{
 const f=fixture();await f.d.pending;f.choose();f.control('برج <أ>').checked=true;f.control('برج ب').checked=true;f.control('تفعيل الوصول إلى العقارات المحددة').checked=true;
 f.state.properties=[{id:'property-b',name:'برج ب'}];await f.button('تحديث الصلاحيات من قاعدة البيانات').onclick();
 const missing=f.propertyInputs().find(input=>input.value==='property-a');assert.ok(missing,'missing selected property remains visible');assert.equal(missing.checked,true);assert.match(missing.parent.label,/غير متاح/);assert.doesNotMatch(missing.parent.label,/برج <أ>/);
 await f.submit();assert.equal(f.calls.filter(call=>call.p_action==='save').length,0);assert.match(f.d.status.textContent,/العقارات المتاحة/);
 await f.button('تحديث الصلاحيات من قاعدة البيانات').onclick();assert.equal(f.propertyInputs().find(input=>input.value==='property-a').checked,true);
 f.propertyInputs().find(input=>input.value==='property-a').checked=false;await f.submit();assert.deepEqual(f.calls.find(call=>call.p_action==='save').p_data.property_ids,['property-b']);
});
test('saved assignments never silently drop an unavailable property during another edit',async()=>{
 const f=fixture([{user_id:'user-a',operational_role:'viewer',is_active:true,property_ids:['property-a','property-b'],revision:3}]);f.state.properties=[{id:'property-b',name:'برج ب'}];await f.d.pending;f.control('حساب الموظف').value='user-a';f.control('حساب الموظف').onchange();
 assert.equal(f.propertyInputs().find(input=>input.value==='property-a')?.checked,true);f.control('سبب منح الصلاحيات أو تعديلها أو إيقافها').value='مراجعة الصلاحيات';await f.submit();assert.equal(f.calls.filter(call=>call.p_action==='save').length,0);
});
test('an unconfirmed interrupted operation remains protected against replay after refresh',async()=>{
 const f=fixture();await f.d.pending;f.choose();f.control('برج <أ>').checked=true;f.control('تفعيل الوصول إلى العقارات المحددة').checked=true;f.state.skipSave=true;f.state.lostSaveReply=true;await f.submit();
 await f.button('تحديث الصلاحيات من قاعدة البيانات').onclick();assert.match(f.d.status.textContent,/لم تتأكد/);await f.submit();assert.equal(f.calls.filter(call=>call.p_action==='save').length,1);assert.match(f.d.status.textContent,/العملية السابقة/);
});
test('failed read after acknowledgement retains the pending operation and newer reason through recovery',async()=>{
 const f=fixture();await f.d.pending;f.choose();f.control('برج <أ>').checked=true;f.control('تفعيل الوصول إلى العقارات المحددة').checked=true;f.state.failReadAfterSave=true;f.state.readError={status:400,code:'P0001'};await f.submit();
 f.control('سبب منح الصلاحيات أو تعديلها أو إيقافها').value='سبب أحدث بعد تعذر التحقق';await f.button('تحديث الصلاحيات من قاعدة البيانات').onclick();assert.match(f.d.status.textContent,/تعذر اتصال/);assert.equal(f.control('سبب منح الصلاحيات أو تعديلها أو إيقافها').value,'سبب أحدث بعد تعذر التحقق');await f.submit();assert.equal(f.calls.filter(call=>call.p_action==='save').length,1);
 f.state.failRead=false;f.state.failReadAfterSave=false;await f.button('تحديث الصلاحيات من قاعدة البيانات').onclick();assert.equal(f.control('سبب منح الصلاحيات أو تعديلها أو إيقافها').value,'سبب أحدث بعد تعذر التحقق');await f.submit();assert.equal(f.assignments[0].revision,2);assert.equal(f.assignments[0].reason,'سبب أحدث بعد تعذر التحقق');
});
test('known precommit rejection can be corrected without replaying an uncertain save',async()=>{
 const f=fixture();await f.d.pending;f.choose();f.control('برج <أ>').checked=true;f.control('تفعيل الوصول إلى العقارات المحددة').checked=true;f.state.saveError=Object.assign(Error('سبب غير صالح'),{status:400,code:'P0001'});await f.submit();assert.equal(f.assignments.length,0);
 f.control('سبب منح الصلاحيات أو تعديلها أو إيقافها').value='سبب مصحح موثق';f.state.saveError=null;await f.submit();assert.equal(f.calls.filter(call=>call.p_action==='save').length,2);assert.equal(f.assignments[0].revision,1);assert.equal(f.assignments[0].reason,'سبب مصحح موثق');
});
test('returning property remains selected while changed membership ceilings still block old roles',async()=>{
 const f=fixture();await f.d.pending;f.choose();f.control('برج <أ>').checked=true;f.control('تفعيل الوصول إلى العقارات المحددة').checked=true;f.state.properties=[{id:'property-b',name:'برج ب'}];await f.button('تحديث الصلاحيات من قاعدة البيانات').onclick();
 f.state.properties.push({id:'property-a',name:'برج أ محدث'});f.members[0].role='viewer';await f.button('تحديث الصلاحيات من قاعدة البيانات').onclick();assert.equal(f.control('برج أ محدث').checked,true);assert.equal(f.control('الدور الوظيفي').value,'');assert.deepEqual(f.control('الدور الوظيفي').children.map(option=>option.value),['','viewer']);assert.equal(f.control('سبب منح الصلاحيات أو تعديلها أو إيقافها').value,'إسناد التحصيل لهذا العقار');
 f.control('الدور الوظيفي').value='collector';await f.submit();assert.match(f.d.status.textContent,/يتجاوز حدود/);assert.equal(f.calls.filter(call=>call.p_action==='save').length,0);
});
