import test from 'node:test';
import assert from 'node:assert/strict';
import {openOfficialDocumentCenter} from '../src/v267/pages/official-document-center.js';
import {OFFICIAL_FORM_TEMPLATES} from '../src/v267/components/document-catalog.js';
import {officialFields,validateOfficialValues} from '../src/v267/components/official-form-fields.js';

async function fixture({typed=false,wrongKind=false,lostReply=false,lostBeforeWrite=false,wrongContext=false,partialReadback=false,rejectOnce=false,mfaAt=null,mfaMessage='MFA_REQUIRED'}={}){
 const original={window:globalThis.window,document:globalThis.document};const calls=[],records=new Map(),numbers=new Map();
 class Element{constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.value='';this.disabled=false;}
  get value(){return this.tagName==='select'&&!this.children.some(x=>x.value===this._value)?'':this._value;}
  set value(v){this._value=this.tagName==='select'&&!this.children.some(x=>x.value===v)?'':v;}
  get isConnected(){return this.parent?this.parent.isConnected:this.connected===true;}
  append(...nodes){for(const n of nodes){this.children.push(n);n.parent=this;}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  querySelectorAll(){return this.children.flatMap(n=>[n,...n.querySelectorAll()]);}
  setAttribute(k,v){this.attributes[k]=v;}addEventListener(){}showModal(){}close(){}remove(){this.parent.children=this.parent.children.filter(x=>x!==this);}}
 const w='fixture-workspace',user='fixture-user';
 const defaults={sourceId:'payment-1',tenantName:'مستأجر محفوظ',contractNo:'LEASE-1',propertyName:'عقار محفوظ',unitNo:'101',amount:'12.345',period:'2026-09',paymentMethod:'نقداً',paymentReference:'مرجع محفوظ',collectorName:'محصل محفوظ',receivedFrom:'مستأجر محفوظ',reference:'مرجع محفوظ',reason:'إيجار سبتمبر'};
 const client={rpc(name,args){calls.push({name,args:structuredClone(args)});return {abortSignal:async()=>{
  if((mfaAt==='number'&&name==='aqari_official_document_number')||(mfaAt==='issue'&&args.p_action==='issue')){mfaAt=null;return {status:403,error:{code:'42501',message:mfaMessage}};}
  if(name==='aqari_official_document_context')return {data:{workspace_id:wrongContext?'other':w,user_id:user,kind:args.p_kind,entity_type:'lease',entity_id:args.p_entity_id,source_id:args.p_source_id,source_required:['rent_receipt','receipt_voucher'].includes(args.p_kind),entities:[{id:'lease-1',label:'عقد محفوظ'}],sources:[{id:'payment-1',label:'دفعة محفوظة'}],defaults:args.p_source_id?defaults:{}}};
  if(name==='aqari_official_document_number'){if(!numbers.has(args.p_request_id))numbers.set(args.p_request_id,(typed?'AQ-'+(wrongKind?'PAYMENT_VOUCHER':args.p_kind.toUpperCase())+'-20260912-':'AQ-20260912-')+String(numbers.size+1).padStart(8,'0'));return {data:{id:args.p_request_id,workspace_id:w,kind:args.p_kind,entity_id:args.p_entity_id,document_no:numbers.get(args.p_request_id)}};}
  assert.equal(name,'aqari_official_document_register');const p=args.p_data;
  if(args.p_action==='list')return {data:{items:[...records.values()].map(r=>({...r.series,version:r.versions.at(-1)}))}};
  if(args.p_action==='get'){const r=structuredClone(records.get(p.id)||{});if(partialReadback&&r.versions)r.versions[0].payload={amount:'999.000'};return {data:r};}
  if(rejectOnce){rejectOnce=false;return {error:{code:'23514',message:'DOCUMENT_SOURCE_MISMATCH'}};}
  if(lostBeforeWrite){lostBeforeWrite=false;throw Error('انقطع الاتصال قبل وصول الطلب.');}
  if(args.p_action==='issue')records.set(p.id,{series:{id:p.id,workspace_id:w,document_no:p.document_no,entity_type:p.entity_type,entity_id:p.entity_id,kind:p.kind,status:'issued',current_version:1},versions:[{id:p.version_id,workspace_id:w,series_id:p.id,version:1,title:p.title,body:p.body,payload:p.payload,content_sha256:p.content_sha256,issued_by_name:'مدير الاختبار'}]});
  else if(args.p_action==='supersede'){const r=records.get(p.id);r.series.current_version++;r.versions.push({id:p.version_id,workspace_id:w,series_id:p.id,version:r.series.current_version,title:p.title,body:p.body,payload:p.payload,content_sha256:p.content_sha256,issued_by_name:'مدير الاختبار'});}
  else if(args.p_action==='void'){const r=records.get(p.id);r.series.status='void';r.series.void_reason=p.reason;}
  if(lostReply){lostReply=false;throw Error('انقطع الاتصال بعد الحفظ.');}return {data:{}};
 }};}};
 const body=new Element('body');body.connected=true;
 globalThis.document={body,activeElement:null,createElement:t=>new Element(t),documentElement:{classList:{contains:()=>true}}};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'},AQARI_DATA_GATE:{scope:{userId:user,workspaceId:w}},AQARI_SUPABASE:{getClient:async()=>client,context:{user:{id:user},workspace:{id:w},membership:{user_id:user,workspace_id:w,is_active:true,role:'general_manager'}}},addEventListener(){},removeEventListener(){}};
 openOfficialDocumentCenter();await new Promise(setImmediate);const dialog=body.children[0],elements=()=>dialog.querySelectorAll();
 const control=label=>{const group=elements().find(x=>x.children?.[0]?.tagName==='label'&&x.children[0].textContent===label);assert.ok(group,label);return group.children[1];};
 const named=key=>elements().find(x=>x.name===key),button=text=>elements().find(x=>x.tagName==='button'&&x.textContent===text);
 return {calls,records,numbers,elements,control,named,button,connected:()=>dialog.isConnected,status:()=>elements().find(x=>x.attributes.role==='status')?.textContent,
  async select(){control('السجل المرتبط').value='lease-1';await control('السجل المرتبط').onchange();control('الحركة المحفوظة').value='payment-1';await control('الحركة المحفوظة').onchange();named('documentNo').value='TEST-DOC-1';control('سبب الإصدار أو التصحيح').value='اختبار إصدار مرتبط';},
  submit:()=>elements().find(x=>x.tagName==='form').onsubmit({preventDefault(){}}),cleanup(){dialog.children[0].onclick();Object.assign(globalThis,original);}};
}
test('all 16 catalogue forms expose labelled typed fields without raw JSON input',async()=>{
 const f=await fixture();try{for(const kind of Object.keys(OFFICIAL_FORM_TEMPLATES)){f.control('نوع النموذج').value=kind;await f.control('نوع النموذج').onchange();assert.deepEqual(f.elements().filter(x=>x.name).map(x=>x.name),OFFICIAL_FORM_TEMPLATES[kind].required);for(const spec of officialFields(kind))assert.match(spec.label,/[\u0600-\u06ff]/);assert.equal(f.elements().some(x=>x.placeholder?.includes('JSON')),false);}}finally{f.cleanup();}
});
test('source selection fills locked financial fields and actual form saves then verifies exact immutable readback',async()=>{
 const f=await fixture();try{await f.select();assert.equal(f.named('amount').value,'12.345');assert.equal(f.named('amount').readOnly,true);assert.equal(f.button('إصدار وحفظ').disabled,false);await f.submit();assert.equal(f.records.size,1);assert.match(f.status(),/تم الحفظ والتحقق/);const write=f.calls.find(x=>x.args.p_action==='issue').args.p_data;assert.equal(write.payload.sourceId,'payment-1');assert.equal(write.entity_id,'lease-1');assert.equal(write.content_sha256.length,64);assert.ok(f.calls.some(x=>x.args.p_action==='get'&&x.args.p_data.id===write.id));}finally{f.cleanup();}
});
test('lost write reply is recovered by readback without issuing or collecting twice',async()=>{
 const f=await fixture({lostReply:true});try{await f.select();await f.submit();assert.equal(f.records.size,1);assert.equal(f.button('إصدار وحفظ').disabled,true);await f.button('التحقق من الحفظ السابق').onclick();assert.match(f.status(),/تم الحفظ والتحقق/);assert.equal(f.calls.filter(x=>x.args.p_action==='issue').length,1);}finally{f.cleanup();}
});
test('incomplete archived values never confirm and do not allow a duplicate issue',async()=>{
 const f=await fixture({partialReadback:true});try{await f.select();await f.submit();assert.doesNotMatch(f.status(),/تم الحفظ والتحقق/);await f.submit();assert.equal(f.calls.filter(x=>x.args.p_action==='issue').length,1);}finally{f.cleanup();}
});
test('request lost before storage is retried with the same reservation and snapshot',async()=>{
 const f=await fixture({lostBeforeWrite:true});try{await f.select();await f.submit();assert.equal(f.records.size,0);await f.button('التحقق من الحفظ السابق').onclick();assert.equal(f.records.size,1);assert.match(f.status(),/تم الحفظ والتحقق/);const writes=f.calls.filter(x=>x.args.p_action==='issue');assert.equal(writes.length,2);assert.deepEqual(writes[0].args.p_data,writes[1].args.p_data);assert.equal(f.calls.filter(x=>x.name==='aqari_official_document_number').length,1);}finally{f.cleanup();}
});
test('known SQL rejection permits correction without reporting a saved document',async()=>{
 const f=await fixture({rejectOnce:true});try{await f.select();await f.submit();assert.equal(f.records.size,0);assert.equal(f.button('إصدار وحفظ').disabled,false);await f.submit();assert.match(f.status(),/تم الحفظ والتحقق/);}finally{f.cleanup();}
});
test('wrong context scope cannot populate or submit financial data',async()=>{
 const f=await fixture({wrongContext:true});try{assert.equal(f.button('إصدار وحفظ').disabled,true);await f.submit();assert.equal(f.records.size,0);assert.match(f.status(),/تعذر تأكيد/);}finally{f.cleanup();}
});
test('correction preserves first version and reuses the archived source instead of replacing the original',async()=>{
 const f=await fixture();try{await f.select();await f.submit();const first=structuredClone([...f.records.values()][0]);f.control('نوع النموذج').value='tenant_statement';await f.control('نوع النموذج').onchange();f.control('السجل المرتبط').replaceChildren();f.control('الحركة المحفوظة').replaceChildren();await f.button('إنشاء إصدار مصحح').onclick();assert.equal(f.control('السجل المرتبط').value,'lease-1');assert.equal(f.control('الحركة المحفوظة').value,'payment-1');assert.equal(f.named('documentNo').readOnly,true);await f.submit();const updated=[...f.records.values()][0];assert.equal(updated.versions.length,2);assert.deepEqual(updated.versions[0],first.versions[0]);assert.match(f.status(),/تم الحفظ والتحقق/);}finally{f.cleanup();}
});
test('invalid calendar dates, reversed ranges and non-financial amounts are rejected in the real field validator',()=>{
 const values=Object.fromEntries(officialFields('tenant_statement').map(x=>[x.key,x.type==='date'?'2026-09-12':x.type==='decimal'?'0.000':'اختبار']));
 for(const change of [{fromDate:'2026-02-30'},{fromDate:'2026-10-01'},{payments:'NaN'},{payments:'1.0001'},{payments:'-5'}])assert.throws(()=>validateOfficialValues('tenant_statement',{...values,...change}));
 assert.equal(validateOfficialValues('tenant_statement',{...values,openingBalance:'-5.125'}).openingBalance,'-5.125');
});

