const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/v267/pages/employees.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
const permissions={read:'عرض / Read',add:'إضافة / Add',edit:'تعديل / Edit',approve_admin:'اعتماد إداري / Administrative approval',approve_chairman:'اعتماد رئيس مجلس الإدارة / Chairman approval'};
const flags={read:true,add:false,edit:false,approve_admin:false,approve_chairman:false};
function fixture(initial=[]){
 const calls=[],grants=structuredClone(initial),state={confirm:true,skipSave:false,lostReply:false,failAccess:false},members=[{user_id:'staff-a',name:'موظف أ',role:'accountant'},{user_id:'staff-b',name:'موظف ب',role:'accountant'}];
 const descendants=el=>[el,...el.children.flatMap(descendants)];
 class Element{
  constructor(tag,text=''){this.tag=tag;this.children=[];this._text=text;this._value=undefined;this.style={};this.checked=false;this.disabled=false;}
  append(...nodes){for(const child of nodes){child.parent=this;this.children.push(child);}}
  prepend(...nodes){for(const child of [...nodes].reverse()){child.parent=this;this.children.unshift(child);}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}set textContent(value){this._text=value;this.children=[];}
  get value(){return this._value??(this.tag==='select'?this.children[0]?.value||'':'');}set value(value){this._value=value;}
  querySelectorAll(selector){return descendants(this).slice(1).filter(x=>selector==='*'||x.tag==='input'&&(!selector.includes(':checked')||x.checked));}
 }
 const node=(tag,text)=>new Element(tag,text),field=(label,control)=>{const el=node('div');el.label=label;el.append(control);return el;};
 const access=()=>({members:structuredClone(members),grants:structuredClone(grants),audit:[]});
 const rpc=async(name,{p_action:action,p_data:data})=>{assert.equal(name,'aqari_hr');calls.push({action,data:structuredClone(data)});if(action==='list')return {employees:[],manager:true,properties:[{id:'property-a',name:'عقار متاح أ'}]};if(action==='access'){if(state.failAccess)throw Object.assign(Error('تعذر تحميل الصلاحيات'),state.readError||{});const result=access();if(state.corruptReadback&&result.grants[0])result.grants[0].permissions.edit=!result.grants[0].permissions.edit;return result;}assert.equal(action,'grant');const saved=grants.find(g=>g.user_id===data.user_id);if(data.revision!==(saved?.revision||0))throw Object.assign(Error('REVISION_CONFLICT'),{status:409,code:'40001'});if(!state.skipSave){const next={...structuredClone(data),revision:data.revision+1};if(saved)Object.assign(saved,next);else grants.push(next);}if(state.failReadAfterSave)state.failAccess=true;if(state.lostReply)throw Error('انقطع الرد بعد الحفظ');return access();};
 const d={body:node('div'),status:node('p'),closed:false,session:{bound:{workspace:'workspace-a'},client:{rpc},request:x=>x},onDispose(){},setBeforeClose(fn){d.beforeClose=fn;},run(fn){d.pending=Promise.resolve().then(fn).catch(error=>{d.status.textContent=error.message;});return d.pending;}};
 vm.runInNewContext(source+'\nopenEmployees();',{createDialog:()=>d,node,field,translateStatic:x=>x,visibleMessage:(text,values)=>text,createPrivateUrls:()=>({clear(){}}),PERMISSIONS:permissions,PROFILE_FIELDS:[],window:{confirm:()=>state.confirm},crypto:{randomUUID:()=> 'unused-fixture-id'}});
 const all=()=>descendants(d.body),control=label=>all().find(x=>x.label===label)?.children[0],button=label=>all().find(x=>x.tag==='button'&&x.textContent===label);
 const choose=id=>{control('الحساب / Account').value=id;control('الحساب / Account').onchange();};
 return {d,calls,grants,state,control,button,all,choose,async open(){await d.pending;await button('صلاحيات حسابات الموظفين / Account permissions').onclick();},async submit(){all().find(x=>x.tag==='form').onsubmit({preventDefault(){}});await d.pending;}};
}
const grant=(overrides={})=>({user_id:'staff-a',property_ids:['property-a'],permissions:{...flags},revision:2,...overrides});
test('HR permission editing retains every saved property and requires explicit removal of unavailable ones',async()=>{
 const f=fixture([grant({property_ids:['property-a','missing-property']})]);await f.open();const missing=f.all().find(x=>x.tag==='input'&&x.value==='missing-property');assert.ok(missing,'saved unavailable scope must remain visible');assert.equal(missing.checked,true);
 f.control(permissions.edit).checked=true;await f.submit();assert.equal(f.calls.filter(x=>x.action==='grant').length,0);assert.match(f.d.status.textContent,/غير متاح/);
 missing.checked=false;missing.onchange();await f.submit();assert.equal(f.calls.filter(x=>x.action==='grant').length,1);assert.deepEqual(f.grants[0].property_ids,['property-a']);assert.equal(f.grants[0].permissions.edit,true);
});
test('HR grant acknowledgement without matching persisted flags or revision never reports success',async()=>{
 const f=fixture([grant()]);await f.open();f.control(permissions.edit).checked=true;f.state.skipSave=true;await f.submit();assert.doesNotMatch(f.d.status.textContent,/حُفظت الصلاحيات/);assert.equal(f.control(permissions.edit).checked,true);assert.match(f.d.status.textContent,/لم تتأكد/);
});
test('HR successful readback keeps the explicitly selected employee instead of switching to the first account',async()=>{
 const f=fixture([grant(),grant({user_id:'staff-b',revision:4})]);await f.open();f.choose('staff-b');f.control(permissions.edit).checked=true;await f.submit();assert.equal(f.control('الحساب / Account').value,'staff-b');assert.equal(f.control(permissions.edit).checked,true);assert.equal(f.grants[1].revision,5);assert.equal(f.grants[0].revision,2);
});

