import test from 'node:test';
import assert from 'node:assert/strict';
import {createDraftAutosave} from '../src/v267/components/draft-autosave.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(save){let value=0,next=0;const timers=new Map(),errors=[];const queue=createDraftAutosave({snapshot:()=>value,save,onError:e=>errors.push(e),setTimer:fn=>{timers.set(++next,fn);return next;},clearTimer:id=>timers.delete(id)});return {queue,errors,timers,set:v=>{value=v;queue.schedule();},fire:()=>{const entry=timers.entries().next().value;timers.delete(entry[0]);entry[1]();}};}

test('review flush saves pending debounce once before proceeding',async()=>{
 const saved=[],f=fixture(async value=>saved.push(value));f.set(1);f.set(2);
 await f.queue.flush();assert.deepEqual(saved,[2]);assert.equal(f.timers.size,0);
 await f.queue.flush();assert.deepEqual(saved,[2]);
});

test('review waits for an in-flight save and the latest queued edit in order',async()=>{
 const first=deferred(),second=deferred(),events=[];
 const f=fixture(async value=>{events.push('start '+value);await (value===1?first:second).promise;events.push('end '+value);});
 f.set(1);f.fire();await Promise.resolve();await Promise.resolve();
 f.set(2);let reviewed=false;const review=f.queue.flush().then(()=>{reviewed=true;events.push('review');});
 assert.equal(reviewed,false);first.resolve();await Promise.resolve();await Promise.resolve();
 assert.equal(reviewed,false);second.resolve();await review;
 assert.deepEqual(events,['start 1','end 1','start 2','end 2','review']);
});

test('failed autosave prevents a review or promotion from proceeding',async()=>{
 const failure=Error('write result not confirmed'),f=fixture(async()=>{throw failure;});f.set(1);
 await assert.rejects(f.queue.flush(),e=>e===failure);assert.deepEqual(f.errors,[failure]);
 await assert.rejects(f.queue.flush(),e=>e===failure);
});

test('closing a draft cancels unsent autosaves',async()=>{
 const saved=[],f=fixture(async value=>saved.push(value));f.set(1);f.queue.dispose();
 assert.equal(f.timers.size,0);await assert.rejects(f.queue.flush(),/أغلقت/);assert.deepEqual(saved,[]);
});
