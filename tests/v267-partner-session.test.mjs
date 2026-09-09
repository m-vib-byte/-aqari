import test from 'node:test';
import assert from 'node:assert/strict';
import {createPartnerSession} from '../src/v267/api/partner-session.js';
function fixture({response,authDelay=false,timeout=1000}={}){
 let notify,id='a',resolveRequest,aborted=false,clears=0,reads=0;
 const client={auth:{onAuthStateChange(fn){notify=fn;return {data:{subscription:{unsubscribe(){}}}};},getSession(){reads++;return authDelay?new Promise(()=>{}):Promise.resolve({data:{session:id?{user:{id}}:null}});}},
 rpc(name,args){assert.equal(name,'aqari_partner_summary');return {abortSignal(signal){signal.addEventListener('abort',()=>aborted=true);if(response)return Promise.resolve(response(args));return new Promise(resolve=>resolveRequest=resolve);}};}};
 const session=createPartnerSession(client,()=>clears++,timeout);
 return {session,emit(event,next){id=next;notify(event,next?{user:{id:next}}:null);},resolve(data){resolveRequest({data});},setUser(next){id=next;},get clears(){return clears;},get aborted(){return aborted;},get reads(){return reads;}};
}
const list=id=>({user_id:id,properties:[{id:'p-a',workspace_id:'w',name:'A'}]});
const detail={user_id:'a',property_id:'p-a',workspace_id:'w',month:'2026-09-01',recorded_receipts:7};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('partner list and detail are bound to identity, property, workspace and month',async()=>{
 const f=fixture({response:args=>({data:args.p_property_id?detail:list('a')})});
 assert.deepEqual(await f.session.read(),list('a'));
 assert.deepEqual(await f.session.read({propertyId:'p-a',workspaceId:'w',month:'2026-09-01'}),detail);f.session.close();
});
test('foreign user response is never returned',async()=>{
 const f=fixture({response:()=>({data:list('b')})});await assert.rejects(f.session.read(),/SCOPE_MISMATCH/);f.session.close();
});
for(const key of ['property_id','workspace_id','month'])test('mismatched '+key+' is rejected',async()=>{
 const f=fixture({response:()=>({data:{...detail,[key]:'other'}})});
 await assert.rejects(f.session.read({propertyId:'p-a',workspaceId:'w',month:'2026-09-01'}),/SCOPE_MISMATCH/);f.session.close();
});
test('sign-out clears synchronously and aborts a pending read',async()=>{
 const f=fixture();const pending=f.session.read();await tick();f.emit('SIGNED_OUT',null);
 assert.equal(f.clears,1);assert.equal(f.aborted,true);await assert.rejects(pending,/ABORTED|CHANGED/);f.resolve(list('a'));f.session.close();
});
test('account change without a callback is caught before returning data',async()=>{
 const f=fixture();const pending=f.session.read();await tick();f.setUser('b');f.resolve(list('a'));
 await assert.rejects(pending,/SESSION_CHANGED|READ_ABORTED/);assert.equal(f.clears,1);f.session.close();
});
test('a newer selection aborts the previous property request',async()=>{
 const f=fixture();const first=f.session.read();const failure=assert.rejects(first,/ABORTED|CHANGED/);await tick();const second=f.session.read();await tick();await failure;
 f.resolve(list('a'));assert.deepEqual(await second,list('a'));f.session.close();
});
test('the deadline includes a hung SDK session read',async()=>{
 const f=fixture({authDelay:true,timeout:20});await assert.rejects(f.session.read(),/READ_ABORTED/);assert.equal(f.aborted,false);f.session.close();
});
test('an expired or revoked grant response cannot become a successful read',async()=>{
 const f=fixture({response:()=>({error:{message:'private provider detail'}})});await assert.rejects(f.session.read(),/ACCESS_DENIED/);f.session.close();
});
