import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/v267/components/staff-account-preparations.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
const clone=value=>JSON.parse(JSON.stringify(value));
const descendants=element=>[element,...element.children.flatMap(descendants)];
const record=(extra={})=>({id:'79400000-0000-4000-8000-000000000020',request_id:'79400000-0000-4000-8000-000000000010',email:'saved@example.invalid',display_name:'موظف محفوظ',role:'accountant',status:'prepared',revision:3,can_cancel:true,...extra});
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
function fixture(initial=[]){
 class Element{
  constructor(tag,value=''){this.tag=tag;this.children=[];this._text=value;this.value='';this.disabled=false;this.hidden=false;this.attributes={};}
  append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
  replaceChildren(...children){this.children=[];this._text='';this.append(...children);}
  setAttribute(key,value){this.attributes[key]=value;}
  querySelectorAll(selector){assert.equal(selector,'button');return descendants(this).filter(child=>child!==this&&child.tag==='button');}
  get textContent(){return String(this._text)+this.children.map(child=>child.textContent).join('');}
  set textContent(value){this._text=value;this.children=[];}
 }
 const node=(tag,text)=>new Element(tag,text),field=(label,control)=>{const el=node('label',label);el.append(control);return el;};
 const calls=[],items=clone(initial),operations=new Map(),disposeCallbacks=[];
 const state={lostReply:false,reject:null,listReject:null,transform:null,gate:null,sessionValid:true};let sequence=0;
 const session={bound:{workspace:'workspace-fixture',user:'manager-fixture',role:'general_manager'},check(){if(!state.sessionValid)throw Error('SESSION_CHANGED');},request:value=>value,
  client:{get auth(){throw Error('Auth signup or admin must never be used by staff preparation.');},async rpc(name,args){
   assert.equal(name,'aqari_staff_account_preparations');assert.equal(args.p_workspace_id,'workspace-fixture');calls.push(clone(args));
   const action=args.p_action,data=clone(args.p_data);let response;
   if(state.reject)throw state.reject;if(action==='list'&&state.listReject)throw state.listReject;
   if(action==='list')response={items:clone(items)};
   else{
    assert.ok(['prepare','cancel'].includes(action));
    let saved=operations.get(data.request_id);
    if(!saved){
     if(action==='prepare')saved={...data,id:'79400000-0000-4000-8000-'+String(100+operations.size).padStart(12,'0'),status:'prepared',revision:1,can_cancel:true};
     else{const existing=items.find(row=>row.id===data.id);assert.ok(existing);assert.equal(existing.status,'prepared');assert.equal(existing.revision,data.revision);saved={...existing,status:'cancelled',revision:existing.revision+1,request_id:data.request_id,can_cancel:false};}
     operations.set(data.request_id,clone(saved));const index=items.findIndex(row=>row.id===saved.id);if(index<0)items.push(clone(saved));else items[index]=clone(saved);
    }
    response={record:clone(saved)};
    if(state.lostReply){state.lostReply=false;throw Error('Lost response after commit');}
   }
   response={workspace_id:session.bound.workspace,user_id:session.bound.user,...response};
   if(state.transform)response=state.transform(response,action);
   if(state.gate)await state.gate.promise;
   return response;
  }}};
 const d={session,status:node('p'),runErrors:[],onDispose:fn=>disposeCallbacks.push(fn),run(task){d.pending=Promise.resolve().then(task).catch(error=>{d.runErrors.push(error);d.status.textContent=error.message;});return d.pending;}};
 const context={node,field,t:value=>value,crypto:{randomUUID:()=>`79400000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`}};
 vm.createContext(context);vm.runInContext(source+'\nglobalThis.createHelper=createStaffAccountPreparations;',context);
 const helper=context.createHelper(d);
 const find=name=>descendants(helper.el).find(el=>el.name===name);
 const button=text=>descendants(helper.el).find(el=>el.tag==='button'&&el.textContent===text);
 const form=()=>descendants(helper.el).find(el=>el.tag==='form');
 const fill=(extra={})=>{for(const [key,value]of Object.entries({email:'  NEW.Employee@Example.Invalid  ',name:'  موظف مستقل  ',role:'accountant',reason:'  تجهيز حساب الموظف الجديد  ',...extra}))find('staff_registration_'+key).value=value;};
 const submit=async()=>{await form().onsubmit({preventDefault(){}});};
 const mutations=()=>calls.filter(call=>call.p_action!=='list');
 return {helper,d,state,calls,items,operations,find,button,form,fill,submit,mutations,dispose(){for(const fn of disposeCallbacks)fn();}};
}

