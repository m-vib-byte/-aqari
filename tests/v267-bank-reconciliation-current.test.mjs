import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const page=readFileSync(new URL('../src/v267/pages/bank-reconciliation.js',import.meta.url),'utf8');
const installer=readFileSync(new URL('../scripts/install-v267-bank-reconciliation.mjs',import.meta.url),'utf8');

test('unknown transfers stay unmatched and UI never promises automatic matching',()=>{
 assert.match(page,/stateLabel\(item\.state\)/);
 assert.match(page,/حفظ كتحويل غير مطابق/);
 assert.match(page,/لن تربطه المنصة تلقائياً بأي مستأجر أو عقد أو عقار أو دفعة/);
 assert.match(page,/لا توجد مطابقة تلقائية أو تقريبية/);
 assert.match(page,/response\?\.autoMatched!==false/);
});

test('explicit matching requires a selected authoritative payment, reason and readback',()=>{
 assert.match(page,/paymentId:payment\.value/);
 assert.match(page,/reason:text\(reason\.value\)/);
 assert.match(page,/response\?\.record\?\.state!=='reconciled'/);
 assert.match(page,/Number\(response\?\.record\?\.revision\)!==Number\(current\.revision\)\+1/);
 assert.match(page,/إعادة إلى غير مطابق/);
});

test('financial register integration is bounded and fail-closed on moved anchor',()=>{
 assert.match(installer,/financial-register\.js/);
 assert.match(installer,/V267 bank reconciliation integration anchor not found/);
 assert.match(installer,/openBankReconciliation/);
 assert.match(installer,/مطابقة التحويلات البنكية/);
});

