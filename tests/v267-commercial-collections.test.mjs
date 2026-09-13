import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture({standalone=false}={}){
 const nodes=[],calls=[],rows=[],cleanups=[];let nextId=0,closed=false,running=false;
 class Element{
  constructor(tag,text=''){this.tag=tag;this._text=text;this.children=[];this.value='';this.checked=false;this.disabled=false;this.hidden=false;this.isConnected=true;nodes.push(this);}
  append(...items){this.children.push(...items);if(this.tag==='select'&&!this.value)this.value=items[0]?.value||'';}
  detach(){this.isConnected=false;this.children.forEach(x=>x.detach());}
  replaceChildren(...items){this.children.forEach(x=>x.detach());this.children=[];this.value=this.tag==='select'?'':this.value;this.append(...items);}
  setAttribute(name,value){this[name]=value;}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}set textContent(value){this._text=value;}
 }
 const node=(tag,text)=>new Element(tag,text),field=(label,control)=>{const group=node('label',label);group.append(control);return group;};
 const date='2026-09-12';
 class Clock extends Date {constructor(...args){super(...(args.length?args:[date+'T10:00:00Z']));}toLocaleDateString(){return date;}}
 const access={user_id:'u1',workspace_id:'w1',role:'general_manager',features:{commercial_collections:true},permissions:{finance:{read:true},documents:{read:true}}};
 const flags={lost:false,failGet:false,failList:false,absentOnce:false,deny:false,canManage:true,accountChanged:false,writeError:null,badGet:null,badList:null,legacyLease:null,badLegacy:null};
 const leases=[{id:'l1',contract_no:'Commercial 1',external_ref:'L1',property_id:'p1',property_ref:'P1',property_name:'Property 1'},{id:'l2',contract_no:'Commercial 2',external_ref:'L2',property_id:'p2',property_ref:'P2',property_name:'Property 2'}];
 const accounts=[{id:'cash1',property_id:'p1',kind:'cashbox',name:'صندوق العقار ١',masked_reference:'****1111',currency:'KWD',revision:2},{id:'bank1',property_id:'p1',kind:'bank',name:'بنك العقار ١',masked_reference:'****2222',currency:'KWD',revision:3},{id:'cash2',property_id:'p2',kind:'cashbox',name:'صندوق العقار ٢',masked_reference:'****3333',currency:'KWD',revision:1}];
 const documents=[{id:'doc1',title:'إثبات قبض العقار ١',entity_type:'property',entity_ref:'P1'},{id:'doc2',title:'إثبات قبض العقار ٢',entity_type:'property',entity_ref:'P2'},{id:'leaseDoc1',title:'إثبات قبض العقد ١',entity_type:'lease',entity_ref:'L1'}];
 const sales=[{id:'s1',lease_id:'l1',month:'2026-08-01',amount:'100.001',period_end:'2026-08-31',reference:'Report 1',reversed:false},{id:'s2',lease_id:'l2',month:'2026-08-01',amount:'80.000',period_end:'2026-08-31',reference:'Report 2',reversed:false},{id:'sReversed',lease_id:'l1',month:'2026-07-01',amount:'8.000',period_end:'2026-07-31',reference:'Reversed report',reversed:true}];
 const format=n=>(n/1000).toFixed(3),paid=id=>rows.filter(r=>!r.reversal).flatMap(r=>r.allocations).filter(a=>a.sale_id===id).reduce((n,a)=>n+Math.round(Number(a.amount)*1000),0);
 const session={bound:{user:'u1',workspace:'w1',role:'general_manager'},check(){if(closed)throw Error('session closed');},request:async p=>p,client:{rpc:async(name,args)=>{
  calls.push({name,args:structuredClone(args)});
  if(flags.deny)throw Object.assign(Error('ACCESS_DENIED'),{code:'42501'});
  assert.equal(args.p_workspace_id,'w1');if(name==='aqari_workspace_access')return structuredClone(access);
  assert.equal(name,'aqari_commercial_collections');const p=args.p_data;
  if(args.p_action==='list'){
   if(flags.failList)throw Error('list unavailable');
   const availableLeases=structuredClone(leases).map(lease=>({...lease,collection_mode:lease.id===flags.legacyLease?'legacy_payment_allocation':'independent_collection'}));
   if(p.lease_id&&p.lease_id===flags.legacyLease){
    const blocked={as_of:p.as_of,mode:'legacy_payment_allocation',unavailable_reason:'COMMERCIAL_COLLECTION_LEGACY_MODE_REQUIRED',can_manage:false,leases:availableLeases,accounts:[],documents:[],statement:null,sales:[],collections:[]};
    if(flags.badLegacy)flags.badLegacy(blocked);return blocked;
   }
   const current=structuredClone(rows.filter(r=>r.collection.lease_id===p.lease_id)),leaseSales=sales.filter(s=>s.lease_id===p.lease_id);
   const charges=leaseSales.reduce((n,s)=>n+Math.round(Number(s.amount)*1000),0),reversed=leaseSales.filter(s=>s.reversed).reduce((n,s)=>n+Math.round(Number(s.amount)*1000),0),collected=current.reduce((n,r)=>n+Math.round(Number(r.collection.amount)*1000),0),collectionReversed=current.filter(r=>r.reversal).reduce((n,r)=>n+Math.round(Number(r.collection.amount)*1000),0);
   const result={as_of:p.as_of,mode:'independent_collection',unavailable_reason:null,can_manage:flags.canManage,leases:availableLeases,accounts:structuredClone(accounts),documents:structuredClone(documents),statement:p.lease_id?{lease_id:p.lease_id,as_of:p.as_of,charge_total:format(charges),reversed_charge_total:format(reversed),collected_total:format(collected),collection_reversed_total:format(collectionReversed),balance:format(charges-reversed-collected+collectionReversed),lines:[]}:null,sales:leaseSales.map(s=>({...s,outstanding:format(Math.round(Number(s.amount)*1000)-paid(s.id))})),collections:current};
   if(current.length&&flags.badList)flags.badList(result);return result;
  }
  if(args.p_action==='get'){
   if(flags.failGet)throw Error('get unavailable');
   const result=structuredClone(rows.find(r=>r.collection.id===p.id)||{collection:null,allocations:[],reversal:null});if(result.collection&&flags.badGet)flags.badGet(result);return result;
  }
  if(args.p_action==='record'){
   if(flags.writeError)throw Object.assign(Error(flags.writeError.message),flags.writeError);
   if(flags.accountChanged)throw Object.assign(Error('COMMERCIAL_COLLECTION_ACCOUNT_CHANGED'),{code:'40001'});
   if(flags.absentOnce){flags.absentOnce=false;throw Error('connection lost before commit');}
   let result=rows.find(r=>r.collection.id===p.id);
   if(!result){result={collection:{...structuredClone(p),account_snapshot:structuredClone(accounts.find(a=>a.id===p.account_id)),source_checksum:'a'.repeat(64),request_data:structuredClone(p)},allocations:structuredClone(p.allocations),reversal:null};rows.push(result);}
   if(flags.lost)throw Error('connection lost after commit');return structuredClone(result);
  }
  if(args.p_action==='reverse'){
   const result=rows.find(r=>r.collection.id===p.collection_id);result.reversal||={...structuredClone(p),amount:result.collection.amount,request_data:structuredClone(p)};
   if(flags.lost)throw Error('connection lost after commit');return structuredClone(result);
  }
  throw Error('unexpected action');
 }}};
 const d={body:node('div'),status:node('p'),session,onDispose:f=>cleanups.push(f),get closed(){return closed;},close(){closed=true;cleanups.forEach(f=>f());},async run(task){
  if(running||closed)return;running=true;
  const controls=nodes.filter(x=>x.isConnected&&['button','input','select'].includes(x.tag)),disabled=controls.map(x=>x.disabled);controls.forEach(x=>x.disabled=true);
  try{await task();}catch(e){if(e.code==='42501')d.close();else d.status.textContent=e.message;}finally{running=false;if(!closed)controls.forEach((x,i)=>{if(x.isConnected)x.disabled=disabled[i];});}
 }};
 const context={node,field,Date:Clock,Error,BigInt,crypto:{randomUUID:()=>`operation-${++nextId}`},createDialog:()=>d};vm.createContext(context);
 const source=fs.readFileSync('src/v267/components/commercial-collections.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
 const component=vm.runInContext(`(()=>{${source}\nreturn {mountCommercialCollections,requireCommercialCollectionsAccess};})()`,context);Object.assign(context,component);
 if(standalone)vm.runInContext(fs.readFileSync('src/v267/pages/commercial-sales.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,''),context);
 else component.mountCommercialCollections(d,d.body);
 const button=label=>nodes.find(x=>x.isConnected&&x.tag==='button'&&x.textContent===label),control=label=>nodes.find(x=>x.isConnected&&x.tag==='label'&&x._text===label)?.children[0];
 const submit=async label=>{const btn=button(label),form=nodes.find(x=>x.isConnected&&x.tag==='form'&&x.children.includes(btn));await form.onsubmit({preventDefault(){}});};
 return {d,access,flags,calls,rows,button,control,submit,context,nodes,async start(){await button('عرض التحصيل التجاري').onclick();await this.selectLease('l1');},async selectLease(id){control('عقد التحصيل التجاري').value=id;await control('عقد التحصيل التجاري').onchange();},fill(value='٤١٫٦٦٧'){
  control('طريقة التحصيل المثبتة').value='cash';control('طريقة التحصيل المثبتة').onchange();
  control('استحقاق نسبة المبيعات').value='s1';control('استحقاق نسبة المبيعات').onchange();control('حساب أو صندوق التحصيل').value='cash1';control('مستند إثبات القبض').value='doc1';control('مبلغ التحصيل د.ك').value=value;control('تاريخ التحصيل').value=date;control('مرجع القبض أو التحويل').value='Synthetic receipt';control('راجعت المستند وقبض المبلغ، وهذا التحصيل التجاري مستقل عن الإيجار.').checked=true;
 },text:()=>d.body.textContent};
}

test('collection choices follow the selected lease property and method, with reviewed source linkage',async()=>{
 const f=fixture();await f.start();f.fill();
 assert.deepEqual(f.control('مستند إثبات القبض').children.map(x=>x.value),['','doc1','leaseDoc1']);
 assert.deepEqual(f.control('حساب أو صندوق التحصيل').children.map(x=>x.value),['','cash1']);
 assert.deepEqual(f.control('استحقاق نسبة المبيعات').children.map(x=>x.value),['','s1']);
 f.control('راجعت المستند وقبض المبلغ، وهذا التحصيل التجاري مستقل عن الإيجار.').checked=false;await f.submit('تسجيل تحصيل موثق');assert.equal(f.rows.length,0);
 f.control('طريقة التحصيل المثبتة').value='bank_transfer';f.control('طريقة التحصيل المثبتة').onchange();assert.deepEqual(f.control('حساب أو صندوق التحصيل').children.map(x=>x.value),['','bank1']);
 await f.selectLease('l2');f.control('طريقة التحصيل المثبتة').value='cash';f.control('طريقة التحصيل المثبتة').onchange();assert.deepEqual(f.control('مستند إثبات القبض').children.map(x=>x.value),['','doc2']);assert.deepEqual(f.control('حساب أو صندوق التحصيل').children.map(x=>x.value),['','cash2']);
 assert.equal(f.calls.filter(x=>x.args.p_action==='record').length,0);
});

test('a lease with legacy receipt allocations keeps the chooser available without a misleading zero balance or independent write',async()=>{
 const f=fixture();f.flags.legacyLease='l2';await f.start();f.fill();
 const save=f.button('تسجيل تحصيل موثق'),retainedForm=f.nodes.find(x=>x.isConnected&&x.tag==='form'&&x.children.includes(save));
 await f.selectLease('l2');assert.equal(f.d.closed,false);assert.match(f.text(),/هذا العقد يستخدم مسار تخصيص الإيصالات القائم/);assert.match(f.text(),/التحصيل المستقل غير متاح لهذا العقد/);
 assert.equal(f.button('تسجيل تحصيل موثق'),undefined);assert.equal(f.control('مبلغ التحصيل د.ك'),undefined);assert.equal(f.control('عقد التحصيل التجاري').disabled,false);assert.equal(f.button('عرض التحصيل التجاري').disabled,false);
 assert.doesNotMatch(f.text(),/0\.000|المتبقي التجاري|لا يوجد تحصيل تجاري محفوظ/);
 await retainedForm.onsubmit({preventDefault(){}});assert.equal(f.calls.filter(x=>['record','reverse'].includes(x.args.p_action)).length,0);
 await f.selectLease('l1');assert.ok(f.button('تسجيل تحصيل موثق'));assert.doesNotMatch(f.text(),/التحصيل المستقل غير متاح لهذا العقد/);f.fill();await f.submit('تسجيل تحصيل موثق');assert.equal(f.rows.length,1);assert.equal(f.rows[0].collection.lease_id,'l1');assert.match(f.text(),/تم حفظ التحصيل والتحقق/);
});

test('legacy mode accepts only the explicit blocked shape and cannot hide a malformed independent statement',async()=>{
 const corruptions=[r=>{r.can_manage=true;},r=>{r.statement={balance:'0.000'};},r=>{r.accounts=[{id:'unexpected'}];},r=>{r.unavailable_reason=null;},r=>{r.mode='independent_collection';},r=>{r.leases[1].collection_mode='independent_collection';}];
 for(const corrupt of corruptions){const f=fixture();f.flags.legacyLease='l2';f.flags.badLegacy=corrupt;await f.start();await f.selectLease('l2');assert.match(f.d.status.textContent,/لم تتطابق إعادة القراءة/);assert.equal(f.button('تسجيل تحصيل موثق'),undefined);assert.doesNotMatch(f.text(),/0\.000|المتبقي التجاري/);}
});

test('mode and cutoff write rejections explain the required route or reconciliation without retaining a rolled-back draft',async()=>{
 for(const [code,message] of [['COMMERCIAL_COLLECTION_LEGACY_MODE_REQUIRED',/مسار تخصيص الإيصالات القائم/],['COMMERCIAL_COLLECTION_INDEPENDENT_MODE_REQUIRED',/يستخدم التحصيل التجاري المستقل/],['COMMERCIAL_COLLECTION_CUTOFF_REVIEW_REQUIRED',/مطابقة عند تاريخ الإقفال/]]){
  const f=fixture();await f.start();f.fill();f.flags.writeError={code:'23514',status:400,message:code};await f.submit('تسجيل تحصيل موثق');assert.equal(f.rows.length,0);assert.match(f.text(),message);assert.equal(f.button('عرض التحصيل التجاري').disabled,false);assert.equal(f.button('التحقق من التحصيل السابق').hidden,true);
 }
});

test('fils precision, Arabic digits, partial collection and independent exact readback',async()=>{
 const f=fixture();await f.start();f.fill();await f.submit('تسجيل تحصيل موثق');
 assert.equal(f.rows[0].collection.amount,'41.667');assert.equal(f.rows[0].allocations[0].amount,'41.667');assert.equal(f.rows[0].collection.request_data.account_revision,2);
 assert.match(f.text(),/58\.334 د.ك/);assert.match(f.text(),/تم حفظ التحصيل والتحقق/);
 assert.deepEqual(f.calls.slice(-3).map(x=>x.args.p_action),['record','get','list']);
 for(const value of ['0','-1','0.0001','9999999999999','58.335']){f.fill(value);await f.submit('تسجيل تحصيل موثق');assert.equal(f.rows.length,1);}
});

test('forged account or document from another property is rejected before a write',async()=>{
 for(const [label,id] of [['حساب أو صندوق التحصيل','cash2'],['مستند إثبات القبض','doc2']]){const f=fixture();await f.start();f.fill();f.control(label).value=id;await f.submit('تسجيل تحصيل موثق');assert.equal(f.rows.length,0);assert.match(f.d.status.textContent,/حساب العقار ومستند القبض/);}
});

test('documented bank receipt stores its account revision and remains a record without a bank execution call',async()=>{
 const f=fixture();await f.start();f.fill('10.001');f.control('طريقة التحصيل المثبتة').value='bank_transfer';f.control('طريقة التحصيل المثبتة').onchange();f.control('حساب أو صندوق التحصيل').value='bank1';f.control('راجعت المستند وقبض المبلغ، وهذا التحصيل التجاري مستقل عن الإيجار.').checked=true;
 await f.submit('تسجيل تحصيل موثق');assert.equal(f.rows[0].collection.method,'bank_transfer');assert.equal(f.rows[0].collection.account_id,'bank1');assert.equal(f.rows[0].collection.request_data.account_revision,3);assert.match(f.text(),/لا ينفذ دفعًا بنكيًا/);
 assert.ok(f.calls.every(x=>['aqari_workspace_access','aqari_commercial_collections'].includes(x.name)));
});

test('lost write response is recovered through get and list without repeating the mutation',async()=>{
 const f=fixture();await f.start();f.fill();f.flags.lost=true;await f.submit('تسجيل تحصيل موثق');
 assert.equal(f.rows.length,1);assert.equal(f.calls.filter(x=>x.args.p_action==='record').length,1);assert.match(f.text(),/تم حفظ التحصيل والتحقق/);
});

test('unavailable proof retains immutable request, locks native-restored inputs, and cannot announce success',async()=>{
 const f=fixture();await f.start();f.fill();f.flags.failGet=true;f.flags.lost=true;await f.submit('تسجيل تحصيل موثق');
 assert.match(f.text(),/لم يتأكد الحفظ/);assert.equal(f.control('مبلغ التحصيل د.ك').disabled,true);assert.equal(f.button('تسجيل تحصيل موثق').disabled,true);assert.equal(f.control('عقد التحصيل التجاري').disabled,true);
 f.control('مبلغ التحصيل د.ك').value='99.999';await f.button('التحقق من التحصيل السابق').onclick();assert.equal(f.calls.filter(x=>x.args.p_action==='record').length,1);
 f.flags.failGet=false;f.flags.failList=true;await f.button('التحقق من التحصيل السابق').onclick();assert.doesNotMatch(f.text(),/تم حفظ التحصيل والتحقق/);
 f.flags.failList=false;await f.button('التحقق من التحصيل السابق').onclick();assert.equal(f.rows[0].collection.amount,'41.667');assert.equal(f.calls.filter(x=>x.args.p_action==='record').length,1);assert.match(f.text(),/تم حفظ التحصيل والتحقق/);
});

test('proven absence enables only a retry of the exact original request and allocation',async()=>{
 const f=fixture();await f.start();f.fill();f.flags.absentOnce=true;await f.submit('تسجيل تحصيل موثق');assert.equal(f.rows.length,0);assert.match(f.text(),/لم تُسجل العملية/);
 f.control('مبلغ التحصيل د.ك').value='99.999';f.control('مرجع القبض أو التحويل').value='changed draft';await f.button('إعادة محاولة الطلب نفسه').onclick();
 const writes=f.calls.filter(x=>x.args.p_action==='record');assert.equal(writes.length,2);assert.deepEqual(writes[0].args.p_data,writes[1].args.p_data);assert.equal(f.rows.length,1);assert.equal(f.rows[0].collection.amount,'41.667');
});

test('incorrect account snapshot, document, checksum, allocation or request cannot pass get proof',async()=>{
 const corruptions=[r=>{r.collection.account_snapshot.property_id='p2';},r=>{r.collection.account_snapshot.revision=999;},r=>{r.collection.source_document_id='doc2';},r=>{r.collection.source_checksum='invalid';},r=>{r.allocations[0].amount='41.666';},r=>{r.collection.request_data.reference='other source';},r=>{r.collection.lease_id='l2';}];
 for(const corrupt of corruptions){const f=fixture();await f.start();f.fill();f.flags.badGet=corrupt;await f.submit('تسجيل تحصيل موثق');assert.match(f.text(),/لم تتطابق إعادة القراءة/);assert.equal(f.button('التحقق من التحصيل السابق').hidden,false);assert.doesNotMatch(f.text(),/تم حفظ التحصيل والتحقق/);}
});

test('list proof rejects missing record, changed allocation and inconsistent statement totals',async()=>{
 const corruptions=[r=>{r.collections=[];},r=>{r.collections[0].allocations[0].sale_id='s2';},r=>{r.statement.balance='0.000';},r=>{r.statement.lease_id='l2';},r=>{r.collections[0].collection.source_checksum='b'.repeat(64);}];
 for(const corrupt of corruptions){const f=fixture();await f.start();f.fill();f.flags.badList=corrupt;await f.submit('تسجيل تحصيل موثق');assert.match(f.text(),/لم تتطابق إعادة القراءة/);assert.doesNotMatch(f.text(),/تم حفظ التحصيل والتحقق/);}
});

test('revision rejection clears rolled-back request and requires a fresh read before another reviewed write',async()=>{
 const f=fixture();await f.start();f.fill();f.flags.accountChanged=true;await f.submit('تسجيل تحصيل موثق');assert.equal(f.rows.length,0);assert.match(f.text(),/تغيرت مراجعة الحساب/);assert.equal(f.button('تسجيل تحصيل موثق'),undefined);
 f.flags.accountChanged=false;await f.button('عرض التحصيل التجاري').onclick();f.fill();await f.submit('تسجيل تحصيل موثق');assert.equal(f.rows[0].collection.id,'operation-2');assert.match(f.text(),/تم حفظ التحصيل والتحقق/);
});

test('confirmed PostgreSQL closed-period rejection releases the draft for a new reviewed date',async()=>{
 const f=fixture();await f.start();f.fill();f.control('تاريخ التحصيل').value='2026-08-31';
 f.flags.writeError={code:'P0001',status:400,message:'الفترة المالية مقفلة؛ لا يمكن تسجيل أو تغيير عملية فيها.'};
 await f.submit('تسجيل تحصيل موثق');assert.equal(f.rows.length,0);assert.match(f.text(),/الفترة المالية مقفلة. اختر تاريخًا في فترة مفتوحة/);assert.equal(f.button('التحقق من التحصيل السابق').hidden,true);assert.equal(f.button('عرض التحصيل التجاري').disabled,false);
 assert.equal(f.calls.filter(x=>x.args.p_action==='get').length,0,'a proven transaction rejection does not masquerade as a lost response');
 f.flags.writeError=null;await f.button('عرض التحصيل التجاري').onclick();f.fill();await f.submit('تسجيل تحصيل موثق');
 assert.equal(f.rows[0].collection.id,'operation-2');assert.equal(f.rows[0].collection.occurred_on,'2026-09-12');assert.match(f.text(),/تم حفظ التحصيل والتحقق/);
});

test('unknown P0001 and a network-like closed-period message retain independent readback and the original request',async()=>{
 const errors=[{code:'P0001',status:400,message:'another backend failure'},{code:'P0001',message:'الفترة المالية مقفلة؛ لا يمكن تسجيل أو تغيير عملية فيها.'},{code:'P0001',status:503,message:'الفترة المالية مقفلة؛ لا يمكن تسجيل أو تغيير عملية فيها.'}];
 for(const error of errors){const f=fixture();await f.start();f.fill();f.flags.writeError=error;await f.submit('تسجيل تحصيل موثق');
  assert.equal(f.calls.at(-1).args.p_action,'get');assert.equal(f.button('إعادة محاولة الطلب نفسه').hidden,false);assert.equal(f.button('عرض التحصيل التجاري').disabled,true);
  f.flags.writeError=null;await f.button('إعادة محاولة الطلب نفسه').onclick();const writes=f.calls.filter(x=>x.args.p_action==='record');assert.equal(writes.length,2);assert.deepEqual(writes[0].args.p_data,writes[1].args.p_data);assert.equal(f.rows.length,1);
 }
});

test('full reversal has an independent request, preserves original receipt and restores commercial balance',async()=>{
 const f=fixture();await f.start();f.fill();await f.submit('تسجيل تحصيل موثق');
 const original=structuredClone(f.rows[0].collection);f.control('سبب عكس التحصيل').value='إثبات قبض يحتاج تصحيحًا';f.control('راجعت عكس المبلغ كاملًا مع إبقاء الأصل.').checked=true;f.flags.lost=true;
 await f.submit('تأكيد عكس التحصيل');assert.deepEqual(f.rows[0].collection,original);assert.equal(f.rows[0].reversal.id,'operation-2');assert.equal(f.rows[0].reversal.amount,'41.667');assert.match(f.text(),/100\.001 د.ك/);assert.match(f.text(),/تم عكس التحصيل والتحقق/);assert.match(f.text(),/الأصل محفوظ/);assert.equal(f.calls.filter(x=>x.args.p_action==='reverse').length,1);
});

test('reversal proof rejects a changed reason and retains the exact operation for recovery',async()=>{
 const f=fixture();await f.start();f.fill();await f.submit('تسجيل تحصيل موثق');f.control('سبب عكس التحصيل').value='تعديل مستند الإثبات';f.control('راجعت عكس المبلغ كاملًا مع إبقاء الأصل.').checked=true;
 f.flags.badGet=r=>{r.reversal.reason='different reason';};await f.submit('تأكيد عكس التحصيل');assert.match(f.text(),/لم تتطابق إعادة القراءة/);assert.doesNotMatch(f.text(),/تم عكس التحصيل والتحقق/);
 f.flags.badGet=null;await f.button('التحقق من التحصيل السابق').onclick();assert.equal(f.calls.filter(x=>x.args.p_action==='reverse').length,1);assert.match(f.text(),/تم عكس التحصيل والتحقق/);
});

test('server capability keeps the financial reader view read only',async()=>{
 const f=fixture();f.flags.canManage=false;await f.start();assert.equal(f.button('تسجيل تحصيل موثق'),undefined);assert.match(f.text(),/التسجيل والعكس متاحان للمدير/);
});

test('auth denial during recovery clears cached records and retained handlers cannot issue calls',async()=>{
 const f=fixture();await f.start();f.fill();f.flags.failGet=true;await f.submit('تسجيل تحصيل موثق');const retry=f.button('التحقق من التحصيل السابق');f.flags.deny=true;await retry.onclick();const count=f.calls.length;
 assert.equal(f.d.closed,true);assert.equal(f.text(),'');await retry.onclick();assert.equal(f.calls.length,count);
});

test('standalone entry validates feature, identity, role and document permission before mounting records',async()=>{
 for(const change of [a=>{a.features.commercial_collections=false;},a=>{a.user_id='u2';},a=>{a.workspace_id='w2';},a=>{a.role='accountant';},a=>{a.permissions.documents.read=false;},a=>{a.permissions.finance.read=false;}]){
  const f=fixture({standalone:true});change(f.access);f.context.openCommercialSales();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.d.closed,true);assert.equal(f.calls.filter(x=>x.name==='aqari_commercial_collections').length,0);assert.equal(f.text(),'');
 }
 const f=fixture({standalone:true});f.context.openCommercialSales();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.d.closed,false);assert.ok(f.button('عرض استحقاقات الشهر'));assert.ok(f.button('عرض التحصيل التجاري'));assert.ok(f.calls.some(x=>x.args.p_action==='list'));
});

test('independent collection requires choosing its payment method explicitly',async()=>{
 const f=fixture();await f.start();assert.equal(f.control('طريقة التحصيل المثبتة').value,'');assert.deepEqual(f.control('حساب أو صندوق التحصيل').children.map(x=>x.value),['']);
 f.fill();f.control('طريقة التحصيل المثبتة').value='';f.control('طريقة التحصيل المثبتة').onchange();await f.submit('تسجيل تحصيل موثق');
 assert.equal(f.rows.length,0);assert.equal(f.calls.some(x=>x.args.p_action==='record'),false);
});