test('mount and repeated load only read; no account or default permission is created',async()=>{
 const f=fixture();assert.equal(f.calls.length,0);assert.equal(f.helper.dirty,false);assert.equal(f.find('staff_registration_role').value,'');
 assert.deepEqual(f.find('staff_registration_role').children.map(option=>option.value),['','viewer','accountant','property_manager']);
 await f.helper.load();await f.helper.load();assert.deepEqual(f.calls.map(call=>call.p_action),['list']);assert.equal(f.mutations().length,0);assert.match(f.helper.el.textContent,/لا يُرسل هذا الإجراء دعوة/);
 f.fill();assert.equal(f.helper.dirty,true);assert.equal(f.mutations().length,0);
});

test('explicit prepare normalizes email and name and verifies exact prepared data',async()=>{
 const f=fixture();await f.helper.load();f.fill();await f.submit();
 assert.equal(f.mutations().length,1);const sent=f.mutations()[0].p_data;
 assert.deepEqual(sent,{request_id:'79400000-0000-4000-8000-000000000001',email:'new.employee@example.invalid',display_name:'موظف مستقل',role:'accountant',reason:'تجهيز حساب الموظف الجديد'});
 assert.equal(f.helper.uncertain,false);assert.equal(f.helper.dirty,false);assert.equal(f.find('staff_registration_role').value,'');assert.match(f.helper.el.textContent,/حُفظ تصريح التسجيل/);assert.match(f.helper.el.textContent,/new\.employee@example\.invalid/);
});

test('blank, unknown and general manager roles are rejected without a write',async()=>{
 for(const role of ['', 'general_manager','owner','collector','maintenance','__proto__']){const f=fixture();f.fill({role});await f.submit();assert.equal(f.mutations().length,0,role);assert.match(f.d.status.textContent,/أكمل بريد الموظف/);}
});

test('invalid email, empty name and invalid reason are rejected before a request',async()=>{
 for(const patch of [{email:'not an email'},{name:'   '},{name:'x'.repeat(121)},{reason:'x'},{reason:'x'.repeat(501)}]){const f=fixture();f.fill(patch);await f.submit();assert.equal(f.mutations().length,0);}
});

test('lost prepare response locks mutable fields and retries exactly the same request and payload',async()=>{
 const f=fixture();f.fill();f.state.lostReply=true;await f.submit();const original=clone(f.mutations()[0]);
 assert.equal(f.helper.uncertain,true);for(const key of ['email','name','role','reason'])assert.equal(f.find('staff_registration_'+key).disabled,true);
 await f.submit();assert.equal(f.mutations().length,1);assert.equal(f.button('التحقق بإعادة المحاولة نفسها').hidden,false);
 // Even a synthetic mutation of disabled controls must not rewrite the pending request.
 f.fill({email:'changed@example.invalid',name:'اسم مختلف',role:'viewer',reason:'سبب أحدث'});
 await f.button('تحديث تصاريح التسجيل').onclick();assert.equal(f.helper.uncertain,true);assert.equal(f.mutations().length,1);
 await f.button('التحقق بإعادة المحاولة نفسها').onclick();assert.deepEqual(f.mutations()[1],original);assert.equal(f.operations.size,1);assert.equal(f.items.length,1);assert.equal(f.helper.uncertain,false);
});

