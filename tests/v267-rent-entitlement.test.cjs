'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={module:{exports:{}},structuredClone,document:{documentElement:{classList:{contains:()=>true}}}};vm.runInNewContext(fs.readFileSync('v267-rental-records.js','utf8'),ctx);const api=ctx.module.exports;
const copy=x=>JSON.parse(JSON.stringify(x));
const tenant={id:'entitlement-test',nameAr:'مستأجر اختبار',nameEn:'Synthetic Tenant',civilId:'123456789012',passportNo:'TEST-P',phone:'55555555',email:'test@example.invalid',nationality:'اختبار'};
const base={id:'entitlement-contract',contract_no:'ENT-1',source:'v267-cloud',tenantId:tenant.id,tenantProfile:tenant,tenant:tenant.nameAr,property:'عقار اختبار',unit:'1',floor:'1',start_date:'2024-01-01',end_date:'2027-12-31',status:'draft',rent:90,contractRent:100,discount:10,deposit:0,advance:0,cleaningFee:0,rentalTermsVersion:1,detailsVersion:2,accountant:'محاسب اختبار',writtenOn:'2026-09-09',contractReceived:'لم يستلم',receivedAt:'',depositReceivedOn:'',evictionNotice:'لم يُبلّغ',freeMonthApproved:false,freeMonthPeriod:'',rentAdjustments:[],rentEntitlement:{version:1,startDate:'2025-09-20',firstPeriodPolicy:'daily_prorated',manualFirstPeriodAmount:null}};
const valid=(c,old=[])=>api.lease(c,old,[tenant],[['عقار اختبار']]);
test('first calendar month uses explicit entitlement date; later months keep the monthly rate',()=>{
 assert.equal(api.effectiveRent(base,'2025-08'),0);assert.equal(api.entitlementDueOn(base,'2025-08'),null);
 assert.equal(api.effectiveRent(base,'2025-09'),33);assert.equal(api.entitlementDueOn(base,'2025-09'),'2025-09-20');
 assert.equal(api.effectiveRent(base,'2025-10'),90);assert.equal(api.entitlementDueOn(base,'2025-10'),'2025-10-01');
 assert.equal(api.effectiveRent(base,'2028-01'),0);assert.equal(api.entitlementDueOn(base,'2028-01'),null);
 assert.equal(api.effectiveRent(base,'2025-09',false),90);
 assert.deepEqual(copy(api.entitlementBreakdown(base,'2025-09')),{gross:36.667,discount:3.667,net:33,manual:false,freeMonth:false,policy:'daily_prorated'});
});
test('calendar proration rounds integer fils once and includes leap day and contract-end cutoff',()=>{
 const c={...base,rentEntitlement:{...base.rentEntitlement,startDate:'2024-02-20'}};
 assert.equal(api.effectiveRent(c,'2024-02'),31.034);
 assert.equal(api.effectiveRent({...c,end_date:'2024-02-21'},'2024-02'),6.207);
 assert.equal(api.effectiveRent({...c,rent:0.001,rentEntitlement:{...c.rentEntitlement,startDate:'2024-02-15'}},'2024-02'),0.001);
 assert.equal(api.effectiveRent({...c,rent:0.001,rentEntitlement:{...c.rentEntitlement,startDate:'2024-02-16'}},'2024-02'),0);
});
test('full month, explicit manual net, dated discounts and free month each follow the selected policy',()=>{
 assert.equal(api.effectiveRent({...base,rentEntitlement:{...base.rentEntitlement,firstPeriodPolicy:'full_month'}},'2025-09'),90);
 const manual={...base,rentEntitlement:{...base.rentEntitlement,firstPeriodPolicy:'manual_first_period',manualFirstPeriodAmount:17.125}};
 assert.deepEqual(copy(api.entitlementBreakdown(manual,'2025-09')),{gross:null,discount:null,net:17.125,manual:true,freeMonth:false,policy:'manual_first_period'});
 assert.deepEqual(copy(api.entitlementBreakdown(manual,'2025-10')),{gross:100,discount:10,net:90,manual:false,freeMonth:false,policy:'full_month'});
 assert.equal(api.effectiveRent({...manual,rentEntitlement:{...manual.rentEntitlement,manualFirstPeriodAmount:0}},'2025-09'),0);
 assert.equal(api.effectiveRent({...manual,freeMonthApproved:true,freeMonthPeriod:'2025-09'},'2025-09'),0);
 assert.equal(api.effectiveRent({...base,rentAdjustments:[{effectiveMonth:'2025-09',rent:60}]},'2025-09'),22);
 assert.equal(api.effectiveRent({...manual,rentAdjustments:[{effectiveMonth:'2025-10',rent:70}]},'2025-10'),70);
});
test('legacy contracts retain preexisting calculation without adding entitlement terms',()=>{
 const old=copy(base);delete old.rentEntitlement;
 assert.equal(api.effectiveRent(old,'2023-12'),90);assert.equal(api.effectiveRent(old,'2025-09'),90);
 const saved=valid(old,[old]);assert.equal(Object.hasOwn(saved,'rentEntitlement'),false);
 assert.throws(()=>valid(old),/بداية الاستحقاق/);
});
test('draft inputs require complete explicit policy and dates; approved terms and saved presence cannot change',()=>{
 for(const entitlement of [null,{}, {...base.rentEntitlement,startDate:'2028-01-01'},{...base.rentEntitlement,startDate:'2025-02-30'},{...base.rentEntitlement,firstPeriodPolicy:''},{...base.rentEntitlement,manualFirstPeriodAmount:10},{...base.rentEntitlement,firstPeriodPolicy:'manual_first_period',manualFirstPeriodAmount:''},{...base.rentEntitlement,firstPeriodPolicy:'manual_first_period',manualFirstPeriodAmount:1.2345}])assert.throws(()=>valid({...base,rentEntitlement:entitlement}));
 assert.equal(valid({...base,rentEntitlement:{...base.rentEntitlement,startDate:'2025-09-21'}},[base]).rentEntitlement.startDate,'2025-09-21');
 const approved={...base,status:'approved'};assert.equal(valid(approved,[base]).status,'approved');
 for(const edit of [{rentEntitlement:{...base.rentEntitlement,startDate:'2025-09-21'}},{start_date:'2024-01-02'},{end_date:'2027-12-30'}])assert.throws(()=>valid({...approved,...edit},[approved]),/ثابتة/);
 const removed=copy(base);delete removed.rentEntitlement;assert.throws(()=>valid(removed,[base]),/إزالة/);
});
test('contract and annex display original rent and factual entitlement date without manual net or discount',()=>{
 const c={...base,rentEntitlement:{...base.rentEntitlement,firstPeriodPolicy:'manual_first_period',manualFirstPeriodAmount:17.125},clauses:[]};
 const html=api.contractMarkup(c,1)+api.contractAnnexMarkup(c);
 assert.match(html,/بداية استحقاق الإيجار/);assert.match(html,/2025-09-20/);
 assert.match(html,/الإيجار عند كتابة العقد/);assert.match(html,/>100</);
 assert.doesNotMatch(html,/17\.125|>90<|الخصم|صافي أول/);
});