test('lost HR grant acknowledgement is recovered by reading the saved result without a duplicate grant',async()=>{
 const f=fixture([grant()]);await f.open();f.control(permissions.edit).checked=true;f.state.lostReply=true;await f.submit();assert.equal(f.grants[0].revision,3);assert.equal(f.all().find(x=>x.tag==='form').inert,true);
 await f.submit();assert.equal(f.calls.filter(x=>x.action==='grant').length,1);await f.button('التحقق من حفظ الصلاحيات السابق').onclick();assert.match(f.d.status.textContent,/تأكدت مطابقة/);assert.equal(f.calls.filter(x=>x.action==='grant').length,1);assert.equal(f.all().find(x=>x.tag==='form').inert,false);
});
test('a failed HR readback retains the grant for verification even when the read returns a validation-shaped error',async()=>{
 const f=fixture([grant()]);await f.open();f.control(permissions.edit).checked=true;f.state.failReadAfterSave=true;f.state.readError={status:400,code:'P0001'};await f.submit();assert.equal(f.grants[0].revision,3);assert.doesNotMatch(f.d.status.textContent,/حُفظت الصلاحيات/);assert.equal(f.control(permissions.edit).checked,true);
 await f.submit();assert.equal(f.calls.filter(x=>x.action==='grant').length,1);f.state.failAccess=false;await f.button('التحقق من حفظ الصلاحيات السابق').onclick();assert.match(f.d.status.textContent,/تأكدت مطابقة/);assert.equal(f.calls.filter(x=>x.action==='grant').length,1);
});
test('changed HR readback flags are rejected even when the saved revision and properties match',async()=>{
 const f=fixture([grant()]);await f.open();f.control(permissions.edit).checked=true;f.state.corruptReadback=true;await f.submit();assert.match(f.d.status.textContent,/لم تتأكد/);assert.equal(f.control(permissions.edit).checked,true);f.state.corruptReadback=false;await f.button('التحقق من حفظ الصلاحيات السابق').onclick();assert.match(f.d.status.textContent,/تأكدت مطابقة/);
});
test('failure to open HR permissions leaves the existing directory usable and creates no grant',async()=>{
 const f=fixture([grant()]);await f.d.pending;f.state.failAccess=true;await f.button('صلاحيات حسابات الموظفين / Account permissions').onclick();assert.ok(f.button('صلاحيات حسابات الموظفين / Account permissions'));assert.equal(f.all().some(x=>x.tag==='form'),false);assert.equal(f.calls.filter(x=>x.action==='grant').length,0);assert.match(f.d.status.textContent,/تعذر تحميل/);
});
test('switching the HR account can preserve its unsaved flags and property choices',async()=>{
 const f=fixture([grant(),grant({user_id:'staff-b',property_ids:['missing-b']})]);await f.open();f.control(permissions.edit).checked=true;f.state.confirm=false;f.choose('staff-b');assert.equal(f.control('الحساب / Account').value,'staff-a');assert.equal(f.control(permissions.edit).checked,true);
 f.state.confirm=true;f.choose('staff-b');assert.equal(f.control('الحساب / Account').value,'staff-b');assert.equal(f.control(permissions.edit).checked,false);assert.equal(f.all().find(x=>x.tag==='input'&&x.value==='missing-b').checked,true);assert.equal(f.control('عقار متاح أ').checked,false);assert.equal(f.calls.filter(x=>x.action==='grant').length,0);
});
test('HR permissions require an explicit property before a grant and uncertain close never writes',async()=>{
 const f=fixture();await f.open();await f.submit();assert.equal(f.calls.filter(x=>x.action==='grant').length,0);assert.match(f.d.status.textContent,/اختر عقار/);
 f.control('عقار متاح أ').checked=true;f.control(permissions.read).checked=true;f.state.lostReply=true;await f.submit();f.state.confirm=false;assert.equal(f.d.beforeClose(),false);f.state.confirm=true;assert.equal(f.d.beforeClose(),true);assert.equal(f.calls.filter(x=>x.action==='grant').length,1);
});
