import test from 'node:test';
import assert from 'node:assert/strict';
import {payrollTotals,expiryState,validateAllocations,csv,SELF_SERVICE_KINDS} from '../src/v267/domain/hr-lifecycle.js';

test('payroll lifecycle totals preserve three-decimal KWD arithmetic',()=>{
 assert.deepEqual(payrollTotals({basic:500,allowances:25,overtime:10,reward:5,late:1,absence:2,deductions:3,advance_repayment:4}),{additions:'540.000',deductions:'10.000',net:'530.000'});
 assert.throws(()=>payrollTotals({basic:1,deductions:2}),/DEDUCTIONS/);
});

test('expiry alerts distinguish expired, soon, valid and missing',()=>{
 const today=new Date('2026-09-22T12:00:00Z');assert.equal(expiryState('',today),'missing');assert.equal(expiryState('2026-09-21',today),'expired');assert.equal(expiryState('2026-11-20',today),'soon');assert.equal(expiryState('2027-01-01',today),'valid');
});

test('cost allocations must be unique, in scope and total exactly 100',()=>{
 assert.deepEqual(validateAllocations([{property_id:'a',share:'40'},{property_id:'b',share:'60'}],['a','b']),[{property_id:'a',share:'40.00'},{property_id:'b',share:'60.00'}]);
 assert.throws(()=>validateAllocations([{property_id:'a',share:90}],['a']),/100/);
 assert.throws(()=>validateAllocations([{property_id:'x',share:100}],['a']),/PROPERTY/);
 for(const share of [NaN,Infinity,-1,100.01,'NaN','1e2',{},'40.005'])assert.throws(()=>validateAllocations([{property_id:'a',share},{property_id:'b',share:60}],['a','b']),/INVALID_ALLOCATION_SHARE/);
 assert.throws(()=>validateAllocations([{property_id:'a',share:40.005},{property_id:'b',share:59.995}],['a','b']),/INVALID_ALLOCATION_SHARE/);
 assert.throws(()=>validateAllocations([{property_id:'a',share:50},{property_id:'a',share:50}],['a']),/PROPERTY/);
 assert.deepEqual(validateAllocations([{property_id:'a',share:'33.33'},{property_id:'b',share:'66.67'}],['a','b']).map(x=>x.share),['33.33','66.67']);
});

test('employee self-service exposes request kinds only and CSV escapes cells',()=>{
 assert.deepEqual(SELF_SERVICE_KINDS,['leave_request','advance_request','salary_certificate','document_update','general_request']);
 const text=csv([{month:'2026-09',employee_name:'A, "B"',property_name:'Tower',state:'paid',net:10,share:100,allocated_cost:10}]);assert.ok(text.startsWith('\uFEFFmonth'));assert.ok(text.includes('"A, ""B"""'));
});

test('zero and blank allocations are omitted while positive shares total 100',()=>{for(const share of [0,'',null])assert.deepEqual(validateAllocations([{property_id:'a',share},{property_id:'b',share:100}],['a','b']),[{property_id:'b',share:'100.00'}]);assert.throws(()=>validateAllocations([{property_id:'a',share:0}],['a']),/100/);});
test('CSV neutralizes spreadsheet expressions and preserves Arabic and decimals',()=>{for(const name of ['=1+2','+cmd','-cmd','@SUM(A1)',' \t=1','\t1'])assert.ok(csv([{employee_name:name}]).includes('"\''+name+'"'));assert.ok(csv([{employee_name:'ماجد',net:'10.125'}]).includes('"ماجد"'));assert.ok(csv([{net:'10.125'}]).includes('"10.125"'));});
