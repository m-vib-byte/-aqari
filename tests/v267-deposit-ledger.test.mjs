import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
import * as domain from '../src/v267/domain/deposit-ledger.js';
import {DEPOSIT_MESSAGES} from '../src/v267/components/deposit-translations.js';

const user='10000000-0000-4000-8000-000000000001',workspace='20000000-0000-4000-8000-000000000001',leaseId='30000000-0000-4000-8000-000000000001';
const scope={user,workspace,role:'general_manager'};
const storage=()=>{const map=new Map();return {map,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};};
const hash=value=>createHash('sha256').update(value).digest('hex');
const values=()=>({lease_id:leaseId,amount:'100.125',on_date:'2026-01-10',method:'cash',reference:'',reason:''});
const saved=(input,id='40000000-0000-4000-8000-000000000001',kind='receipt')=>({id,workspace_id:workspace,lease_id:leaseId,voucher_no:kind==='receipt'?'DP-20260110-00000001':'DF-20260110-00000001',kind,status:'confirmed',...input,actor_id:user,actor_name:'موظف <محفوظ>',created_at:'2026-01-10T10:00:00Z',balance_after:input.amount,snapshot:{lease_id:leaseId,tenant_id:'tenant-id',property_id:'property-id',unit_id:'unit-id',contract_no:'C-001',tenant_name:'اسم <script>',property_name:'عقار & محفوظ',unit_no:'101'}});
function writerFixture({store=storage(),record=null}={}){
 let n=0;const calls=[],state={record,loseReply:false,noCommit:false,getError:null,badRecord:null,reject:null};
 const rpc=async(action,payload)=>{
  calls.push({action,payload:structuredClone(payload)});
  if(action==='get'){if(state.getError)throw state.getError;const entry=state.badRecord||state.record;return {entry,lease:entry?{id:leaseId}:null};}
  if(state.reject)throw state.reject;
  if(!state.noCommit&&!state.record)state.record=saved(payload,payload.id,action==='receive'?'receipt':'refund');
  if(state.loseReply)throw Error('transport disconnected');
  return {entry:state.record};
 };
 const create=(extra={})=>domain.createDepositWriter({rpc,scope,storage:store,hash,uuid:()=>`40000000-0000-4000-8000-${String(++n).padStart(12,'0')}`,...extra});
 return {state,calls,store,create,writer:create()};
}
test('KWD uses exact fils, accepts Arabic digits and rejects rounding or exponent input',()=>{
 assert.equal(domain.depositMoney('١٠٠٫١٢٥'), '100.125');assert.equal(domain.depositMoney('۱۲.۵'), '12.500');assert.equal(domain.depositFils('999999999999.999'),999999999999999n);
 for(const input of ['1.0001','1e3','-1','1,000','NaN','Infinity','1000000000000'])assert.throws(()=>domain.depositMoney(input));
 assert.throws(()=>domain.depositMoney('0',{positive:true}));assert.equal(domain.depositDate('2026-02-30'),false);
});
test('cash needs no invented reference or reason, refund requires a reason and noncash needs a reference',()=>{
 assert.equal(domain.depositValues('receive',values()).reference,'');
 assert.throws(()=>domain.depositValues('refund',values()),/سبب/);
 assert.throws(()=>domain.depositValues('receive',{...values(),method:'bank'}),/مرجع/);
 assert.equal(domain.depositValues('refund',{...values(),reason:'إرجاع جزئي'}).reason,'إرجاع جزئي');
 assert.equal(domain.depositValues('receive',{...values(),on_date:'1899-12-31'}).on_date,'1899-12-31','no invented minimum financial year');
});
test('a write is only reported saved after exact independent readback',async()=>{
 const f=writerFixture();const result=await f.writer.submit('receive',values());
 assert.equal(result.state,'saved');assert.deepEqual(f.calls.map(c=>c.action),['receive','get']);assert.equal(f.writer.pending,null);assert.equal(f.store.map.size,0);
});
test('a committed operation with a lost reply is recovered without a second write',async()=>{
 const f=writerFixture();f.state.loseReply=true;const result=await f.writer.submit('receive',values());
 assert.equal(result.state,'saved');assert.equal(f.calls.filter(c=>c.action==='receive').length,1);
});
test('an absent result locks new writes and retries only the original UUID and content',async()=>{
 const f=writerFixture();f.state.noCommit=true;const result=await f.writer.submit('receive',values());
 assert.equal(result.state,'absent');assert.ok(f.writer.pending);await assert.rejects(f.writer.submit('receive',{...values(),amount:'5'}),/السابقة/);
 await assert.rejects(f.writer.retry({...values(),amount:'5'}),/نفسها/);assert.equal(f.calls.filter(c=>c.action==='receive').length,1);
 f.state.noCommit=false;assert.equal((await f.writer.retry(values())).state,'saved');
 const writes=f.calls.filter(c=>c.action==='receive');assert.equal(writes.length,2);assert.deepEqual(writes[0].payload,writes[1].payload);
});
test('page reload preserves only ID and fingerprint and safely retries the original operation',async()=>{
 const f=writerFixture();f.state.noCommit=true;const input={...values(),reason:'Private description',reference:'Private reference'};
 await f.writer.submit('receive',input);const marker=[...f.store.map.values()][0];
 for(const secret of [input.amount,input.reason,input.reference,'اسم <script>'])assert.equal(marker.includes(secret),false);
 const reopened=f.create();assert.equal(reopened.retained,null);assert.equal((await reopened.reconcile()).state,'absent');
 await assert.rejects(reopened.retry({...input,amount:'10'}),/نفسها/);f.state.noCommit=false;
 assert.equal((await reopened.retry(input)).state,'saved');const writes=f.calls.filter(c=>c.action==='receive');assert.equal(writes[0].payload.id,writes[1].payload.id);
});
test('a timeout during verification preserves the pointer and recovers after reopening',async()=>{
 const f=writerFixture();f.state.getError=Error('offline');await assert.rejects(f.writer.submit('receive',values()),/offline/);
 assert.ok(f.writer.pending);assert.equal(f.store.map.size,1);f.state.getError=null;
 assert.equal((await f.create().reconcile()).state,'saved');assert.equal(f.calls.filter(c=>c.action==='receive').length,1);
});
test('deterministic SQL rejection and absent readback release the draft for correction',async()=>{
 const f=writerFixture();f.state.reject=Object.assign(Error('DEPOSIT_RECEIPT_EXCEEDS_CONTRACT'),{code:'22023'});
 await assert.rejects(f.writer.submit('receive',values()),/EXCEEDS/);assert.equal(f.writer.pending,null);
 f.state.reject=null;assert.equal((await f.writer.submit('receive',{...values(),amount:'20'})).state,'saved');
 assert.notEqual(f.calls.filter(c=>c.action==='receive')[0].payload.id,f.calls.filter(c=>c.action==='receive')[1].payload.id);
});
test('opaque application rejection cannot unlock an uncertain payment',async()=>{
 const f=writerFixture();f.state.reject=Object.assign(Error('generic handler failure'),{code:'P0001'});
 assert.equal((await f.writer.submit('receive',values())).state,'absent');assert.ok(f.writer.pending);
});
test('malformed readback never proves absence or clears a pending operation',async()=>{
 for(const malformed of [null,{},[],{entry:null},{entry:null,lease:{}},{entry:undefined,lease:null}]){
  const store=storage();const writer=domain.createDepositWriter({scope,storage:store,hash,uuid:()=> '40000000-0000-4000-8000-000000000001',rpc:async(action)=>{if(action==='get')return malformed;throw Object.assign(Error('rejected'),{code:'22023'});}});
  await assert.rejects(writer.submit('receive',values()),/تعذر تأكيد/);assert.ok(writer.pending);
 }
});
test('changed actor, amount, lease, kind or ID cannot confirm a payment',async()=>{
 for(const change of [{actor_id:'different-user'},{amount:'9.000'},{snapshot:{lease_id:'another-lease'}},{kind:'refund'},{id:'another-id'},{status:'pending'}]){
  const f=writerFixture();f.state.badRecord={...saved(values()),...change};await assert.rejects(f.writer.submit('receive',values()),/لا تطابق/);assert.ok(f.writer.pending);
 }
});
test('a late committed operation is read before retry and is never resubmitted',async()=>{
 const f=writerFixture();f.state.noCommit=true;await f.writer.submit('receive',values());
 const marker=f.writer.pending;f.state.record=saved(values(),marker.id);assert.equal((await f.writer.retry(values())).state,'saved');
 assert.equal(f.calls.filter(c=>c.action==='receive').length,1);
});
test('unavailable or corrupt recovery storage prevents starting a financial write',async()=>{
 const store=storage();store.setItem=()=>{throw Error('disabled');};const f=writerFixture({store});await assert.rejects(f.writer.submit('receive',values()),/تعذر تأمين/);assert.equal(f.calls.length,0);
 const corrupt=storage();corrupt.setItem('aqari:v267:deposit-pending:'+JSON.stringify([workspace,user]),'broken');assert.throws(()=>writerFixture({store:corrupt}),/السابقة/);
});
test('printed receipt uses saved identity, escapes markup, and carries the scope statement in five languages',()=>{
 for(const locale of ['ar','en','hi','ur','ml']){
  const translate=source=>locale==='ar'?source:DEPOSIT_MESSAGES[source]?.[locale]||source;
  const html=domain.depositReceiptHTML(saved(values()),{translate,locale,direction:['ar','ur'].includes(locale)?'rtl':'ltr'});
  assert.match(html,/اسم &lt;script&gt;/);assert.doesNotMatch(html,/<script>|onclick=|<iframe/);assert.match(html,/DP-20260110-00000001/);assert.ok(html.includes(translate('وصل التأمين مستقل عن الإيجار ولا يمثل مخالصة أو براءة ذمة.')));
  assert.match(html,/Content-Security-Policy/);
 }
 assert.throws(()=>domain.depositReceiptHTML({...saved(values()),status:'pending'}),/محفوظة/);
});