function fixture(initialState='unmatched',options={}){
 class Element{constructor(tag,text=''){this.tag=tag;this.children=[];this._text=text;this.value='';}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=[];this.append(...items);}get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}set textContent(value){this._text=value;this.children=[];}}
 const node=(tag,text)=>new Element(tag,text),field=(label,control)=>{const el=node('label');el.label=label;el.append(control);return el;};
 const storage=options.storage??new Map();const sessionStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>{if(options.storageError)throw Error('storage unavailable');storage.set(k,v);},removeItem:k=>storage.delete(k)};
 const prompts=[];let answer=false;
 const state={skipPersist:false,corrupt:null,badEnvelope:false,listError:false},calls=[];
 let row={id:'transfer-one',state:initialState,revision:3,paymentId:initialState==='reconciled'?'payment-one':null,amount:options.amount??'12.125',bankSource:'BANK',externalId:'EXT-1',transferDate:'2026-10-01',bankReference:'REF-1'};
 if(options.row)row=structuredClone(options.row);
 const rpc=async(name,args)=>{
  assert.equal(name,'aqari_bank_reconciliation');assert.equal(args.p_workspace_id,'workspace-one');calls.push(structuredClone(args));
  if(args.p_action==='list'){
   if(state.listError&&calls.some(c=>c.p_action!=='list'))throw Error('read unavailable');
   const readRow=state.corrupt&&calls.some(c=>c.p_action!=='list')?{...row,...state.corrupt}:row;
   return {workspace_id:'workspace-one',user_id:'user-one',canWrite:true,autoMatch:false,transfers:options.rows??[structuredClone(readRow)],candidates:options.candidates??[{paymentId:'payment-one',amount:options.amount??'12.125',reference:'PAY-REF'}],events:[]};
  }
  if(args.p_action==='ingest'){
   if(state.ingestError)throw state.ingestError;
   const next={...args.p_data,id:'new-transfer',state:'unmatched',paymentId:null,revision:1};
   if(!state.skipPersist)row=next;if(state.loseReply)throw Error('reply lost');
   return {workspace_id:state.badEnvelope?'other-workspace':'workspace-one',user_id:'user-one',autoMatched:false,record:{id:next.id,state:'unmatched',payment_id:null,revision:1}};
  }
  assert.ok(['reconcile','reopen'].includes(args.p_action));
  const next={...row,revision:row.revision+1,state:args.p_action==='reconcile'?'reconciled':'unmatched',paymentId:args.p_action==='reconcile'?args.p_data.paymentId:null};
  if(state.matchError)throw state.matchError;
  if(!state.skipPersist)row=next;if(state.loseMatchReply)throw Error('match reply lost');
  return {workspace_id:state.badEnvelope?'other-workspace':'workspace-one',user_id:'user-one',autoMatched:false,record:{id:next.id,state:next.state,payment_id:next.paymentId,revision:next.revision}};
 };
 const d={setBeforeClose(fn){this.beforeClose=fn;},setBeforeUnload(fn){this.beforeUnload=fn;},async requestClose(){if(!this.beforeClose||await this.beforeClose()!==false)this.closed=true;},body:node('div'),status:node('p'),session:{bound:{workspace:'workspace-one',user:'user-one'},client:{rpc},request:x=>x,check(){}},run(fn){d.pending=Promise.resolve().then(fn).catch(e=>{d.status.textContent=e.message;});return d.pending;}};
 vm.runInNewContext(page.replace(/^import .*;$/gm,'').replace(/\bexport /g,'')+'\nopenBankReconciliation();',{crypto:webcrypto,TextEncoder,sessionStorage,node,field,createDialog:()=>d,translateStatic:x=>x,visibleMessage:(s,v)=>s.replace(/\{(\w+)\}/g,(_,k)=>v[k]),window:{prompt:()=> 'تصحيح موثق',confirm:message=>{prompts.push(message);return answer;}},console});
 const all=e=>[e,...e.children.flatMap(all)],button=label=>all(d.body).find(x=>x.tag==='button'&&x.textContent===label),control=label=>all(d.body).find(x=>x.label===label)?.children[0];
 const submit=async()=>{all(d.body).find(x=>x.tag==='form').onsubmit({preventDefault(){}});await d.pending;};
 return {d,state,calls,prompts,confirm(value){answer=value;},button,control,submit,storage,saved:()=>structuredClone(row),async ingest(){await button('+ إدخال تحويل وارد').onclick();for(const [label,value] of [['مصدر/بنك الكشف','BANK'],['المعرف الخارجي للتحويل','EXT-NEW'],['تاريخ التحويل','2026-10-01'],['المبلغ','12.125'],['مرجع البنك','NEW-REF'],['اسم المرسل كما ورد','Sender'],['آخر/جزء آمن من الحساب','1234'],['البيان','Saved memo']])control(label).value=value;},async match(){await button('مطابقة صريحة').onclick();control('الدفعة البنكية المطابقة').value='payment-one';control('سبب المطابقة').value='سبب موثق';await submit();}};
}
test('bank matching succeeds only after the exact saved revision and payment are independently read',async()=>{
 const f=fixture();await f.d.pending;await f.match();assert.match(f.d.status.textContent,/تمت المطابقة الصريحة/);assert.deepEqual(f.calls.map(c=>c.p_action),['list','list','reconcile','list']);assert.match(f.d.body.textContent,/payment-one/);
});
test('bank matching acknowledgement cannot prove persistence when the saved list is unchanged or contradictory',async()=>{
 for(const corrupt of [null,{paymentId:'other-payment'},{revision:5},{amount:'12.126'},{externalId:'OTHER'},{bankReference:'OTHER'},{id:'other-transfer'}]){
  const f=fixture();await f.d.pending;if(corrupt)f.state.corrupt=corrupt;else f.state.skipPersist=true;
  await f.match();assert.match(f.d.status.textContent,/لم تتأكد مطابقة التحويل المحفوظ/);assert.doesNotMatch(f.d.status.textContent,/تمت المطابقة الصريحة/);assert.equal(f.calls.filter(c=>c.p_action==='reconcile').length,1);
 }
});
test('bank matching rejects a foreign response envelope and a failed readback without claiming success',async()=>{
 for(const key of ['badEnvelope','listError']){const f=fixture();await f.d.pending;f.state[key]=true;await f.match();assert.doesNotMatch(f.d.status.textContent,/تمت المطابقة الصريحة/);assert.equal(f.calls.filter(c=>c.p_action==='reconcile').length,1);}
});
test('bank reopening independently verifies the saved unmatched state and cleared payment',async()=>{
 for(const corrupt of [null,{paymentId:'payment-one'},{state:'reconciled'},{revision:3}]){
  const f=fixture('reconciled');await f.d.pending;f.state.corrupt=corrupt;await f.button('إعادة إلى غير مطابق').onclick();
  if(corrupt)assert.match(f.d.status.textContent,/لم تتأكد مطابقة التحويل المحفوظ/);else assert.match(f.d.status.textContent,/أعيد التحويل إلى قائمة غير المطابق/);
  assert.deepEqual(f.calls.map(c=>c.p_action),['list','list','reopen','list']);
 }
});
test('bank ingest independently verifies all submitted fields before claiming saved unmatched transfer',async()=>{
 const f=fixture();await f.d.pending;await f.ingest();await f.submit();assert.match(f.d.status.textContent,/تم حفظ التحويل كغير مطابق/);assert.deepEqual(f.calls.map(c=>c.p_action),['list','list','list','ingest','list']);assert.match(f.d.body.textContent,/EXT-NEW/);
});
test('unverified bank ingest keeps its fields and locks repeated writes and back navigation',async()=>{
 for(const corrupt of [null,{amount:'12.126'},{senderName:'wrong'},{senderAccountHint:'wrong'},{memo:'wrong'},{transferDate:'2026-10-02'},{revision:2},{paymentId:'payment-one'},{id:'different-id'}]){
  const f=fixture();await f.d.pending;await f.ingest();if(corrupt)f.state.corrupt=corrupt;else f.state.skipPersist=true;await f.submit();assert.match(f.d.status.textContent,/لم تتأكد مطابقة التحويل المحفوظ/);assert.equal(f.control('المعرف الخارجي للتحويل').value,'EXT-NEW');assert.equal(f.button('حفظ كتحويل غير مطابق').disabled,true);
  await f.submit();await f.button('رجوع').onclick();assert.equal(f.calls.filter(c=>c.p_action==='ingest').length,1);assert.ok(f.control('المعرف الخارجي للتحويل'));
 }
});
test('lost bank ingest response recovers by reading without resending the transfer',async()=>{
 const f=fixture();await f.d.pending;await f.ingest();f.state.loseReply=true;await f.submit();assert.match(f.d.status.textContent,/reply lost/);await f.button('التحقق من التحويل المحفوظ').onclick();assert.match(f.d.status.textContent,/تم حفظ التحويل كغير مطابق/);assert.equal(f.calls.filter(c=>c.p_action==='ingest').length,1);
});
test('failed bank ingest readback stays locked until explicit successful recovery',async()=>{
 const f=fixture();await f.d.pending;await f.ingest();f.state.listError=true;await f.submit();assert.equal(f.button('حفظ كتحويل غير مطابق').disabled,true);await f.button('التحقق من التحويل المحفوظ').onclick();assert.doesNotMatch(f.d.status.textContent,/تم حفظ التحويل/);f.state.listError=false;await f.button('التحقق من التحويل المحفوظ').onclick();assert.match(f.d.status.textContent,/تم حفظ التحويل/);assert.equal(f.calls.filter(c=>c.p_action==='ingest').length,1);
});
test('existing bank source and external ID block duplicate ingest before any write',async()=>{
 const f=fixture();await f.d.pending;await f.ingest();f.control('المعرف الخارجي للتحويل').value='EXT-1';await f.submit();assert.match(f.d.status.textContent,/يوجد تحويل محفوظ/);assert.equal(f.calls.filter(c=>c.p_action==='ingest').length,0);
});
test('definite validation or MFA rejection unlocks bank input but transport errors do not',async()=>{
 for(const error of [Object.assign(Error('validation'),{code:'22023'}),Object.assign(Error('MFA_REQUIRED'),{code:'42501',status:403}),Error('transport')]){
  const f=fixture();await f.d.pending;await f.ingest();f.state.ingestError=error;await f.submit();assert.equal(f.button('حفظ كتحويل غير مطابق').disabled,error.message==='transport');assert.equal(f.control('المبلغ').value,'12.125');
 }
});

