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
 assert.match(source,/installContractRoutes\(window,openContracts\)/);
});