test('typed number survives lost response and reuses its original reservation',async()=>{
 const f=await fixture({typed:true,lostBeforeWrite:true});try{await f.select();await f.submit();await f.button('التحقق من الحفظ السابق').onclick();assert.equal(f.records.size,1);assert.match(f.status(),/تم الحفظ والتحقق/);assert.equal(f.calls.filter(x=>x.name==='aqari_official_document_number').length,1);assert.match([...f.records.values()][0].series.document_no,/^AQ-RENT_RECEIPT-/);}finally{f.cleanup();}
});
test('a typed number for another kind is rejected before issue',async()=>{
 const f=await fixture({typed:true,wrongKind:true});try{await f.select();await f.submit();assert.equal(f.calls.filter(x=>x.args.p_action==='issue').length,0);assert.match(f.status(),/رقم المستند المحجوز/);}finally{f.cleanup();}
});

for(const mfaAt of ['number','issue'])for(const mfaMessage of ['MFA_REQUIRED','MFA_RECENT_REAUTH_REQUIRED']){
 test(`${mfaMessage} at ${mfaAt} preserves the official draft and retries one reservation`,async()=>{
  const f=await fixture({typed:true,mfaAt,mfaMessage});
  try{
   await f.select();const reason=f.control('سبب الإصدار أو التصحيح').value;
   await f.submit();
   assert.equal(f.connected(),true,'MFA rejection keeps the real document form attached');
   assert.equal(f.records.size,0,'a rejected write cannot be reported as archived');
   assert.equal(f.numbers.size,mfaAt==='number'?0:1,'only the successful allocator may reserve a serial');
   assert.equal(f.control('سبب الإصدار أو التصحيح').value,reason);
   assert.equal(f.named('amount').value,'12.345');
   assert.equal(f.button('إصدار وحفظ').disabled,false);
   assert.equal(f.button('التحقق من الحفظ السابق').hidden,true,'known rejection is not an uncertain write');
   assert.match(f.status(),/التحقق الثنائي/);
   assert.equal(f.calls.filter(x=>x.name==='aqari_official_document_number').length,1,'no automatic retry');
   assert.equal(f.calls.filter(x=>x.args.p_action==='issue').length,mfaAt==='number'?0:1);
   // The fixture accepts the explicit next attempt, representing completed step-up.
   // This is local transport simulation, not proof of hosted MFA acceptance.
   await f.submit();
   assert.equal(f.records.size,1);assert.equal(f.numbers.size,1);
   assert.match(f.status(),/تم الحفظ والتحقق/);
   const requests=f.calls.filter(x=>x.name==='aqari_official_document_number');
   assert.equal(requests.length,2);assert.deepEqual(requests[0].args,requests[1].args);
   const stored=[...f.records.values()][0];
   assert.equal(stored.series.id,requests[0].args.p_request_id);
   assert.equal(stored.versions.length,1);
   assert.equal(stored.series.document_no,[...f.numbers.values()][0]);
  }finally{f.cleanup();}
 });
}