test('known transaction rejection permits correction with a new operation',async()=>{
 const f=fixture();f.fill();f.state.reject=Object.assign(Error('STAFF_EMAIL_UNAVAILABLE'),{status:409,code:'P0001'});await f.submit();
 assert.equal(f.helper.uncertain,false);assert.equal(f.find('staff_registration_email').disabled,false);assert.match(f.d.status.textContent,/هذا البريد مرتبط/);
 f.state.reject=null;f.fill({email:'other@example.invalid'});await f.submit();assert.equal(f.mutations().length,2);assert.notEqual(f.mutations()[0].p_data.request_id,f.mutations()[1].p_data.request_id);assert.equal(f.items[0].email,'other@example.invalid');
});

test('an exact email collision without HTTP status unlocks the preserved form for a new request',async()=>{
 const f=fixture();f.fill();f.state.reject=Object.assign(Error('STAFF_EMAIL_UNAVAILABLE'),{code:'23505'});await f.submit();
 assert.equal(f.helper.uncertain,false);assert.equal(f.find('staff_registration_email').disabled,false);assert.equal(f.find('staff_registration_email').value,'  NEW.Employee@Example.Invalid  ');assert.equal(f.helper.dirty,true);assert.match(f.d.status.textContent,/هذا البريد مرتبط/);assert.equal(f.items.length,0);
 const original=clone(f.mutations()[0]);f.state.reject=null;f.fill({email:'independent@example.invalid'});await f.submit();
 assert.equal(f.mutations().length,2);assert.notEqual(f.mutations()[1].p_data.request_id,original.p_data.request_id);assert.equal(f.mutations()[1].p_data.email,'independent@example.invalid');assert.equal(f.items.length,1);assert.equal(f.helper.uncertain,false);
});

test('an unknown 23505 without HTTP status stays uncertain and retains the same retry operation',async()=>{
 const f=fixture();f.fill();f.state.reject=Object.assign(Error('Unknown unique violation'),{code:'23505'});await f.submit();const original=clone(f.mutations()[0]);
 assert.equal(f.helper.uncertain,true);assert.equal(f.find('staff_registration_email').disabled,true);assert.equal(f.find('staff_registration_email').value,'  NEW.Employee@Example.Invalid  ');assert.equal(f.items.length,0);
 await f.submit();assert.equal(f.mutations().length,1);f.state.reject=null;await f.button('التحقق بإعادة المحاولة نفسها').onclick();assert.deepEqual(f.mutations()[1],original);assert.equal(f.helper.uncertain,false);assert.equal(f.items.length,1);
});

for(const code of ['MFA_REQUIRED','MFA_RECENT_REAUTH_REQUIRED'])test(`${code} preserves the form and handles 42501 locally without closing the dialog`,async()=>{
 const f=fixture();f.fill();f.state.reject=Object.assign(Error(code),{status:403,code:'42501'});await f.submit();
 assert.equal(f.d.runErrors.length,0,'the shared dialog must not receive the authorization error');assert.equal(f.helper.uncertain,false);assert.equal(f.helper.dirty,true);assert.equal(f.find('staff_registration_email').value,'  NEW.Employee@Example.Invalid  ');assert.equal(f.find('staff_registration_name').value,'  موظف مستقل  ');assert.equal(f.find('staff_registration_email').disabled,false);assert.equal(f.helper.el.children.length>0,true);assert.match(f.helper.el.textContent,/الثنائي/);assert.doesNotMatch(f.helper.el.textContent,/حُفظ تصريح التسجيل/);
 f.state.reject=null;await f.submit();assert.equal(f.items.length,1);assert.equal(f.helper.uncertain,false);
});

test('failed readback after acknowledged write retains the exact operation even for a 400 response',async()=>{
 const f=fixture();await f.helper.load();f.fill();f.state.listReject=Object.assign(Error('Readback rejected'),{status:400,code:'P0001'});await f.submit();
 const original=clone(f.mutations()[0]);assert.equal(f.helper.uncertain,true);assert.equal(f.items.length,1);assert.doesNotMatch(f.helper.el.textContent,/حُفظ تصريح التسجيل/);
 await f.submit();assert.equal(f.mutations().length,1);f.state.listReject=null;await f.button('التحقق بإعادة المحاولة نفسها').onclick();
 assert.deepEqual(f.mutations()[1],original);assert.equal(f.operations.size,1);assert.equal(f.helper.uncertain,false);
});

