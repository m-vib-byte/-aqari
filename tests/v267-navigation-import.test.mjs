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

test('cancellation settles immediately even when the page download never finishes',async()=>{
 const result=guardPageImport(()=>new Promise(()=>{}));
 const rejected=assert.rejects(result,/NAVIGATION_SUPERSEDED/);
 cancelPendingNavigation();await rejected;
 assert.equal(await guardPageImport(async()=> 'ready'),'ready');
});
test('a stalled page times out and its late completion cannot open a page',async(t)=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const download=deferred();let opened=0;
 const result=guardPageImport(()=>download.promise).then(()=>opened++);
 const rejected=assert.rejects(result,/انتهت مهلة فتح الصفحة/);
 await Promise.resolve();t.mock.timers.tick(15000);await rejected;
 download.resolve({});await Promise.resolve();assert.equal(opened,0);
 assert.equal(await guardPageImport(async()=> 'retry'),'retry');
});
test('cleanup of an old import cannot remove the cancellation of its replacement',async()=>{
 const old=guardPageImport(()=>new Promise(()=>{}));
 const oldRejected=assert.rejects(old,/NAVIGATION_SUPERSEDED/);
 const current=guardPageImport(()=>new Promise(()=>{}));
 const currentRejected=assert.rejects(current,/NAVIGATION_SUPERSEDED/);
 await oldRejected;cancelPendingNavigation();await currentRejected;
});
