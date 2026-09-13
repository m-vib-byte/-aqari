'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../v202-property-os.js'),'utf8');
const rentalSource=fs.readFileSync(path.join(__dirname,'../v267-rental-records.js'),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
function voucherValue(html,label){
 for(const line of html.matchAll(/<div class="v267-voucher-line">([\s\S]*?)<\/div>/g)){
  if(line[1].includes('>'+label+'</small>'))return line[1].match(/<strong>([\s\S]*?)<\/strong>/)?.[1];
 }
 return undefined;
}

function fixture(options={}){
 let instant=options.today||'2026-09-10T12:00:00Z';
 class Clock extends Date{
  constructor(...args){super(...(args.length?args:[instant]));}
  static now(){return Date.parse(instant);}
 }
 const rentalContext={module:{exports:{}},structuredClone,Date:Clock};
 vm.runInNewContext(rentalSource,rentalContext);
 const rental=rentalContext.module.exports;
 const scope={userId:'entitlement-user',workspaceId:'entitlement-workspace'};
 const contract={id:'entitlement-contract',contract_no:'ENTITLEMENT-CONTRACT',tenant:'مستأجر اختبار الاستحقاق',property:'عقار اختبار الاستحقاق',unit:'1',rent:90,contractRent:100,discount:10,rentalTermsVersion:1,detailsVersion:2,freeMonthApproved:false,freeMonthPeriod:'',rentAdjustments:[],rentEntitlement:{version:1,startDate:'2026-09-20',firstPeriodPolicy:'daily_prorated',manualFirstPeriodAmount:null},status:'signed',start_date:'2026-09-01',end_date:'2027-08-31',source:'v267-cloud',tenantProfile:{nameEn:'Entitlement Tenant',email:'entitlement@example.invalid'},...clone(options.contract||{})};
 if(options.legacy)delete contract.rentEntitlement;
 const data={properties:[[contract.property]],contractsV202:[contract],collections:[],rentLedgerV202:[],rentReceiptsV267:[],audit:[]};
 let remote=clone(data),revision=1,reads=0,writes=0;
 const initial=clone(remote),elements={};
 function element(value=''){
  const classes=new Set(),attrs=new Map();
  return {value,textContent:'',innerHTML:'',dataset:{},disabled:false,isConnected:true,
   classList:{contains:name=>classes.has(name),add:name=>classes.add(name),remove:name=>classes.delete(name),toggle(name,on){if(on===undefined)on=!classes.has(name);if(on)classes.add(name);else classes.delete(name);return on;}},
   setAttribute:(name,v)=>attrs.set(name,v),removeAttribute:name=>attrs.delete(name),hasAttribute:name=>attrs.has(name),querySelector:()=>null,querySelectorAll:()=>[],focus(){}};
 }
 const values={v202PaymentContract:contract.id,v202PaymentNumber:'ENTITLEMENT-RECEIPT-1',v202PaymentAmount:options.amount||'33',v202PaymentStatus:'مدفوع',v202PaymentPeriod:options.period||'2026-09',v202PaymentDate:options.paidAt||'2026-09-10',v202PaymentMethod:'نقدي',v267PaymentTransaction:'CASH-ENTITLEMENT-1',v202PaymentNote:''};
 for(const [id,value]of Object.entries(values))elements[id]=element(value);
 for(const id of ['v202PaymentError','v202PaymentBalance','v267PaymentContractDetails','v267PaymentSubmit','v202DocumentDialog','v202DocumentDialogTitle','v202DocumentBody'])elements[id]=element();
 const window={AQARI_DATA_GATE:{scope},AQARI_EARLY_STORAGE_GATE:{scope},AQARI_RENTAL_RECORDS:options.withoutHelper?undefined:rental,
  AQARI_SUPABASE:{context:{user:{id:scope.userId},workspace:{id:scope.workspaceId},membership:{is_active:true,user_id:scope.userId,workspace_id:scope.workspaceId,role:'general_manager'}},
   async loadAppState(actualScope){assert.deepEqual(clone(actualScope),scope);reads++;return {payload:clone(options.omitReadback&&writes?initial:remote),revision};},
   async saveAppState(payload,expectedRevision,actualScope){assert.deepEqual(clone(actualScope),scope);assert.equal(expectedRevision,revision);writes++;remote=clone(payload);revision++;}},
  AQARI_CLOUD_SYNC:{decodeCloudPayload:payload=>({primary:payload})}};
 const body=element();body.children=[];body.appendChild=node=>{elements[node.id]=node;body.children.push(node);};
 const document={readyState:'loading',documentElement:{classList:{contains:()=>true}},activeElement:null,addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[],getElementById:id=>elements[id]||null,createElement:()=>element(),head:{appendChild(){}},body};
 const context={window,document,db:data,console,Date:Clock,structuredClone,setTimeout(){},clearTimeout(){},requestAnimationFrame(){},localContractsV55:()=>[]};
 const end=source.lastIndexOf('})();');
 // Expose real runtime functions. Only cloud transport and DOM are simulated.
 const expose='globalThis.api={normalizeContract,contractRent,savePayment,savedVoucher,contextFor,rentStatementItems,propertyRentLedgerRows,updatePaymentBalance,contractEntitlementDueOn,rentEntitlementPaymentStatus};activeProperty='+JSON.stringify(contract.property)+';';
 vm.runInNewContext(source.slice(0,end)+expose+source.slice(end),context);
 return {api:context.api,rental,window,elements,data,contract,read:()=>clone(remote),counts:()=>({reads,writes}),setToday:value=>{instant=value;},submit:()=>context.api.savePayment({preventDefault(){}})};
}

test('normalization preserves explicit entitlement independently and adds no terms to legacy contracts',()=>{
 const f=fixture(),normalized=f.api.normalizeContract(f.contract,'db-v202',0);
 assert.deepEqual(clone(normalized.rentEntitlement),f.contract.rentEntitlement);
 assert.notEqual(normalized.rentEntitlement,f.contract.rentEntitlement);
 normalized.rentEntitlement.startDate='2026-09-25';
 assert.equal(f.contract.rentEntitlement.startDate,'2026-09-20');
 const legacy={...f.contract};delete legacy.rentEntitlement;
 assert.equal(Object.hasOwn(f.api.normalizeContract(legacy,'db-v202',0),'rentEntitlement'),false);
});

test('a prorated first rent saves, reads back and prints the same 33.000 net while retaining the 100 original rent',async()=>{
 const f=fixture();
 assert.equal(await f.submit(),true,f.elements.v202PaymentError.textContent);
 assert.deepEqual(f.counts(),{reads:2,writes:1});
 const remote=f.read(),ledger=remote.rentLedgerV202[0],receipt=remote.rentReceiptsV267[0];
 assert.equal(ledger.due,33);assert.equal(ledger.paid,33);assert.equal(ledger.balance,0);assert.equal(ledger.status,'مدفوع');
 assert.equal(receipt.contract.contractRent,100);assert.equal(receipt.contract.rent,90);
 assert.deepEqual(receipt.rentPeriodBreakdown,{version:1,period:'2026-09',dueOn:'2026-09-20',gross:36.667,discount:3.667,net:33,manual:false,freeMonth:false,policy:'daily_prorated'});
 assert.deepEqual(clone(f.data.rentLedgerV202),remote.rentLedgerV202);
 assert.deepEqual(clone(f.data.rentReceiptsV267),remote.rentReceiptsV267);
 const printed=f.api.savedVoucher(f.data.collections[0]);
 assert.equal(Number(voucherValue(printed,'Original contract rent')),100);
 assert.equal(Number(voucherValue(printed,'Period gross rent')),36.667);
 assert.equal(Number(voucherValue(printed,'Period discount')),3.667);
 assert.equal(Number(voucherValue(printed,'Period net due')),33);
 assert.match(printed,/2026-09-20/);
 assert.doesNotMatch(printed,/الخامس من كل شهر/);
 assert.match(printed,/CASH-ENTITLEMENT-1/);
 const statement=f.api.rentStatementItems(f.api.contextFor(f.contract.property),'2026-09');
 assert.equal(statement.length,1);assert.equal(statement[0].due,33);assert.equal(statement[0].paid,33);assert.equal(statement[0].balance,0);assert.equal(statement[0].paymentStatus,'مسدد');
});

test('receipt terms and printed values are immutable after a live monthly discount amendment',async()=>{
 const f=fixture();assert.equal(await f.submit(),true,f.elements.v202PaymentError.textContent);
 const record=f.data.collections[0],snapshot=JSON.stringify(f.data.rentReceiptsV267[0]),before=f.api.savedVoucher(record);
 f.data.contractsV202[0].rent=80;
 f.data.contractsV202[0].discount=20;
 f.data.contractsV202[0].rentAdjustments=[{effectiveMonth:'2026-09',rent:80,discount:20,reason:'Synthetic later adjustment'}];
 assert.equal(f.api.savedVoucher(record),before);
 assert.equal(JSON.stringify(f.data.rentReceiptsV267[0]),snapshot);
 assert.equal(f.read().rentLedgerV202[0].due,33);
});

test('manual first-period amount is already net and does not receive the monthly discount twice',async()=>{
 const f=fixture({amount:'27.125',contract:{rentEntitlement:{version:1,startDate:'2026-09-20',firstPeriodPolicy:'manual_first_period',manualFirstPeriodAmount:27.125}}});
 assert.equal(await f.submit(),true,f.elements.v202PaymentError.textContent);
 const receipt=f.read().rentReceiptsV267[0];
 assert.equal(f.read().rentLedgerV202[0].due,27.125);
 assert.equal(receipt.rentPeriodBreakdown.net,27.125);assert.equal(receipt.rentPeriodBreakdown.gross,null);assert.equal(receipt.rentPeriodBreakdown.discount,null);assert.equal(receipt.rentPeriodBreakdown.manual,true);
 assert.match(f.api.savedVoucher(f.data.collections[0]),/27\.125/);
 assert.equal(voucherValue(f.api.savedVoucher(f.data.collections[0]),'Period gross rent'),undefined);
 assert.equal(voucherValue(f.api.savedVoucher(f.data.collections[0]),'Period discount'),undefined);
 assert.match(f.api.savedVoucher(f.data.collections[0]),/مبلغ يدوي، دون خصم إضافي/);
});

test('full-month policy uses the net monthly rate and later months are not prorated again',async()=>{
 for(const [policy,period]of [['full_month','2026-09'],['daily_prorated','2026-10']]){
  const f=fixture({amount:'90',period,contract:{rentEntitlement:{version:1,startDate:'2026-09-20',firstPeriodPolicy:policy,manualFirstPeriodAmount:null}}});
  assert.equal(await f.submit(),true,f.elements.v202PaymentError.textContent);
  assert.equal(f.read().rentLedgerV202[0].due,90);
  assert.equal(f.read().rentReceiptsV267[0].rentPeriodBreakdown.net,90);
 }
});

test('a period before independent entitlement cannot create a payment or receipt',async()=>{
 const f=fixture({contract:{start_date:'2026-08-01'},period:'2026-08',amount:'1'});
 assert.equal(f.api.contractRent(f.api.normalizeContract(f.contract,'db-v202',0),'2026-08'),0);
 assert.equal(await f.submit(),false);assert.deepEqual(f.counts(),{reads:0,writes:0});
 assert.equal(f.data.rentReceiptsV267.length,0);assert.equal(f.data.rentLedgerV202.length,0);
 assert.match(f.elements.v202PaymentError.textContent,/الاستحقاق|لا يوجد|غير مستحق/);
});

test('a scheduled first rent can be paid before its due date without making the due date earlier',async()=>{
 const f=fixture({today:'2026-09-10T12:00:00Z',paidAt:'2026-09-10'});
 assert.equal(await f.submit(),true,f.elements.v202PaymentError.textContent);
 const remote=f.read();assert.equal(remote.rentLedgerV202[0].paidAt,'2026-09-10');assert.equal(remote.rentReceiptsV267[0].rentPeriodBreakdown.dueOn,'2026-09-20');
});

test('scheduled rent is not labelled currently due before its independent due date',()=>{
 const f=fixture(),c=f.api.normalizeContract(f.contract,'db-v202',0);
 assert.equal(f.api.contractEntitlementDueOn(c,'2026-09'),'2026-09-20');
 const statement=f.api.rentStatementItems(f.api.contextFor(f.contract.property),'2026-09');
 assert.equal(statement[0].due,33);assert.equal(statement[0].balance,33);assert.equal(statement[0].dueOn,'2026-09-20');
 assert.equal(statement[0].paymentStatus,'لم يحن الاستحقاق');
 assert.equal(f.api.rentEntitlementPaymentStatus(c,'2026-09',33,0,0,33,'2026-09-19'),'لم يحن الاستحقاق');
 assert.equal(f.api.rentEntitlementPaymentStatus(c,'2026-09',33,0,0,33,'2026-09-20'),'مستحق');
 assert.equal(f.api.rentEntitlementPaymentStatus(c,'2026-09',33,33,0,0,'2026-09-10'),'مسدد');
});

test('missing central entitlement helper cannot turn unknown rent into a verified zero balance or save a receipt',async()=>{
 const f=fixture({withoutHelper:true}),c=f.api.normalizeContract(f.contract,'db-v202',0);
 let value;
 try{value=f.api.contractRent(c,'2026-09');}catch(error){assert.match(error.message,/استحقاق|حساب|تحقق|الإيجار|تحميل/);}
 assert.equal(Number.isFinite(value),false);
 assert.equal(await f.submit(),false);assert.deepEqual(f.counts(),{reads:0,writes:0});assert.equal(f.data.rentReceiptsV267.length,0);
 assert.ok(f.elements.v202PaymentError.textContent);
});

test('invalid explicit entitlement remains invalid instead of silently reverting to legacy rent',async()=>{
 for(const entitlement of [null,{}, {version:1,startDate:'2026-09-20',firstPeriodPolicy:'daily_prorated',manualFirstPeriodAmount:1}]){
  const f=fixture({contract:{rentEntitlement:entitlement}}),c=f.api.normalizeContract(f.contract,'db-v202',0);
  assert.equal(Object.hasOwn(c,'rentEntitlement'),true);
  assert.equal(await f.submit(),false);assert.deepEqual(f.counts(),{reads:0,writes:0});assert.equal(f.data.rentReceiptsV267.length,0);
 }
});

test('missing authoritative readback exposes no local receipt and blocks a blind payment retry',async()=>{
 const f=fixture({omitReadback:true});
 assert.equal(await f.submit(),false);assert.deepEqual(f.counts(),{reads:2,writes:1});
 assert.equal(f.data.collections.length,0);assert.equal(f.data.rentLedgerV202.length,0);assert.equal(f.data.rentReceiptsV267.length,0);
 assert.equal(f.read().rentReceiptsV267[0].rentPeriodBreakdown.net,33);
 assert.match(f.elements.v202PaymentError.textContent,/لم يكتمل تأكيد الحفظ/);
 assert.equal(await f.submit(),false);assert.deepEqual(f.counts(),{reads:2,writes:1});
});

test('a malformed new receipt breakdown cannot be printed as a verified receipt',async()=>{
 const f=fixture();assert.equal(await f.submit(),true,f.elements.v202PaymentError.textContent);
 const saved=f.data.rentReceiptsV267[0],original=clone(saved.rentPeriodBreakdown),record=f.data.collections[0];
 for(const change of [{net:90},{gross:36.666},{discount:null},{dueOn:'2026-10-20'},{dueOn:'2026-09-00'},{manual:true},{version:2},{policy:'automatic'}]){
  saved.rentPeriodBreakdown={...original,...change};assert.equal(f.api.savedVoucher(record),'',JSON.stringify(change));
 }
 saved.rentPeriodBreakdown=null;assert.equal(f.api.savedVoucher(record),'');
 delete saved.rentPeriodBreakdown;assert.equal(f.api.savedVoucher(record),'');
 saved.rentPeriodBreakdown=original;assert.ok(f.api.savedVoucher(record));
});

test('approved free month remains uncollectible and legacy receipts gain no new snapshot fields',async()=>{
 const free=fixture({contract:{freeMonthApproved:true,freeMonthPeriod:'2026-09'}});
 assert.equal(free.api.contractRent(free.contract,'2026-09'),0);
 assert.equal(await free.submit(),false);assert.deepEqual(free.counts(),{reads:0,writes:0});
 assert.equal(free.api.rentEntitlementPaymentStatus(free.contract,'2026-09',0,0,0,0,'2026-09-20'),'شهر مجاني');
 const legacy=fixture({legacy:true,amount:'90'});
 assert.equal(await legacy.submit(),true,legacy.elements.v202PaymentError.textContent);
 const saved=legacy.read().rentReceiptsV267[0];assert.equal(Object.hasOwn(saved,'rentPeriodBreakdown'),false);assert.equal(Object.hasOwn(saved.contract,'rentEntitlement'),false);
 assert.equal(voucherValue(legacy.api.savedVoucher(legacy.data.collections[0]),'Original / Current rent'),'100 / 90');
 assert.match(legacy.api.savedVoucher(legacy.data.collections[0]),/الخامس من كل شهر/);
});
