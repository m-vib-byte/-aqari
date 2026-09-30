import test from 'node:test';
import assert from 'node:assert/strict';
import {kuwaitMonth,previousKuwaitMonth} from '../src/v267/domain/kuwait-calendar.js';

test('financial months turn at Kuwait midnight rather than UTC midnight',()=>{
 for(const [instant,current,previous] of [
  ['2026-09-30T20:59:59.999Z','2026-09','2026-08'],
  ['2026-09-30T21:00:00.000Z','2026-10','2026-09'],
  ['2026-10-01T00:00:00.000Z','2026-10','2026-09'],
  ['2026-12-31T21:00:00.000Z','2027-01','2026-12'],
  ['2028-02-29T21:00:00.000Z','2028-03','2028-02']
 ]){
  assert.equal(kuwaitMonth(new Date(instant)),current,instant);
  assert.equal(previousKuwaitMonth(new Date(instant)),previous,instant);
 }
});

test('device time zone cannot change the Kuwait accounting month',()=>{
 const previousZone=process.env.TZ;
 try{
  for(const zone of ['UTC','America/Los_Angeles','Pacific/Kiritimati']){
   process.env.TZ=zone;
   assert.equal(kuwaitMonth(new Date('2026-09-30T21:30:00Z')),'2026-10',zone);
   assert.equal(previousKuwaitMonth(new Date('2026-09-30T21:30:00Z')),'2026-09',zone);
  }
 }finally{if(previousZone===undefined)delete process.env.TZ;else process.env.TZ=previousZone;}
});