test('prepare replay reads current registration status instead of claiming an old prepared state',async()=>{
 const f=fixture();f.fill();f.state.lostReply=true;await f.submit();Object.assign(f.items[0],{status:'registered',revision:2,can_cancel:false});
 await f.button('التحقق بإعادة المحاولة نفسها').onclick();assert.equal(f.operations.size,1);assert.equal(f.helper.uncertain,false);assert.match(f.helper.el.textContent,/سجّل الموظف حسابه/);assert.doesNotMatch(f.helper.el.textContent,/حُفظ تصريح التسجيل/);
});

for(const key of ['workspace_id','user_id'])test(`forged ${key} envelope cannot report a successful preparation`,async()=>{
 const f=fixture();f.fill();f.state.transform=value=>({...value,[key]:'another-scope'});await f.submit();
 assert.equal(f.helper.uncertain,true);assert.doesNotMatch(f.helper.el.textContent,/حُفظ تصريح التسجيل/);assert.match(f.d.status.textContent,/تعذر التحقق/);
 f.state.transform=null;await f.button('التحقق بإعادة المحاولة نفسها').onclick();assert.equal(f.operations.size,1);assert.equal(f.helper.uncertain,false);
});

test('mismatched record acknowledgement never reports preparation success',async()=>{
 for(const patch of [{request_id:'foreign-request'},{email:'foreign@example.invalid'},{display_name:'شخص آخر'},{role:'viewer'},{revision:0},{revision:2},{status:'unknown'},{status:'registered'},{status:'cancelled'}]){
  const f=fixture();f.fill();f.state.transform=value=>({...value,record:{...value.record,...patch}});await f.submit();assert.equal(f.helper.uncertain,true);assert.doesNotMatch(f.helper.el.textContent,/حُفظ تصريح التسجيل/);assert.match(f.d.status.textContent,/لم تتأكد مطابقة/);
 }
});

test('list rejects a foreign envelope and malformed rows before showing private records',async()=>{
 const foreign=fixture([record()]);foreign.state.transform=value=>({...value,workspace_id:'foreign-workspace'});await assert.rejects(foreign.helper.load(),/تعذر التحقق/);assert.doesNotMatch(foreign.helper.el.textContent,/saved@example/);
 const invalid=fixture([record({role:'general_manager'})]);await assert.rejects(invalid.helper.load(),/قائمة تصاريح/);assert.doesNotMatch(invalid.helper.el.textContent,/saved@example/);
});

test('only a prepared registration can be cancelled with explicit reason and expected revision',async()=>{
 const f=fixture([record(),record({id:'registered-id',status:'registered',can_cancel:false,email:'registered@example.invalid'}),record({id:'cancelled-id',status:'cancelled',can_cancel:false,email:'cancelled@example.invalid'})]);await f.helper.load();
 assert.equal(descendants(f.helper.el).filter(el=>el.tag==='button'&&el.textContent==='إلغاء تصريح التسجيل').length,1);
 await f.button('إلغاء تصريح التسجيل').onclick();assert.equal(f.mutations().length,0);assert.match(f.d.status.textContent,/سببًا واضحًا/);
 f.find('staff_cancel_reason').value='  إلغاء التصريح بطلب المدير  ';await f.button('إلغاء تصريح التسجيل').onclick();
 assert.deepEqual(f.mutations()[0].p_data,{id:record().id,revision:3,request_id:'79400000-0000-4000-8000-000000000001',reason:'إلغاء التصريح بطلب المدير'});assert.equal(f.mutations()[0].p_action,'cancel');assert.equal(f.items[0].status,'cancelled');assert.equal(f.items[0].revision,4);assert.equal(f.helper.uncertain,false);assert.equal(f.button('إلغاء تصريح التسجيل'),undefined);
});

