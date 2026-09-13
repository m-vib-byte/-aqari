import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture(){
 const nodes=[],calls=[],cleanups=[];let seq=0,closed=false,lost=false;
 const allocation={value:null,reversal:null},flags={independent:new Set(),reversed:new Set(),invalidMode:false,modeUnavailable:false};
 class Element{
  constructor(tag,text=''){this.tag=tag;this._text=text;this.children=[];this.value='';this.disabled=false;this.hidden=false;this.required=false;this.isConnected=true;nodes.push(this);}
  append(...items){this.children.push(...items);if(this.tag==='select'&&!this.value)this.value=items[0]?.value||'';}
  replaceChildren(...items){this.children.forEach(x=>x.detach?.());this.children=[];this.append(...items);}
  detach(){this.isConnected=false;for(const x of this.children)x.detach?.();}
  setAttribute(name,value){this[name]=value;}
  querySelectorAll(selector){const tags=new Set(selector.split(','));const out=[];const walk=x=>{for(const c of x.children||[]){if(tags.has(c.tag))out.push(c);walk(c);}};walk(this);return out;}
  get textContent(){return this._text+this.children.map(x=>x.textContent||'').join('');}
  set textContent(value){this._text=String(value);}
 }
 const node=(tag,text)=>new Element(tag,text),field=(text,control)=>{const label=node('label',text);label.append(control);return label;};
 const contextData=(id='l1')=>{
  const active=allocation.value&&!allocation.reversal?30000n:0n;
  return {
   lease_id:id,
   statement:{lease_id:id,commercial_due_total:'30.000',commercial_paid_total:active? '30.000':'0.000',commercial_balance:active?'0.000':'30.000',sales:[{
    id:'s1',lease_id:id,month:'2026-08-01',amount:'30.000',paid_amount:active?'30.000':'0.000',reversal:null,
    allocations:allocation.value?[{id:allocation.value.id,sale_id:'s1',payment_id:'p1',amount:'30.000',payment_reference:'R-1',receipt_cancelled:false,reversal:allocation.reversal?structuredClone(allocation.reversal):null}]:[]
   }]},
   payments:[{id:'p1',reference:'R-1',amount:'100.000',paid_at:'2026-08-31',period:'2026-08-01',status:'paid',payment_method:'cash',allocated_amount:active?'30.000':'0.000',available_amount:active?'70.000':'100.000'}]
  };
 };
 const session={bound:{workspace:'workspace'},check(){if(closed)throw Error('closed');},request:async value=>value,client:{rpc:async(name,args)=>{
  calls.push({name,args:structuredClone(args)});
  if(name==='aqari_commercial_collections'){
   if(flags.modeUnavailable)throw Object.assign(Error('missing function'),{code:'PGRST202'});
   const id=args.p_data.lease_id,legacy=!!allocation.value&&!flags.independent.has(id),asOf=args.p_data.as_of;
   return {as_of:asOf,mode:legacy?'legacy_payment_allocation':'independent_collection',unavailable_reason:legacy?'COMMERCIAL_COLLECTION_LEGACY_MODE_REQUIRED':null,can_manage:!legacy,
    leases:[{id,collection_mode:legacy?'legacy_payment_allocation':'independent_collection'}],accounts:[],documents:[],sales:[],
    statement:legacy?null:{lease_id:flags.invalidMode?'foreign-lease':id,as_of:asOf,lines:[]},
    collections:flags.independent.has(id)?[{collection:{id:'independent-1',lease_id:id},reversal:flags.reversed.has(id)?{id:'reversal-1'}:null}]:[]};
  }
  if(name==='aqari_commercial_payment_context')return structuredClone(contextData(args.p_lease_id));
  assert.equal(name,'aqari_commercial_payment_allocations');assert.equal(args.p_workspace_id,'workspace');
  if(args.p_action==='allocate'){
   if(!allocation.value)allocation.value={id:args.p_data.id,sale_id:args.p_data.sale_id,payment_id:args.p_data.payment_id,amount:args.p_data.amount};
   assert.deepEqual(structuredClone(args.p_data),allocation.value);
   if(lost)throw Error('connection lost after commit');return {...structuredClone(allocation.value),lease_id:'l1'};
  }
  if(args.p_action==='reverse'){
   allocation.reversal||={id:args.p_data.id,allocation_id:args.p_data.allocation_id,occurred_on:args.p_data.occurred_on,reason:args.p_data.reason};
   return structuredClone(allocation.reversal);
  }
  throw Error('unexpected action');
 }}};
 const d={status:node('p'),session,onDispose:f=>cleanups.push(f),async run(task){try{return await task();}catch(error){d.status.textContent=error.message;}},close(){closed=true;for(const f of cleanups)f();}};
 const context={node,field,crypto:{randomUUID:()=>`allocation-${++seq}`},Date,Error,BigInt};vm.createContext(context);
 vm.runInContext(fs.readFileSync('src/v267/components/commercial-payment-allocations.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,''),context);
 const root=node('section');const mounted=context.mountCommercialPaymentAllocations(d,root,{leases:[{id:'l1',contract_no:'C-1',property_name:'Property 1'},{id:'l2',contract_no:'C-2',property_name:'Property 2'}]});
 const button=text=>nodes.find(x=>x.isConnected&&x.tag==='button'&&x.textContent===text);
 const control=label=>nodes.find(x=>x.isConnected&&x.tag==='label'&&x._text===label)?.children[0];
 const submit=async text=>{const b=button(text),form=nodes.find(x=>x.isConnected&&x.tag==='form'&&x.children.includes(b));assert.ok(form);await form.onsubmit({preventDefault(){}});};
 async function load(){control('العقد المراد تسويته').value='l1';await button('عرض تسوية العقد').onclick();}
 return {d,root,calls,allocation,flags,context,button,control,submit,load,mounted,setLost:value=>{lost=value;}};
}

test('commercial payment money parser is exact to fils and accepts Arabic digits',()=>{
 const f=fixture();assert.equal(vm.runInContext("commercialMoney('١٠٠٫١٢٥')",f.context),100125n);assert.equal(vm.runInContext("commercialMoneyText(70125n)",f.context),'70.125');assert.throws(()=>vm.runInContext("commercialMoney('1.0001')",f.context));
});

test('allocation uses the available payment balance and requires exact context readback',async()=>{
 const f=fixture();await f.load();assert.match(f.root.textContent,/المتبقي: 30.000/);f.control('الدفعة').value='p1';f.control('الدفعة').onchange();assert.equal(f.control('المبلغ المخصص د.ك').value,'30.000');await f.submit('تخصيص دفعة للمبيعات');
 assert.equal(f.allocation.value.amount,'30.000');assert.match(f.root.textContent,/تم تخصيص الدفعة/);assert.match(f.root.textContent,/المسدد: 30.000/);
 const writes=f.calls.filter(x=>x.name==='aqari_commercial_payment_allocations'&&x.args.p_action==='allocate');assert.equal(writes.length,1);assert.equal(f.calls.at(-1).name,'aqari_commercial_payment_context');
});

test('lost allocation response reuses the same request id and cannot claim success before readback',async()=>{
 const f=fixture();await f.load();f.control('الدفعة').value='p1';f.control('الدفعة').onchange();f.setLost(true);await f.submit('تخصيص دفعة للمبيعات');assert.match(f.d.status.textContent,/connection lost/);assert.equal(f.button('إعادة محاولة تخصيص السداد').hidden,false);
 const first=f.calls.find(x=>x.name==='aqari_commercial_payment_allocations').args.p_data;f.setLost(false);await f.button('إعادة محاولة تخصيص السداد').onclick();const writes=f.calls.filter(x=>x.name==='aqari_commercial_payment_allocations'&&x.args.p_action==='allocate');assert.equal(writes.length,2);assert.deepEqual(writes[0].args.p_data,writes[1].args.p_data);assert.equal(writes[1].args.p_data.id,first.id);assert.match(f.root.textContent,/تم تخصيص الدفعة/);
});

test('reversal is append-only and verified by a fresh statement',async()=>{
 const f=fixture();await f.load();f.control('الدفعة').value='p1';f.control('الدفعة').onchange();await f.submit('تخصيص دفعة للمبيعات');f.control('سبب عكس التخصيص').value='Synthetic correction';f.control('تاريخ عكس التخصيص').value='2026-09-12';await f.submit('عكس تخصيص السداد');
 assert.equal(f.allocation.reversal.allocation_id,f.allocation.value.id);assert.match(f.root.textContent,/تم عكس تخصيص السداد/);assert.match(f.root.textContent,/المتبقي: 30.000/);assert.equal(f.calls.at(-1).name,'aqari_commercial_payment_context');
});

test('invalid context arithmetic is rejected before any write',async()=>{
 const f=fixture();const original=f.d.session.client.rpc;f.d.session.client.rpc=async(name,args)=>{const value=await original(name,args);if(name==='aqari_commercial_payment_context')value.payments[0].available_amount='99.000';return value;};await f.load();assert.match(f.d.status.textContent,/أرصدة الدفعات المتاحة/);assert.equal(f.calls.some(x=>x.name==='aqari_commercial_payment_allocations'),false);
});

test('dispose removes the reconciliation desk and blocks retained actions',async()=>{
 const f=fixture();await f.load();const load=f.button('عرض تسوية العقد'),before=f.calls.length;f.mounted.dispose();assert.equal(f.root.textContent,'');await load.onclick();assert.equal(f.calls.length,before);
});

test('independent collections and their reversals block only that contract without displaying a false unpaid balance',async()=>{
 for(const reversed of [false,true]){
  const f=fixture();f.flags.independent.add('l1');if(reversed)f.flags.reversed.add('l1');await f.load();
  assert.match(f.root.textContent,/يستخدم التحصيل التجاري المستقل/);assert.doesNotMatch(f.root.textContent,/المتبقي:|30\.000/);assert.equal(f.button('تخصيص دفعة للمبيعات'),undefined);assert.equal(f.control('العقد المراد تسويته').disabled,false);
  assert.equal(f.calls.some(x=>x.name==='aqari_commercial_payment_context'),false);
  f.control('العقد المراد تسويته').value='l2';f.control('العقد المراد تسويته').onchange();await f.button('عرض تسوية العقد').onclick();assert.ok(f.button('تخصيص دفعة للمبيعات'));assert.doesNotMatch(f.root.textContent,/يستخدم التحصيل التجاري المستقل/);
 }
});
test('a route change before submission is rechecked and cannot mix an independent receipt with an allocation',async()=>{
 const f=fixture();await f.load();f.control('الدفعة').value='p1';f.control('الدفعة').onchange();f.flags.independent.add('l1');await f.submit('تخصيص دفعة للمبيعات');
 assert.equal(f.allocation.value,null);assert.equal(f.calls.some(x=>x.name==='aqari_commercial_payment_allocations'),false);assert.match(f.d.status.textContent,/يستخدم التحصيل التجاري المستقل/);assert.equal(f.button('إعادة محاولة تخصيص السداد').hidden,true);
});
test('unverified route clears the old form and rejects retained handlers without a write',async()=>{
 for(const flag of ['invalidMode','modeUnavailable']){
  const f=fixture();await f.load();const save=f.button('تخصيص دفعة للمبيعات'),descendants=node=>[node,...node.children.flatMap(descendants)],retainedForm=descendants(f.root).find(node=>node.tag==='form'&&node.children.includes(save));f.control('الدفعة').value='p1';f.control('الدفعة').onchange();
  f.flags[flag]=true;await f.button('عرض تسوية العقد').onclick();assert.equal(f.button('تخصيص دفعة للمبيعات'),undefined);assert.doesNotMatch(f.root.textContent,/المتبقي:/);
  assert.equal(f.calls.some(x=>x.name==='aqari_commercial_payment_allocations'),false);assert.match(f.d.status.textContent,flag==='modeUnavailable'?/تفعيل تحديث قاعدة البيانات/:/التحقق من مسار/);await retainedForm.onsubmit({preventDefault(){}});assert.equal(f.calls.some(x=>x.name==='aqari_commercial_payment_allocations'),false);
 }
});
