const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
function fixture(){
 class Element{constructor(tag,value=''){this.tag=tag;this._text=value;this.children=[];this.value='';this.disabled=false;this.checked=false;this.hidden=false;this.isConnected=true;}append(...x){this.children.push(...x);}replaceChildren(...x){this.children=x;}setAttribute(){}get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}set textContent(v){this._text=v;}querySelectorAll(tags){return this.children.flatMap(x=>[...(tags.split(',').includes(x.tag)?[x]:[]),...x.querySelectorAll(tags)]);}}
 const node=(t,v)=>new Element(t,v),field=(label,input)=>{const el=node('label',label);el.append(input);return el;},calls=[],events=[];let seq=0;
 const initial={id:'a1',property_id:'p1',name:'الحساب الأصلي',masked_reference:'****1234',kind:'bank',currency:'KWD',status:'active',revision:1};let row=structuredClone(initial);
 const state={lostResponse:false,failRead:false,notCommitted:false,wrongRead:false,callbackFailure:false};let changed=0;
 const d={body:node('div'),status:node('p'),session:{bound:{workspace:'w',user:'u'},async request(x){return x;},client:{async rpc(name,{p_action:action,p_data:p}){
  calls.push({action,payload:structuredClone(p)});
  if(action==='read'){if(state.failRead)throw Error('network unavailable');return {account:{...row,...(state.wrongRead?{name:'wrong same-revision row'}:{})},events:events.filter(e=>!p.operation_id||e.operation_id===p.operation_id).map(e=>structuredClone(e))};}
  if(state.notCommitted)throw Error('network dropped before commit');const old=events.find(e=>e.operation_id===p.operation_id);if(!old){const before=structuredClone(row);row={...row,revision:row.revision+1,...(action==='archive'?{status:'archived'}:{name:p.name,masked_reference:p.masked_reference})};events.push({operation_id:p.operation_id,account_id:row.id,action,request:{...p,action},reason:p.reason,actor_name:'مدير الاختبار',before_value:before,after_value:structuredClone(row),recorded_at:'2026-09-12'});}
  if(state.lostResponse)throw Error('response dropped after commit');return {account:row,operation_id:p.operation_id};
 }}},async run(fn){const controls=this.body.querySelectorAll('button,input,select'),prior=controls.map(x=>x.disabled);controls.forEach(x=>x.disabled=true);try{await fn();}catch(e){this.status.textContent=e.message;}finally{controls.forEach((x,i)=>x.disabled=prior[i]);}}};
 const ctx={node,field,Object,Array,String,Number,Error,crypto:{randomUUID:()=>`operation-${++seq}`}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('src/v267/components/collection-account-manager.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,''),ctx);
 const manager=ctx.createCollectionAccountManager(d,{onChanged:async()=>{changed++;if(state.callbackFailure)throw Error('other archive offline');}});d.body.append(manager.el);manager.update({accounts:[initial],properties:[{id:'p1',name:'العقار المحفوظ'}]});
 const control=label=>manager.el.querySelectorAll('label').find(x=>x._text===label)?.children[0],button=label=>manager.el.querySelectorAll('button').find(x=>x.textContent===label),form=manager.el.querySelectorAll('form')[0];
 const edit=()=>{control('اسم الحساب').value='الاسم المصحح';control('مرجع الحساب المحجوب').value='****5678';control('سبب التعديل أو الأرشفة').value='تصحيح بيانات العرض';};
 return {state,calls,events,d,manager,control,button,edit,get row(){return row;},get changed(){return changed;},async save(){await form.onsubmit({preventDefault(){}});},get text(){return manager.el.textContent;}};
}
test('lost write response is recovered from its immutable event without repeating the mutation',async()=>{
 const f=fixture();f.edit();f.state.lostResponse=true;await f.save();assert.equal(f.calls.filter(x=>x.action==='edit').length,1);assert.equal(f.events.length,1);assert.equal(f.row.revision,2);assert.match(f.text,/تم حفظ الحساب والتحقق/);assert.equal(f.changed,1);
});
test('unavailable readback locks the original payload through dialog control restoration',async()=>{
 const f=fixture();f.edit();f.state.lostResponse=true;f.state.failRead=true;await f.save();assert.equal(f.button('حفظ تعديل الحساب').disabled,true);assert.equal(f.control('اسم الحساب').disabled,true);assert.equal(f.button('التحقق من الحفظ السابق').hidden,false);assert.match(f.text,/لم يتأكد الحفظ/);
 await f.save();assert.equal(f.calls.filter(x=>x.action==='edit').length,1);f.state.failRead=false;await f.button('التحقق من الحفظ السابق').onclick();assert.equal(f.events.length,1);assert.match(f.text,/تم حفظ الحساب والتحقق/);
});
test('a proven absent write retries the same immutable request and operation id',async()=>{
 const f=fixture();f.edit();f.state.notCommitted=true;await f.save();const first=f.calls.find(x=>x.action==='edit').payload;assert.equal(f.events.length,0);assert.ok(f.button('إعادة محاولة الطلب نفسه'));
 f.state.notCommitted=false;await f.button('إعادة محاولة الطلب نفسه').onclick();assert.deepEqual(f.calls.filter(x=>x.action==='edit').map(x=>x.payload),[first,first]);assert.equal(f.events.length,1);assert.match(f.text,/تم حفظ الحساب والتحقق/);
});
test('same revision with a different reread account cannot claim success',async()=>{
 const f=fixture();f.edit();f.state.wrongRead=true;await f.save();assert.match(f.text,/لم يتأكد الحفظ/);assert.equal(f.changed,0);assert.equal(f.button('حفظ تعديل الحساب').disabled,true);
 f.state.wrongRead=false;await f.button('التحقق من الحفظ السابق').onclick();assert.equal(f.changed,1);assert.equal(f.events.length,1);
});
test('archive requires explicit acknowledgement and becomes immutable in the UI',async()=>{
 const f=fixture();f.control('الإجراء على الحساب').value='archive';f.control('الإجراء على الحساب').onchange();f.control('سبب التعديل أو الأرشفة').value='وقف استقبال الترحيلات';await f.save();assert.equal(f.calls.length,0);assert.match(f.d.status.textContent,/أكد منع الترحيلات/);
 f.control('أفهم أن الأرشفة تمنع ترحيلات جديدة لهذا الحساب').checked=true;await f.save();assert.equal(f.row.status,'archived');assert.equal(f.row.revision,2);assert.equal(f.button('تأكيد أرشفة الحساب').disabled,true);assert.equal(f.events[0].request.name,undefined);assert.equal(f.events[0].request.property_id,undefined);
});
test('full references are rejected and failure to refresh another panel does not erase confirmed success',async()=>{
 const f=fixture();f.edit();f.control('مرجع الحساب المحجوب').value='١٢٣٤ ٥٦٧٨';await f.save();assert.equal(f.calls.length,0);f.control('مرجع الحساب المحجوب').value='****5678';f.state.callbackFailure=true;await f.save();assert.match(f.text,/تم حفظ الحساب والتحقق/);assert.match(f.text,/تعذر تحديث بقية السجلات/);f.manager.clear();assert.equal(f.manager.el.querySelectorAll('input').length,0);
});
