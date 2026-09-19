let localeBindings;
const loadLocaleBindings=async()=>{const locale=await import('../src/v267/components/locale.js');const errors=await import('../src/v267/components/ui-error.js');const session=await import('../src/v267/api/session.js');return {translateStatic:locale.t,visibleMessage:locale.message,visibleDateLocale:locale.dateLocale,uiError:errors.uiError,safeError:session.safeError};};
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test.before(async()=>{localeBindings=await loadLocaleBindings();});
const source=fs.readFileSync('src/v267/pages/financial-register.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
const clone=value=>structuredClone(value);
const currentMonth=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuwait',year:'numeric',month:'2-digit'}).format(new Date());
function fixture(initial=[],options={}){
 const records=clone(initial),calls=[],history=[],all=[],confirmations=[];let sequence=0;
 class Element{
  constructor(tag,value){this.tag=tag;this.children=[];this.style={};this._value='';this._text=value??'';this.hidden=false;this.disabled=false;this.listeners={};all.push(this);}
  append(...nodes){for(const child of nodes){child.parent=this;this.children.push(child);}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  get textContent(){return String(this._text)+this.children.map(child=>child.textContent).join('');}
  set textContent(value){this._text=value;this.children=[];}
  get value(){return this._value||(this.tag==='select'?this.children[0]?.value||'':'');}
  set value(value){this._value=value;}
  reset(){const walk=element=>{if(['input','select','textarea'].includes(element.tag))element._value='';for(const child of element.children)walk(child);};walk(this);}
  focus(){}
  setAttribute(name,value){(this.attributes||={})[name]=value;}
  addEventListener(name,handler){(this.listeners[name]||=[]).push(handler);}
  querySelector(tag){return descendants(this).find(element=>element.tag===tag);}
 }
 const descendants=element=>[element,...element.children.flatMap(descendants)];
 const node=(tag,value)=>new Element(tag,value),field=(label,control)=>{const group=node('div');group.label=label;group.append(control);return group;};
 const state={manager:true,canWrite:true,skipSave:false,saveErrorAfterPersist:false,failList:false,wrongReadback:false,period:null,confirm:true,...options};
 const properties=[{id:'property-one',name:'العقار <المحفوظ>'},{id:'property-two',name:'عقار آخر'}];
 const documents=[{id:'document-one',property_id:'property-one',title:'فاتورة <محفوظة>',document_no:'DOC-1'},{id:'document-two',property_id:'property-two',title:'فاتورة ثانية',document_no:'DOC-2'}];
 const rpc=async(name,args)=>{
  assert.equal(name,'aqari_financial_register');assert.equal(args.p_workspace_id,'workspace-fixture');calls.push(clone(args));const values=args.p_data;
  if(args.p_action==='list'){
   if(state.listError)throw state.listError;
   if(state.failList)throw Error('تعذر اتصال القراءة');
   const rows=records.filter(record=>record.expense_date.startsWith(values.month));const approved=rows.filter(record=>record.state==='approved');
   return {manager:state.manager,can_write:state.canWrite,properties:clone(properties),documents:clone(documents),expenses:clone(rows).map(row=>state.wrongReadback?{...row,amount:'999.000'}:row),history:clone(history),period:clone(state.period),summary:{approved_expenses:approved.reduce((sum,row)=>sum+Math.round(Number(row.amount)*1000),0)/1000+'',count:approved.length}};
  }
  if(state.writeError)throw state.writeError;
  if(args.p_action==='close_period'){
   state.period={month:values.month+'-01',closed_at:'2026-09-10T09:00:00Z',closed_by_name:'المدير',reason:values.reason,snapshot:{}};
   history.push({entity_id:values.month,action:args.p_action,actor_name:'المدير',recorded_at:'2026-09-10T09:00:00Z',reason:values.reason});return clone(state.period);
  }
  let row=records.find(record=>record.id===values.id);assert.equal(values.revision,row?.revision||0,'optimistic revision check');
  if(args.p_action==='save'){
   if(state.skipSave)return {...values,revision:1,state:'draft'};
   if(!row){row={...values,state:'draft',revision:1,voucher_no:null};records.unshift(row);}else Object.assign(row,values,{revision:row.revision+1});
  }else if(args.p_action==='approve'){
   assert.equal(row.state,'draft');assert.ok(row.document_id);Object.assign(row,{state:'approved',revision:row.revision+1,voucher_no:'EXP-202609-000001',approved_at:'2026-09-10T09:00:00Z',approved_by_name:'المدير',approval_reason:values.reason});
  }else if(args.p_action==='cancel')Object.assign(row,{state:'cancelled',revision:row.revision+1,cancelled_at:'2026-09-10T09:00:00Z',cancelled_by_name:'المدير',cancel_reason:values.reason});
  else throw Error('unsupported action');
  history.push({entity_id:row.id,action:'expense.'+args.p_action,actor_name:'مدير <مسجل>',recorded_at:'2026-09-10T09:00:00Z',reason:values.reason||''});
  if(state.listErrorAfterWrite)state.listError=state.listErrorAfterWrite;
  if(args.p_action==='save'&&state.saveErrorAfterPersist)throw Error('انقطع الرد بعد الحفظ');
  return clone(row);
 };
 const el=node('dialog'),close=node('button','إغلاق');el.append(close);
 const d={el,body:node('div'),status:node('p'),session:{bound:{workspace:'workspace-fixture'},client:{rpc},request:query=>query},cleanups:[],onDispose(fn){this.cleanups.push(fn);},run(work){d.lastError=null;d.pending=Promise.resolve().then(work).catch(error=>{d.lastError=error;d.status.textContent=error.message;});return d.pending;}};el.append(d.body);
 const ctx={...localeBindings,node,field,createDialog:()=>d,crypto:{randomUUID:()=> 'expense-new-'+(++sequence)},window:{confirm:message=>{confirmations.push(message);return state.confirm;}},console};vm.createContext(ctx);vm.runInContext(source+'\nopenFinancialRegister();',ctx);
 const button=label=>descendants(d.body).find(element=>element.tag==='button'&&element.textContent===label);
 const control=label=>descendants(d.body).find(element=>element.label===label)?.children[0];
 const editor=()=>descendants(d.body).find(element=>element.tag==='form'&&element.children.some(child=>child.tag==='h3'));
 const submit=async form=>{form.onsubmit({preventDefault(){}});await d.pending;};
 const newDraft=()=>{button('إعداد مصروف جديد').onclick();control('العقار').value='property-one';control('العقار').onchange();control('بند المصروف').value='صيانة <مسجلة>';control('المستفيد').value='مقاول <محفوظ>';control('المبلغ بالدينار الكويتي').value='١٢٠٫٠٠٥';control('البيان والتفاصيل').value='تفاصيل <script>';};
 return {d,records,calls,history,state,properties,documents,confirmations,close,button,control,editor,submit,newDraft,descendants};
}
const expense=overrides=>({id:'expense-existing',property_id:'property-one',expense_date:currentMonth()+'-01',category:'صيانة أصلية',payee:'المستفيد الأصلي',amount:'12.005',method:'cash',reference:'',description:'تفاصيل أصلية <script>',document_id:'document-one',state:'draft',revision:1,voucher_no:null,...overrides});

test('empty financial register loads authoritative period data without creating financial records',async()=>{
 const f=fixture();await f.d.pending;assert.match(f.d.body.textContent,/لا توجد مصروفات محفوظة/);assert.match(f.d.body.textContent,/0\.000 د\.ك/);assert.equal(f.calls.length,1);assert.equal(f.calls[0].p_action,'list');assert.equal(f.records.length,0);
});
test('expense save normalizes Arabic KWD to exact fils and verifies stored values before clearing editor',async()=>{
 const f=fixture();await f.d.pending;f.newDraft();f.control('مستند المصروف المحفوظ').value='document-one';await f.submit(f.editor());
 const save=f.calls.find(call=>call.p_action==='save');assert.equal(save.p_data.amount,'120.005');assert.equal(save.p_data.document_id,'document-one');assert.equal(save.p_data.revision,0);assert.equal(save.p_data.description,'تفاصيل <script>');assert.equal(f.calls.at(-1).p_action,'list');assert.equal(f.editor().hidden,true);assert.match(f.d.status.textContent,/تم حفظ المسودة والتحقق/);
});
test('invalid amounts, dates, references and cross-property attachments never reach a write RPC',async()=>{
 const f=fixture();await f.d.pending;f.newDraft();
 for(const invalid of ['-1','0','1.0001','1e2','1,000.000','1000000000.000']){f.control('المبلغ بالدينار الكويتي').value=invalid;await f.submit(f.editor());assert.equal(f.calls.filter(call=>call.p_action==='save').length,0);}
 f.control('المبلغ بالدينار الكويتي').value='1.001';f.control('تاريخ المصروف').value='2026-02-30';await f.submit(f.editor());assert.match(f.d.status.textContent,/تاريخاً صحيحاً/);
 f.control('تاريخ المصروف').value=currentMonth()+'-01';f.control('طريقة الصرف').value='bank';await f.submit(f.editor());assert.match(f.d.status.textContent,/رقم مرجع/);
 f.control('رقم مرجع التحويل أو الشيك').value='TR-123';f.control('مستند المصروف المحفوظ').value='document-two';await f.submit(f.editor());assert.match(f.d.status.textContent,/للعقار نفسه/);assert.equal(f.calls.filter(call=>call.p_action==='save').length,0);
});
test('unverified save retains form, blocks blind repetition and reuses its id after refresh reconciliation',async()=>{
 const f=fixture();await f.d.pending;f.state.skipSave=true;f.newDraft();await f.submit(f.editor());
 const first=f.calls.find(call=>call.p_action==='save');assert.equal(f.editor().hidden,false);assert.equal(f.control('المبلغ بالدينار الكويتي').value,'١٢٠٫٠٠٥');assert.match(f.d.status.textContent,/لم تتأكد مطابقة/);
 await f.submit(f.editor());assert.equal(f.calls.filter(call=>call.p_action==='save').length,1);assert.match(f.d.status.textContent,/العملية السابقة أولاً/);
 await f.button('تحديث السجل والتحقق من الحفظ').onclick();assert.match(f.d.status.textContent,/لا يطابق/);f.state.skipSave=false;await f.submit(f.editor());
 const saves=f.calls.filter(call=>call.p_action==='save');assert.equal(saves[1].p_data.id,first.p_data.id);assert.equal(saves[1].p_data.revision,0);assert.equal(f.records.length,1);assert.equal(f.editor().hidden,true);
});
test('lost save response is reconciled by rereading the existing record without a duplicate write',async()=>{
 const f=fixture([],{saveErrorAfterPersist:true});await f.d.pending;f.newDraft();await f.submit(f.editor());assert.equal(f.records.length,1);assert.equal(f.editor().hidden,false);assert.match(f.d.status.textContent,/انقطع الرد/);
 await f.button('تحديث السجل والتحقق من الحفظ').onclick();assert.equal(f.editor().hidden,true);assert.match(f.d.status.textContent,/التحقق من العملية السابقة/);assert.equal(f.calls.filter(call=>call.p_action==='save').length,1);
});
test('approval requires matching saved document and a reason; approved data is immutable in the editor',async()=>{
 const f=fixture([expense({document_id:null})]);await f.d.pending;f.control('سبب اعتماد المصروف').value='مراجعة الفاتورة';await f.submit(f.button('اعتماد المصروف').parent);assert.match(f.d.status.textContent,/يلزم مستند/);assert.equal(f.calls.filter(call=>call.p_action==='approve').length,0);
 f.records[0].document_id='document-one';await f.button('تحديث السجل والتحقق من الحفظ').onclick();f.control('سبب اعتماد المصروف').value='مراجعة الفاتورة';await f.submit(f.button('اعتماد المصروف').parent);
 assert.equal(f.records[0].state,'approved');assert.equal(f.button('تعديل مسودة المصروف'),undefined);assert.equal(f.button('اعتماد المصروف'),undefined);assert.match(f.d.body.textContent,/EXP-202609-000001/);assert.match(f.d.status.textContent,/تم اعتماد المصروف/);assert.equal(f.calls.at(-1).p_action,'list');
});
test('a changed financial amount on approval readback cannot be reported successful',async()=>{
 const f=fixture([expense()]);await f.d.pending;f.state.wrongReadback=true;f.control('سبب اعتماد المصروف').value='مراجعة الفاتورة';await f.submit(f.button('اعتماد المصروف').parent);assert.match(f.d.status.textContent,/لم تتأكد مطابقة/);assert.doesNotMatch(f.d.status.textContent,/تم اعتماد/);
});
test('documented cancellation preserves original amount and historical details',async()=>{
 const original=expense({state:'approved',voucher_no:'EXP-1'}),f=fixture([original]);await f.d.pending;f.control('سبب إلغاء المصروف').value='x';await f.submit(f.button('إلغاء المصروف مع حفظ الأصل').parent);assert.equal(f.calls.filter(call=>call.p_action==='cancel').length,0);
 f.control('سبب إلغاء المصروف').value='إلغاء بسبب تكرار الفاتورة';await f.submit(f.button('إلغاء المصروف مع حفظ الأصل').parent);assert.equal(f.records[0].state,'cancelled');assert.equal(f.records[0].amount,original.amount);assert.equal(f.records[0].description,original.description);assert.equal(f.records[0].cancel_reason,'إلغاء بسبب تكرار الفاتورة');assert.equal(f.button('إلغاء المصروف مع حفظ الأصل'),undefined);
 f.button('عرض سجل المصروف').onclick();assert.match(f.d.body.textContent,/مدير <مسجل>/);assert.match(f.d.body.textContent,/إلغاء بسبب تكرار الفاتورة/);assert.match(f.d.body.textContent,/تفاصيل أصلية <script>/);
});
test('closed months remain readable but expose no create, edit, approval or cancellation actions',async()=>{
 const f=fixture([expense()],{period:{month:currentMonth()+'-01',closed_at:'2026-09-10T09:00:00Z',closed_by_name:'المدير',reason:'إقفال معتمد'}});await f.d.pending;
 assert.equal(f.button('إعداد مصروف جديد').hidden,true);assert.equal(f.button('تعديل مسودة المصروف'),undefined);assert.equal(f.button('اعتماد المصروف'),undefined);assert.equal(f.button('إلغاء المصروف مع حفظ الأصل'),undefined);assert.match(f.d.body.textContent,/الفترة مقفلة/);assert.match(f.d.body.textContent,/12\.005 د\.ك/);
});
test('read-only users have no financial mutation actions',async()=>{
 const f=fixture([expense()],{manager:false,canWrite:false});await f.d.pending;assert.equal(f.button('إعداد مصروف جديد').hidden,true);assert.equal(f.button('تعديل مسودة المصروف'),undefined);assert.equal(f.button('اعتماد المصروف'),undefined);assert.equal(f.button('إلغاء المصروف مع حفظ الأصل'),undefined);assert.equal(f.button('إقفال الشهر نهائياً'),undefined);
});
test('refresh preserves dirty fields and cancelling discard preserves draft and selected month',async()=>{
 const f=fixture();await f.d.pending;f.newDraft();const idBefore=f.editor();await f.button('تحديث السجل والتحقق من الحفظ').onclick();assert.equal(f.control('المستفيد').value,'مقاول <محفوظ>');assert.equal(f.control('العقار').value,'property-one');
 f.state.confirm=false;f.button('إغلاق المسودة').onclick();assert.equal(f.editor().hidden,false);f.control('الفترة المالية').value='2020-01';f.control('الفترة المالية').onchange();assert.equal(f.control('الفترة المالية').value,currentMonth());assert.equal(f.editor(),idBefore);assert.ok(f.confirmations.length>=2);
 f.state.confirm=true;f.state.failList=true;f.control('الفترة المالية').value='2020-01';f.control('الفترة المالية').onchange();await f.d.pending;assert.equal(f.control('الفترة المالية').value,currentMonth());assert.equal(f.control('المستفيد').value,'مقاول <محفوظ>');assert.equal(f.editor().hidden,false);
});
test('past-month close requires explicit reason and confirmation then verifies server closure record',async()=>{
 const f=fixture();await f.d.pending;assert.equal(f.button('إقفال الشهر نهائياً'),undefined);f.control('الفترة المالية').value='2020-01';f.control('الفترة المالية').onchange();await f.d.pending;
 f.control('سبب إقفال الفترة').value='إقفال بعد المطابقة';f.state.confirm=false;await f.submit(f.button('إقفال الشهر نهائياً').parent);assert.equal(f.calls.filter(call=>call.p_action==='close_period').length,0);
 f.state.confirm=true;await f.submit(f.button('إقفال الشهر نهائياً').parent);assert.equal(f.state.period.month,'2020-01-01');assert.equal(f.state.period.reason,'إقفال بعد المطابقة');assert.equal(f.calls.at(-1).p_action,'list');assert.match(f.d.status.textContent,/تم إقفال الشهر والتحقق/);assert.equal(f.button('إقفال الشهر نهائياً'),undefined);
});
test('local close and Escape guard dirty input without intercepting forced disposal',async()=>{
 const f=fixture();await f.d.pending;f.newDraft();f.state.confirm=false;
 for(const name of ['click','cancel']){let prevented=false,stopped=false;for(const listener of f.d.el.listeners[name])listener({target:f.close,preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});assert.equal(prevented,true);assert.equal(stopped,true);}
 const count=f.confirmations.length;for(const cleanup of f.d.cleanups)cleanup();assert.equal(f.confirmations.length,count);
});

test('denied financial reads clear private records, history, document choices and drafts without reviving them on recovery',async()=>{
 for(const error of [Object.assign(Error('denied'),{status:401}),Object.assign(Error('denied'),{status:403}),Object.assign(Error('denied'),{code:'42501'}),Error('ACCESS_DENIED')]){
  const f=fixture([expense()]);await f.d.pending;
  f.history.push({entity_id:'expense-existing',action:'expense.save',actor_name:'مدقق سري',recorded_at:'2026-09-10T09:00:00Z',reason:'مرجع تدقيق سري'});
  await f.button('تحديث السجل والتحقق من الحفظ').onclick();f.button('عرض سجل المصروف').onclick();
  const oldHistory=f.button('عرض سجل المصروف');assert.match(f.d.body.textContent,/مرجع تدقيق سري/);
  const reason=f.control('سبب اعتماد المصروف');reason.value='اعتماد محلي غير محفوظ';reason.oninput();
  f.newDraft();f.control('مستند المصروف المحفوظ').value='document-one';f.state.listError=error;
  await f.button('تحديث السجل والتحقق من الحفظ').onclick();
  assert.equal(f.d.status.textContent,error.message);assert.equal(f.editor().hidden,true);assert.equal(f.button('إعداد مصروف جديد').hidden,true);
  assert.doesNotMatch(f.d.body.textContent,/المستفيد الأصلي|مرجع تدقيق سري|مدقق سري|فاتورة <محفوظة>|12\.005/);
  for(const label of ['المستفيد','بند المصروف','المبلغ بالدينار الكويتي','رقم مرجع التحويل أو الشيك','البيان والتفاصيل'])assert.equal(f.control(label).value,'');
  for(const label of ['العقار','مستند المصروف المحفوظ'])assert.equal(f.control(label).children.length,0);
  oldHistory.onclick();assert.doesNotMatch(f.d.body.textContent,/صيانة أصلية|مرجع تدقيق سري/);
  assert.equal(f.records.length,1);assert.equal(f.calls.filter(call=>call.p_action!=='list').length,0);
  f.state.listError=null;f.history.length=0;await f.button('تحديث السجل والتحقق من الحفظ').onclick();
  assert.match(f.d.body.textContent,/المستفيد الأصلي/);assert.equal(f.editor().hidden,true);assert.equal(f.control('المستفيد').value,'');
  assert.equal(f.control('سبب اعتماد المصروف').value,'');assert.doesNotMatch(f.d.body.textContent,/مرجع تدقيق سري/);
 }
});

test('read denial after a persisted expense clears its draft and blocks blind repeat until authorized reread',async()=>{
 const denied=Object.assign(Error('ACCESS_DENIED'),{status:403,code:'42501'}),f=fixture([],{listErrorAfterWrite:denied});await f.d.pending;
 f.newDraft();await f.submit(f.editor());
 assert.equal(f.records.length,1);assert.equal(f.editor().hidden,true);assert.equal(f.control('المستفيد').value,'');assert.equal(f.button('إعداد مصروف جديد').hidden,true);
 assert.doesNotMatch(f.d.body.textContent,/مقاول <محفوظ>|صيانة <مسجلة>|120\.005/);
 await f.submit(f.editor());await f.button('تحديث السجل والتحقق من الحفظ').onclick();f.button('إعداد مصروف جديد').onclick();
 assert.equal(f.editor().hidden,true);assert.equal(f.calls.filter(call=>call.p_action==='save').length,1);
 f.state.listError=null;f.state.listErrorAfterWrite=null;await f.button('تحديث السجل والتحقق من الحفظ').onclick();
 assert.match(f.d.status.textContent,/راجع العملية السابقة/);assert.match(f.d.body.textContent,/120\.005/);assert.equal(f.editor().hidden,true);
 assert.equal(f.control('المستفيد').value,'');assert.equal(f.button('إعداد مصروف جديد').disabled,false);
 assert.equal(f.calls.filter(call=>call.p_action==='save').length,1);assert.equal(f.records.length,1);
});

test('temporary 503 financial reads preserve drafts and the uncertain-save lock until readback succeeds',async()=>{
 const unavailable=Object.assign(Error('SERVICE_UNAVAILABLE'),{status:503}),f=fixture([expense()]);await f.d.pending;
 f.newDraft();f.state.listError=unavailable;await f.button('تحديث السجل والتحقق من الحفظ').onclick();
 assert.match(f.d.body.textContent,/المستفيد الأصلي/);assert.equal(f.editor().hidden,false);assert.equal(f.control('المستفيد').value,'مقاول <محفوظ>');
 assert.equal(f.control('المبلغ بالدينار الكويتي').value,'١٢٠٫٠٠٥');
 f.state.listError=null;f.state.listErrorAfterWrite=unavailable;await f.submit(f.editor());
 assert.equal(f.records.length,2);assert.equal(f.editor().hidden,false);assert.equal(f.button('إعداد مصروف جديد').disabled,true);
 await f.submit(f.editor());await f.button('تحديث السجل والتحقق من الحفظ').onclick();
 assert.equal(f.calls.filter(call=>call.p_action==='save').length,1);assert.equal(f.control('المستفيد').value,'مقاول <محفوظ>');
 f.state.listError=null;f.state.listErrorAfterWrite=null;await f.button('تحديث السجل والتحقق من الحفظ').onclick();
 assert.match(f.d.status.textContent,/تم التحقق من العملية السابقة/);assert.equal(f.editor().hidden,true);
 assert.equal(f.calls.filter(call=>call.p_action==='save').length,1);assert.equal(f.records.length,2);
});

test('denied write RPCs clear financial data and propagate the original authorization error to the dialog',async()=>{
 for(const denied of [Object.assign(Error('session expired'),{status:401}),Object.assign(Error('write denied'),{status:403}),Object.assign(Error('insufficient privilege'),{code:'42501'}),Error('ACCESS_DENIED')]){
  const f=fixture([expense()]);await f.d.pending;f.newDraft();f.state.writeError=denied;await f.submit(f.editor());
  assert.equal(f.d.lastError,denied,'the dialog must receive the original denial with its status, code and message');
  assert.equal(f.editor().hidden,true);assert.equal(f.control('المستفيد').value,'');assert.equal(f.button('إعداد مصروف جديد').hidden,true);
  assert.doesNotMatch(f.d.body.textContent,/المستفيد الأصلي|مقاول <محفوظ>|صيانة أصلية|12\.005/);
  assert.equal(f.control('العقار').children.length,0);assert.equal(f.control('مستند المصروف المحفوظ').children.length,0);
  assert.equal(f.records.length,1);assert.equal(f.calls.filter(call=>call.p_action==='save').length,1);
  await f.submit(f.editor());assert.equal(f.calls.filter(call=>call.p_action==='save').length,1);
 }
});

test('temporary 503 write failures retain the draft and block repetition until saved-state reconciliation',async()=>{
 const f=fixture();await f.d.pending;f.newDraft();f.state.writeError=Object.assign(Error('SERVICE_UNAVAILABLE'),{status:503});await f.submit(f.editor());
 const first=f.calls.find(call=>call.p_action==='save');assert.equal(f.editor().hidden,false);assert.equal(f.control('المستفيد').value,'مقاول <محفوظ>');
 assert.equal(f.control('المبلغ بالدينار الكويتي').value,'١٢٠٫٠٠٥');assert.equal(f.button('إعداد مصروف جديد').disabled,true);assert.equal(f.records.length,0);
 await f.submit(f.editor());assert.equal(f.calls.filter(call=>call.p_action==='save').length,1);
 f.state.writeError=null;await f.button('تحديث السجل والتحقق من الحفظ').onclick();assert.match(f.d.status.textContent,/لا يطابق/);
 await f.submit(f.editor());const saves=f.calls.filter(call=>call.p_action==='save');assert.equal(saves.length,2);assert.equal(saves[1].p_data.id,first.p_data.id);
 assert.equal(f.records.length,1);assert.equal(f.editor().hidden,true);
});

test('reconciling an interrupted expense save retains later edits and saves them against the verified revision',async()=>{
 const f=fixture([],{saveErrorAfterPersist:true});await f.d.pending;f.newDraft();await f.submit(f.editor());
 f.control('المستفيد').value='مستفيد مصحح بعد الانقطاع';f.control('المبلغ بالدينار الكويتي').value='١٣٠٫١٢٥';
 f.state.saveErrorAfterPersist=false;await f.button('تحديث السجل والتحقق من الحفظ').onclick();
 assert.equal(f.editor().hidden,false);assert.equal(f.control('المستفيد').value,'مستفيد مصحح بعد الانقطاع');assert.equal(f.control('المبلغ بالدينار الكويتي').value,'١٣٠٫١٢٥');
 await f.submit(f.editor());const writes=f.calls.filter(c=>c.p_action==='save');assert.equal(writes.length,2);assert.equal(writes[1].p_data.id,writes[0].p_data.id);assert.equal(writes[1].p_data.revision,1);assert.equal(f.records.length,1);assert.equal(f.records[0].amount,'130.125');assert.equal(f.editor().hidden,true);
});
test('a later matching revision cannot be mistaken for confirmation of an earlier expense save',async()=>{
 const f=fixture([],{saveErrorAfterPersist:true});await f.d.pending;f.newDraft();await f.submit(f.editor());f.records[0].revision=3;
 await f.button('تحديث السجل والتحقق من الحفظ').onclick();assert.equal(f.editor().hidden,false);assert.doesNotMatch(f.d.status.textContent,/تم التحقق/);assert.match(f.d.status.textContent,/لا يطابق/);
});
test('an uncertain expense save cannot lose its editor through the inner discard action',async()=>{
 const f=fixture([],{saveErrorAfterPersist:true});await f.d.pending;f.newDraft();await f.submit(f.editor());f.button('إغلاق المسودة').onclick();assert.equal(f.editor().hidden,false);assert.equal(f.control('المبلغ بالدينار الكويتي').value,'١٢٠٫٠٠٥');
});

test('expense filters combine Arabic search, property and status without changing authoritative totals',async()=>{
 const f=fixture([expense({id:'one',payee:'أحْمَد سالم',reference:'TR-١٢۳',state:'approved'}),expense({id:'two',property_id:'property-two',payee:'احمد سالم',reference:'TR-123',state:'draft'}),expense({id:'three',payee:'مورد آخر',state:'cancelled'})]);await f.d.pending;
 const originalCalls=f.calls.length;f.control('البحث في مصروفات الفترة').value='احمد tr-123';f.control('البحث في مصروفات الفترة').oninput();
 assert.equal(f.descendants(f.d.body).filter(x=>x.tag==='article').length,2);
 f.control('تصفية المصروفات حسب العقار').value='property-one';f.control('تصفية المصروفات حسب العقار').onchange();f.control('حالة المصروف').value='approved';f.control('حالة المصروف').onchange();
 assert.equal(f.descendants(f.d.body).filter(x=>x.tag==='article').length,1);assert.match(f.d.body.textContent,/12\.005 د\.ك • عددها: 1/);assert.match(f.d.body.textContent,/نتائج التصفية: 1 من 3/);
 f.control('حالة المصروف').value='draft';f.control('حالة المصروف').onchange();assert.equal(f.descendants(f.d.body).filter(x=>x.tag==='article').length,0);assert.match(f.d.body.textContent,/لا توجد مصروفات تطابق/);assert.match(f.d.body.textContent,/12\.005 د\.ك • عددها: 1/);
 f.button('مسح البحث والتصفية').onclick();assert.equal(f.descendants(f.d.body).filter(x=>x.tag==='article').length,3);assert.equal(f.calls.length,originalCalls,'local filtering must not write or reread');
});
test('expense pages cover every saved row and search resets the page while preserving a dirty editor',async()=>{
 const f=fixture(Array.from({length:45},(_,i)=>expense({id:'row-'+i,category:'صيانة '+i,voucher_no:'EX-'+(i+1)})));await f.d.pending;
 const cards=()=>f.descendants(f.d.body).filter(x=>x.tag==='article');assert.equal(cards().length,20);assert.equal(f.button('الصفحة السابقة').disabled,true);
 const seen=new Set(cards().map(x=>x.children[0].textContent));f.button('الصفحة التالية').onclick();assert.equal(cards().length,20);cards().forEach(x=>seen.add(x.children[0].textContent));f.button('الصفحة التالية').onclick();assert.equal(cards().length,5);cards().forEach(x=>seen.add(x.children[0].textContent));assert.equal(seen.size,45);assert.equal(f.button('الصفحة التالية').disabled,true);
 f.newDraft();f.control('البحث في مصروفات الفترة').value='ex-٤٥';f.control('البحث في مصروفات الفترة').oninput();assert.equal(cards().length,1);assert.match(cards()[0].textContent,/EX-45/);assert.equal(f.control('المستفيد').value,'مقاول <محفوظ>');assert.equal(f.editor().hidden,false);
 f.control('البحث في مصروفات الفترة').value='';f.control('البحث في مصروفات الفترة').oninput();assert.equal(cards().length,20);assert.equal(f.button('الصفحة السابقة').disabled,true);assert.equal(f.confirmations.length,0);
});
test('refresh clamps a shortened result page and denied reads cannot revive filtered data through old controls',async()=>{
 const f=fixture(Array.from({length:21},(_,i)=>expense({id:'row-'+i})));await f.d.pending;f.button('الصفحة التالية').onclick();f.records.splice(1);await f.button('تحديث السجل والتحقق من الحفظ').onclick();assert.equal(f.descendants(f.d.body).filter(x=>x.tag==='article').length,1);assert.equal(f.button('الصفحة التالية').disabled,true);assert.match(f.d.body.textContent,/الصفحة 1 من 1/);
 f.control('البحث في مصروفات الفترة').value='المستفيد';f.control('البحث في مصروفات الفترة').oninput();const oldNext=f.button('الصفحة التالية'),oldReset=f.button('مسح البحث والتصفية');f.state.listError=Object.assign(Error('ACCESS_DENIED'),{status:403});await f.button('تحديث السجل والتحقق من الحفظ').onclick();oldNext.onclick();oldReset.onclick();f.control('البحث في مصروفات الفترة').oninput();
 assert.equal(f.control('البحث في مصروفات الفترة').value,'');assert.equal(f.control('تصفية المصروفات حسب العقار').children.length,0);assert.equal(f.descendants(f.d.body).filter(x=>x.tag==='article').length,0);assert.doesNotMatch(f.d.body.textContent,/المستفيد الأصلي|نتائج التصفية:/);
});
