import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installContractRoutes,normalizeContractIntent} from '../src/v267/components/contract-routing.js';

test('contract route intents are canonical and reject conflicting or unsafe hints',()=>{
 assert.deepEqual(normalizeContractIntent(),{});
 assert.deepEqual(normalizeContractIntent({create:true,property:'  برج مرزوق  ',ignored:'drop'}),{create:true,property:'برج مرزوق'});
 assert.deepEqual(normalizeContractIntent({id:42,ignored:'drop'}),{id:'42'});
 assert.deepEqual(normalizeContractIntent({renewalFrom:'  renewal-1  '}),{renewalFrom:'renewal-1'});
 assert.throws(()=>normalizeContractIntent([]),/طلب فتح العقود غير صالح/);
 assert.throws(()=>normalizeContractIntent({create:true,id:'x'}),/إجراءات متعارضة/);
 assert.throws(()=>normalizeContractIntent({id:'x',renewalFrom:'y'}),/إجراءات متعارضة/);
 assert.throws(()=>normalizeContractIntent({property:'برج'}),/مسموح فقط عند إنشاء عقد جديد/);
 assert.throws(()=>normalizeContractIntent({id:{unsafe:true}}),/مرجع العقد غير صالح/);
 assert.throws(()=>normalizeContractIntent({renewalFrom:'x\ny'}),/مرجع التجديد غير صالح/);
 assert.throws(()=>normalizeContractIntent({id:'x'.repeat(301)}),/مرجع العقد غير صالح/);
});

test('legacy routes keep canonical contract entry and preserve unrelated navigation',async()=>{
 const opened=[],legacy=[];
 const target={go:function(...args){legacy.push([this,...args]);return 'legacy';}};
 installContractRoutes(target,async initial=>{opened.push(initial||{});return 'modern';});
 assert.equal(await target.go('smartContractsPage'),'modern');
 assert.equal(await target.go('leases'),'modern');
 assert.equal(await target.AQARI_V267_OPEN_CONTRACTS({id:' 42 ',ignored:'drop'}),'modern');
 assert.deepEqual(opened,[{create:true},{},{id:'42'}]);
 assert.equal(legacy.length,0);
 assert.equal(target.go('home','x'),'legacy');
 assert.equal(legacy[0][0],target);
 assert.deepEqual(legacy[0].slice(1),['home','x']);
});

test('browser create intent is forced through live access guard before foundation load',()=>{
 const routing=readFileSync(new URL('../src/v267/components/contract-routing.js',import.meta.url),'utf8');
 const guard=readFileSync(new URL('../src/v267/components/contract-entry-guard.js',import.meta.url),'utf8');
 assert.match(routing,/const intent=normalizeContractIntent\(initial\)/);
 assert.match(routing,/intent\.create&&typeof window!=='undefined'&&target===window/);
 assert.match(routing,/import\('\.\/contract-entry-guard\.js'\)/);
 assert.match(routing,/openGuardedContractFoundation\(intent,open\)/);
 assert.match(guard,/permissions\?\.contracts\?\.read===true&&access\?\.permissions\?\.contracts\?\.write===true/);
 assert.equal((guard.match(/await readAccess\(\)/g)||[]).length,2);
 assert.match(guard,/session\.check\(\)[\s\S]*import\('\.\.\/pages\/contract-foundation\.js'\)[\s\S]*session\.check\(\)/);
 assert.match(guard,/return module\.openContractFoundation\(\{\.\.\.intent,openContracts\}\)/);
 assert.match(guard,/finally\{[\s\S]*session\.close\(\)/);
});

test('atomic execution interception remains installed after route hardening',()=>{
 const source=readFileSync(new URL('../src/v267/components/contract-routing.js',import.meta.url),'utf8');
 assert.match(source,/function installExecutionGuard\(\)/);
 assert.match(source,/input\?\.status==='signed'&&input\?\.source==='v267-cloud'/);
 assert.match(source,/import\('\.\.\/pages\/contract-execution\.js'\)/);
 assert.match(source,/openContractExecution\(input\.id,\{onDone:\(\)=>route\(\{id:input\.id\}\)\}\)/);
 assert.match(source,/return input;/);
});

test('workspace re-checks session scope and contract read permission around saved-contract lazy loading',()=>{
 const source=readFileSync(new URL('../src/v267/workspace.js',import.meta.url),'utf8');
 assert.match(source,/directoryAllowed\(\{section:'contracts'\}\)/);
 assert.match(source,/const bound=directoryScope\(\),m=await import\('\.\/pages\/rental-contracts\.js'\)/);
 assert.match(source,/bound!==directoryScope\(\)/);
 assert.match(source,/openRentalContracts\(initial\)/);
 assert.match(source,/installContractRoutes\(window,openContracts\)/);
});
