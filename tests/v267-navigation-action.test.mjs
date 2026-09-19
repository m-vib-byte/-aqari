import test from 'node:test';
import assert from 'node:assert/strict';
import {runNavigationAction} from '../src/v267/components/navigation-action.js';
test('unavailable session reports failure without invoking the page',async()=>{
 const messages=[];let called=false;
 assert.equal(await runNavigationAction({scope:()=>null,action:()=>{called=true;},report:(...m)=>messages.push(m)}),false);
 assert.equal(called,false);assert.equal(messages[0][1],true);
});
test('synchronous and asynchronous page failures are visible and sanitized',async()=>{
 for(const action of [()=>{throw Error('private provider error');},()=>Promise.reject(Error('private provider error')),()=>false]){
  const messages=[];assert.equal(await runNavigationAction({scope:()=>({}),action,report:(...m)=>messages.push(m)}),false);
  assert.deepEqual(messages.at(-1),['تعذر فتح الخدمة.',true]);
 }
});
test('successful actions clear the previous failure and execute exactly once',async()=>{
 let calls=0;const messages=[];
 assert.equal(await runNavigationAction({scope:()=>({}),action:async()=>{calls++;return true;},report:(...m)=>messages.push(m)}),true);
 assert.equal(calls,1);assert.deepEqual(messages,[['']]);
});
