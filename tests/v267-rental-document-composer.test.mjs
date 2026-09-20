import test from 'node:test';
import assert from 'node:assert/strict';
import {mountRentalDocumentCycle} from '../src/v267/pages/rental-document-cycle.js';
import {createSession} from '../src/v267/api/session.js';
import {documentTemplateBlueprints} from '../src/v267/domain/rental-document-cycle.js';

// Real composer, binding, substitution and scoped session; local DOM/network
// fixtures do not claim hosted or physical-device verification.
const clone=value=>JSON.parse(JSON.stringify(value));
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.value='';this.textContent='';this.style={};this.hidden=false;this.disabled=false;}
 append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
 prepend(...children){for(const child of children.reverse()){child.parent=this;this.children.unshift(child);}}
 replaceChildren(...children){this.children=[];this.append(...children);}
 setAttribute(name,value){this[name]=value;}
 get innerHTML(){return '';}
 set innerHTML(value){throw Error('Unsafe HTML rendering: '+value);}
 click(){this.clicked=true;}
}
const all=element=>[element,...element.children.flatMap(all)];
async function fixture({initial={},role='general_manager',emptyTemplates=false,missingOwner=false,badTemplate=false,wrongScope=false,holdPdf=false,responseStatus=200,badDigest=false,representative=false}={}){
 const original={document:globalThis.document,window:globalThis.window,fetch:globalThis.fetch},calls=[],downloads=[];
 const workspace='fixture-workspace',user='fixture-user';let activeUser=user,releaseBody=null;
 const profile={id:'tenant-1',nameAr:'مستأجر <script>اختبار</script>',nameEn:'Fixture Tenant',civilId:'123456789012',nationality:'اختبار'};
 const base={tenantId:profile.id,tenant:profile.nameAr,property:'عقار اختبار',unit:'1',floor:'3',start_date:'2026-01-01',end_date:'2026-12-31',writtenOn:'2025-12-15',contractRent:350.125,accountant:'محاسب اختبار'};
 const contracts=[{...base,id:'contract-1',contract_no:'C-1'},{...base,id:'contract-2',contract_no:'C-2',unit:'2'},{...base,id:'contract-3',contract_no:'C-3',tenantId:'tenant-2',tenant:'مستأجر آخر',unit:'3'}];
 const data={contractsV202:contracts,tenantProfilesV267:[profile,{...profile,id:'tenant-2',nameAr:'مستأجر آخر'}],rentReceiptsV267:[],rentLedgerV202:[]};
 const db={aqari_leases:contracts.map((c,i)=>({id:'lease-'+(i+1),workspace_id:workspace,external_ref:c.id,tenant_id:i===2?'db-tenant-2':'db-tenant-1',unit_id:'unit-'+(i+1),snapshot:c})),aqari_units:contracts.map((_,i)=>({id:'unit-'+(i+1),workspace_id:workspace,property_id:'property-1',unit_no:String(i+1)})),aqari_tenants:data.tenantProfilesV267.map((p,i)=>({id:'db-tenant-'+(i+1),workspace_id:workspace,external_ref:p.id,full_name:p.nameAr,civil_id:p.civilId,profile:p})),aqari_properties:[{id:'property-1',workspace_id:workspace,name:'عقار اختبار',external_ref:'legacy-property',metadata:{}}],aqari_rent_payments:[{id:'payment-1',workspace_id:workspace,lease_id:'lease-1',reference:'R-1',status:'paid',amount:'350.125',period:'2026-08-01',paid_at:'2026-08-02',payment_method:'K-Net',record:{transactionNo:'REF-1',receiverName:'مستلم اختبار',accountant:'محاسب الوصل'},receipt:{record:['R-1',profile.nameAr,'350.125','paid','عقار اختبار','2026-08-02','1','','2026-08','K-Net']}}]};
 const templates=emptyTemplates?[]:documentTemplateBlueprints.map((b,i)=>({id:'template-'+i,kind:b.kind,title:b.label,version:1,published_at:'2026-09-20T00:00:00Z',content_sha256:'a'.repeat(64),fields:clone(b.fields),clauses:[{title:'اختبار {{contract_no}}',text:'المستأجر {{tenant_name}} — وحدة {{unit_no}}'}]}));
 if(badTemplate)templates[0].clauses[0].text='{{field_name}}';
 const response=result=>({abortSignal:async()=>({data:clone(result)})});
 const client={
  rpc(name,args){calls.push({name,args:clone(args)});
   if(name==='aqari_read_state_v267')return response({workspace_id:wrongScope?'other-workspace':workspace,payload:data});
   if(name==='aqari_rental_templates'){assert.equal(args.p_action,'context','composer must never mutate templates');return response({workspace_id:workspace,user_id:user,can_publish:true,items:templates});}
   if(name==='aqari_property_contract_context')return response({workspace_id:workspace,user_id:user,property:{id:'property-1',name:'عقار اختبار',owners:missingOwner?[]:[{name:'مالك اختبار'}],...(representative?{representative:{name:'وكيل اختبار'}}:{})},unit:{id:args.p_unit_id,propertyId:'property-1',floor:'3',unitNo:args.p_unit_id.split('-').at(-1)}});
   if(name==='aqari_official_document_context')return response({workspace_id:workspace,user_id:user,kind:'rent_receipt',entity_id:args.p_entity_id,source_id:null,sources:db.aqari_rent_payments.filter(p=>p.lease_id===args.p_entity_id).map(p=>({id:p.id,label:p.reference}))});
   throw Error('Unexpected or mutating RPC '+name);
  },
  from(table){const query={table,filters:[],columns:'',count:null};calls.push(query);const builder={select(columns){query.columns=columns;return builder;},eq(name,value){query.filters.push([name,value]);return builder;},limit(count){query.count=count;return builder;},abortSignal:async()=>{assert.ok(query.filters.some(([name,value])=>name==='workspace_id'&&value===workspace));assert.ok(query.filters.some(([name])=>name!=='workspace_id'),'must query exact linked record');return {data:clone(db[table].filter(row=>query.filters.every(([name,value])=>row[name]===value)).slice(0,query.count))};}};return builder;},
  auth:{getSession:async()=>({data:{session:{access_token:'fixture-token',user:{id:activeUser}}}})}
 };
 globalThis.document={createElement:tag=>{const el=new Element(tag);if(tag==='a')el.click=()=>downloads.push(el.download);return el;},documentElement:{classList:{contains:()=>true}}};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'},AQARI_DATA_GATE:{scope:{userId:user,workspaceId:workspace}},AQARI_SUPABASE:{getClient:async()=>client,context:{user:{id:user},workspace:{id:workspace},membership:{user_id:user,workspace_id:workspace,is_active:true,role}}}};
 globalThis.fetch=async(url,options)=>{calls.push({url,options});const body=JSON.parse(options.body);return {ok:responseStatus===200,status:responseStatus,headers:new Headers({'content-type':'application/pdf','X-Aqari-Document-SHA256':badDigest?'0'.repeat(64):body.document.previewDigest}),blob:async()=>{if(holdPdf)await new Promise(resolve=>{releaseBody=resolve;});return new Blob(['%PDF-1.7 fixture'],{type:'application/pdf'});}};};
 const dispose=[],session=createSession();await session.connect();
 const d={session,body:new Element('main'),status:new Element('p'),closed:false,onDispose:fn=>dispose.push(fn),run:task=>Promise.resolve().then(()=>{session.check();return task();}),close(){this.closed=true;session.close();for(const fn of dispose)fn();}};
 const f={d,calls,data,templates,db,downloads,all:()=>all(d.body),control:name=>all(d.body).find(el=>el.name===name),button:label=>all(d.body).find(el=>el.tagName==='button'&&el.textContent===label),setUser:value=>{activeUser=value;},release:()=>releaseBody?.(),cleanup(){if(!d.closed)d.close();Object.assign(globalThis,original);}};
 try{await mountRentalDocumentCycle(d,d.body,initial);}catch(error){f.mountError=error;}
 return f;
}
async function choose(f,kind='rental_agreement'){
 if(f.control('document_kind').value!==kind){f.control('document_kind').value=kind;await f.control('document_kind').onchange();}
 f.control('template_id').value=f.templates.find(t=>t.kind===kind).id;await f.control('template_id').onchange();
}
function fillDocumentFields(f){for(const control of f.all().filter(el=>el.tagName==='input'&&!el.readOnly)){control.value=control.type==='date'?'2026-09-20':control.name==='key_count'?'9':control.name==='net_balance'?'0':'بيانات اختبار';}}

