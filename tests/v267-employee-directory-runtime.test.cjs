const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let locale;
test.before(async()=>{locale=await import('../src/v267/components/locale.js');locale.setLocale('ar');});
const source=fs.readFileSync('src/v267/pages/employees.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
function fixture(employees,options={}){
 const callbacks=[],calls=[];
 class Element{
  constructor(tag,text=''){this.tag=tag;this.children=[];this._text=text;this.value='';this.style={};}
  append(...nodes){this.children.push(...nodes);}
  querySelectorAll(selector){const all=this.children.flatMap(x=>[x,...x.querySelectorAll('*')]);return selector==='*'?all:all.filter(x=>x.tag==='input'&&(!selector.includes(':checked')||x.checked));}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
  set textContent(value){this._text=value;this.children=[];}
 }
 const node=(tag,text)=>new Element(tag,text),field=(label,control)=>{const group=node('div');group.label=label;group.append(control);return group;};
 const d={body:node('div'),status:node('p'),closed:false,onDispose:fn=>callbacks.push(fn),setBeforeClose(check){d.beforeClose=check;},session:{bound:{workspace:'w'},client:{rpc(name,args){assert.equal(name,'aqari_hr');calls.push(args);return structuredClone(options.rpc?options.rpc(args):args.p_action==='get'?{employee:employee({id:args.p_data.employee_id,revision:1,property_ids:[],profile:{name_ar:'محفوظ',name_en:'Saved'}}),permissions:{},payroll:[],events:[],documents:[],audit:[]}:{employees,properties:[],manager:false});}},request:query=>query},run(work){if(d.closed)return;d.pending=Promise.resolve().then(work).catch(error=>{d.status.textContent=error.message;});return d.pending;}};
 const context={translateStatic:locale.t,visibleMessage:locale.message,createDialog:()=>d,node,field,createPrivateUrls:()=>({clear(){}}),console,window:{confirm:()=>options.confirm!==false},crypto:{randomUUID:()=> 'new-employee'},PROFILE_FIELDS:[['name_ar','الاسم']],STATES:{paid:'مصروف',draft:'مسودة',issued:'صادر'},money:Number,currentMonth:()=> '2026-09'};
 vm.runInNewContext(source+'\nopenEmployees();',context);
 const descendants=el=>[el,...el.children.flatMap(descendants)];
 return {d,calls,inspect:context.payrollReferenceFindings,confirm:value=>{options.confirm=value;},find:label=>descendants(d.body).find(x=>x.label===locale.t(label))?.children[0],button:label=>descendants(d.body).find(x=>x.tag==='button'&&x.textContent===locale.t(label)),all:()=>descendants(d.body),search:()=>descendants(d.body).find(x=>x.tag==='input'&&x.type==='search'),cards:()=>descendants(d.body).filter(x=>x.tag==='article'),dispose(){d.closed=true;callbacks.forEach(fn=>fn());}};
}
const employee=overrides=>({id:'employee-one',status:'active',profile:{name_ar:'أحْمَد سالم',name_en:'Ahmed Salem',phone:'00965 5555-1234',job_ar:'محاسب'},...overrides});
const payroll=overrides=>({id:'salary-one',employee_id:'employee-one',state:'paid',voucher_no:'SAL-1',method:'cash',reference:'',month:'2026-09-01',net:'150.000',...overrides});
const signedDocument=overrides=>({id:'signed-one',employee_id:'employee-one',payroll_id:'salary-one',kind:'signed_salary',status:'ready',attestations:{signature:true,fingerprint:true,stamp:true},...overrides});
test('payroll quality permits cash without reference and ignores draft or issued salaries',async()=>{
 const f=fixture([]);await f.d.pending;
 assert.deepEqual(structuredClone(f.inspect('employee-one',[payroll(),payroll({id:'draft',state:'draft',voucher_no:null,method:'transfer'}),payroll({id:'issued',state:'issued',voucher_no:null,method:'cheque'})],[signedDocument()])),[]);
});
test('payroll quality detects missing vouchers and references for each supported noncash method',async()=>{
 const f=fixture([]);await f.d.pending;
 for(const method of ['transfer','cheque','knet'])assert.deepEqual(structuredClone(f.inspect('employee-one',[payroll({voucher_no:null,reference:'  ',method})],[signedDocument()])),[{kind:'missing_voucher',id:'salary-one',voucher:''},{kind:'missing_reference',id:'salary-one',voucher:''}]);
 assert.equal(f.inspect('employee-one',[payroll({method:'other'})],[signedDocument()])[0].kind,'unknown_method');
});
test('only ready signed documents for the same employee and salary with boolean attestations satisfy metadata review',async()=>{
 const f=fixture([]);await f.d.pending;
 for(const override of [{employee_id:'other'},{payroll_id:'other'},{kind:'employment_contract'},{status:'reserved'},{attestations:{signature:true,fingerprint:true}},{attestations:{signature:'true',fingerprint:true,stamp:true}}]){
  const findings=f.inspect('employee-one',[payroll()],[signedDocument(override)]);assert.equal(findings.length,1);assert.equal(findings[0].kind,'signed_document_not_confirmed');
 }
 assert.equal(f.inspect('employee-one',[payroll()],[signedDocument({status:'reserved'}),signedDocument({id:'good'})]).length,0);
});
test('payroll quality reports shared exact references as review candidates and separates payment methods',async()=>{
 const f=fixture([]);await f.d.pending;
 const rows=[payroll({method:'transfer',reference:'BATCH'}),payroll({id:'salary-two',voucher_no:'SAL-1',method:'transfer',reference:'BATCH'}),payroll({id:'cheque',voucher_no:'C1',method:'cheque',reference:'BATCH'}),payroll({id:'case',voucher_no:'C2',method:'transfer',reference:'batch'})];
 const docs=rows.map(p=>signedDocument({payroll_id:p.id})),before=structuredClone(rows);
 assert.deepEqual(structuredClone(f.inspect('employee-one',rows,docs)).map(x=>[x.kind,x.id]),[['duplicate_voucher','salary-one'],['duplicate_voucher','salary-two'],['shared_reference','salary-one'],['shared_reference','salary-two']]);assert.deepEqual(rows,before);
 assert.throws(()=>f.inspect('employee-one',[payroll({employee_id:'another'})],docs),/نطاق الموظف/);
});
async function payrollReview(){
 const saved=employee({property_ids:[]}),state={error:null,result:{employee:saved,permissions:{},payroll:[payroll({method:'transfer'})],documents:[],events:[],audit:[]}};
 const f=fixture([saved],{rpc:args=>{if(args.p_action==='list')return {employees:[saved],properties:[]};if(state.error)throw state.error;return state.result;}});await f.d.pending;await f.button('فتح ملف أحْمَد سالم').onclick();return {f,state};
}
test('payroll review rereads only the selected employee and visibly limits its scope without financial writes',async()=>{
 const {f}=await payrollReview();await f.button('مراجعة مراجع الرواتب المصروفة').onclick();
 assert.match(f.d.body.textContent,/راتب مصروف بغير النقد بلا مرجع — SAL-1/);assert.match(f.d.body.textContent,/لا يشمل الموظفين الآخرين/);assert.match(f.d.body.textContent,/عدم ظهور مستند لا يثبت حذفه/);
 assert.deepEqual(f.calls.map(c=>c.p_action),['list','get','get']);assert.ok(f.calls.filter(c=>c.p_action==='get').every(c=>c.p_data.employee_id==='employee-one'));
});
test('failed payroll review and file refresh remove previous findings before any successful reread',async()=>{
 for(const error of [Error('network'),Object.assign(Error('denied'),{code:'42501'})]){
  const {f,state}=await payrollReview();await f.button('مراجعة مراجع الرواتب المصروفة').onclick();state.error=error;
  await f.button('مراجعة مراجع الرواتب المصروفة').onclick();assert.doesNotMatch(f.d.body.textContent,/نتيجة مراجعة مراجع الرواتب|لم يرصد هذا الفحص/);
  state.error=null;await f.button('مراجعة مراجع الرواتب المصروفة').onclick();assert.match(f.d.body.textContent,/نتيجة مراجعة/);
  state.error=error;await f.button('تحديث الملف / Reload employee').onclick();assert.doesNotMatch(f.d.body.textContent,/نتيجة مراجعة مراجع الرواتب/);
 }
});
test('incomplete or wrong-employee payroll responses cannot produce a clean quality report',async()=>{
 const {f,state}=await payrollReview();const initial=structuredClone(state.result);
 for(const override of [{documents:undefined},{payroll:undefined},{employee:{id:'another'}},{payroll:[payroll({employee_id:'another'})]}]){
  state.result={...initial,...override};await f.button('مراجعة مراجع الرواتب المصروفة').onclick();assert.match(f.d.status.textContent,/لم يُعرض تقرير جودة/);assert.doesNotMatch(f.d.body.textContent,/نتيجة مراجعة مراجع الرواتب|لم يرصد هذا الفحص/);
 }
 state.result={...initial,payroll:[],documents:[]};await f.button('مراجعة مراجع الرواتب المصروفة').onclick();assert.match(f.d.body.textContent,/لم يرصد هذا الفحص المحدود/);f.dispose();assert.equal(f.d.body.textContent,'');
});
test('employee search accepts Arabic digits, diacritics and formatted phone fragments without extra requests',async()=>{
 const f=fixture([employee(),employee({id:'two',profile:{name_ar:'سالم',name_en:'Salem',phone:'12340000',job_ar:'حارس'}})]);await f.d.pending;
 f.search().value='احمد';f.search().oninput();assert.equal(f.cards().length,1);assert.match(f.cards()[0].textContent,/Ahmed Salem/);
 f.search().value='٥٥٥٥١٢٣٤';f.search().oninput();assert.equal(f.cards().length,1);assert.match(f.cards()[0].textContent,/Ahmed Salem/);f.search().value='۵۵۵۵۱۲۳۴';f.search().oninput();assert.equal(f.cards().length,1);assert.match(f.cards()[0].textContent,/Ahmed Salem/);assert.equal(f.calls.length,1);
});
test('an incomplete returned employee profile cannot break the directory or render undefined values',async()=>{
 const f=fixture([employee({profile:{name_ar:'موظف محفوظ',phone:null}})]);await f.d.pending;assert.doesNotMatch(f.d.status.textContent,/Cannot read|undefined/);assert.equal(f.cards().length,1);assert.doesNotMatch(f.cards()[0].textContent,/undefined|null/);
 f.search().value='محفوظ';assert.doesNotThrow(()=>f.search().oninput());assert.equal(f.cards().length,1);
});
test('disposing the employee dialog removes private rows and queued search cannot restore them',async()=>{
 const f=fixture([employee()]);await f.d.pending;const search=f.search();assert.match(f.d.body.textContent,/Ahmed Salem/);f.dispose();assert.equal(f.d.body.children.length,0);search.oninput();assert.equal(f.d.body.children.length,0);assert.equal(f.calls.length,1);
});

async function editor(){const f=fixture([]);await f.d.pending;await f.button('إضافة موظف / Add employee').onclick();return f;}
test('employee editor blocks accidental back navigation with raw unsaved text',async()=>{
 const f=await editor();f.find('الاسم').value='  موظف جديد  ';await f.button('الرجوع للدليل / Back').onclick();assert.equal(f.find('الاسم').value,'  موظف جديد  ');assert.equal(f.calls.length,1);assert.match(f.d.status.textContent,/غير محفوظة/);
 await f.button('تجاهل التعديلات والرجوع للدليل / Discard and return').onclick();assert.ok(f.search());assert.equal(f.calls.length,2);
});
test('checking a saved employee does not erase an unsaved editor',async()=>{
 const f=await editor();f.find('الاسم').value='مسودة باقية';await f.button('التحقق من الحفظ بعد انقطاع الاتصال / Check saved record').onclick();assert.equal(f.find('الاسم').value,'مسودة باقية');assert.doesNotMatch(f.d.status.textContent,/تم حفظ الموظف/);
});
test('unchanged employee editor can return to the directory',async()=>{
 const f=await editor();await f.button('الرجوع للدليل / Back').onclick();assert.ok(f.search());
});

test('unavailable saved properties remain selected and block employee saving until explicit removal',async()=>{
 const saved=employee({revision:2,property_ids:['available','missing']});
 const f=fixture([saved],{rpc:args=>args.p_action==='list'?{employees:[saved],properties:[{id:'available',name:'عقار متاح'}]}:{employee:saved,permissions:{edit:true},payroll:[],events:[],documents:[],audit:[]}});await f.d.pending;
 await f.button('فتح ملف أحْمَد سالم').onclick();await f.button('تعديل بيانات الموظف / Edit employee').onclick();
 const missing=f.find('عقار غير متاح حالياً — ألغِ اختياره قبل الحفظ');assert.ok(missing);assert.equal(missing.checked,true);
 const form=f.all().find(x=>x.tag==='form');form.onsubmit({preventDefault(){}});await f.d.pending;assert.equal(f.calls.filter(x=>x.p_action==='save_employee').length,0);assert.match(f.d.status.textContent,/غير متاح/);
 missing.checked=false;missing.onchange();assert.equal(missing.disabled,true);form.onsubmit({preventDefault(){}});await f.d.pending;assert.deepEqual(Array.from(f.calls.find(x=>x.p_action==='save_employee').p_data.property_ids),['available']);
});

test('document shortcuts select an employee and read only that employee without creating records',async()=>{
 for(const [icon,label] of [['📄','عقد عمل / Employment contract'],['🧾','سند راتب / Salary voucher'],['📁','مستندات الموظف / Employee documents'],['📅','السلف والإجازات / Advances and leave']]){
  const f=fixture([employee()]);await f.d.pending;
  await f.button(icon+' '+locale.t(label)).onclick();
  f.find('الموظف').value='employee-one';
  await f.button('فتح ملف الموظف').onclick();
  assert.deepEqual(f.calls.map(x=>x.p_action),['list','get']);
  assert.equal(f.calls[1].p_data.employee_id,'employee-one');
  assert.doesNotMatch(f.d.status.textContent,/not defined|Cannot read/);
 }
});
test('empty directory shortcuts offer adding an employee without making a document',async()=>{
 const f=fixture([]);await f.d.pending;
 await f.button('📄 '+locale.t('عقد عمل / Employment contract')).onclick();
 assert.ok(f.button('إضافة موظف / Add employee'));assert.equal(f.calls.length,1);
});

test('closing an employee editor protects raw unsaved input and discard clears the obsolete guard',async()=>{
 const f=await editor();assert.equal(f.d.beforeClose(),true);f.find('الاسم').value='  تعديل لم يحفظ  ';
 f.confirm(false);assert.equal(f.d.beforeClose(),false);assert.equal(f.find('الاسم').value,'  تعديل لم يحفظ  ');assert.equal(f.calls.length,1);f.confirm(true);assert.equal(f.d.beforeClose(),true);assert.equal(f.calls.length,1);
 await f.button('تجاهل التعديلات والرجوع للدليل / Discard and return').onclick();assert.equal(f.d.beforeClose,null);assert.ok(f.search());assert.equal(f.calls.filter(call=>call.p_action==='save_employee').length,0);
});

test('an unavailable linked account is retained until the manager explicitly changes or removes it',async()=>{
 const saved=employee({revision:2,user_id:'inactive-account',property_ids:['available']});
 const f=fixture([saved],{rpc:args=>args.p_action==='list'?{employees:[saved],properties:[{id:'available',name:'عقار متاح'}],members:[{user_id:'other-account',name:'حساب نشط'}],manager:true}:{employee:saved,permissions:{edit:true},payroll:[],events:[],documents:[],audit:[]}});await f.d.pending;
 await f.button('فتح ملف أحْمَد سالم').onclick();await f.button('تعديل بيانات الموظف / Edit employee').onclick();
 const account=f.find('ربط حساب الموظف / Linked login account');assert.equal(account.value,'inactive-account');assert.match(account.children.find(option=>option.value==='inactive-account').textContent,/غير متاح/);
 f.find('الاسم').value='اسم مصحح';const form=f.all().find(x=>x.tag==='form');form.onsubmit({preventDefault(){}});await f.d.pending;assert.equal(f.calls.filter(call=>call.p_action==='save_employee').length,0);assert.match(f.d.status.textContent,/إلغاء الربط صراحة/);assert.equal(account.value,'inactive-account');
 account.value='';form.onsubmit({preventDefault(){}});await f.d.pending;assert.equal(f.calls.find(call=>call.p_action==='save_employee').p_data.user_id,null);
});