test('cancel reason longer than 500 characters is rejected before writing',async()=>{
 const f=fixture([record()]);await f.helper.load();f.find('staff_cancel_reason').value='x'.repeat(501);await f.button('إلغاء تصريح التسجيل').onclick();assert.equal(f.mutations().length,0);
});

test('a prepared record without server cancellation permission has no cancel action',async()=>{
 const f=fixture([record({can_cancel:false})]);await f.helper.load();assert.equal(f.button('إلغاء تصريح التسجيل'),undefined);assert.equal(f.mutations().length,0);
});

test('lost cancel acknowledgement retains the operation and checks its exact final revision',async()=>{
 const f=fixture([record()]);await f.helper.load();f.find('staff_cancel_reason').value='إلغاء تصريح الاختبار';f.state.lostReply=true;await f.button('إلغاء تصريح التسجيل').onclick();const original=clone(f.mutations()[0]);assert.equal(f.helper.uncertain,true);
 f.state.transform=value=>value.record?{...value,record:{...value.record,revision:9}}:value;await f.button('التحقق بإعادة المحاولة نفسها').onclick();assert.equal(f.helper.uncertain,true);assert.doesNotMatch(f.helper.el.textContent,/أُلغي تصريح التسجيل قبل/);
 f.state.transform=null;await f.button('التحقق بإعادة المحاولة نفسها').onclick();assert.deepEqual(f.mutations()[1],original);assert.deepEqual(f.mutations()[2],original);assert.equal(f.operations.size,1);assert.equal(f.helper.uncertain,false);
});

test('contradictory cancellation readback cannot report cancellation success',async()=>{
 const f=fixture([record()]);await f.helper.load();f.find('staff_cancel_reason').value='إلغاء تصريح الاختبار';f.state.transform=(value,action)=>action==='list'?{...value,items:value.items.map(row=>({...row,status:'registered'}))}:value;await f.button('إلغاء تصريح التسجيل').onclick();assert.equal(f.helper.uncertain,true);assert.doesNotMatch(f.helper.el.textContent,/أُلغي تصريح التسجيل قبل/);assert.match(f.d.status.textContent,/لم تتأكد إعادة قراءة/);
});

test('disposal clears private controls, records and pending state',async()=>{
 const f=fixture([record()]);await f.helper.load();f.fill();const email=f.find('staff_registration_email'),name=f.find('staff_registration_name'),reason=f.find('staff_registration_reason');
 f.dispose();assert.equal(f.helper.el.textContent,'');assert.equal(f.helper.uncertain,false);assert.equal(f.helper.dirty,false);assert.equal(email.value,'');assert.equal(name.value,'');assert.equal(reason.value,'');assert.equal(email.disabled,true);
});

test('late read and write replies cannot refill a disposed page',async()=>{
 for(const action of ['list','prepare']){
  const f=fixture([record()]);f.state.gate=deferred();let pending;
  if(action==='list')pending=f.helper.load().catch(()=>{});else{f.fill();pending=f.submit();}
  await Promise.resolve();await Promise.resolve();f.dispose();f.state.gate.resolve();await pending;
  assert.equal(f.helper.el.textContent,'');assert.equal(f.helper.uncertain,false);
 }
});

test('loading a disposed helper issues no new request',async()=>{
 const f=fixture();f.dispose();await f.helper.load().catch(()=>{});assert.equal(f.calls.length,0);
});

test('session change while the server responds cannot report or reveal the returned record',async()=>{
 const f=fixture();f.fill();f.state.gate=deferred();const pending=f.submit();await Promise.resolve();await Promise.resolve();f.state.sessionValid=false;f.state.gate.resolve();await pending;assert.doesNotMatch(f.helper.el.textContent,/حُفظ تصريح التسجيل|new\.employee@example/);assert.match(f.d.status.textContent,/SESSION_CHANGED/);
});
