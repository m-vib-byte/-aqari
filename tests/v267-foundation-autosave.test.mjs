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

test('forced disposal cancels unsent autosaves after the session boundary',async()=>{
 const saved=[],f=fixture(async value=>saved.push(value));f.set(1);f.queue.dispose();
 assert.equal(f.timers.size,0);await assert.rejects(f.queue.flush(),/أغلقت/);assert.deepEqual(saved,[]);
});

for(const queued of [false,true])test('close flush also saves edits arriving while the first write is in flight; queued='+queued,async()=>{
 const first=deferred(),second=deferred(),started=deferred(),latestStarted=deferred(),saved=[];
 const f=fixture(async value=>{(value===1?started:latestStarted).resolve();await (value===1?first:second).promise;saved.push(value);});
 f.set(1);let closed=false;const closing=f.queue.flush().then(()=>closed=true);
 await started.promise;assert.equal(f.queue.hasUnsavedChanges(),true);f.set(2);if(queued)f.fire();first.resolve();
 await Promise.race([latestStarted.promise,closing]);
 assert.equal(closed,false,'closing must wait for the new edit, not just the first save');
 second.resolve();await closing;assert.deepEqual(saved,[1,2]);assert.equal(f.timers.size,0);assert.equal(f.queue.hasUnsavedChanges(),false);
});

test('saving an older snapshot cannot announce that the latest pending edit is saved',async()=>{
 const first=deferred(),started=deferred(),events=[];let value=1,timer;
 const queue=createDraftAutosave({snapshot:()=>value,save:async v=>{if(v===1){started.resolve();await first.promise;}},onSaved:()=>events.push('saved'),setTimer:fn=>(timer=fn,1),clearTimer:()=>{timer=null;}});
 queue.schedule();timer();await started.promise;value=2;queue.schedule();first.resolve();
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(events,[],'the new edit still has no confirmed write');
 await queue.flush();assert.deepEqual(events,['saved']);
});

test('unload warning remains active during debounce, writes and failure until a later edit is confirmed',async()=>{
 const failure=Error('write not confirmed');let rejectWrite=true;
 const f=fixture(async()=>{if(rejectWrite)throw failure;});
 assert.equal(f.queue.hasUnsavedChanges(),false);f.set(1);assert.equal(f.queue.hasUnsavedChanges(),true);
 await assert.rejects(f.queue.flush(),e=>e===failure);assert.equal(f.queue.hasUnsavedChanges(),true);
 await assert.rejects(f.queue.flush(),e=>e===failure);
 rejectWrite=false;f.set(2);await f.queue.flush();assert.equal(f.queue.hasUnsavedChanges(),false);
 f.set(3);f.queue.dispose();assert.equal(f.queue.hasUnsavedChanges(),false);
});
