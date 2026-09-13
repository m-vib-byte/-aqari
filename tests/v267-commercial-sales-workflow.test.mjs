import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture(){
 const nodes=[],calls=[],rows=[],cleanups=[],paymentDesks=[];let id=0,closed=false;
 class Element{
  constructor(tag,text=''){this.tag=tag;this._text=text;this.children=[];this.value='';this.checked=false;this.disabled=false;this.hidden=false;this.isConnected=true;nodes.push(this);}
  append(...items){this.children.push(...items);if(this.tag==='select'&&!this.value)this.value=items[0]?.value||'';}
  detach(){this.isConnected=false;this.children.forEach(x=>x.detach());}
  replaceChildren(...items){this.children.forEach(x=>x.detach());this.children=[];this.append(...items);}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}set textContent(value){this._text=value;}
 }
 const node=(tag,text)=>new Element(tag,text),field=(text,input)=>{const label=node('label',text);label.append(input);return label;};
 const flags={lost:false,badAmount:false,badRate:false,badReadback:false,failedList:false,staleTerms:false};
 const leases=[{id:'l1',external_ref:'L1',contract_no:'C1',property_id:'p1',property_ref:'P1',property_name:'Property 1',sales_percentage:7.5,sales_rent_basis:'additional_to_base_rent',base_rent_due:100,terms_revision:1},{id:'l2',external_ref:'L2',contract_no:'C2',property_id:'p2',property_ref:'P2',property_name:'Property 2',sales_percentage:5,sales_rent_basis:'greater_of_base_or_percentage',base_rent_due:20,terms_revision:1}];
 const documents=[{id:'d1',title:'Property report 1',entity_type:'property',entity_ref:'P1'},{id:'d2',title:'Property report 2',entity_type:'property',entity_ref:'P2'},{id:'d3',title:'Lease report 1',entity_type:'lease',entity_ref:'L1'}];
 const session={bound:{workspace:'workspace'},check(){if(closed)throw Error('closed');},request:async p=>p,client:{rpc:async(name,args)=>{
  assert.equal(name,'aqari_commercial_sales');assert.equal(args.p_workspace_id,'workspace');calls.push({name,args:structuredClone(args)});const p=args.p_data;
  if(args.p_action==='list'){
   if(flags.failedList&&rows.length)throw Error('readback unavailable');
   const entries=structuredClone(rows);if(flags.badReadback&&entries[0])entries[0].lease_id='foreign-lease';
   return {month:p.month,leases,documents,entries};
  }
  if(args.p_action==='record'){
   if(flags.staleTerms)throw Object.assign(Error('SALES_TERMS_REVISION_CONFLICT'),{code:'40001'});
   const selected=leases.find(x=>x.id===p.lease_id),percentage=Number(p.gross_sales)*selected.sales_percentage/100,calculated=p.calculation_basis==='greater_of_base_or_percentage'?Math.max(percentage-selected.base_rent_due,0):percentage;
   let row=rows.find(x=>x.id===p.id);if(!row){row={...p,month:p.month+'-01',gross_sales:Number(p.gross_sales),sales_percentage:flags.badRate?8:selected.sales_percentage,amount:flags.badAmount?42.111:Number(calculated.toFixed(3)),period_start:p.month+'-01',period_end:p.month+'-31'};rows.push(row);}
   if(flags.lost)throw Error('connection lost after commit');return row;
  }
  if(args.p_action==='reverse'){
   const row=rows.find(x=>x.id===p.sale_id);row.reversal||={...p};return row.reversal;
  }
  throw Error('unexpected action');
 }}};
 const d={body:node('div'),status:node('p'),session,onDispose:f=>cleanups.push(f),async run(task){try{await task();}catch(error){d.status.textContent=error.message;}},close(){closed=true;cleanups.forEach(f=>f());}};
 const context={node,field,mountCommercialPaymentAllocations(d,container,{leases}){const desk={leases,disposed:false};paymentDesks.push(desk);return {dispose(){desk.disposed=true;container.replaceChildren();}};},mountCommercialCollections(){return {load:async()=>{}};},crypto:{randomUUID:()=> 'request-'+(++id)},Date,Error,BigInt};vm.createContext(context);
 vm.runInContext(fs.readFileSync('src/v267/pages/commercial-sales.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,''),context);context.mountCommercialSales(d,d.body);
 const button=label=>nodes.find(x=>x.isConnected&&x.tag==='button'&&x.textContent===label),control=label=>nodes.find(x=>x.isConnected&&x.tag==='label'&&x._text===label).children[0];
 const submit=async label=>{const btn=button(label),form=nodes.find(x=>x.isConnected&&x.tag==='form'&&x.children.includes(btn));await form.onsubmit({preventDefault(){}});};
 return {d,flags,calls,rows,control,button,submit,context,paymentDesks,async start(){control('شهر المبيعات').value='2026-08';await button('عرض استحقاقات الشهر').onclick();},fill(leaseId='l1'){control('العقد التجاري').value=leaseId;control('العقد التجاري').onchange();control('مبيعات الفترة د.ك').value='555.555';control('مبيعات الفترة د.ك').oninput();control('تقرير المبيعات المحفوظ').value=leaseId==='l1'?'d1':'d2';control('مرجع تقرير المبيعات').value='Synthetic report';control('راجعت تقرير المبيعات ونص العقد وأساس الاحتساب المعتمد.').checked=true;}};
}
test('commercial sales uses exact fils arithmetic, including Arabic digits and half-up rounding',()=>{
 const f=fixture();assert.equal(vm.runInContext("salesAmount('555.555','7.5')",f.context),'41.667');
 assert.equal(vm.runInContext("salesAmount('٠٫٠٠٥','10')",f.context),'0.001');
 assert.equal(vm.runInContext("salesAmount('999999999.999','100')",f.context),'999999999.999');
 assert.throws(()=>vm.runInContext("salesAmount('1.0001','7.5')",f.context));
 assert.throws(()=>vm.runInContext("salesAmount('-1','7.5')",f.context));
});
test('sales form filters report documents to the selected property and lease and requires review',async()=>{
 const f=fixture();await f.start();f.fill();assert.deepEqual(f.control('تقرير المبيعات المحفوظ').children.map(x=>x.value),['','d1','d3']);
 f.control('راجعت تقرير المبيعات ونص العقد وأساس الاحتساب المعتمد.').checked=false;await f.submit('اعتماد استحقاق المبيعات');assert.equal(f.rows.length,0);assert.match(f.d.status.textContent,/أكد مراجعة/);
 f.control('العقد التجاري').value='l2';f.control('العقد التجاري').onchange();assert.deepEqual(f.control('تقرير المبيعات المحفوظ').children.map(x=>x.value),['','d2']);
});
test('save recovers a lost response using the same request and independently reads back the ledger record',async()=>{
 const f=fixture();await f.start();f.fill();f.flags.lost=true;await f.submit('اعتماد استحقاق المبيعات');assert.equal(f.rows.length,1);assert.match(f.d.status.textContent,/connection lost/);
 f.control('مبيعات الفترة د.ك').value='999';f.flags.lost=false;await f.button('إعادة محاولة الحفظ والتحقق').onclick();
 assert.equal(f.rows.length,1);assert.equal(f.rows[0].gross_sales,555.555);assert.match(f.d.status.textContent,/تم اعتماد القيد/);
 const writes=f.calls.filter(x=>x.args.p_action==='record');assert.equal(writes.length,2);assert.deepEqual(writes[0].args.p_data,writes[1].args.p_data);assert.equal(f.calls.at(-1).args.p_action,'list');
});
test('successful write followed by unavailable readback keeps the retry and cannot claim success',async()=>{
 const f=fixture();await f.start();f.fill();f.flags.failedList=true;await f.submit('اعتماد استحقاق المبيعات');assert.match(f.d.status.textContent,/readback unavailable/);assert.equal(f.rows.length,1);assert.equal(f.button('إعادة محاولة الحفظ والتحقق').hidden,false);
 f.flags.failedList=false;await f.button('إعادة محاولة الحفظ والتحقق').onclick();assert.equal(f.rows.length,1);assert.match(f.d.status.textContent,/تم اعتماد القيد/);
});
test('wrong saved amount, rate or linked lease cannot be accepted as verified',async()=>{
 for(const flag of ['badAmount','badRate','badReadback']){const f=fixture();await f.start();f.fill();f.flags[flag]=true;await f.submit('اعتماد استحقاق المبيعات');assert.match(f.d.status.textContent,/لم تتطابق إعادة القراءة/);assert.equal(f.button('إعادة محاولة الحفظ والتحقق').hidden,false);}
});
test('a rolled-back stale-terms error releases the pending request for a fresh reviewed entry',async()=>{
 const f=fixture();await f.start();f.fill();f.flags.staleTerms=true;await f.submit('اعتماد استحقاق المبيعات');assert.equal(f.rows.length,0);assert.match(f.d.status.textContent,/تغيرت نسبة المبيعات/);assert.equal(f.button('إعادة محاولة الحفظ والتحقق').hidden,true);
 f.flags.staleTerms=false;await f.submit('اعتماد استحقاق المبيعات');assert.equal(f.rows.length,1);assert.equal(f.rows[0].id,'request-2');
});
test('reversal uses a separate immutable request and preserves the original debit display',async()=>{
 const f=fixture();await f.start();f.fill();await f.submit('اعتماد استحقاق المبيعات');f.control('سبب العكس').value='تقرير المبيعات بحاجة تصحيح';f.control('تاريخ القيد العكسي').value='2026-09-01';await f.submit('عكس الاستحقاق بقيد دائن');
 assert.equal(f.rows.length,1);assert.equal(f.rows[0].amount,41.667);assert.equal(f.rows[0].reversal.id,'request-2');assert.match(f.d.status.textContent,/تم اعتماد القيد/);assert.match(f.d.body.textContent,/معكوس/);
});
test('auth disposal clears sales records and prevents retry with a retained request',async()=>{
 const f=fixture();await f.start();f.fill();f.flags.lost=true;await f.submit('اعتماد استحقاق المبيعات');const retry=f.button('إعادة محاولة الحفظ والتحقق'),count=f.calls.length;f.d.close();assert.equal(f.d.body.textContent,'');await retry.onclick();assert.equal(f.calls.length,count);
});

test('greater-of contract uses the approved basis and verifies only the excess over base rent',async()=>{
 const f=fixture();await f.start();f.fill('l2');await f.submit('اعتماد استحقاق المبيعات');
 assert.equal(f.rows[0].calculation_basis,'greater_of_base_or_percentage');assert.equal(f.rows[0].amount,7.778);assert.match(f.d.status.textContent,/تم اعتماد القيد/);
 assert.equal(vm.runInContext("salesAdjustment('100','5','greater_of_base_or_percentage','20')",f.context),'0.000');
 assert.equal(vm.runInContext("salesAdjustment('555.555','7.5','additional_to_base_rent','100')",f.context),'41.667');
});
test('the payment allocation desk is rebuilt for the selected month and disposed with the dialog',async()=>{
 const f=fixture();await f.start();assert.equal(f.paymentDesks.length,1);assert.equal(f.paymentDesks[0].leases.length,2);
 f.control('شهر المبيعات').value='2026-07';f.control('شهر المبيعات').onchange();assert.equal(f.paymentDesks[0].disposed,true);
 await f.button('عرض استحقاقات الشهر').onclick();assert.equal(f.paymentDesks.length,2);assert.equal(f.paymentDesks[1].disposed,false);
 f.d.close();assert.equal(f.paymentDesks[1].disposed,true);
});
