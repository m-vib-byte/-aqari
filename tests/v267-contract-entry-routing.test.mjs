import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installContractRoutes} from '../src/v267/components/contract-routing.js';

test('legacy contract routes use one guarded entry and preserve unrelated navigation',async()=>{
 const opened=[],legacy=[];
 const target={go:function(...args){legacy.push([this,...args]);return 'legacy';}};
 installContractRoutes(target,async initial=>{opened.push(initial||{});return 'modern';});
 assert.equal(await target.go('smartContractsPage'),'modern');
 assert.equal(await target.go('leases'),'modern');
 await target.AQARI_V267_OPEN_CONTRACTS({create:true,property:'برج مرزوق'});
 assert.deepEqual(opened,[{create:true},{},{create:true,property:'برج مرزوق'}]);
 assert.equal(legacy.length,0);
 assert.equal(target.go('home','x'),'legacy');
 assert.equal(legacy[0][0],target);
 assert.deepEqual(legacy[0].slice(1),['home','x']);
});

test('workspace re-checks session scope and contract read permission around lazy loading',()=>{
 const source=readFileSync(new URL('../src/v267/workspace.js',import.meta.url),'utf8');
 assert.match(source,/directoryAllowed\(\{section:'contracts'\}\)/);
 assert.match(source,/const bound=directoryScope\(\),m=await guardPageImport\(\(\)=>import\('\.\/pages\/rental-contracts\.js'\)/);
 assert.match(source,/bound!==directoryScope\(\)/);
 assert.match(source,/openRentalContracts\(initial\)/);
 assert.match(source,/installContractRoutes\(window,openContracts,\(\)=>contractTemplates\.onclick\(\)\)/);
});

test('legacy template navigation opens the current guarded library instead of the old preview screen',async()=>{
 const legacy=[],calls=[];
 const target={go:(...args)=>{legacy.push(args);return 'legacy';}};
 installContractRoutes(target,()=>{throw Error('Templates must not open the contract list');},async()=>{calls.push('library');return 'current-library';});
 assert.equal(await target.go('contractTemplatePage'),'current-library');
 assert.equal(await target.AQARI_V267_OPEN_TEMPLATES(),'current-library');
 assert.deepEqual(calls,['library','library']);
 assert.deepEqual(legacy,[]);
 assert.equal(target.go('documentsHub'),'legacy');
 assert.deepEqual(legacy,[['documentsHub']]);
});

test('a denied library entry cannot fall back to the old unguarded template screen',async()=>{
 const legacy=[];
 const target={go:page=>legacy.push(page)};
 installContractRoutes(target,()=>true,()=>false);
 assert.equal(await target.go('contractTemplatePage'),false);
 assert.deepEqual(legacy,[]);
});


test('signing settlement module load is bounded and rechecked before dialog handoff',()=>{
 const source=readFileSync(new URL('../src/v267/pages/rental-contracts.js',import.meta.url),'utf8');
 assert.match(source,/async function openContractExecutionDialog\(d,id,onDone\)[\s\S]*guardPageImport\(\(\)=>import\('\.\/contract-execution\.js'\)\)/);
 assert.match(source,/guardPageImport[\s\S]*d\.session\.check\(\)[\s\S]*d\.close\(\)[\s\S]*openContractExecution\(id,\{onDone\}\)/);
 assert.doesNotMatch(source,/openContractExecutionDialog[\s\S]{0,180}await import\('\.\/contract-execution\.js'\)/);
});
