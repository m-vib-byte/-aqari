import test from 'node:test';
import assert from 'node:assert/strict';
import {openOpeningBalances,openingAmount} from '../src/v267/pages/opening-balances.js';
import {checksum} from '../src/v267/components/scan-image.js';

async function fixture({feature=true,wrongAccess=false,role='general_manager',lostReply=false,lostBefore=false,wrongProof=false,wrongHash=false}={}){
 const original={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch};const calls=[],records=new Map(),created=[],revoked=[];
 const originalURL={createObjectURL:URL.createObjectURL,revokeObjectURL:URL.revokeObjectURL};URL.createObjectURL=()=>{const id='blob:opening-'+created.length;created.push(id);return id;};URL.revokeObjectURL=id=>revoked.push(id);
 class Element{constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.value='';this.disabled=false;this.checked=false;}
  get value(){return this.tagName==='select'&&!this.children.some(x=>x.value===this._value)?'':this._value;}set value(v){this._value=this.tagName==='select'&&!this.children.some(x=>x.value===v)?'':v;}
  get isConnected(){return this.parent?this.parent.isConnected:this.connected===true;}
  append(...nodes){for(const n of nodes){this.children.push(n);n.parent=this;}}replaceChildren(...nodes){for(const old of this.children)old.parent=null;this.children=[];this.append(...nodes);}
  querySelectorAll(){return this.children.flatMap(n=>[n,...n.querySelectorAll()]);}setAttribute(k,v){this.attributes[k]=v;}addEventListener(){}showModal(){}close(){}remove(){this.parent.children=this.parent.children.filter(x=>x!==this);}}
 const w='opening-workspace',user='opening-user',tenantId='tenant-1';const blob=new Blob(['%PDF-Synthetic private opening source'],{type:'application/pdf'}),hash=await checksum(blob);
 const doc={id:'source-1',title:'مصدر محفوظ',document_no:'DOC-1',entity_type:'tenant',entity_ref:tenantId,storage_bucket:'aqari-documents',storage_path:w+'/source-1.pdf',checksum_sha256:wrongHash?'f'.repeat(64):hash,size_bytes:blob.size,mime_type:'application/pdf',original_filename:'source.pdf'};
 const entries=[{id:'opening-1',workspace_id:w,tenant_id:tenantId,lease_id:'lease-1',contract_no:'CON-1',kind:'opening_debit',direction:'debit',amount:'40.125',occurred_on:'2026-01-01',reason:'مديونية افتتاحية'},
  {id:'opening-2',workspace_id:w,tenant_id:tenantId,lease_id:'lease-1',contract_no:'CON-1',kind:'opening_credit',direction:'credit',amount:'10.125',occurred_on:'2026-01-31',reason:'رصيد دائن افتتاحي'},
  {id:'adjustment-3',workspace_id:w,tenant_id:tenantId,lease_id:null,contract_no:null,kind:'adjustment',direction:'credit',amount:'5.000',occurred_on:'2026-02-01',reason:'تسوية لاحقة'}];
 const client={rpc(name,args){calls.push({name,args:structuredClone(args)});return {abortSignal:async()=>{
  if(name==='aqari_workspace_access')return {data:{workspace_id:wrongAccess?'foreign':w,user_id:user,role,features:{opening_balance_reconciliation:feature},permissions:{finance:{read:true},documents:{read:true}}}};
  assert.equal(name,'aqari_opening_balance_reconciliation');const d=args.p_data;
  if(args.p_action==='context')return {data:{workspace_id:w,user_id:user,tenant_id:d.tenant_id||null,cutoff_date:d.cutoff_date||null,cutoff_boundary:'end_of_day',scope:'selected_opening_lines_source_review_only',tenants:[{id:tenantId,name:'مستأجر محفوظ'}],documents:d.tenant_id?[doc]:[],entries:d.tenant_id?entries.map(e=>({...e,side:d.cutoff_date?e.occurred_on<=d.cutoff_date?'through_cutoff':'after_cutoff':'unspecified'})):[],reviews:[...records.values()],latest_revision:[...records.values()].filter(x=>x.cutoff_date===d.cutoff_date).length,actual_collections:d.tenant_id?'100.000':null}};
  if(args.p_action==='get'){const r=structuredClone(records.get(d.id)||null);if(wrongProof&&r)r.entries_snapshot[0].amount='999.000';return {data:{workspace_id:w,user_id:user,review:r}};}
  assert.equal(args.p_action,'review');if(lostBefore){lostBefore=false;throw Error('انقطع الاتصال قبل الحفظ.');}
  const saved={...d,workspace_id:w,reviewed_by:user,reviewed_by_name:'مدير محفوظ',reviewed_at:'2026-09-12T14:00:00Z',revision:d.expected_revision+1,entries_snapshot:entries.filter(e=>d.entry_ids.includes(e.id)).map(e=>({...e})),document_snapshot:{...doc},request_snapshot:structuredClone(d),review_fingerprint:'a'.repeat(64)};
  records.set(d.id,saved);if(lostReply){lostReply=false;throw Error('انقطع الاتصال بعد الحفظ.');}return {data:{workspace_id:w,user_id:user,review:saved}};
 }};}};
 const body=new Element('body');body.connected=true;globalThis.document={body,activeElement:null,createElement:t=>new Element(t),documentElement:{classList:{contains:()=>true}}};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'},AQARI_DATA_GATE:{scope:{userId:user,workspaceId:w}},AQARI_SUPABASE:{getClient:async()=>client,getSession:async()=>({access_token:'synthetic-token',user:{id:user}}),context:{user:{id:user},workspace:{id:w},membership:{user_id:user,workspace_id:w,is_active:true,role}}},addEventListener(){},removeEventListener(){}};
 globalThis.fetch=async(url,options)=>{assert.match(url,/storage\/v1\/object\/authenticated\/aqari-documents\/opening-workspace\/source-1.pdf$/);assert.equal(options.method,'GET');return new Response(blob,{status:200,headers:{'Content-Type':'application/pdf'}});};
 await openOpeningBalances();const dialog=body.children[0],elements=()=>dialog.querySelectorAll();
 const control=label=>{const group=elements().find(x=>x.children?.[0]?.tagName==='label'&&x.children[0].textContent===label);assert.ok(group,label);return group.children[1];};
 const button=text=>elements().find(x=>x.tagName==='button'&&x.textContent===text);
 return {calls,records,elements,control,button,created,revoked,status:()=>elements().find(x=>x.attributes.role==='status')?.textContent,
  async select(){control('المستأجر').value=tenantId;await control('المستأجر').onchange();control('تاريخ القطع — نهاية اليوم المحدد').value='2026-01-31';await control('تاريخ القطع — نهاية اليوم المحدد').onchange();control('المستند المحفوظ').value=doc.id;control('المستند المحفوظ').onchange();await button('فتح المصدر المحفوظ والتحقق منه').onclick();
   control('موضع المصدر — رقم الصفحة أو البيان').value='صفحة 1 السطر 3';control('ما الذي يغطيه المصدر؟ وضّح الإيجار والرسوم والتأمين بحسب المستند').value='إيجار فقط؛ لا رسوم أو تأمين في هذا المصدر';control('المدين المثبت بالمصدر — د.ك').value='40.125';control('الدائن المثبت بالمصدر — د.ك').value='10.125';
   for(const x of elements().filter(x=>x.attributes['aria-label']?.startsWith('اختيار القيد'))){x.checked=true;x.onchange();}
   const a=elements().find(x=>x.type==='checkbox'&&!x.attributes['aria-label']);a.checked=true;a.onchange();},
  submit:()=>elements().find(x=>x.tagName==='form').onsubmit({preventDefault(){}}),cleanup(){dialog.children[0].onclick();Object.assign(globalThis,original);Object.assign(URL,originalURL);}};
}
test('feature, identity and manager checks prevent reading source review data',async()=>{
 for(const options of [{feature:false},{wrongAccess:true},{role:'accountant'}]){const f=await fixture(options);try{assert.equal(f.calls.filter(x=>x.name==='aqari_opening_balance_reconciliation').length,0);assert.equal(f.elements().some(x=>x.tagName==='form'),false);}finally{f.cleanup();}}
});
test('no date or zero defaults; real source bytes must verify before any attestation or write',async()=>{
 const f=await fixture({wrongHash:true});try{assert.equal(f.control('تاريخ القطع — نهاية اليوم المحدد').value,'');assert.equal(f.control('المدين المثبت بالمصدر — د.ك').value,'');assert.equal(f.control('الدائن المثبت بالمصدر — د.ك').value,'');await f.select();assert.equal(f.created.length,0);assert.equal(f.button('اعتماد مطابقة القيود المختارة').disabled,true);await f.submit();assert.equal(f.records.size,0);}finally{f.cleanup();}
});
test('verified source, explicit exact amounts and end-of-day selected lines save and confirm immutable readback',async()=>{
 const f=await fixture();try{await f.select();assert.equal(f.elements().filter(x=>x.attributes['aria-label']?.startsWith('اختيار القيد')).length,2);await f.submit();assert.match(f.status(),/تم اعتماد المطابقة والتحقق/);assert.equal(f.records.size,1);const saved=[...f.records.values()][0];assert.deepEqual(saved.entry_ids,['opening-1','opening-2']);assert.equal(saved.cutoff_boundary,'end_of_day');assert.equal(saved.source_debit,'40.125');assert.ok(f.calls.some(x=>x.args.p_action==='get'));assert.equal(f.revoked.length,1);}finally{f.cleanup();}
});
test('same net balance is insufficient; gross debit and credit must each equal the selected source lines',async()=>{
 const f=await fixture();try{await f.select();f.control('المدين المثبت بالمصدر — د.ك').value='30.125';f.control('الدائن المثبت بالمصدر — د.ك').value='0.125';await f.submit();assert.equal(f.records.size,0);assert.match(f.status(),/كلٌ على حدة/);}finally{f.cleanup();}
});
test('lost reply recovers the saved UUID without repeating the approval',async()=>{
 const f=await fixture({lostReply:true});try{await f.select();await f.submit();assert.equal(f.records.size,1);assert.equal(f.button('اعتماد مطابقة القيود المختارة').disabled,true);await f.button('التحقق من الحفظ السابق').onclick();assert.match(f.status(),/تم اعتماد المطابقة والتحقق/);assert.equal(f.calls.filter(x=>x.args.p_action==='review').length,1);}finally{f.cleanup();}
});
test('request lost before storage retries the same frozen UUID, source and lines',async()=>{
 const f=await fixture({lostBefore:true});try{await f.select();await f.submit();assert.equal(f.records.size,0);await f.button('التحقق من الحفظ السابق').onclick();assert.equal(f.records.size,1);const writes=f.calls.filter(x=>x.args.p_action==='review');assert.equal(writes.length,2);assert.deepEqual(writes[0].args.p_data,writes[1].args.p_data);}finally{f.cleanup();}
});
test('tampered line readback never confirms and keeps the saved request locked against duplicate writes',async()=>{
 const f=await fixture({wrongProof:true});try{await f.select();await f.submit();assert.doesNotMatch(f.status(),/تم اعتماد المطابقة والتحقق/);assert.equal(f.button('اعتماد مطابقة القيود المختارة').disabled,true);await f.submit();assert.equal(f.calls.filter(x=>x.args.p_action==='review').length,1);}finally{f.cleanup();}
});
test('source and cutoff changes clear attestation and revoke private download URLs',async()=>{
 const f=await fixture();try{await f.select();assert.equal(f.created.length,1);f.control('المستند المحفوظ').onchange();assert.equal(f.revoked.length,1);assert.equal(f.button('اعتماد مطابقة القيود المختارة').disabled,true);await f.button('فتح المصدر المحفوظ والتحقق منه').onclick();f.control('تاريخ القطع — نهاية اليوم المحدد').value='2026-02-01';await f.control('تاريخ القطع — نهاية اليوم المحدد').onchange();assert.equal(f.revoked.length,2);assert.equal(f.control('المستند المحفوظ').value,'');assert.equal(f.control('المدين المثبت بالمصدر — د.ك').value,'');}finally{f.cleanup();}
});
test('a correction requires a reason and links the current revision without overwriting the original',async()=>{
 const f=await fixture();try{await f.select();await f.submit();const first=structuredClone([...f.records.values()][0]);await f.select();await f.submit();assert.equal(f.records.size,1);assert.match(f.status(),/سبب التصحيح/);
  f.control('سبب التصحيح — مطلوب عند وجود مراجعة سابقة لنفس تاريخ القطع').value='توضيح التغطية بحسب الصفحة نفسها';f.control('ما الذي يغطيه المصدر؟ وضّح الإيجار والرسوم والتأمين بحسب المستند').value='إيجار يناير فقط؛ الرسوم والتأمين خارج المبالغ';await f.submit();
  assert.equal(f.records.size,2);const second=[...f.records.values()][1];assert.equal(second.previous_review_id,first.id);assert.equal(second.expected_revision,1);assert.equal(second.revision,2);assert.deepEqual(f.records.get(first.id),first);assert.match(f.status(),/تم اعتماد المطابقة والتحقق/);
 }finally{f.cleanup();}
});
test('explicit zero is valid but missing, negative, exponent or excess-precision values are rejected without floating point rounding',()=>{
 assert.equal(openingAmount('0'),'0.000');assert.equal(openingAmount('999999999999.999'),'999999999999.999');
 for(const v of ['',null,undefined,'-1','NaN','1e3','0.0001','1000000000000'])assert.throws(()=>openingAmount(v));
});
