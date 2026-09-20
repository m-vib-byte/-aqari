import test from 'node:test';
import assert from 'node:assert/strict';
import {openPropertyContract,openPropertySavedStatements} from '../src/v267/components/property-record-navigation.js';

function fixture(rows=[{external_ref:'saved-contract'}]){
 const events=[],filters={};const q={select(){return q;},eq(k,v){filters[k]=v;return q;}};
 const d={session:{bound:{workspace:'workspace'},client:{from(table){assert.equal(table,'aqari_leases');return q;}},async request(){return rows;},check(){events.push('check');}},close(){events.push('close');}};
 return {d,events,filters};
}
test('property contract opens the saved reference after scoped lookup and module loading',async()=>{
 const f=fixture();let initial;
 await openPropertyContract(f.d,'property',{id:'lease'},async()=>{f.events.push('loaded');return {openRentalContracts(x){initial=x;f.events.push('open');}};});
 assert.deepEqual(f.filters,{'workspace_id':'workspace',id:'lease','aqari_units.property_id':'property'});
 assert.deepEqual(initial,{id:'saved-contract'});assert.deepEqual(f.events,['check','loaded','check','close','open']);
});
test('missing or ambiguous contracts do not close the property file',async()=>{
 for(const rows of [[],[{external_ref:''}],[{external_ref:'a'},{external_ref:'b'}]]){
  const f=fixture(rows);await assert.rejects(openPropertyContract(f.d,'p',{id:'l'},async()=>{throw Error('must not load');}),/ربط العقد/);assert.ok(!f.events.includes('close'));
 }
});
test('failed page imports retain the original file for retry',async()=>{
 const f=fixture();await assert.rejects(openPropertyContract(f.d,'p',{id:'l'},async()=>{throw Error('offline');}),/offline/);assert.ok(!f.events.includes('close'));
});
test('statement navigation keeps the property name and lets the page select the saved month',async()=>{
 const f=fixture();let initial;
 await openPropertySavedStatements(f.d,'العقار',async()=>({openPropertyStatements(x){initial=x;}}));
 assert.deepEqual(initial,{propertyName:'العقار'});assert.deepEqual(f.events,['check','close']);
});
test('session changes prevent handoff to private pages',async()=>{
 const f=fixture();f.d.session.check=()=>{throw Error('changed');};
 await assert.rejects(openPropertySavedStatements(f.d,'p',async()=>({openPropertyStatements(){throw Error('must not open');}})),/changed/);
 assert.ok(!f.events.includes('close'));
});
