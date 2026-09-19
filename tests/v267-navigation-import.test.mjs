import test from 'node:test';
import assert from 'node:assert/strict';
import {guardPageImport,cancelPendingNavigation} from '../src/v267/components/navigation-import.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('a slow service cannot open after a newer service has opened',async()=>{
 const first=deferred();let opened=[];
 const old=guardPageImport(()=>first.promise).then(m=>m.open());
 const rejected=assert.rejects(old,/NAVIGATION_SUPERSEDED/);
 await guardPageImport(async()=>({open:()=>opened.push('new')})).then(m=>m.open());
 first.resolve({open:()=>opened.push('old')});await rejected;
 assert.deepEqual(opened,['new']);
});
test('route changes and authentication boundaries cancel in-flight service imports',async()=>{
 const pending=deferred();let opened=false;
 const result=guardPageImport(()=>pending.promise).then(()=>opened=true);
 const rejected=assert.rejects(result,/NAVIGATION_SUPERSEDED/);
 cancelPendingNavigation();pending.resolve({});await rejected;assert.equal(opened,false);
});
test('a failed import leaves the next navigation usable',async()=>{
 await assert.rejects(guardPageImport(async()=>{throw Error('download failed');}),/download failed/);
 const page={open(){}};assert.equal(await guardPageImport(async()=>page),page);
});