test('opening the five document structures reads saved data and never seeds or writes a model',async()=>{
 const f=await fixture({emptyTemplates:true});try{
  assert.equal(f.mountError,undefined);assert.deepEqual(f.control('document_kind').children.map(x=>x.value),['rental_agreement','apartment_handover','rent_receipt','eviction','owner_final_clearance']);
  assert.equal(f.control('template_id').disabled,true);assert.ok(f.all().some(x=>x.textContent.includes('لم تعتمد نموذجًا')));
  assert.deepEqual(f.calls.filter(x=>x.name).map(x=>x.name).sort(),['aqari_read_state_v267','aqari_rental_templates']);
 }finally{f.cleanup();}
});

test('a tenant with multiple contracts requires explicit contract selection; a unique contract auto-binds',async()=>{
 const f=await fixture();try{
  f.control('tenant_id').value='tenant-1';await f.control('tenant_id').onchange();assert.equal(f.control('contract_id').value,'');assert.equal(f.calls.some(x=>x.table),false);
  f.control('tenant_id').value='tenant-2';await f.control('tenant_id').onchange();assert.equal(f.control('contract_id').value,'contract-3');
  await choose(f);assert.equal(f.control('tenant_name').value,'مستأجر آخر');assert.equal(f.control('unit_no').value,'3');assert.equal(f.control('tenant_name').readOnly,true);
 }finally{f.cleanup();}
});