test('bank candidate selection distinguishes adjacent fils at large decimal amounts',async()=>{
 const f=fixture('unmatched',{amount:'99999999999999.999',candidates:[{paymentId:'exact',amount:'99999999999999.999'},{paymentId:'different',amount:'99999999999999.998'}]});await f.d.pending;
 assert.match(f.d.body.textContent,/99999999999999\.999/);
 await f.button('مطابقة صريحة').onclick();assert.deepEqual(f.control('الدفعة البنكية المطابقة').children.map(x=>x.value),['','exact']);
});
test('bank readback rejects a one-fils change hidden by floating point rounding',async()=>{
 const f=fixture('unmatched',{amount:'99999999999999.999'});await f.d.pending;f.state.corrupt={amount:'99999999999999.998'};await f.match();assert.match(f.d.status.textContent,/لم تتأكد مطابقة التحويل المحفوظ/);
});
test('bank candidate selection rejects invalid or imprecise numeric amounts',async()=>{
 for(const amount of [null,'invalid',99999999999999.99]){
  const f=fixture('unmatched',{amount:amount===null?'invalid':amount,candidates:[{paymentId:'bad',amount}]});await f.d.pending;await f.button('مطابقة صريحة').onclick();assert.deepEqual(f.control('الدفعة البنكية المطابقة').children.map(x=>x.value),['']);
 }
});
test('bank matching accepts equivalent exact decimal scales',async()=>{
 const f=fixture('unmatched',{amount:'12.1'});await f.d.pending;f.state.corrupt={amount:'12.100'};await f.match();assert.match(f.d.status.textContent,/تمت المطابقة الصريحة/);
});