const source=fs.readFileSync('src/v267/pages/deposit-ledger.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
function uiFixture({locale='ar',role='general_manager',store=storage(),shared=null}={}){
 const tr=value=>locale==='ar'?value:DEPOSIT_MESSAGES[value]?.[locale]||value;
 const calls=[],state={closed:false,sessionLost:false,denied:false,noCommit:false,lostReply:false,getError:null,badGet:null,serverReject:null,leaseStatus:'signed',canReceive:true,canRefund:true};
 const records=shared||[],urls=[],revoked=[],cleanups=[];let sequence=100;
 const walk=el=>[el,...el.children.flatMap(walk)];
 class Element{
  constructor(tag,value=''){this.tag=tag;this.children=[];this._text=value;this.value='';this.disabled=false;this.hidden=false;this.dataset={};this.style={};}
  append(...children){for(const c of children){c.parent=this;this.children.push(c);}}
  replaceChildren(...children){for(const c of this.children)c.parent=null;this.children=[];this.append(...children);}
  get textContent(){return String(this._text)+this.children.map(c=>c.textContent).join('');}
  set textContent(value){this._text=value;this.replaceChildren();}
  get isConnected(){return !state.closed&&(this.root||this.parent?.isConnected===true);}
 }
 const node=(tag,value)=>new Element(tag,value),field=(label,control)=>{const el=node('div');el.label=label;el.append(control);return el;};
 const lease=()=>{
  const received=records.filter(r=>r.kind==='receipt').reduce((s,r)=>s+Number(r.amount),0),refunded=records.filter(r=>r.kind==='refund').reduce((s,r)=>s+Number(r.amount),0),balance=received-refunded;
  return {id:leaseId,contract_no:'C-001',tenant_id:'tenant-id',tenant_name:'اسم <script>',property_id:'property-id',property_name:'عقار & محفوظ',unit_id:'unit-id',unit_no:'101',status:state.leaseStatus,contract_deposit:'200.000',received:received.toFixed(3),refunded:refunded.toFixed(3),balance:balance.toFixed(3),can_receive:state.canReceive&&state.leaseStatus==='signed'&&balance<200,can_refund:state.canRefund&&role==='general_manager'&&balance>0};
 };
 const rpc=async(name,args)=>{
  assert.equal(name,'aqari_deposit_register');assert.equal(args.p_workspace_id,workspace);calls.push(structuredClone(args));
  if(state.denied)throw Object.assign(Error('ACCESS_DENIED'),{code:'42501'});
  const {p_action:action,p_data:data}=args;
  if(action==='list')return {manager:role==='general_manager',leases:[lease()],entries:data.lease_id?structuredClone(records):[]};
  if(action==='get'){if(state.getError)throw state.getError;const entry=state.badGet||structuredClone(records.find(r=>r.id===data.id)||null);return {entry,lease:entry?lease():null};}
  if(state.serverReject)throw state.serverReject;
  if(!state.noCommit&&!records.some(r=>r.id===data.id)){
   const kind=action==='receive'?'receipt':'refund',record=saved(data,data.id,kind);record.balance_after=(Number(lease().balance)+(kind==='receipt'?1:-1)*Number(data.amount)).toFixed(3);records.unshift(record);
  }
  if(state.lostReply)throw Error('reply dropped');return {entry:structuredClone(records.find(r=>r.id===data.id)||null),lease:lease()};
 };
 const d={el:node('dialog'),body:node('div'),status:node('p'),get closed(){return state.closed;},session:{bound:{user,workspace,role},client:{rpc},request:query=>query,check(){if(state.sessionLost||state.closed)throw Error('session lost');}},onDispose:fn=>cleanups.push(fn),run(task){
  if(d.busy||state.closed)return;d.busy=true;const controls=walk(d.body).filter(e=>['button','input','select','textarea'].includes(e.tag)),disabled=controls.map(e=>e.disabled);controls.forEach(e=>e.disabled=true);
  d.pending=Promise.resolve().then(task).catch(error=>{d.status.textContent=error.message;}).finally(()=>{d.busy=false;controls.forEach((e,i)=>{if(e.isConnected)e.disabled=disabled[i];});});return d.pending;
 }};d.body.root=true;
 const context={...domain,node,field,createDialog:()=>d,t:tr,message:(key,args)=>tr(key).replace(/\{(\w+)\}/g,(_,key)=>args[key]),getLocale:()=>locale,direction:()=>['ar','ur'].includes(locale)?'rtl':'ltr',dateLocale:()=>locale,Blob,console,crypto:webcrypto,createPrivateUrls:dialog=>{
  const clear=()=>{revoked.push(...urls.map(x=>x.url));urls.length=0;};dialog.onDispose(clear);return {clear,create:blob=>{const url='blob:fixture-'+urls.length;urls.push({url,blob});return url;}};
 },createDepositWriter:args=>domain.createDepositWriter({...args,storage:store,hash,uuid:()=>`40000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`})};
 vm.createContext(context);vm.runInContext(source,context);
 const button=label=>walk(d.body).find(e=>e.tag==='button'&&e.textContent===tr(label));
 const control=label=>walk(d.body).find(e=>e.label===tr(label))?.children[0];
 const form=()=>walk(d.body).find(e=>e.tag==='form');
 const fill=(key,value)=>{const el=control(key);assert.ok(el,'missing field '+key);el.value=value;(el.oninput||el.onchange)?.();};
 const select=async()=>{const el=control('العقد المحفوظ');el.value=leaseId;await el.onchange();};
 const submit=()=>form().onsubmit({preventDefault(){}});
 return {d,state,records,calls,urls,revoked,store,button,control,form,fill,select,submit,start:()=>context.openDepositLedger(),close(){state.closed=true;for(const cleanup of cleanups)cleanup();},walk};
}
test('five-language UI selects a saved contract and verifies receipt plus exact ledger balance',async()=>{
 for(const locale of ['ar','en','hi','ur','ml']){
  const f=uiFixture({locale});await f.start();await f.select();assert.match(f.d.body.textContent,/اسم <script>.*عقار & محفوظ.*101/);
  f.fill('المبلغ بالدينار الكويتي','١٢٫١٢٥');await f.submit();
  assert.equal(f.records.length,1);assert.equal(f.records[0].amount,'12.125');assert.equal(f.records[0].reference,'');
  assert.equal(f.calls.find(c=>c.p_action==='receive').p_data.lease_id,leaseId);assert.equal(f.calls.at(-1).p_action,'list');
  const expected=locale==='ar'?'تم حفظ حركة التأمين والتحقق من الوصل والرصيد.':DEPOSIT_MESSAGES['تم حفظ حركة التأمين والتحقق من الوصل والرصيد.'][locale];assert.equal(f.d.status.textContent,expected);
  assert.equal(f.control('العقد المحفوظ').disabled,false,'dialog restore must not re-enable stale controls');
 }
});
test('manager records partial then full refund with reason and never inflates the received total',async()=>{
 const record=saved(values()),f=uiFixture({shared:[record]});await f.start();await f.select();f.button('تسجيل رد تأمين').onclick();f.fill('المبلغ بالدينار الكويتي','20');await f.submit();
 assert.equal(f.calls.filter(c=>c.p_action==='refund').length,0);f.fill('سبب رد التأمين','رد جزئي موثق');await f.submit();
 assert.equal(f.records.length,2);assert.equal(f.records[0].amount,'20.000');assert.equal(f.records[0].kind,'refund');
 f.button('تسجيل رد تأمين').onclick();f.button('استخدام كامل الرصيد للرد').onclick();assert.equal(f.control('المبلغ بالدينار الكويتي').value,'80.125');
 f.fill('سبب رد التأمين','رد كامل المتبقي');await f.submit();assert.equal(f.records[0].balance_after,'0.000');assert.equal(f.records.filter(r=>r.kind==='receipt').length,1);
});
test('accountant can receive with server permission but has no refund form',async()=>{
 const f=uiFixture({role:'accountant',shared:[saved({...values(),amount:'30.000'})]});await f.start();await f.select();assert.ok(f.button('تسجيل قبض تأمين'));assert.equal(f.button('تسجيل رد تأمين'),undefined);
 f.fill('المبلغ بالدينار الكويتي','5');await f.submit();assert.equal(f.calls.filter(c=>c.p_action==='refund').length,0);
});
test('lost write reply plus unavailable readback locks editing until exact saved recovery',async()=>{
 const f=uiFixture();await f.start();await f.select();f.fill('المبلغ بالدينار الكويتي','15');f.state.lostReply=true;f.state.getError=Error('network');await f.submit();
 assert.equal(f.records.length,1);assert.equal(f.control('المبلغ بالدينار الكويتي').disabled,true);assert.equal(f.button('حفظ الحركة والتحقق من الوصل'),undefined);assert.equal(f.control('العقد المحفوظ').disabled,true);
 f.state.getError=null;await f.button('تحديث السجل والتحقق من العملية').onclick();assert.equal(f.calls.filter(c=>c.p_action==='receive').length,1);assert.match(f.d.status.textContent,/تم حفظ/);assert.equal(f.control('المبلغ بالدينار الكويتي').disabled,false);
});
test('a restored absent transaction accepts only identical re-entry and keeps its original ID',async()=>{
 const store=storage(),f=uiFixture({store});await f.start();await f.select();f.state.noCommit=true;f.fill('المبلغ بالدينار الكويتي','15');await f.submit();const id=f.calls.find(c=>c.p_action==='receive').p_data.id;f.close();
 const reopened=uiFixture({store});await reopened.start();assert.equal(reopened.control('العقد المحفوظ').value,leaseId);assert.equal(reopened.control('المبلغ بالدينار الكويتي').disabled,false);
 reopened.fill('المبلغ بالدينار الكويتي','16');await reopened.submit();assert.equal(reopened.calls.filter(c=>c.p_action==='receive').length,0);
 reopened.fill('المبلغ بالدينار الكويتي','15');await reopened.submit();assert.equal(reopened.records.length,1);assert.equal(reopened.records[0].id,id);
});
test('an absent operation can obtain deterministic rejection after its contract expires and then unlock',async()=>{
 const f=uiFixture();await f.start();await f.select();f.state.noCommit=true;f.fill('المبلغ بالدينار الكويتي','15');await f.submit();
 f.state.leaseStatus='expired';await f.button('تحديث السجل والتحقق من العملية').onclick();f.state.serverReject=Object.assign(Error('DEPOSIT_SIGNED_CONTRACT_REQUIRED'),{code:'22023'});
 await f.submit();assert.equal(f.calls.filter(c=>c.p_action==='receive').length,2,'retry reaches server even after can_receive changes');assert.equal(f.store.map.size,0);assert.equal(f.button('إعادة نفس العملية دون تكرار'),undefined);assert.equal(f.control('العقد المحفوظ').disabled,false);
});
test('printing reads original saved snapshot and permission revocation clears rows, form and private URL',async()=>{
 const f=uiFixture({shared:[saved(values())]});await f.start();await f.select();await f.button('تجهيز الوصل المحفوظ للطباعة').onclick();
 assert.equal(f.calls.at(-1).p_action,'get');assert.equal(f.urls.length,1);const html=await f.urls[0].blob.text();assert.match(html,/اسم &lt;script&gt;/);assert.match(html,/100\.125/);
 f.state.denied=true;await f.button('تحديث السجل والتحقق من العملية').onclick();assert.equal(f.d.body.textContent,'');assert.equal(f.urls.length,0);assert.equal(f.revoked.length,1);
});
test('forged receipt readback cannot create a printable file for another contract',async()=>{
 const f=uiFixture({shared:[saved(values())]});await f.start();await f.select();f.state.badGet={...f.records[0],snapshot:{...f.records[0].snapshot,lease_id:'other'}};
 await f.button('تجهيز الوصل المحفوظ للطباعة').onclick();assert.equal(f.urls.length,0);assert.match(f.d.status.textContent,/تعذر التحقق/);
});
test('dialog disposal removes private financial data and revokes prepared receipts',async()=>{
 const f=uiFixture({shared:[saved(values())]});await f.start();await f.select();await f.button('تجهيز الوصل المحفوظ للطباعة').onclick();f.close();assert.equal(f.d.body.textContent,'');assert.equal(f.urls.length,0);
});
test('all source interface strings have complete translations with matching placeholders',()=>{
 const files=['src/v267/pages/deposit-ledger.js','src/v267/domain/deposit-ledger.js'];
 for(const file of files){const source=fs.readFileSync(file,'utf8');for(const match of source.matchAll(/'([^'\n]*)'/g)){
  const text=match[1];if(!/[\u0600-\u06ff]/.test(text)||/[<>]/.test(text))continue;
  const row=DEPOSIT_MESSAGES[text];assert.ok(row,`missing translations: ${text}`);
  for(const locale of ['en','hi','ur','ml']){assert.ok(row[locale]);assert.deepEqual([...row[locale].matchAll(/\{(\w+)\}/g)].map(x=>x[1]).sort(),[...text.matchAll(/\{(\w+)\}/g)].map(x=>x[1]).sort());}
 }}
});