test('all five kinds resolve the same linked records and receipt preview requires a saved payment',async()=>{
 const f=await fixture({initial:{contractId:'contract-1'}});try{
  assert.equal(f.mountError,undefined);
  for(const kind of documentTemplateBlueprints.map(x=>x.kind)){
   await choose(f,kind);if(kind==='rent_receipt'){assert.equal(f.button('معاينة نهائية').disabled,true);f.control('receipt_id').value='payment-1';await f.control('receipt_id').onchange();assert.equal(f.control('amount').value,'350.125');assert.equal(f.control('amount').readOnly,true);assert.equal(f.control('payment_reference').value,'REF-1');assert.equal(f.control('receiver_name').value,'مستلم اختبار');assert.equal(f.control('accountant_name').value,'محاسب الوصل');assert.ok(f.calls.find(x=>x.table==='aqari_rent_payments').columns.split(',').includes('record'));}
   assert.equal(f.control('contract_no').value,'C-1');assert.equal(f.control('unit_no').value,'1');fillDocumentFields(f);await f.button('معاينة نهائية').onclick();
   assert.ok(f.all().some(x=>x.textContent.includes('المستأجر مستأجر <script>اختبار</script> — وحدة 1')));assert.equal(f.button('فتح وتحميل PDF').disabled,false);
  }
  assert.equal(f.calls.some(x=>x.args?.p_action&&x.args.p_action!=='context'),false);
 }finally{f.cleanup();}
});

test('contract and template changes clear document values, signer names, preview and PDF eligibility',async()=>{
 const f=await fixture({initial:{contractId:'contract-1'}});try{
  await choose(f,'apartment_handover');fillDocumentFields(f);await f.button('معاينة نهائية').onclick();assert.equal(f.button('فتح وتحميل PDF').disabled,false);
  f.control('contract_id').value='contract-2';await f.control('contract_id').onchange();assert.equal(f.control('document_no').value,'');assert.equal(f.control('unit_no').value,'2');assert.equal(f.button('فتح وتحميل PDF').disabled,true);assert.equal(f.all().some(x=>x.textContent==='معاينة للمراجعة فقط — غير معتمدة وغير موقعة'),false);
  fillDocumentFields(f);await f.button('معاينة نهائية').onclick();f.control('template_id').value='';await f.control('template_id').onchange();assert.equal(f.control('document_no'),undefined);assert.equal(f.button('فتح وتحميل PDF').disabled,true);
 }finally{f.cleanup();}
});

test('missing canonical data stays locked and prevents final preview rather than accepting local identity edits',async()=>{
 const f=await fixture({initial:{contractId:'contract-1'},missingOwner:true});try{
  await choose(f);assert.equal(f.control('owner_name').readOnly,true);assert.equal(f.control('owner_name').value,'');
  f.control('owner_name').value='forged owner';await assert.rejects(f.button('معاينة نهائية').onclick(),/مالك العقار/);assert.equal(f.button('فتح وتحميل PDF').disabled,true);
 }finally{f.cleanup();}
});

test('generic and unknown placeholders block final preview and PDF',async()=>{
 const f=await fixture({initial:{contractId:'contract-1'},badTemplate:true});try{
  await choose(f);await assert.rejects(f.button('معاينة نهائية').onclick(),/field_name/);await assert.rejects(f.button('فتح وتحميل PDF').onclick(),/المعاينة النهائية/);assert.equal(f.calls.some(x=>x.url),false);
 }finally{f.cleanup();}
});