test('uncertain matching blocks another write and recovers by read only',async()=>{
 const f=fixture();await f.d.pending;f.state.loseMatchReply=true;await f.match();assert.match(f.d.status.textContent,/match reply lost/);assert.equal(f.button('اعتماد المطابقة الصريحة').disabled,true);
 await f.submit();await f.button('رجوع').onclick();assert.ok(f.control('الدفعة البنكية المطابقة'));assert.equal(f.calls.filter(c=>c.p_action==='reconcile').length,1);
 await f.button('التحقق من المطابقة المحفوظة').onclick();assert.match(f.d.status.textContent,/تمت المطابقة الصريحة/);assert.equal(f.calls.filter(c=>c.p_action==='reconcile').length,1);
});
test('matching recovery keeps the submitted payment even if the control changes',async()=>{
 const f=fixture();await f.d.pending;f.state.loseMatchReply=true;await f.match();f.control('الدفعة البنكية المطابقة').value='other';await f.button('التحقق من المطابقة المحفوظة').onclick();assert.match(f.d.status.textContent,/تمت المطابقة الصريحة/);
});
test('contradictory matching recovery remains locked without claiming success',async()=>{
 const f=fixture();await f.d.pending;f.state.corrupt={paymentId:'other'};await f.match();await f.button('التحقق من المطابقة المحفوظة').onclick();assert.match(f.d.status.textContent,/لم تتأكد مطابقة التحويل المحفوظ/);await f.submit();assert.equal(f.calls.filter(c=>c.p_action==='reconcile').length,1);
});
test('definite matching rejection unlocks inputs while transport failure retains the lock',async()=>{
 for(const error of [Object.assign(Error('validation'),{code:'22023'}),Object.assign(Error('MFA_REQUIRED'),{code:'42501',status:403}),Error('transport')]){
 const f=fixture();await f.d.pending;f.state.matchError=error;await f.match();assert.equal(f.button('اعتماد المطابقة الصريحة').disabled,error.message==='transport');}
});
test('matching failed readback recovers after read service returns without another write',async()=>{
 const f=fixture();await f.d.pending;f.state.listError=true;await f.match();await f.button('التحقق من المطابقة المحفوظة').onclick();assert.doesNotMatch(f.d.status.textContent,/تمت المطابقة الصريحة/);f.state.listError=false;await f.button('التحقق من المطابقة المحفوظة').onclick();assert.match(f.d.status.textContent,/تمت المطابقة الصريحة/);assert.equal(f.calls.filter(c=>c.p_action==='reconcile').length,1);
});

