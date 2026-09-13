import test from 'node:test';
import assert from 'node:assert/strict';
import {leaseEndFromMonths} from '../src/v267/domain/lease-dates.js';

test('inclusive month terms handle year boundaries and a three-year lease',()=>{
  assert.equal(leaseEndFromMonths('2026-09-01',36),'2029-08-31');
  assert.equal(leaseEndFromMonths('2026-12-15',1),'2027-01-14');
  assert.equal(leaseEndFromMonths('2026-01-01',1),'2026-01-31');
});
test('end-of-month dates clamp without spilling into the next month',()=>{
  assert.equal(leaseEndFromMonths('2026-01-31',1),'2026-02-28');
  assert.equal(leaseEndFromMonths('2024-01-31',1),'2024-02-29');
  assert.equal(leaseEndFromMonths('2024-02-29',12),'2025-02-28');
  assert.equal(leaseEndFromMonths('2026-05-31',1),'2026-06-30');
});
test('invalid civil dates and nonintegral or missing terms are rejected',()=>{
  for(const value of ['2026-02-29','2026-04-31','2026-00-12','2026-13-01','2026-01-00','2026-1-1','1899-12-01','',null]) assert.throws(()=>leaseEndFromMonths(value,12));
  for(const value of [0,-1,601,1.5,'12months','1e2','',null]) assert.throws(()=>leaseEndFromMonths('2026-09-01',value));
  assert.throws(()=>leaseEndFromMonths('9998-09-01',600));
});
