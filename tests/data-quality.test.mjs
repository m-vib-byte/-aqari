import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectQuality} from '../src/v267/components/data-quality.mjs';
test('unit duplicate is property scoped and input remains unchanged',()=>{const data={units:[{id:'1',property_id:'a',unit_no:'401'},{id:'2',property_id:'b',unit_no:'401'},{id:'3',property_id:'a',unit_no:'401'}]};const before=JSON.stringify(data);assert.deepEqual(inspectQuality(data),[{kind:'duplicate_unit',ids:['1','3']}]);assert.equal(JSON.stringify(data),before);});
test('optional email and missing identifiers do not invent duplicates',()=>{assert.deepEqual(inspectQuality({tenants:[{id:'a',full_name:'A'},{id:'b',full_name:'B'}]}),[]);});
test('shared phone remains a candidate and draft dates remain pending',()=>{const results=inspectQuality({tenants:[{id:'a',full_name:'A',phone:'55 55'},{id:'b',full_name:'B',phone:'5555'}],leases:[{id:'c',status:'draft',start_date:null,end_date:null}]});assert.deepEqual(results.map(r=>r.kind),['shared_phone_review','draft_leases','pending_contract_dates']);});
