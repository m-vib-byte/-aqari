const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/v267/pages/employees.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
function fixture(employees,options={}){
 const callbacks=[],calls=[];
 class Element{
  constructor(tag,text=''){this.tag=tag;this.children=[];this._text=text;this.value='';this.style={};}
  setAttribute(name,value){this[name]=value;}
  append(...nodes){this.children.push(...nodes);}
  querySelectorAll(selector){const all=this.children.flatMap(x=>[x,...x.querySelectorAll('*')]);return selector==='*'?all:all.filter(x=>x.tag==='input'&&(!selector.includes(':checked')||x.checked));}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
  set textContent(value){this._text=value;this.children=[];}
 }
 const node=(tag,text)=>new Element(tag,text),field=(label,control)=>{const group=node('div');group.label=label;group.append(control);return group;};
 const d={body:node('div'),status:node('p'),closed:false,onDispose:fn=>callbacks.push(fn),session:{bound:{workspace:'w'},client:{rpc(name,args){assert.equal(name,'aqari_hr');calls.push(args);return structuredClone(options.rpc?options.rpc(args):args.p_action==='get'?{employee:employee({id:args.p_data.employee_id,revision:1,property_ids:[],profile:{name_ar:'محفوظ',name_en:'Saved'}}),permissions:{},payroll:[],events:[],documents:[],audit:[]}:{employees,properties:[],manager:false});}},request:query=>query},run(work){if(d.closed)return;d.pending=Promise.resolve().then(work).catch(error=>{d.status.textContent=error.message;});return d.pending;}};
 vm.runInNewContext(source+'\nopenEmployees();',{createDialog:()=>d,node,field,createPrivateUrls:()=>({clear(){}}),console,crypto:{randomUUID:()=> 'new-employee'},PROFILE_FIELDS:[['name_ar','الاسم']],money:Number,currentMonth:()=> '2026-09'});
 const descendants=el=>[el,...el.children.flatMap(descendants)];
 return {d,calls,find:label=>descendants(d.body).find(x=>x.label===label)?.children[0],button:label=>descendants(d.body).find(x=>x.tag==='button'&&x.textContent===label),all:()=>descendants(d.body),search:()=>descendants(d.body).find(x=>x.tag==='input'&&x.type==='search'),cards:()=>descendants(d.body).filter(x=>x.tag==='article'),dispose(){d.closed=true;callbacks.forEach(fn=>fn());}};
}
const employee=overrides=>({id:'employee-one',status:'active',profile:{name_ar:'أحْمَد سالم',name_en:'Ahmed Salem',phone:'00965 5555-1234',job_ar:'محاسب'},...overrides});
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

test('employee directory combines property, status and Arabic search with accurate scoped counts',async()=>{
 const rows=[employee({id:'a',property_ids:['p1'],status:'active'}),employee({id:'b',property_ids:['p1','p2'],status:'leave'}),employee({id:'c',property_ids:['p2'],status:'inactive'})];
 const f=fixture(rows,{rpc:()=>({employees:rows,properties:[{id:'p1',name:'العقار الأول'},{id:'p2',name:'العقار الثاني'}]})});await f.d.pending;
 assert.match(f.d.body.textContent,/الملفات المتاحة لك: 3 · نشط: 1 · في إجازة: 1 · غير نشط: 1/);
 const status=f.find('تصفية حسب الحالة / Filter by status'),property=f.find('تصفية حسب العقار / Filter by property');
 property.value='p1';property.onchange();assert.equal(f.cards().length,2);status.value='leave';status.onchange();assert.equal(f.cards().length,1);
 f.search().value='احمد';f.search().oninput();assert.equal(f.cards().length,1);assert.match(f.d.body.textContent,/نتائج البحث: 1 من 3/);
 f.search().value='غير موجود';f.search().oninput();assert.equal(f.cards().length,0);assert.match(f.d.body.textContent,/نتائج البحث: 0 من 3/);
 f.button('مسح البحث والفلاتر / Clear filters').onclick();assert.equal(f.cards().length,3);assert.equal(f.calls.length,1);
 const reset=f.button('مسح البحث والفلاتر / Clear filters');f.dispose();property.onchange();reset.onclick();assert.equal(f.d.body.children.length,0);
});

test('employee paging preserves filters and page on return, clamps after refresh, and ignores detached controls',async()=>{
 let rows=Array.from({length:45},(_,i)=>employee({id:'employee-'+i,property_ids:['p'],profile:{name_ar:'موظف '+i}}));
 const f=fixture(rows,{rpc:args=>args.p_action==='list'?{employees:rows,properties:[{id:'p',name:'العقار'}]}:{employee:rows.find(e=>e.id===args.p_data.employee_id),permissions:{},payroll:[],events:[],documents:[],audit:[]}});await f.d.pending;
 assert.equal(f.cards().length,20);assert.equal(f.button('السابق / Previous').disabled,true);
 const property=f.find('تصفية حسب العقار / Filter by property');property.value='p';property.onchange();f.search().value='موظف';f.search().oninput();
 f.button('التالي / Next').onclick();assert.equal(f.cards().length,20);assert.match(f.d.body.textContent,/عرض 21–40 · الصفحة 2 من 3/);assert.equal(f.calls.length,1);
 const staleNext=f.button('التالي / Next'),staleSearch=f.search();await f.button('فتح ملف موظف 20').onclick();await f.button('الرجوع للدليل / Back').onclick();
 assert.equal(f.search().value,'موظف');assert.equal(f.find('تصفية حسب العقار / Filter by property').value,'p');assert.match(f.d.body.textContent,/الصفحة 2 من 3/);
 staleNext.onclick();staleSearch.value='old';staleSearch.oninput();await f.button('تحديث من قاعدة البيانات / Refresh').onclick();assert.equal(f.search().value,'موظف');assert.match(f.d.body.textContent,/الصفحة 2 من 3/);
 f.button('التالي / Next').onclick();assert.equal(f.cards().length,5);assert.equal(f.button('التالي / Next').disabled,true);
 rows=rows.slice(0,3);await f.button('تحديث من قاعدة البيانات / Refresh').onclick();assert.equal(f.cards().length,3);assert.match(f.d.body.textContent,/عرض 1–3 · الصفحة 1 من 1/);assert.equal(f.button('التالي / Next').disabled,true);
});
test('refresh retains an unavailable property filter without broadening the employee list',async()=>{
 let properties=[{id:'p1',name:'الأول'},{id:'p2',name:'الثاني'}];const rows=[employee({property_ids:['p1']})];
 const f=fixture(rows,{rpc:()=>({employees:rows,properties})});await f.d.pending;const property=f.find('تصفية حسب العقار / Filter by property');property.value='p2';property.onchange();assert.equal(f.cards().length,0);
 properties=[properties[0]];await f.button('تحديث من قاعدة البيانات / Refresh').onclick();assert.equal(f.find('تصفية حسب العقار / Filter by property').value,'p2');assert.match(f.d.body.textContent,/العقار المحدد غير متاح حالياً/);assert.equal(f.cards().length,0);
 f.button('مسح البحث والفلاتر / Clear filters').onclick();assert.equal(f.cards().length,1);
});
