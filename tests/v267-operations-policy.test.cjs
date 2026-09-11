const test=require('node:test');
const assert=require('node:assert/strict');

let api;
test.before(async()=>{api=await import('../lib/v267/operations-policy.js');});

test('returned cheque reopens debt, freezes renewal and is idempotent', () => {
 const cheque={state:'deposited',amount:'150.250',events:[]};
 const returned=api.transitionCheque(cheque,'returned',{id:'evt-1',occurredAt:'2026-09-11',reference:'BANK-7'});
 assert.equal(returned.debtAdjustment,'150.250');assert.equal(returned.renewalFrozen,true);
 assert.equal(api.transitionCheque(returned,'redeposited',{id:'evt-1',occurredAt:'2026-09-12',reference:'BANK-8'}).duplicate,true);
 assert.throws(()=>api.transitionCheque(returned,'cleared',{id:'evt-2',occurredAt:'2026-09-12',reference:'BANK-8'}),{code:'INVALID_CHEQUE_TRANSITION'});
});
test('common charge allocation is exact to the fils',()=>{
 const rows=api.allocateCommonCharge({amount:'10.000',basis:'area',units:[{id:'B',area:1},{id:'A',area:1},{id:'C',area:1}]});
 assert.deepEqual(rows.map(row=>row.amount),['3.334','3.333','3.333']);
 assert.equal(rows.reduce((sum,row)=>sum+Math.round(Number(row.amount)*1000),0),10000);
});
test('commercial charge honors grace, percentage rent and CAM',()=>{
 const contract={baseRent:'500',cam:'25',salesPercentage:10,graceDays:30,startDate:'2026-01-01'};
 assert.equal(api.calculateCommercialCharge(contract,{startDate:'2026-01-15',sales:'9000'}).total,'25.000');
 assert.equal(api.calculateCommercialCharge(contract,{startDate:'2026-02-01',sales:'9000'}).total,'925.000');
});
test('rent reminders start on day 28, alternate days and stop for zero balance',()=>{
 assert.deepEqual(api.buildRentReminderSchedule({balance:0,year:2026,month:9,graceDeadline:'2026-10-02'}),[]);
 const rows=api.buildRentReminderSchedule({balance:'25.000',year:2026,month:9,graceDeadline:'2026-10-02'});
 assert.deepEqual([...new Set(rows.map(row=>row.onDate))],['2026-09-28','2026-09-30','2026-10-02']);assert.equal(rows.length,6);
});
test('tenant stars use settled non-cancelled installments and cap at four',()=>{
 const installments=[1,4,7,10].map((month,index)=>({id:`p-${index}`,dueDate:`2026-${String(month).padStart(2,'0')}-05`,settledAt:`2026-${String(month).padStart(2,'0')}-04`,dueAmount:'100',paidAmount:'100',status:'confirmed'}));
 const result=api.calculateTenantYear({year:2026,installments});assert.equal(result.stars,4);assert.equal(result.rating,'ممتاز');
});
test('clearance is blocked by any obligation unless exception is fully documented',()=>{
 const base={rentBalance:'1.000',damageBalance:0,utilityBalance:0,legalBalance:0,depositBalance:0,keysReturned:true,inspectionCompleted:true};
 assert.equal(api.evaluateClearance(base).canIssue,false);
 assert.equal(api.evaluateClearance({...base,exception:{approvedBy:'manager-1',reason:'استثناء رسمي موثق بسبب حكم نهائي',approvedAt:'2026-09-11'}}).canIssue,true);
});
test('petty cash enforces invoice, approval, balance and ceiling',()=>{
 assert.throws(()=>api.validatePettyCashTransaction({fundBalance:'50',ceiling:'100',amount:'10',kind:'spend'}),{code:'PETTY_CASH_APPROVAL_REQUIRED'});
 assert.equal(api.validatePettyCashTransaction({fundBalance:'50',ceiling:'100',amount:'10',kind:'spend',invoiceId:'inv-1',approvedBy:'mgr'}).after,'40.000');
 assert.throws(()=>api.validatePettyCashTransaction({fundBalance:'95',ceiling:'100',amount:'10',kind:'fund'}),{code:'PETTY_CASH_CEILING'});
});
test('work order invoice produces a stable one-time expense key',()=>{
 assert.deepEqual(api.assertWorkOrderInvoice({workOrder:{id:'wo-1',status:'completed',approvedBy:'mgr',vendorId:'vendor-1',approvedAmount:'75'},invoice:{id:'inv-1',vendorId:'vendor-1',amount:'70.250'}}),{expenseKey:'work-order:wo-1:invoice:inv-1',amount:'70.250'});
});
test('integration event removes common secrets and has idempotency key',()=>{
 const event=api.buildIntegrationEvent({id:'event-1',type:'payment.confirmed',aggregateId:'pay-1',occurredAt:'2026-09-11',payload:{amount:'1.000',token:'no',civil_id:'no'}});
 assert.equal(event.idempotencyKey,'payment.confirmed:event-1');assert.deepEqual(event.payload,{amount:'1.000'});
});
