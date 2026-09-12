import test from 'node:test';
import assert from 'node:assert/strict';
import {openFinalGapCenter} from '../src/v267/pages/final-gap-center.js';

async function fixture({incompleteReadback=false,openingResponse=null,openingError=false}={}){
 const original={window:globalThis.window,document:globalThis.document};const calls=[];
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.value='';this.disabled=false;}
  get isConnected(){return this.parent?this.parent.isConnected:this.connected===true;}
  append(...nodes){for(const n of nodes){this.children.push(n);n.parent=this;}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  querySelectorAll(){return this.children.flatMap(n=>[n,...n.querySelectorAll()]);}
  setAttribute(k,v){this.attributes[k]=v;}
  addEventListener(){}showModal(){}close(){}
  remove(){this.parent.children=this.parent.children.filter(x=>x!==this);}
 }
 const data={tenants:[{id:'t1',name:'مستأجر الاختبار'},{id:'t2',name:'مستأجر آخر'}],properties:[{id:'p1',name:'عقار الاختبار'}],leases:[{id:'l1',tenant_id:'t1',contract_no:'L-1'},{id:'l2',tenant_id:'t2',contract_no:'L-2'}],payments:[{id:'pay1',reference:'R-1',amount:'10.000'}],accounts:[{id:'a1',property_id:'p1',kind:'bank',name:'حساب اختبار',masked_reference:'****1234',status:'active'}],ledger:[{id:'c1',tenant_id:'t1',direction:'credit',amount:'15.000',reason:'رصيد اختبار'}],preferences:[],postings:[],credit_allocations:[],cancellations:[],reserves:[],channels:[],ratings:[],collector_performance:[]};
 const client={rpc(name,args){if(name==='aqari_opening_balance_statement')return {abortSignal:async()=>{if(openingError)throw Error('Opening read failed');return {data:structuredClone(openingResponse)};}};assert.equal(name,'aqari_final_gap_register');calls.push(structuredClone(args));return {abortSignal:async()=>{
  if(args.p_action!=='list'){
   const key={allocate_credit:'credit_allocations',post_payment:'postings',account:'accounts'}[args.p_action];assert.ok(key);
   const p=structuredClone(args.p_data);if(!data[key].some(x=>x.id===p.id))data[key].push(incompleteReadback?{id:p.id}:{...p,amount:'amount'in p?Number(p.amount).toFixed(3):undefined});
  }
  // Simulate JSONB key ordering without substituting the actual form/session code.
  return {data:JSON.parse(JSON.stringify(data),(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).reverse()):v)};
 }};}};
 const body=new Element('body');body.connected=true;const user='u1',workspace='w1';
 globalThis.document={body,activeElement:null,createElement:t=>new Element(t),documentElement:{classList:{contains:()=>true}}};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'},AQARI_DATA_GATE:{scope:{userId:user,workspaceId:workspace}},AQARI_SUPABASE:{getClient:async()=>client,context:{user:{id:user},workspace:{id:workspace},membership:{user_id:user,workspace_id:workspace,is_active:true,role:'general_manager'}}},addEventListener(){},removeEventListener(){}};
 openFinalGapCenter();await new Promise(setImmediate);const dialog=body.children[0],elements=()=>dialog.querySelectorAll();
 const control=label=>{const group=elements().find(x=>x.children?.[0]?.tagName==='label'&&x.children[0].textContent===label);assert.ok(group,label);return group.children[1];};
 return {calls,data,control,elements,choose(action){const c=control('العملية');c.value=action;c.onchange();},submit:()=>elements().find(x=>x.tagName==='form').onsubmit({preventDefault(){}}),status:()=>elements().find(x=>x.attributes.role==='status')?.textContent,cleanup(){dialog.children[0].onclick();Object.assign(globalThis,original);}};
}