test('matching marker survives dialog recreation and recovers without a write',async()=>{
 const f=fixture();await f.d.pending;f.state.loseMatchReply=true;await f.match();assert.equal(f.storage.size,1);const marker=JSON.parse([...f.storage.values()][0]);assert.deepEqual(Object.keys(marker).sort(),['digest','id','version']);
 const g=fixture('unmatched',{storage:f.storage,row:f.saved()});await g.d.pending;assert.equal(g.button('+ إدخال تحويل وارد'),undefined);await g.button('التحقق من المطابقة السابقة').onclick();assert.match(g.d.status.textContent,/تم التحقق من المطابقة السابقة/);assert.equal(g.storage.size,0);assert.ok(g.calls.every(c=>c.p_action==='list'));
});
test('reload recovery rejects a contradictory saved payment and stays blocked',async()=>{
 const f=fixture();await f.d.pending;f.state.loseMatchReply=true;await f.match();const g=fixture('unmatched',{storage:f.storage,row:{...f.saved(),paymentId:'wrong'}});await g.d.pending;await g.button('التحقق من المطابقة السابقة').onclick();assert.match(g.d.status.textContent,/لم تتأكد المطابقة السابقة/);assert.equal(g.storage.size,1);assert.equal(g.button('+ إدخال تحويل وارد'),undefined);
});
test('unavailable marker storage prevents matching before any write',async()=>{
 const f=fixture('unmatched',{storageError:true});await f.d.pending;await f.match();assert.match(f.d.status.textContent,/storage unavailable/);assert.equal(f.calls.filter(c=>c.p_action==='reconcile').length,0);
});
test('malformed stored marker fails closed before banking actions appear',async()=>{
 const storage=new Map([['aqari:v267:bank-match-pending:'+JSON.stringify(['workspace-one','user-one']),'{broken']]);const f=fixture('unmatched',{storage});await f.d.pending;assert.equal(f.button('+ إدخال تحويل وارد'),undefined);assert.equal(f.calls.length,0);
});
test('successful matching and definite rejection clear the reload marker',async()=>{
 for(const rejected of [false,true]){const f=fixture();await f.d.pending;if(rejected)f.state.matchError=Object.assign(Error('validation'),{code:'22023'});await f.match();assert.equal(f.storage.size,0);}
});

test('lost reopen response recovers in the current dialog without repeating the write',async()=>{
 const f=fixture('reconciled');await f.d.pending;f.state.loseMatchReply=true;await f.button('إعادة إلى غير مطابق').onclick();assert.equal(f.storage.size,1);assert.equal(f.button('إعادة إلى غير مطابق'),undefined);await f.button('التحقق من المطابقة السابقة').onclick();assert.match(f.d.status.textContent,/تم التحقق من المطابقة السابقة/);assert.equal(f.calls.filter(c=>c.p_action==='reopen').length,1);assert.equal(f.storage.size,0);
});
test('reopen verification survives same-tab dialog recreation',async()=>{
 const f=fixture('reconciled');await f.d.pending;f.state.loseMatchReply=true;await f.button('إعادة إلى غير مطابق').onclick();const g=fixture('unmatched',{storage:f.storage,row:f.saved()});await g.d.pending;await g.button('التحقق من المطابقة السابقة').onclick();assert.match(g.d.status.textContent,/تم التحقق من المطابقة السابقة/);assert.ok(g.calls.every(c=>c.p_action==='list'));
});
test('reopen recovery rejects a still-linked or later-revision transfer',async()=>{
 for(const changed of [{paymentId:'payment-one'},{revision:5}]){const f=fixture('reconciled');await f.d.pending;f.state.loseMatchReply=true;await f.button('إعادة إلى غير مطابق').onclick();const g=fixture('unmatched',{storage:f.storage,row:{...f.saved(),...changed}});await g.d.pending;await g.button('التحقق من المطابقة السابقة').onclick();assert.match(g.d.status.textContent,/لم تتأكد المطابقة السابقة/);assert.equal(g.storage.size,1);}
});
test('reopen storage failure prevents sending and definite rejection clears marker',async()=>{
 const f=fixture('reconciled',{storageError:true});await f.d.pending;await f.button('إعادة إلى غير مطابق').onclick();assert.equal(f.calls.filter(c=>c.p_action==='reopen').length,0);
 const g=fixture('reconciled');await g.d.pending;g.state.matchError=Object.assign(Error('validation'),{code:'22023'});await g.button('إعادة إلى غير مطابق').onclick();assert.equal(g.storage.size,0);assert.ok(g.button('إعادة إلى غير مطابق'));
});

