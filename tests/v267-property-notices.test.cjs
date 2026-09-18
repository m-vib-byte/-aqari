const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let localeBindings;
test.before(async()=>{const locale=await import('../src/v267/components/locale.js');localeBindings={translateStatic:locale.t,visibleText:locale.t,visibleMessage:locale.message,dateLocale:locale.dateLocale};});
const source=fs.readFileSync('src/v267/pages/property-notices.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
function fixture(initial=[]){
 const all=[],records=structuredClone(initial),calls=[],versions=[];let sequence=0;
 class Element{
  constructor(tag,value){this.tag=tag;this.children=[];this.style={};this._value='';this._text=value??'';this.hidden=false;this.disabled=false;all.push(this);}
  append(...nodes){for(const child of nodes){child.parent=this;this.children.push(child);}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  get textContent(){return String(this._text)+this.children.map(c=>c.textContent).join('');}
  set textContent(value){this._text=value;this.children=[];}
  get value(){return this._value||(this.tag==='select'?this.children[0]?.value||'':'');}
  set value(value){this._value=value;}
  reset(){const walk=element=>{if(['input','select','textarea'].includes(element.tag))element._value='';for(const child of element.children)walk(child);};walk(this);}
  focus(){}
 }
 const node=(tag,value)=>new Element(tag,value),field=(label,control)=>{const group=node('div');group.label=label;group.append(control);return group;};
 const state={manager:true,skipSave:false};
 const rpc=async(name,args)=>{
  assert.equal(name,'aqari_property_notices');assert.equal(args.p_workspace_id,'workspace-fixture');calls.push(structuredClone(args));const values=args.p_data;
  if(args.p_action==='list')return {properties:[{id:'property-fixture',name:'عقار <محفوظ>'}],notices:structuredClone(records),manager:state.manager};
  if(args.p_action==='history')return {versions:structuredClone(versions),acknowledgements:[{notice_revision:2,user_name:'مستأجر <محفوظ>',acknowledged_at:'2026-09-09T12:00:00Z'}]};
  let row=records.find(record=>record.id===values.id);
  assert.equal(values.revision,row?.revision||0,'server expected-revision check');
  if(args.p_action==='save'){
   if(state.skipSave)return {...values,revision:1,status:'draft'};
   if(!row){row={...values,status:'draft',revision:1};records.unshift(row);}else Object.assign(row,values,{revision:row.revision+1});
  }else if(args.p_action==='publish'){assert.equal(row.status,'draft');Object.assign(row,{status:'published',revision:row.revision+1,published_at:'2026-09-09T11:00:00Z'});}
  else if(args.p_action==='archive'){assert.ok(values.reason.length>=3);Object.assign(row,{status:'archived',revision:row.revision+1});}
  versions.push({revision:row.revision,action:args.p_action,actor_name:'مدير الاختبار',recorded_at:'2026-09-09T11:00:00Z',after_snapshot:structuredClone(row),reason:values.reason||''});return structuredClone(row);
 };
 const d={body:node('div'),status:node('p'),session:{bound:{workspace:'workspace-fixture'},client:{rpc},request:query=>query},onDispose(){},run(work){d.pending=Promise.resolve().then(work).catch(error=>{d.status.textContent=error.message;});return d.pending;}};
 const ctx={...localeBindings,node,field,createDialog:()=>d,crypto:{randomUUID:()=> 'notice-new-'+(++sequence)},console};vm.createContext(ctx);vm.runInContext(source+'\nopenPropertyNotices();',ctx);
 const descendants=element=>[element,...element.children.flatMap(descendants)];
 const button=label=>descendants(d.body).find(element=>element.tag==='button'&&element.textContent===label);
 const control=label=>descendants(d.body).find(element=>element.label===label)?.children[0];
 const editor=()=>descendants(d.body).find(element=>element.tag==='form');
 return {d,records,calls,state,button,control,editor,descendants};
}
const notice=()=>({id:'notice-existing',property_id:'property-fixture',kind:'circular',title:'تعميم <script>',body:'نص محفوظ <img>',status:'draft',revision:1,published_at:null,expires_at:null,ack_count:0});
test('manager draft save reads back exact content and converts Kuwait expiry correctly',async()=>{
 const f=fixture();await f.d.pending;f.button('إعداد مسودة جديدة').onclick();f.control('العنوان').value='عنوان <script>';f.control('النص').value='نص <img src=x>';f.control('تاريخ انتهاء العرض — نهاية اليوم بتوقيت الكويت، اختياري').value='2026-10-01';
 f.editor().onsubmit({preventDefault(){}});await f.d.pending;const save=f.calls.find(call=>call.p_action==='save');
 assert.equal(save.p_data.revision,0);assert.equal(save.p_data.expires_at,'2026-10-01T20:59:59.000Z');assert.equal(save.p_data.title,'عنوان <script>');assert.equal(f.records[0].status,'draft');assert.equal(f.calls.at(-1).p_action,'list');assert.equal(f.editor().hidden,true);assert.match(f.d.status.textContent,/تم حفظ المسودة/);
});
test('unverified write is not reported saved and retains the draft for reconciliation',async()=>{
 const f=fixture();await f.d.pending;f.state.skipSave=true;f.button('إعداد مسودة جديدة').onclick();f.control('العنوان').value='عنوان غير متحقق';f.control('النص').value='نص لم يثبت';f.editor().onsubmit({preventDefault(){}});await f.d.pending;
 assert.equal(f.editor().hidden,false);assert.equal(f.control('العنوان').value,'عنوان غير متحقق');assert.match(f.d.status.textContent,/لم تتأكد مطابقة المسودة/);assert.equal(f.records.length,0);
});
test('published original loses edit action and can only seed a distinct new draft',async()=>{
 const f=fixture([notice()]);await f.d.pending;await f.button('نشر للمستأجرين').onclick();assert.equal(f.records[0].revision,2);assert.equal(f.records[0].status,'published');assert.equal(f.button('تعديل المسودة'),undefined);
 f.button('إنشاء مسودة جديدة من هذه النسخة').onclick();f.control('العنوان').value='نسخة جديدة';f.editor().onsubmit({preventDefault(){}});await f.d.pending;
 const save=f.calls.find(call=>call.p_action==='save');assert.notEqual(save.p_data.id,'notice-existing');assert.equal(save.p_data.revision,0);assert.equal(f.records.find(row=>row.id==='notice-existing').title,'تعميم <script>');assert.equal(f.records.find(row=>row.id==='notice-existing').status,'published');
});
test('archive requires a documented reason, persists status and exposes literal historical records',async()=>{
 const f=fixture([notice()]);await f.d.pending;const archive=f.button('أرشفة وإيقاف العرض'),form=archive.parent;f.control('سبب الأرشفة الموثق').value='x';form.onsubmit({preventDefault(){}});await f.d.pending;assert.equal(f.calls.filter(call=>call.p_action==='archive').length,0);
 f.control('سبب الأرشفة الموثق').value='انتهاء الحاجة إلى الإعلان';form.onsubmit({preventDefault(){}});await f.d.pending;assert.equal(f.records[0].status,'archived');assert.equal(f.calls.find(call=>call.p_action==='archive').p_data.reason,'انتهاء الحاجة إلى الإعلان');
 await f.button('سجل النسخ وإقرارات الاطلاع').onclick();assert.match(f.d.body.textContent,/مستأجر <محفوظ>/);assert.match(f.d.body.textContent,/تعميم <script>/);assert.match(f.d.body.textContent,/انتهاء الحاجة إلى الإعلان/);
});