test('credit form offers only the saved tenant leases and verifies persisted amount after JSONB readback',async()=>{
 const f=await fixture();try{
  f.choose('allocate_credit');assert.deepEqual(f.control('العقد').children.map(x=>x.value),['l1']);
  assert.equal(f.elements().filter(x=>x.tagName==='textarea').length,0);
  f.control('شهر الاستحقاق').value='2026-02';f.control('المبلغ بالدينار').value='10.000';f.control('السبب').value='تخصيص اختبار';await f.submit();
  const p=f.calls.find(x=>x.p_action==='allocate_credit').p_data;
  assert.equal(p.period,'2026-02-01');assert.equal(p.lease_id,'l1');assert.equal(p.amount,10);assert.match(f.status(),/تم الحفظ وإعادة القراءة/);
 }finally{f.cleanup();}
});
test('an id without saved values cannot confirm credit allocation and retry preserves the operation id',async()=>{
 const f=await fixture({incompleteReadback:true});try{
  f.choose('allocate_credit');f.control('شهر الاستحقاق').value='2026-02';f.control('المبلغ بالدينار').value='10';f.control('السبب').value='تخصيص اختبار';await f.submit();assert.match(f.status(),/تعذر تأكيد/);
  await f.submit();const writes=f.calls.filter(x=>x.p_action==='allocate_credit');assert.equal(writes.length,2);assert.equal(writes[0].p_data.id,writes[1].p_data.id);
 }finally{f.cleanup();}
});
test('payment account form confirms the saved posting instead of comparing unrelated list counts',async()=>{
 const f=await fixture();try{f.choose('post_payment');f.control('السبب').value='ترحيل اختبار';await f.submit();const p=f.calls.find(x=>x.p_action==='post_payment').p_data;assert.equal(p.payment_id,'pay1');assert.equal(p.account_id,'a1');assert.match(f.status(),/تم الحفظ وإعادة القراءة/);}finally{f.cleanup();}
});
test('account form uses Arabic fields and saves the selected property and masked bank reference',async()=>{
 const f=await fixture();try{f.choose('account');f.control('اسم الحساب').value='حساب جديد';f.control('مرجع الحساب المحجوب').value='****7890';await f.submit();const p=f.calls.find(x=>x.p_action==='account').p_data;assert.equal(p.property_id,'p1');assert.equal(p.masked_reference,'****7890');assert.match(f.status(),/تم الحفظ وإعادة القراءة/);}finally{f.cleanup();}
});

test('financial archive renders server records, searches without writes, and refreshes newly saved records',async()=>{
 const f=await fixture();try{
  const search=f.control('بحث بالاسم أو العقد أو مرجع الحركة');search.value='حساب اختبار';search.oninput();
  assert.equal(f.elements().filter(x=>x.tagName==='details').length,1);
  const before=f.calls.length;search.value='غير موجود';search.oninput();assert.equal(f.elements().filter(x=>x.tagName==='details').length,0);assert.equal(f.calls.length,before);
  f.data.accounts.push({id:'a2',property_id:'p1',kind:'bank',name:'حساب جديد محفوظ',masked_reference:'****1111'});
  search.value='حساب جديد محفوظ';search.oninput();assert.equal(f.elements().filter(x=>x.tagName==='details').length,0);
  await f.elements().find(x=>x.textContent==='تحديث السجلات المحفوظة').onclick();
  assert.equal(f.elements().filter(x=>x.tagName==='details').length,1);assert.equal(f.calls.at(-1).p_action,'list');assert.match(f.status(),/تم تحديث/);
 }finally{f.cleanup();}
});
test('archived accounts cannot be selected for new postings and an existing no-message preference stays selected',async()=>{
 const f=await fixture();try{
  f.data.accounts.push({id:'archived',property_id:'p1',kind:'bank',name:'حساب مؤرشف',masked_reference:'****9876',status:'archived'});
  f.data.preferences.push({tenant_id:'t1',preferred_channel:'none'});
  await f.elements().find(x=>x.textContent==='تحديث السجلات المحفوظة').onclick();f.choose('post_payment');
  assert.deepEqual(f.control('الحساب أو الصندوق').children.map(x=>x.value),['a1']);
  f.choose('preference');assert.equal(f.control('وسيلة التواصل').value,'none');
 }finally{f.cleanup();}
});

test('opening positions stay visibly separate from confirmed live collections after concurrent feature merge',async()=>{
 const f=await fixture({openingResponse:{opening_entries:[],totals:{opening_debit:'40.000',opening_credit:'10.000',opening_net:'30.000',actual_collections:'100.000'}}});try{
  const summary=f.elements().find(x=>x.tagName==='p'&&x.textContent?.includes('افتتاحي مدين:'));
  assert.ok(summary);assert.match(summary.textContent,/صافي الافتتاح: 30\.000/);assert.match(summary.textContent,/التحصيل الفعلي — جميع الفترات: 100\.000/);
  assert.ok(f.control('بحث بالاسم أو العقد أو مرجع الحركة'));assert.equal(f.calls.filter(x=>x.p_action!=='list').length,0);
 }finally{f.cleanup();}
});
test('missing or invalid opening data cannot display fabricated zero totals or remove the saved archive',async()=>{
 for(const options of [{openingError:true},{openingResponse:{opening_entries:[],totals:{opening_debit:null,opening_credit:0,opening_net:0,actual_collections:'NaN'}}}]){
  const f=await fixture(options);try{assert.ok(f.elements().some(x=>x.textContent?.includes('تعذر استرجاع فصل الأرصدة الافتتاحية')));assert.ok(f.control('بحث بالاسم أو العقد أو مرجع الحركة'));assert.ok(!f.elements().some(x=>x.tagName==='p'&&x.textContent?.includes('افتتاحي مدين: 0.000')));}finally{f.cleanup();}
 }
});
