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

// Additional dashboard sources must not widen account/workspace access.
const {readReferenceDashboard}=await import('../src/v267/components/live-dashboard-data.js');
test('reference dashboard refuses a mismatched workspace before loading details',async()=>{
 const calls=[];const session={bound:{workspace:'w',user:'u',role:'general_manager'},client:{rpc:(name,args)=>({name,args})},request:async q=>{calls.push(q.name);return {workspace_id:'other',user_id:'u',role:'general_manager'}},check(){}};
 await assert.rejects(readReferenceDashboard(session,'2026-09-19'),/ACCESS_DENIED/);
 assert.deepEqual(calls,['aqari_workspace_access']);
});
test('denied dashboard sections stay unknown and never issue HR finance or property requests',async()=>{
 const calls=[];const access={workspace_id:'w',user_id:'u',role:'staff',permissions:{},features:{}};
 const session={bound:{workspace:'w',user:'u',role:'staff'},client:{rpc:(name,args)=>({name,args})},request:async q=>{calls.push(q.name);return access},check(){}};
 const report=await readReferenceDashboard(session,'2026-09-19');assert.equal(report.metrics.employees,null);assert.equal(report.metrics.invoices,null);assert.equal(report.properties,null);assert.ok(report.months.every(x=>x.amount===null));assert.deepEqual(calls,['aqari_workspace_access','aqari_workspace_access']);
});
test('monthly chart ends at today, keeps future months unknown, and rejects changed permissions',async()=>{
 const calls=[];let reads=0,changed=false;const access={workspace_id:'w',user_id:'u',role:'general_manager',permissions:{finance:{read:true}},features:{kpi_dashboard:true}};
 const session={bound:{workspace:'w',user:'u',role:'general_manager'},client:{rpc:(name,args)=>({name,args}),from:()=>{throw Error('unavailable')}},request:async q=>{calls.push(q);if(q.name==='aqari_workspace_access'){reads++;return changed&&reads>1?{...access,permissions:{}}:access;}return {units:{total:10,occupied:8,vacant:2},collections:{actual:'125.125'}};},check(){}};
 const r=await readReferenceDashboard(session,'2026-02-15');assert.deepEqual(r.months.slice(0,3).map(x=>x.amount),[125.125,125.125,null]);assert.ok(calls.filter(x=>x.name==='aqari_kpi_dashboard').every(x=>x.args.p_to<='2026-02-15'));assert.equal(r.partial,true);
 changed=true;reads=0;await assert.rejects(readReferenceDashboard(session,'2026-02-15'),/ACCESS_CHANGED/);
});

const {overdueTotal}=await import('../src/v267/components/live-dashboard-data.js');
test('arrears use net saved balances and exclude future, today, paid and credit periods',()=>{
 assert.equal(overdueTotal([{due_on:'2026-08-01',balance:'75.125'},{due_on:'2026-09-01',balance:'25.125'},{due_on:'2026-09-19',balance:'100'},{due_on:'2026-10-01',balance:'200'},{due_on:null,balance:0},{due_on:'2026-08-01',balance:-40}],'2026-09-19'),100.25);
 assert.equal(overdueTotal([],'2026-09-19'),0);
 assert.throws(()=>overdueTotal([{balance:100}],'2026-09-19'),/MISSING_DUE_DATE/);
 assert.throws(()=>overdueTotal([{due_on:'2026-09-01',balance:null}],'2026-09-19'),/INVALID_DUE_BALANCE/);
});

const {registeredUnitCount}=await import('../src/v267/components/live-dashboard-data.js');
test('property cards use registered unit counts, preserving zero and unknown',()=>{
 assert.equal(registeredUnitCount([{name:'برج مرزوق',aqari_units:[{count:0}],units:10}],'برج مرزوق'),0);
 assert.equal(registeredUnitCount([{name:'test',aqari_units:[{count:12}]}],'test'),12);
 for(const props of [null,[],[{name:'test'}],[{name:'test',aqari_units:[{count:null}]}],[{name:'test',aqari_units:[{count:-1}]}],[{name:'test',aqari_units:[{count:1}]},{name:'test',aqari_units:[{count:2}]}]])assert.equal(registeredUnitCount(props,'test'),null);
});
