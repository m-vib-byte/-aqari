import test from 'node:test';
import assert from 'node:assert/strict';
import {sumMoney,projectDashboard,readLiveDashboard} from '../src/v267/components/live-dashboard-data.js';
test('financial totals preserve fils and missing data is not zero',()=>{
 assert.equal(sumMoney([{due:'125.125'},{due:'50.125'}],'due'),175.250);
 assert.equal(sumMoney([{due:null}],'due'),null);
 assert.equal(sumMoney(undefined,'due'),null);
 assert.equal(sumMoney([],'due'),0);
});
test('dashboard separates monthly actual, daily actual, due and remaining',()=>{
 const r=projectDashboard({collections:{actual:'50.125'},profit:{approved_expenses:'10',actual_net:'40.125'}},{collections:{actual:'0'},units:{total:10,occupied:8}},{properties:[{due:'125.125',remaining:'75'}]},{items:[{id:'properties',value:4},{id:'active_contracts',value:8}]});
 assert.equal(r.month,50.125);assert.equal(r.today,0);assert.equal(r.due,125.125);assert.equal(r.remaining,75);
 assert.equal(r.occupancy,80);assert.equal(r.properties,4);assert.equal(r.contracts,8);assert.equal(r.tenants,null);
});
test('late responses are rejected when the bound session changes',async()=>{
 const session={bound:{workspace:'workspace'},client:{rpc:()=>({})},request:async()=>({}),check:()=>{throw Error('scope changed')}};
 await assert.rejects(readLiveDashboard(session,'2026-09-17',async()=>({items:[]})),/scope changed/);
});
test('one unavailable source cannot invent finance metrics from another',async()=>{
 const session={bound:{workspace:'workspace'},client:{rpc:(name,args)=>({name,args})},request:async q=>{if(q.name==='aqari_kpi_dashboard')throw Error('not available');return {properties:[{due:'100',remaining:'25'}]}},check(){}};
 const report=await readLiveDashboard(session,'2026-09-17',async()=>({items:[{id:'properties',value:4}]}));
 assert.equal(report.partial,true);assert.equal(report.values.month,null);assert.equal(report.values.due,100);assert.equal(report.values.properties,4);
});
