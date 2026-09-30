import {previousKuwaitMonth} from '../src/v267/domain/kuwait-calendar.js';
import {t as translateStatic,t as visibleText,message as visibleMessage,dateLocale} from '../src/v267/components/locale.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function fixture(){
 const nodes=[],calls=[],approvals=[],entries=[],cleanups=[];let id=0,closed=false;
 class Element{
  constructor(tag,text=''){this.tag=tag;this._text=text;this.children=[];this.value='';this.checked=false;this.hidden=false;this.disabled=false;this.isConnected=true;nodes.push(this);}
  append(...items){this.children.push(...items);if(this.tag==='select'&&!this.value)this.value=items[0]?.value||'';}
  detach(){this.isConnected=false;this.children.forEach(x=>x.detach());}
  replaceChildren(...items){this.children.forEach(x=>x.detach());this.children=[];this.append(...items);}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}set textContent(v){this._text=v;}
 }
 const node=(tag,text)=>new Element(tag,text),field=(text,input)=>{const el=node('label',text);el.append(input);return el;};
 const owners=[{id:'a',name:'Owner A',role:'مالك',bps:3333},{id:'b',name:'Owner B',role:'وارث',bps:6667}],allocations=[{owner_id:'a',name:'Owner A',role:'مالك',bps:3333,amount_fils:'16665'},{owner_id:'b',name:'Owner B',role:'وارث',bps:6667,amount_fils:'33335'}];
 const flags={lost:false,badReadback:false,stale:false,listFails:false};
 const base={workspace_id:'w',month:'2026-01',currency:'KWD',properties:[{id:'p',name:'Property'},{id:'other',name:'Other'}],sources:[{}],shares:{key:{enabled:true,version:1,owners}},partners:[{user_id:'ua',property_id:'p',name:'Partner A',email:'a@example.invalid'},{user_id:'ub',property_id:'other',name:'Other',email:'other@example.invalid'}],documents:[{id:'doc',property_id:'p',title:'Review'},{id:'other-doc',property_id:'other',title:'Other'}]};
 const session={bound:{workspace:'w'},check(){if(closed)throw Error('closed');},request:async p=>p,client:{rpc:async(name,args)=>{
  assert.equal(name,'aqari_partner_distribution_register');assert.equal(args.p_workspace_id,'w');calls.push(structuredClone(args));const p=args.p_data;
  if(args.p_action==='list'){if(flags.listFails&&approvals.length)throw Error('readback unavailable');const a=structuredClone(approvals),e=structuredClone(entries);if(flags.badReadback&&a[0])a[0].property_id='foreign';return {...base,approvals:a,entries:e};}
  if(args.p_action==='preview')return {workspace_id:'w',property_id:'p',month:'2026-01',shares_key:'key',shares_version:1,review_revision:approvals.length,source_hash:'hash',income_fils:'100000',expense_fils:'30000',reserve_fils:'20000',net_fils:'50000',owners,allocations};
  if(args.p_action==='approve_source'){
   if(flags.stale)throw Object.assign(Error('PARTNER_REVIEW_STALE'),{code:'40001'});
   let a=approvals.find(x=>x.id===p.id);if(!a){a={id:p.id,workspace_id:'w',property_id:p.property_id,month:p.month+'-01',shares_key:p.shares_key,shares_version:p.shares_version,review_revision:p.expected_review_revision+1,source_hash:p.source_hash,review_hash:'review-hash',document_id:p.document_id,recipients:p.recipients,owners,income_fils:p.expected_income_fils,expense_fils:p.expected_expense_fils,reserve_fils:p.expected_reserve_fils,net_fils:'50000',reason:p.reason};approvals.push(a);}
   if(flags.lost)throw Error('response lost');return a;
  }
  if(args.p_action==='post'){
   const a=approvals.find(x=>x.id===p.source_id);const row={id:p.id,workspace_id:'w',property_id:'p',month:'2026-01-01',kind:'distribution',source_id:a.id,net_fils:'50000',allocations,review_hash:a.review_hash,reason:p.reason,occurred_on:'2026-09-12'};entries.push(row);return row;
  }
  if(args.p_action==='reverse'){
   const original=entries.find(x=>x.id===p.distribution_id),row={...original,id:p.id,kind:'reversal',reverses_id:original.id,net_fils:'-50000',reason:p.reason,allocations:allocations.map(x=>({...x,amount_fils:(-BigInt(x.amount_fils)).toString()}))};entries.push(row);return row;
  }
  throw Error('unexpected action');
 }}};
 const d={body:node('div'),status:node('p'),session,onDispose:f=>cleanups.push(f),async run(task){try{await task();}catch(e){d.status.textContent=e.message;}},close(){closed=true;cleanups.forEach(f=>f());}};
 const context={previousKuwaitMonth,translateStatic,visibleText,visibleMessage,dateLocale,node,field,Date,Error,BigInt,crypto:{randomUUID:()=> 'request-'+(++id)}};vm.createContext(context);
 vm.runInContext(fs.readFileSync('src/v267/pages/partner-distributions.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,''),context);context.mountPartnerDistributions(d,d.body);
 const control=label=>nodes.find(x=>x.isConnected&&x.tag==='label'&&x._text===label)?.children[0],button=text=>nodes.find(x=>x.isConnected&&x.tag==='button'&&x.textContent===text);
 const submit=async()=>{const btn=button('حفظ مراجعة المصدر الموثقة'),form=nodes.find(x=>x.isConnected&&x.tag==='form'&&x.children.includes(btn));await form.onsubmit({preventDefault(){}});};
 return {d,context,flags,calls,approvals,entries,control,button,submit,async start(){control('شهر المصدر المقفل').value='2026-01';await button('عرض دفتر الشهر').onclick();control('العقار').value='p';control('سجل الحصص').value='key';await button('عرض المصدر والحصص للمراجعة').onclick();},fill(){control('المقبوض المطابق للمستند د.ك').value='100';control('المصروف المطابق للمستند د.ك، أدخل 0 إن لم يوجد').value='30';control('صافي الاحتياطي المطابق د.ك، أدخل 0 إن لم يوجد').value='20';control('مستند مطابقة العقار').value='doc';control('حساب Owner A').value='ua';control('حساب Owner B').value='offline';control('سبب المطابقة واعتماد الحصص للفترة').value='مطابقة مالية موثقة';}};
}
test('partner source defaults to the completed Kuwait month at the year boundary',t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-12-31T21:30:00Z')});
 assert.equal(fixture().control('شهر المصدر المقفل').value,'2026-12');
});
test('explicit reconciliation parses fils exactly, never silently rounds, and displays server signed fils',()=>{
 const f=fixture();assert.equal(f.context.partnerFils('٥١٫٠٠١'),'51001');assert.equal(f.context.partnerFils('0'),'0');assert.equal(f.context.partnerFils('-1.001'),'-1001');assert.equal(f.context.partnerMoney('-51001'),'-51.001 د.ك');assert.throws(()=>f.context.partnerFils(''));assert.throws(()=>f.context.partnerFils('1.0001'));assert.throws(()=>f.context.partnerFils('1e2'));
});
test('review filters documents/accounts to the property and demands explicit values including zero',async()=>{
 const f=fixture();await f.start();assert.deepEqual(f.control('مستند مطابقة العقار').children.map(x=>x.value),['','doc']);assert.deepEqual(f.control('حساب Owner A').children.map(x=>x.value),['','offline','ua']);f.fill();f.control('المصروف المطابق للمستند د.ك، أدخل 0 إن لم يوجد').value='';await f.submit();assert.equal(f.approvals.length,0);assert.match(f.d.status.textContent,/صفرًا صراحة/);
});
test('lost save response retries identical immutable request and checks authoritative readback',async()=>{
 const f=fixture();await f.start();f.fill();f.flags.lost=true;await f.submit();assert.equal(f.approvals.length,1);assert.match(f.d.status.textContent,/response lost/);f.control('المقبوض المطابق للمستند د.ك').value='999';f.flags.lost=false;await f.button('إعادة محاولة الحفظ والتحقق').onclick();assert.equal(f.approvals.length,1);assert.match(f.d.status.textContent,/تم حفظ العملية/);const writes=f.calls.filter(x=>x.p_action==='approve_source');assert.deepEqual(writes[0].p_data,writes[1].p_data);assert.equal(writes[0].p_data.expected_income_fils,'100000');assert.equal(writes[0].p_data.recipients.b,null);
});
test('unavailable or mismatched readback preserves recovery and never claims completion',async()=>{
 for(const flag of ['listFails','badReadback']){const f=fixture();await f.start();f.fill();f.flags[flag]=true;await f.submit();assert.equal(f.approvals.length,1);assert.doesNotMatch(f.d.status.textContent,/تم حفظ العملية/);assert.equal(f.button('إعادة محاولة الحفظ والتحقق').hidden,false);f.flags[flag]=false;await f.button('إعادة محاولة الحفظ والتحقق').onclick();assert.match(f.d.status.textContent,/تم حفظ العملية/);}
});
test('stale review clears request and requires a fresh preview before another approval',async()=>{
 const f=fixture();await f.start();f.fill();f.flags.stale=true;await f.submit();assert.equal(f.approvals.length,0);assert.match(f.d.status.textContent,/تغيرت المراجعة/);assert.equal(f.button('إعادة محاولة الحفظ والتحقق').hidden,true);assert.equal(f.button('حفظ مراجعة المصدر الموثقة'),undefined);
});
test('posting sends source/hash only, reversal remains separate and original allocation retained',async()=>{
 const f=fixture();await f.start();f.fill();await f.submit();f.control('سبب اعتماد التوزيع').value='اعتماد استحقاق الشركاء';await f.button('اعتماد التوزيع من هذه المراجعة').onclick();assert.equal(f.entries.length,1);const post=f.calls.find(x=>x.p_action==='post');assert.deepEqual(Object.keys(post.p_data).sort(),['id','reason','review_hash','source_id']);f.control('سبب العكس').value='تصحيح يستدعي قيد عكس';await f.button('عكس التوزيع بقيد مستقل').onclick();assert.equal(f.entries.length,2);assert.equal(f.entries[0].net_fils,'50000');assert.equal(f.entries[1].net_fils,'-50000');assert.match(f.d.status.textContent,/تم حفظ العملية/);
});
test('authorization disposal erases private records and stops retained retries',async()=>{
 const f=fixture();await f.start();f.fill();f.flags.lost=true;await f.submit();const retry=f.button('إعادة محاولة الحفظ والتحقق'),before=f.calls.length;f.d.close();assert.equal(f.d.body.textContent,'');await retry.onclick();assert.equal(f.calls.length,before);
});
