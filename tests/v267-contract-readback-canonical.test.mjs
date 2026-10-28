import test from 'node:test';
import assert from 'node:assert/strict';
import {sameExecutionReadback} from '../src/v267/pages/contract-execution.js';

// JSONB can reorder object keys, but must never mask changed values or array order.
test('same contract despite reordered nested JSONB keys',()=>{
 const before={contract:{id:'contract-1',terms:{rent:350,currency:'KWD'}},tenant:{name_ar:'مستأجر',id:'tenant-1'}};
 const after={tenant:{id:'tenant-1',name_ar:'مستأجر'},contract:{terms:{currency:'KWD',rent:350},id:'contract-1'}};
 assert.equal(sameExecutionReadback(before,after),true);
});
test('changed rent, tenant, receipt and missing fields remain conflicts',()=>{
 const base={contract:{rent:350},tenant:{id:'tenant-1'},receipt:{amount:350}};
 for(const changed of [
  {contract:{rent:351},tenant:{id:'tenant-1'},receipt:{amount:350}},
  {contract:{rent:350},tenant:{id:'tenant-2'},receipt:{amount:350}},
  {contract:{rent:350},tenant:{id:'tenant-1'},receipt:{amount:351}},
  {contract:{rent:350},tenant:{id:'tenant-1'}}
 ])assert.equal(sameExecutionReadback(base,changed),false);
});
test('array order remains significant, including receipt allocations',()=>{
 assert.equal(sameExecutionReadback({allocations:[{id:1},{id:2}]},{allocations:[{id:2},{id:1}]}),false);
 assert.equal(sameExecutionReadback([{a:1,b:2}],[{b:2,a:1}]),true);
});
test('null, empty and numeric values do not collapse',()=>{
 assert.equal(sameExecutionReadback(null,{}),false);
 assert.equal(sameExecutionReadback(0,'0'),false);
 assert.equal(sameExecutionReadback([],{}),false);
 assert.equal(sameExecutionReadback({paid:false},{paid:0}),false);
});
