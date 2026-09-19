import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const live=read('src/v267/live-stability-runtime.js');
test('each dashboard metric is a keyboard-accessible button with its corresponding destination',()=>{
 const code=live.slice(live.indexOf('const METRIC_ACTIONS='),live.indexOf('function panel('));
 const box={workspaceIcon:()=>'',ui:x=>x,escapeText:x=>x};vm.createContext(box);vm.runInContext(code,box);
 const expected={properties:['route','properties'],units:['service','unit_readiness'],tenants:['route','tenants'],contracts:['service','rental_contracts'],month:['route','collectionProPage'],today:['route','collectionProPage'],due:['route','collectionProPage'],remaining:['route','collectionProPage'],overdue:['route','collectionProPage'],occupancy:['service','unit_readiness'],maintenance:['route','maintenanceProPage'],employees:['service','employees_payroll'],invoices:['service','maintenance_utilities'],expiring:['service','lease_expiry_report'],expenses:['service','financial_register'],net:['service','kpi_dashboard']};
 for(const [key,[kind,target]]of Object.entries(expected)){
  const html=box.makeMetric(key,key);assert.ok(html.startsWith('<button type="button"'),key);
  assert.ok(html.includes(`data-exact-${kind}="${target}"`),key);assert.ok(html.includes(`data-live-value="${key}"`),key);
 }
});
test('unit addition opens the property chooser without entering the inspection screen',async()=>{
 assert.ok(live.includes("refAction('إضافة وحدة','special','unit_create','grid')"));
 const source=read('src/v267/owner-feedback-runtime.js');
 const code=source.slice(source.indexOf('async function openUnitAction(){'),source.indexOf('async function openTenantAction(){')).replace("import('./pages/unit-entry.js')",'loadEntry()');
 for(const active of [true,false]){
  const calls=[],messages=[],box={scope:()=>active,loadEntry:async()=>({openUnitEntry:()=>{calls.push('chooser');return true;}}),t:x=>x,setStatus:x=>messages.push(x)};
  vm.createContext(box);vm.runInContext(code,box);assert.equal(await box.openUnitAction(),active);
  assert.deepEqual(calls,active?['chooser']:[]);assert.equal(messages.length,0);
 }
});
