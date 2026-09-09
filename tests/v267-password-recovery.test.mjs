import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createPasswordRecovery,createRecoveryTransport} from '../src/v267/api/password-recovery.js';
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(options={}){
 let callback,id='account-a',writes=0,stops=0,unsubscribed=false;
 const phases=[];
 const auth={
  onAuthStateChange(fn){callback=fn;return {data:{subscription:{unsubscribe(){unsubscribed=true;}}}};},
  async getSession(){return {data:{session:options.empty?null:{user:{id}}}};},
  async getUser(){if(options.verify)await options.verify();return {data:{user:{id}}};},
  async updateUser(body){writes++;assert.deepEqual(body,{password:'new-password-123'});if(options.update)await options.update();return options.updateError?{error:Error('secret-provider-error')}:{data:{user:{id}}};},
  async signOut(body){assert.equal(body.scope,'global');if(options.logoutError)return {error:Error('network')};callback('SIGNED_OUT',null);return {};}
 };
 const recovery=createPasswordRecovery({auth},{stop(){stops++;}},p=>phases.push(p),options.timeout||200);
 return {recovery,auth,phases,emit:(event,user=id)=>callback(event,user?{user:{id:user}}:null),setId(value){id=value;},get writes(){return writes;},get stops(){return stops;},get unsubscribed(){return unsubscribed;}};
}
async function ready(f){const p=f.recovery.initialize();await tick();f.emit('PASSWORD_RECOVERY');await p;assert.equal(f.recovery.phase,'ready');}
test('delayed SDK recovery event enables a verified one-use reset and global sign-out',async()=>{
 const f=fixture();await ready(f);assert.equal(await f.recovery.save('new-password-123','new-password-123'),true);assert.equal(f.recovery.phase,'complete');assert.equal(f.writes,1);
 assert.equal(await f.recovery.save('new-password-123','new-password-123'),false);assert.equal(f.writes,1);
});
test('a saved ordinary session cannot authorize the recovery form',async()=>{
 const f=fixture({timeout:15});f.emit('SIGNED_IN');await f.recovery.initialize();assert.notEqual(f.recovery.phase,'ready');assert.equal(f.writes,0);
});
test('missing or expired callback session cannot authorize reset',async()=>{
 const f=fixture({empty:true});f.emit('PASSWORD_RECOVERY');await f.recovery.initialize();assert.equal(f.recovery.phase,'expired');
});
test('password mismatch and length reject without a write and allow correction',async()=>{
 const f=fixture();await ready(f);for(const [a,b]of [['short','short'],['new-password-123','different'],['a'.repeat(129),'a'.repeat(129)]])assert.equal(await f.recovery.save(a,b),false);
 assert.equal(f.writes,0);assert.equal(f.recovery.phase,'ready');
});
test('synchronous sign-out clears authorization and prevents a pending verification write',async()=>{
 const f=fixture();await ready(f);let resolve;f.auth.getUser=()=>new Promise(r=>{resolve=r;});const saved=f.recovery.save('new-password-123','new-password-123');await tick();f.emit('SIGNED_OUT',null);
 assert.equal(f.recovery.phase,'expired');resolve({data:{user:{id:'account-a'}}});assert.equal(await saved,false);assert.equal(f.writes,0);
});
test('account changes, including a silent change, cannot reset the new account',async()=>{
 for(const event of [true,false]){const f=fixture();await ready(f);f.setId('account-b');if(event)f.emit('SIGNED_IN','account-b');assert.equal(await f.recovery.save('new-password-123','new-password-123'),false);assert.equal(f.writes,0);}
});
test('uncertain save is terminal and cannot create a duplicate mutation',async()=>{
 const f=fixture({update:()=>new Promise(()=>{}),timeout:15});await ready(f);assert.equal(await f.recovery.save('new-password-123','new-password-123'),false);assert.equal(f.recovery.phase,'uncertain');assert.equal(await f.recovery.save('new-password-123','new-password-123'),false);assert.equal(f.writes,1);
});
test('provider rejection never becomes success or exposes provider details',async()=>{
 const f=fixture({updateError:true});await ready(f);assert.equal(await f.recovery.save('new-password-123','new-password-123'),false);assert.equal(f.recovery.phase,'uncertain');assert.ok(!JSON.stringify(f.phases).includes('secret'));
});
test('successful update with failed sign-out is reported separately',async()=>{
 const f=fixture({logoutError:true});await ready(f);assert.equal(await f.recovery.save('new-password-123','new-password-123'),false);assert.equal(f.recovery.phase,'saved-signout-failed');
});
test('leaving the page closes the flow and ignores a late successful mutation',async()=>{
 let resolve;const f=fixture({update:()=>new Promise(r=>{resolve=r;})});await ready(f);const saved=f.recovery.save('new-password-123','new-password-123');await tick();f.recovery.close();resolve();assert.equal(await saved,false);assert.equal(f.recovery.phase,'expired');assert.equal(f.unsubscribed,true);
});
test('transport handles empty logout response and refuses late SDK network work',async()=>{
 let calls=0;const t=createRecoveryTransport(async()=>{calls++;return new Response(null,{status:204});});assert.equal((await t.fetch('/logout')).status,204);t.stop();await assert.rejects(t.fetch('/user'));assert.equal(calls,1);
});
test('transport abort covers a hanging response body',async()=>{
 let aborted=false;const t=createRecoveryTransport(async(_,{signal})=>({arrayBuffer:()=>new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));})),status:200}),10);
 await assert.rejects(t.fetch('/user'));assert.equal(aborted,true);
});
test('login routes recovery and expired callbacks before starting auth or restoring app',()=>{
 const source=fs.readFileSync('login.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
 for(const hash of ['#type=recovery&access_token=synthetic&refresh_token=synthetic','#error=access_denied&error_code=otp_expired']){
  const destinations=[];vm.runInNewContext(source,{window:{location:{hash,replace:path=>destinations.push(path)}},document:{getElementById(){throw Error('normal login booted');}}});assert.deepEqual(destinations,['/reset-password.html'+hash]);
 }
});