test('PDF request includes only document-specific values, linked identifiers and the reviewed digest',async()=>{
 const f=await fixture({initial:{contractId:'contract-1'}});try{
  await choose(f,'apartment_handover');fillDocumentFields(f);await f.button('معاينة نهائية').onclick();await f.button('فتح وتحميل PDF').onclick();
  const call=f.calls.find(x=>x.url),body=JSON.parse(call.options.body);assert.equal(body.document.contractId,'contract-1');assert.equal(body.document.tenantId,'tenant-1');assert.match(body.document.previewDigest,/^[a-f0-9]{64}$/);
  assert.equal(body.template.version,undefined);assert.equal(body.template.content_sha256,undefined);assert.equal(body.template.fields.some(x=>'source' in x),false);assert.deepEqual(Object.keys(body.document.values).sort(),['document_no','handover_date','key_count','unit_condition']);assert.equal(body.document.values.tenant_name,undefined);assert.ok(call.options.signal);assert.equal(call.options.credentials,'same-origin');assert.equal(call.options.redirect,'error');assert.equal(f.downloads.length,1);
  f.control('unit_condition').value='تغيير بعد المعاينة';f.control('unit_condition').oninput();assert.equal(f.button('فتح وتحميل PDF').disabled,true);await assert.rejects(f.button('فتح وتحميل PDF').onclick(),/المعاينة النهائية/);
 }finally{f.cleanup();}
});

test('manager-only access and mismatched saved workspace stop before records are exposed',async()=>{
 for(const settings of [{role:'accountant'},{wrongScope:true}]){const f=await fixture(settings);try{assert.ok(f.mountError);assert.equal(f.calls.some(x=>x.table),false);if(settings.role)assert.equal(f.calls.length,0);}finally{f.cleanup();}}
});

test('auth changes before PDF prevent the request and auth changes during the body prevent the download',async()=>{
 let f=await fixture({initial:{contractId:'contract-1'}});try{await choose(f);await f.button('معاينة نهائية').onclick();f.setUser('another-user');await assert.rejects(f.button('فتح وتحميل PDF').onclick(),/جلسة الدخول/);assert.equal(f.calls.some(x=>x.url),false);}finally{f.cleanup();}
 f=await fixture({initial:{contractId:'contract-1'},holdPdf:true});try{await choose(f);await f.button('معاينة نهائية').onclick();const promise=f.button('فتح وتحميل PDF').onclick();await new Promise(setImmediate);f.setUser('another-user');f.release();await assert.rejects(promise,/جلسة الدخول/);assert.equal(f.downloads.length,0);}finally{f.cleanup();}
});

test('closing the dialog aborts a hanging PDF read and discards its late result',async()=>{
 const f=await fixture({initial:{contractId:'contract-1'},holdPdf:true});try{
  await choose(f);await f.button('معاينة نهائية').onclick();const promise=f.button('فتح وتحميل PDF').onclick();await new Promise(setImmediate);const call=f.calls.find(x=>x.url);f.d.close();await assert.rejects(promise,/جلسة الدخول/);assert.equal(call.options.signal.aborted,true);f.release();await new Promise(setImmediate);assert.equal(f.downloads.length,0);
 }finally{f.cleanup();}
});

test('changed saved data and a mismatched PDF digest cannot download an unreviewed snapshot',async()=>{
 for(const setting of [{responseStatus:409},{badDigest:true}]){
  const f=await fixture({initial:{contractId:'contract-1'},...setting});try{
   await choose(f);await f.button('معاينة نهائية').onclick();await assert.rejects(f.button('فتح وتحميل PDF').onclick(),/تغيرت البيانات|لم يطابق/);assert.equal(f.downloads.length,0);
   if(setting.responseStatus)assert.equal(f.button('فتح وتحميل PDF').disabled,true);
  }finally{f.cleanup();}
 }
});

test('explicit property representative appears by his own role without generating a signature',async()=>{
 const f=await fixture({initial:{contractId:'contract-1'},representative:true});try{
  await choose(f);await f.button('معاينة نهائية').onclick();assert.ok(f.all().some(x=>x.textContent==='وكيل المالك المفوض'));assert.ok(f.all().some(x=>x.textContent==='الاسم: وكيل اختبار'));assert.ok(f.all().some(x=>x.textContent==='التوقيع: ……………………'));assert.equal(f.control('owner_name').value,'مالك اختبار');
 }finally{f.cleanup();}
});
