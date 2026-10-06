import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

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
 const state={skipPersist:false,corrupt:null,badEnvelope:false,listError:false},calls=[];
 let row={id:'transfer-one',state:initialState,revision:3,paymentId:initialState==='reconciled'?'payment-one':null,amount:options.amount??'12.125',bankSource:'BANK',externalId:'EXT-1',transferDate:'2026-10-01',bankReference:'REF-1'};
 const rpc=async(name,args)=>{
  assert.equal(name,'aqari_bank_reconciliation');assert.equal(args.p_workspace_id,'workspace-one');calls.push(structuredClone(args));
  if(args.p_action==='list'){
   if(state.listError&&calls.some(c=>c.p_action!=='list'))throw Error('read unavailable');
   const readRow=state.corrupt&&calls.some(c=>c.p_action!=='list')?{...row,...state.corrupt}:row;
   return {workspace_id:'workspace-one',user_id:'user-one',canWrite:true,autoMatch:false,transfers:[structuredClone(readRow)],candidates:options.candidates??[{paymentId:'payment-one',amount:options.amount??'12.125',reference:'PAY-REF'}],events:[]};
  }
  if(args.p_action==='ingest'){
   if(state.ingestError)throw state.ingestError;
   const next={...args.p_data,id:'new-transfer',state:'unmatched',paymentId:null,revision:1};
   if(!state.skipPersist)row=next;if(state.loseReply)throw Error('reply lost');
   return {workspace_id:state.badEnvelope?'other-workspace':'workspace-one',user_id:'user-one',autoMatched:false,record:{id:next.id,state:'unmatched',payment_id:null,revision:1}};
  }
  assert.ok(['reconcile','reopen'].includes(args.p_action));
  const next={...row,revision:row.revision+1,state:args.p_action==='reconcile'?'reconciled':'unmatched',paymentId:args.p_action==='reconcile'?args.p_data.paymentId:null};
  if(!state.skipPersist)row=next;
  return {workspace_id:state.badEnvelope?'other-workspace':'workspace-one',user_id:'user-one',autoMatched:false,record:{id:next.id,state:next.state,payment_id:next.paymentId,revision:next.revision}};
 };
 const d={body:node('div'),status:node('p'),session:{bound:{workspace:'workspace-one',user:'user-one'},client:{rpc},request:x=>x,check(){}},run(fn){d.pending=Promise.resolve().then(fn).catch(e=>{d.status.textContent=e.message;});return d.pending;}};
 vm.runInNewContext(page.replace(/^import .*;$/gm,'').replace(/\bexport /g,'')+'\nopenBankReconciliation();',{node,field,createDialog:()=>d,translateStatic:x=>x,visibleMessage:(s,v)=>s.replace(/\{(\w+)\}/g,(_,k)=>v[k]),window:{prompt:()=> 'تصحيح موثق'},console});
 const all=e=>[e,...e.children.flatMap(all)],button=label=>all(d.body).find(x=>x.tag==='button'&&x.textContent===label),control=label=>all(d.body).find(x=>x.label===label)?.children[0];
 const submit=async()=>{all(d.body).find(x=>x.tag==='form').onsubmit({preventDefault(){}});await d.pending;};
 return {d,state,calls,button,control,submit,async ingest(){await button('+ إدخال تحويل وارد').onclick();for(const [label,value] of [['مصدر/بنك الكشف','BANK'],['المعرف الخارجي للتحويل','EXT-NEW'],['تاريخ التحويل','2026-10-01'],['المبلغ','12.125'],['مرجع البنك','NEW-REF'],['اسم المرسل كما ورد','Sender'],['آخر/جزء آمن من الحساب','1234'],['البيان','Saved memo']])control(label).value=value;},async match(){await button('مطابقة صريحة').onclick();control('الدفعة البنكية المطابقة').value='payment-one';control('سبب المطابقة').value='سبب موثق';await submit();}};
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
