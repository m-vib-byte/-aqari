'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const sandbox={module:{exports:{}},structuredClone};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../v267-rental-records.js'),'utf8'),sandbox);
const api=sandbox.module.exports;
const clone=x=>JSON.parse(JSON.stringify(x));
const tenant={id:'synthetic-tenant',nameAr:'مستأجر اختبار',nameEn:'Synthetic Tenant',civilId:'123456789012',phone:'55555555',nationality:'اختبار',email:'tenant@example.invalid',passportNo:'TEST-P123',address:'',attachments:[]};
const contract={id:123,contract_no:'TEST-123',tenantId:tenant.id,property:'عقار اختبار',unit:'٤',rent:'100.125',deposit:'50',start_date:'2026-09-01',end_date:'2027-08-31',status:'draft',floor:'1',advance:'0',cleaningFee:'5',discount:'10',accountant:'محاسب اختبار',receivedAt:'2026-09-01T10:30',writtenOn:'2026-09-09',evictionNotice:'لم يُبلّغ'};
test('contract delivery may be pending; optional charges and an approved free month are explicit',()=>{
 const c=api.lease({...contract,rentalTermsVersion:1,rentEntitlement:{version:1,startDate:'2026-09-01',firstPeriodPolicy:'full_month',manualFirstPeriodAmount:null},deposit:'',advance:'',cleaningFee:'',contractReceived:'لم يستلم',receivedAt:'',depositReceivedOn:'',freeMonthApproved:true,freeMonthPeriod:'2026-10',rentAdjustments:[]},[],[tenant],[['عقار اختبار']]);
 assert.equal(c.deposit,0);assert.equal(c.receivedAt,'');assert.equal(c.contractReceived,'لم يستلم');assert.equal(api.effectiveRent(c,'2026-10'),0);assert.equal(api.effectiveRent(c,'2026-11'),90.125);assert.equal(api.directoryFields(c,tenant).freeMonth,'نعم — 2026-10');
 assert.throws(()=>api.lease({...c,freeMonthPeriod:'2028-01'},[],[tenant],[['عقار اختبار']]),/الشهر المجاني/);
 assert.throws(()=>api.lease({...c,depositReceivedOn:'2026-09-01'},[],[tenant],[['عقار اختبار']]),/التأمين/);
 assert.throws(()=>api.lease({...c,contractReceived:'مستلم',receivedAt:''},[],[tenant],[['عقار اختبار']]),/استلام/);
 const changed=api.lease({...c,rentAdjustments:[{effectiveMonth:'2026-11',discount:'20.125',reason:'Approved test change'}]},[c],[tenant],[['عقار اختبار']]);
 assert.equal(api.effectiveRent(changed,'2026-09'),90.125);assert.equal(api.effectiveRent(changed,'2026-11'),80);assert.equal(api.effectiveRent(changed,'2026-10'),0);assert.equal(changed.contractRent,100.125);
});
function valid(c=contract,old=[]){return api.lease(c,old,[tenant],[['عقار اختبار']])}
test('complete reusable tenant profile normalizes civil ID and prevents duplicates',()=>{
 assert.equal(api.profile({...tenant,civilId:'١٢٣٤٥٦٧٨٩٠١٢'}).civilId,tenant.civilId);
 assert.throws(()=>api.profile({...tenant,nameEn:''}),/أكمل/);
 assert.throws(()=>api.profile({...tenant,civilId:'123'}),/أكمل/);
 assert.throws(()=>api.profile({...tenant,email:'wrong'}),/البريد/);
 assert.throws(()=>api.profile(tenant,[{...tenant,id:'other'}]),/مسجل/);
});
test('lease binds a saved profile and exact property/unit with three-decimal money',()=>{
 const c=valid();assert.equal(c.unit,'4');assert.equal(c.rent,90.125);assert.equal(c.contractRent,100.125);assert.equal(c.tenantProfile.nameEn,tenant.nameEn);
 assert.throws(()=>api.lease(contract,[],[],[['عقار اختبار']]),/احفظ ملف/);
 assert.throws(()=>valid({...contract,rent:'1.1234'}),/مبلغ/);
 assert.throws(()=>valid({...contract,start_date:'2026-02-30'}),/تاريخ/);
});
test('lease conflicts include boundary dates, incomplete legacy dates and localized unit digits',()=>{
 const old=valid();
 assert.throws(()=>valid({...contract,id:124,contract_no:'TEST-124',unit:'4'},[old]),/متعارض/);
 assert.throws(()=>valid({...contract,id:124,contract_no:'TEST-124',start_date:'2027-08-31',end_date:'2028-08-31'},[old]),/متعارض/);
 assert.throws(()=>valid({...contract,id:124,contract_no:'TEST-124'},[{...old,start_date:null}]),/متعارض/);
 assert.throws(()=>valid({...contract,id:124,contract_no:'TEST-124'},[{contractId:999,propertyName:old.property,unitName:'٤',contractNo:'ALIAS',startDate:old.start_date,endDate:old.end_date}]),/متعارض/);
 assert.equal(valid({...contract,id:124,contract_no:'TEST-124',start_date:'2027-09-01',end_date:'2028-08-31'},[old]).id,124);
 assert.equal(valid({...contract,id:124,contract_no:'TEST-124',unit:'14'},[old]).unit,'14');
 assert.equal(valid({...contract,id:124,contract_no:'TEST-124'},[{...old,status:'cancelled'}]).id,124);
 assert.throws(()=>valid({...contract,id:124},[{...old,status:'cancelled'}]),/رقم العقد/);
});
function fixture(mode='direct'){
 let current={userId:'synthetic-user',workspaceId:'synthetic-workspace'},revision=1;
 const initial={tenants:[],tenantProfilesV267:[],contractsV202:[],properties:[['عقار اختبار']],audit:[]};
 let local=clone(initial),payload=mode==='envelope'?{format:'aqari-cloud-state-v1',snapshot:{values:{aqari_v30:clone(initial),untouched:{keep:true}}}}:mode==='snapshot'?{schema:'aqari-local-snapshot-v1',values:{aqari_v30:clone(initial)}}:clone(initial);
 const options={scope:()=>current,local:()=>local,load:async()=>({payload:clone(payload),revision}),save:async(p,r)=>{if(r!==revision)throw Error('revision conflict');payload=clone(p);revision++},cache(){}};
 return {options,store:api.createStore(options),read:()=>clone(payload),reload:()=>{local=clone(api.primary(payload));return local},switchScope:()=>{current=null}};
}
const saveTenant=store=>store.change(['tenantProfilesV267'],db=>{const p=api.profile(tenant,db.tenantProfilesV267);db.tenantProfilesV267.push(p);return p},(db,p)=>db.tenantProfilesV267.some(x=>x.id===p.id));
for(const format of ['direct','envelope','snapshot'])test('tenant → lease → status survives authoritative reload in '+format,async()=>{
 const f=fixture(format);await saveTenant(f.store);assert.equal(f.reload().tenantProfilesV267.length,1);
 const add=c=>f.store.change(['contractsV202','tenantProfilesV267','properties'],db=>{const saved=api.lease(c,db.contractsV202,db.tenantProfilesV267,db.properties);db.contractsV202=db.contractsV202.filter(x=>x.id!==saved.id).concat([saved]);return saved},(db,c)=>db.contractsV202.some(x=>JSON.stringify(x)===JSON.stringify(c)));
 await add(contract);assert.equal(f.reload().contractsV202[0].status,'draft');
 await add({...contract,status:'signed'});assert.equal(f.reload().contractsV202[0].status,'signed');
 await assert.rejects(add({...contract,id:124,contract_no:'TEST-124'}),/متعارض/);
 if(format==='envelope')assert.equal(f.read().snapshot.values.untouched.keep,true);
});
test('a lost acknowledgement requires reload and never publishes success or retries blindly',async()=>{
 const f=fixture();const original=f.options.save;let writes=0;
 f.options.save=async(...args)=>{writes++;await original(...args);throw Error('connection lost')};
 await assert.rejects(saveTenant(f.store),/قد يكون السجل وصل/);
 assert.equal(f.options.local().tenantProfilesV267.length,0);
 await assert.rejects(saveTenant(f.store),/تحديث الصفحة مطلوب/);assert.equal(writes,1);
 assert.equal(f.reload().tenantProfilesV267.length,1);
});
test('missing readback does not expose a saved tenant',async()=>{
 const f=fixture();f.options.save=async()=>{};
 await assert.rejects(saveTenant(f.store),/تأكيد الحفظ/);assert.equal(f.options.local().tenantProfilesV267.length,0);
});
test('concurrent lease writers cannot both save conflicting contracts',async()=>{
 const f=fixture();await saveTenant(f.store);f.reload();
 const second=api.createStore({...f.options,local:()=>clone(f.options.local())});
 const write=(store,id)=>store.change(['contractsV202'],db=>{const c=api.lease({...contract,id,contract_no:'TEST-'+id},db.contractsV202,db.tenantProfilesV267,db.properties);db.contractsV202.push(c);return c},(db,c)=>db.contractsV202.some(x=>x.id===c.id));
 const results=await Promise.allSettled([write(f.store,201),write(second,202)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(api.primary(f.read()).contractsV202.length,1);
});
test('scope loss after write never copies the previous account into local state',async()=>{
 const f=fixture(),save=f.options.save;f.options.save=async(...args)=>{await save(...args);f.switchScope()};
 await assert.rejects(saveTenant(f.store));assert.equal(f.options.local().tenantProfilesV267.length,0);
});

test('preparation draft accepts incomplete details but cannot issue a lease',()=>{
 const draft=api.tenantDraft({id:'draft-only',nameAr:'مسودة',phone:'٥٥',civilId:''});
 assert.equal(draft.phone,'55');
 assert.throws(()=>api.profile(draft),/أكمل/);
 assert.throws(()=>api.lease({...contract,tenantId:draft.id},[],[draft],[['عقار اختبار']]),/أكمل/);
 assert.throws(()=>api.tenantDraft({id:'empty'}),/اسماً/);
});
test('preparation draft persists separately without mutating tenants, contracts or source evidence',async()=>{
 const f=fixture();const before=f.read();const draft=api.tenantDraft({id:'draft-1',nameEn:'Later entry'});
 await f.store.change(['tenantPreparationDraftsV267'],db=>{db.tenantPreparationDraftsV267=[draft];return draft},(db,saved)=>db.tenantPreparationDraftsV267.some(x=>x.id===saved.id));
 const after=f.reload();assert.deepEqual(after.tenants,before.tenants);assert.deepEqual(after.contractsV202,before.contractsV202);assert.equal(after.tenantPreparationDraftsV267[0].nameEn,'Later entry');
});

test('contract requires every new field and keeps original rent separate from discount',()=>{
 for(const field of ['floor','advance','cleaningFee','discount','accountant','receivedAt','writtenOn'])assert.throws(()=>valid({...contract,[field]:''}),field);
 for(const field of ['nameAr','nameEn','nationality','civilId','passportNo','phone'])assert.throws(()=>api.lease(contract,[],[{...tenant,[field]:''}],[['عقار اختبار']]),field);
 assert.throws(()=>valid({...contract,discount:'101'}));
 const original=valid();assert.throws(()=>valid({...original,contractRent:120},[original]),/محفوظان/);
 const adjusted=valid({...original,discount:20},[original]);assert.equal(adjusted.contractRent,100.125);assert.equal(adjusted.rent,80.125);
 const linked=api.directoryFields(adjusted,tenant);assert.equal(linked.currentRent,80.125);assert.equal(linked.advance,0);assert.equal(linked.passportNo,tenant.passportNo);assert.equal(linked.accountant,contract.accountant);
});
test('a new contract accepts an absent tenant email without inventing contact data',()=>{
 for(const email of [undefined,null,'','   ']){
  const input={...tenant,email};if(email===undefined)delete input.email;
  const savedProfile=api.profile(input);assert.equal(savedProfile.email,'');
  const savedContract=api.lease(contract,[],[savedProfile],[['عقار اختبار']]);
  assert.equal(savedContract.tenantProfile.email,'');
  assert.equal(savedContract.tenantProfile.passportNo,tenant.passportNo);
  assert.equal(api.directoryFields(savedContract,savedProfile).email,'');
 }
});
test('optional tenant email is still validated when supplied to contract creation',()=>{
 for(const email of ['wrong','missing@host','two@@example.invalid','name @example.invalid']){
  assert.throws(()=>api.lease(contract,[],[{...tenant,email}],[['عقار اختبار']]),/البريد/);
 }
 const saved=api.lease(contract,[],[tenant],[['عقار اختبار']]);
 assert.equal(saved.tenantProfile.email,tenant.email);
 assert.equal(api.directoryFields(saved,tenant).email,tenant.email);
});
test('Kuwait contract dates are independent of browser timezone; delivery rejects invalid or future dates',()=>{
 assert.equal(api.kuwaitDate(new Date('2026-09-08T22:30:00Z')),'2026-09-09');
 assert.equal(api.receivedAt('2026-09-01T10:30'),'2026-09-01T10:30:00+03:00');
 assert.throws(()=>api.receivedAt('2026-02-30T10:00'));
 assert.throws(()=>api.receivedAt('2026-09-01T25:00'));
 assert.throws(()=>api.receivedAt('2099-09-01T10:00'));
});

test('contract and annex retain both tenant names and escape inserted content',()=>{
 const browserModule={module:{exports:{}},document:{},structuredClone};vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../v267-rental-records.js'),'utf8'),browserModule);
 const c={...valid(),tenantProfile:{...tenant,nameEn:'Synthetic <Tenant>'},rentalTermsVersion:1,freeMonthApproved:true,freeMonthPeriod:'2026-10',rentAdjustments:[{effectiveMonth:'2026-11',discount:20,rent:80,reason:'Approved test'}]};
 const contract=browserModule.module.exports.contractMarkup(c,1),annex=browserModule.module.exports.contractAnnexMarkup(c);
 assert.match(contract,/حُرر هذا العقد في دولة الكويت بتاريخ 2026-09-09/);
 for(const html of [contract,annex]){assert.match(html,/مستأجر اختبار/);assert.match(html,/Synthetic &lt;Tenant&gt;/);assert.doesNotMatch(html,/<Tenant>/);}
 assert.match(annex,/2026-10/);assert.doesNotMatch(annex,/2026-11|Approved test|تعديلات الخصم المؤرخة/);
 assert.deepEqual(c.rentAdjustments,[{effectiveMonth:'2026-11',discount:20,rent:80,reason:'Approved test'}]);
});


test('saving a lease uses authoritative identity data while ignoring read-only local projections',async()=>{
 const f=fixture();await saveTenant(f.store);f.reload();
 const originalProperties=clone(api.primary(f.read()).properties),originalProfiles=clone(api.primary(f.read()).tenantProfilesV267);
 f.options.local().properties.push(['Display-only imported property']);
 f.options.local().tenantProfilesV267[0].nameAr='Local display projection';
 const source=fs.readFileSync(require('node:path').join(__dirname,'../v267-rental-records.js'),'utf8');
 const saveBlock=source.slice(source.indexOf('async function saveLease'),source.indexOf('async function generate'));
 const createSave=new vm.Script('('+saveBlock.trim()+')');
 const context=vm.createContext({root:{AQARI_V202:{canCreateContract:()=>true}},fail:message=>{throw Error(message)},store:f.store,lease:api.lease,directoryFields:api.directoryFields,scope:f.options.scope,same:(a,b)=>JSON.stringify(a)===JSON.stringify(b)});
 const save=createSave.runInContext(context);await save(contract);
 const saved=api.primary(f.read());
 assert.equal(saved.contractsV202[0].tenantProfile.nameAr,tenant.nameAr);
 assert.equal(saved.tenantDirectoryV202[0].tenantProfileId,tenant.id);
 assert.equal(saved.leases[0][4],contract.id);
 assert.deepEqual(saved.properties,originalProperties);assert.deepEqual(saved.tenantProfilesV267,originalProfiles);
 assert.equal(saved.audit.length,1);
});

test('confirmed foundation writes synchronize only unchanged local sections for the next lease transition',async()=>{
 const bound={userId:'manager',workspaceId:'test'},before={contractsV202:[],audit:[],unrelated:['keep']},confirmed={...clone(before),contractsV202:[{id:'new',status:'draft'}],audit:[['foundation']],unrelated:['remote']};
 const local=clone(before);let cloud=clone(confirmed),writes=0;
 const store=api.createStore({scope:()=>bound,local:()=>local,load:async()=>({payload:clone(cloud),revision:1}),save:async p=>{cloud=clone(p);writes++;},cache(){}});
 assert.equal(store.adoptConfirmed(['contractsV202','audit'],before,confirmed,bound),true);
 assert.deepEqual(local.unrelated,['keep']);
 await store.change(['contractsV202','audit'],data=>{data.contractsV202[0].status='ready';return data.contractsV202[0];},(data,c)=>data.contractsV202[0].status===c.status);
 assert.equal(writes,1);assert.equal(local.contractsV202[0].status,'ready');
});

test('foundation cache synchronization preserves local edits atomically and rejects changed identity',()=>{
 const bound={userId:'manager',workspaceId:'test'},before={contractsV202:[],audit:[]},confirmed={contractsV202:[{id:'new'}],audit:[['foundation']]};
 for(const conflict of ['local','scope']){
  const local=clone(before);if(conflict==='local')local.audit=[['unsaved local audit']];const snapshot=clone(local);
  const store=api.createStore({scope:()=>bound,local:()=>local,cache(){throw Error('must not cache');}});
  assert.equal(store.adoptConfirmed(['contractsV202','audit'],before,confirmed,conflict==='scope'?{...bound,userId:'other'}:bound),false);
  assert.deepEqual(local,snapshot);
 }
});

test('foundation cache synchronization cannot clear an uncertain write lock',async()=>{
 const bound={userId:'manager',workspaceId:'test'},local={contractsV202:[]};
 const store=api.createStore({scope:()=>bound,local:()=>local,load:async()=>({payload:{contractsV202:[]},revision:1}),save:async()=>{throw Error('timeout');},cache(){}});
 await assert.rejects(store.change(['contractsV202'],data=>{data.contractsV202.push({id:'new'});},()=>true),/تأكيد/);
 assert.equal(store.adoptConfirmed(['contractsV202'],{contractsV202:[]},{contractsV202:[{id:'new'}]},bound),false);
 assert.deepEqual(local,{contractsV202:[]});
});
