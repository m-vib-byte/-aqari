import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';

const raw=fs.readFileSync('supabase/functions/stage-c-storage-receiver-20261001/index.ts','utf8').replace(/^import .*;\n/,'');
const workspace='c05fcb74-8315-43aa-86b7-0b420c05d2cd';
function fixture(fetch){
 const ctx=vm.createContext({fetch,Response,Request,AbortSignal,Date,atob,Uint8Array,crypto,createClient(){throw Error('must not reach storage')},Deno:{serve(handler){ctx.handler=handler},env:{get(){throw Error('must not read privileged context')}}}});
 vm.runInContext(stripTypeScriptTypes(raw),ctx);return ctx;
}
function request(aal='aal2'){
 const token='e30.'+Buffer.from(JSON.stringify({sub:'manager',aal})).toString('base64url')+'.test';
 return new Request('https://receiver.invalid',{method:'POST',headers:{authorization:'Bearer '+token}});
}
const user=()=>Response.json({id:'manager'});
const access=(role='general_manager')=>Response.json({workspace_id:workspace,user_id:'manager',role});
test('transient auth timeout retries once and still verifies workspace role',async()=>{
 let calls=0;const ctx=fixture(async()=>{calls++;if(calls===1)throw new DOMException('timeout','TimeoutError');return calls===2?user():access()});
 const result=await ctx.verifySourceManager(request());assert.equal(result.userId,'manager');assert.equal(calls,3);
});
test('transient workspace service error is retried',async()=>{
 let calls=0;const ctx=fixture(async()=>{calls++;return calls===1?user():calls===2?new Response('',{status:503}):access()});
 assert.equal((await ctx.verifySourceManager(request())).userId,'manager');assert.equal(calls,3);
});
test('definitive auth rejection is not retried',async()=>{
 let calls=0;const ctx=fixture(async()=>{calls++;return new Response('',{status:401})});
 assert.equal(await ctx.verifySourceManager(request()),null);assert.equal(calls,1);
});
test('persistent timeout returns controlled 503 without privileged storage access',async()=>{
 let calls=0;const ctx=fixture(async()=>{calls++;throw new DOMException('timeout','TimeoutError')});
 const result=await ctx.handler(request());assert.equal(result.status,503);assert.equal((await result.json()).error,'SOURCE_AUTH_UNAVAILABLE');assert.equal(calls,2);
});
test('aal1 and non-manager remain denied',async()=>{
 const low=fixture(async()=>user());assert.equal(await low.verifySourceManager(request('aal1')),null);
 let calls=0;const ctx=fixture(async()=>++calls===1?user():access('accountant'));
 assert.equal(await ctx.verifySourceManager(request()),null);assert.equal(calls,2);
});
test('expired shared authorization budget does not call upstream',async()=>{
 const ctx=fixture(async()=>{throw Error('unexpected fetch')});
 await assert.rejects(()=>ctx.sourceJson('https://source.invalid',{},Date.now()-1),/SOURCE_AUTH_UNAVAILABLE/);
});