test('lost ingest reply recovers after dialog recreation using digests without plaintext payload',async()=>{
 const f=fixture();await f.d.pending;await f.ingest();f.state.loseReply=true;await f.submit();const raw=[...f.storage.values()][0];assert.equal(f.storage.size,1);for(const value of ['BANK','EXT-NEW','Sender','Saved memo','12.125'])assert.ok(!raw.includes(value));
 const g=fixture('unmatched',{storage:f.storage,row:f.saved()});await g.d.pending;assert.equal(g.button('+ إدخال تحويل وارد'),undefined);await g.button('التحقق من التحويل السابق').onclick();assert.match(g.d.status.textContent,/تم التحقق من التحويل السابق/);assert.equal(g.storage.size,0);assert.ok(g.calls.every(c=>c.p_action==='list'));
});
test('ingest reload recovery rejects changed payload, duplicate identity and absent transfer',async()=>{
 for(const mode of ['changed','duplicate','absent']){const f=fixture();await f.d.pending;await f.ingest();f.state.loseReply=true;await f.submit();const row=f.saved(),rows=mode==='changed'?[{...row,memo:'different'}]:mode==='duplicate'?[row,{...row,id:'other'}]:[];const g=fixture('unmatched',{storage:f.storage,rows});await g.d.pending;await g.button('التحقق من التحويل السابق').onclick();assert.match(g.d.status.textContent,/لم يتأكد التحويل السابق/);assert.equal(g.storage.size,1);assert.ok(g.calls.every(c=>c.p_action==='list'));}
});
test('ingest storage failure prevents write and successful verification clears marker',async()=>{
 const f=fixture('unmatched',{storageError:true});await f.d.pending;await f.ingest();await f.submit();assert.equal(f.calls.filter(c=>c.p_action==='ingest').length,0);
 const g=fixture();await g.d.pending;await g.ingest();await g.submit();assert.equal(g.storage.size,0);
});
test('acknowledged ingest ID remains authoritative after reload',async()=>{
 const f=fixture();await f.d.pending;await f.ingest();f.state.listError=true;await f.submit();const g=fixture('unmatched',{storage:f.storage,row:{...f.saved(),id:'other'}});await g.d.pending;await g.button('التحقق من التحويل السابق').onclick();assert.match(g.d.status.textContent,/لم يتأكد التحويل السابق/);assert.equal(g.storage.size,1);
});


test('bank entry back and close cancellation retain the complete unsaved draft',async()=>{
 const f=fixture();await f.d.pending;await f.ingest();
 const draft=f.control('المعرف الخارجي للتحويل');
 await f.button('رجوع').onclick();assert.equal(f.control('المعرف الخارجي للتحويل'),draft);
 await f.d.requestClose();assert.notEqual(f.d.closed,true);assert.equal(f.control('المبلغ').value,'12.125');
 assert.equal(f.prompts.length,2);assert.equal(f.calls.filter(c=>c.p_action!=='list').length,0);
 assert.equal(f.d.beforeUnload(),true);
});
test('bank reconciliation selection is retained when departure is cancelled',async()=>{
 const f=fixture();await f.d.pending;await f.button('مطابقة صريحة').onclick();
 f.control('الدفعة البنكية المطابقة').value='payment-one';f.control('سبب المطابقة').value='draft reason';
 await f.button('رجوع').onclick();assert.equal(f.control('سبب المطابقة')?.value,'draft reason');
 f.confirm(true);await f.button('رجوع').onclick();assert.equal(f.control('سبب المطابقة'),undefined);
 assert.equal(f.d.beforeUnload(),false);assert.equal(f.calls.filter(c=>c.p_action!=='list').length,0);
});
test('clean bank entry and verified save do not prompt on leaving',async()=>{
 const f=fixture();await f.d.pending;await f.button('+ إدخال تحويل وارد').onclick();
 await f.button('رجوع').onclick();assert.equal(f.prompts.length,0);
 await f.ingest();await f.submit();assert.equal(f.d.beforeUnload(),false);
 await f.d.requestClose();assert.equal(f.d.closed,true);assert.equal(f.prompts.length,0);
});
test('uncertain bank save warns on close and preserves the recovery marker',async()=>{
 const f=fixture();await f.d.pending;await f.ingest();f.state.loseReply=true;await f.submit();
 await f.d.requestClose();assert.notEqual(f.d.closed,true);assert.match(f.prompts[0],/لم تتأكد/);
 f.confirm(true);await f.d.requestClose();assert.equal(f.d.closed,true);assert.equal(f.storage.size,1);
 const restored=fixture('unmatched',{row:f.saved(),storage:f.storage});await restored.d.pending;
 await restored.button('التحقق من التحويل السابق').onclick();assert.equal(restored.storage.size,0);
 assert.equal(restored.calls.filter(c=>c.p_action!=='list').length,0);
});
test('busy bank dialog cannot close even when discard was approved',async()=>{
 const f=fixture();await f.d.pending;await f.ingest();f.confirm(true);f.d.body.inert=true;
 await f.d.requestClose();assert.notEqual(f.d.closed,true);assert.equal(f.prompts.length,0);
 assert.match(f.d.status.textContent,/انتظر/);
});
