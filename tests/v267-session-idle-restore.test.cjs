const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const bridge=fs.readFileSync(path.join(root,'secure-auth-bridge.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const start=bridge.indexOf('  function setCompatibility(){');
const end=bridge.indexOf('\n  function hideLegacyGates(',start);
const idleSource=html.match(/setInterval\(\(\)=>\{const at=Number\(localStorage\.getItem\('aqari_v75_last_activity'\)[\s\S]*?\},60000\);/)?.[0];
assert.ok(idleSource,'exercise the actual legacy idle timer');

function fixture(authorized=true){
 let now=Date.parse('2026-09-18T15:46:43Z'),signouts=0,tick;
 const values=new Map([['aqari_v75_last_activity',String(now-3600000)],['aqari_last_activity_v119',new Date(now-3600000).toISOString()]]);
 const localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v))};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const context=authorized?{user:{id:'u',email:'test@example.invalid'},membership:{is_active:true,user_id:'u',workspace_id:'w'},workspace:{id:'w'},profile:{display_name:'Record'}}:null;
 const sandbox={context,Date:Clock,localStorage,sessionStorage:{setItem(){}},window:{},roleInfo:()=>({local:'manager',legacy:'manager',label:'Manager'}),byId:()=>null,SESSION_TIMEOUT_V75:15*60000,lockSessionV75(){signouts++;},setInterval(fn){tick=fn;}};
 vm.runInNewContext(bridge.slice(start,end)+'\n'+idleSource,sandbox);
 return {unlock:()=>sandbox.setCompatibility(),tick:()=>tick(),advance:ms=>{now+=ms;},values,get signouts(){return signouts;},get now(){return now;}};
}
test('a stale previous visit reproduces immediate idle logout before a verified unlock',()=>{
 const r=fixture();r.tick();assert.equal(r.signouts,1);
});
test('verified restore resets both idle clocks and survives the next old timer tick',()=>{
 const r=fixture();r.unlock();
 assert.equal(r.values.get('aqari_v75_last_activity'),String(r.now));
 assert.equal(r.values.get('aqari_last_activity_v119'),new Date(r.now).toISOString());
 r.advance(60000);r.tick();assert.equal(r.signouts,0);
 r.advance(15*60000);r.tick();assert.equal(r.signouts,1,'real inactivity still locks');
});
test('a signed-out state cannot reset the idle timer or grant access',()=>{
 const r=fixture(false);const before=[...r.values];r.unlock();assert.deepEqual([...r.values],before);
 r.tick();assert.equal(r.signouts,1);
});

function logoutFixture({sdkError=false,clearError=false,mismatch=false}={}){
 const adapter=fs.readFileSync(path.join(root,'supabase-adapter.js'),'utf8');
 const a=adapter.indexOf('  async function signOut('),b=adapter.indexOf('\n  async function bindAccess(',a);
 const l=bridge.indexOf('  function legacyLockV198('),le=bridge.indexOf('\n  // The obsolete V121',l);
 const o=bridge.indexOf('  window.cloudLogoutV198 ='),oe=bridge.indexOf('\n  window.uploadLocalToCloudV198',o);
 const sessions=new Set(['current','other-device']),calls=[],notices=[];
 let cleared=0,resets=0,sealed=0;
 const identity={userId:'user',workspaceId:'workspace'};
 const sdk={auth:{signOut:async options=>{calls.push(options?.scope||'global');if(sdkError)return {error:new Error('unavailable')};if(options?.scope==='local')sessions.delete('current');else sessions.clear();return {error:null};}}};
 const clear=()=>{if(clearError)throw Error('cannot clear');cleared++;};
 const sandbox={context:identity,accessIdentity:x=>x,sameIdentity:(x,y)=>x===y,getClient:async()=>sdk,clearPersistedSession:clear,localStorage:{removeItem(){}},SYNC_READY_KEY:'sync',showGate:(...args)=>notices.push(args),hardResetPage:()=>resets++,sealData:()=>sealed++,hideLegacyGates(){},window:{AQARI_AUTOSYNC:{disable(){}}}};
 vm.createContext(sandbox);vm.runInContext(adapter.slice(a,b),sandbox);
 sandbox.window.AQARI_SUPABASE={context:mismatch?{}:identity,signOut:sandbox.signOut,clearPersistedSession:clear,verifySessionNull:async()=>{if(clearError)throw Error('session remains');}};
 vm.runInContext(bridge.slice(l,le)+'\n'+bridge.slice(o,oe),sandbox);
 return {sessions,calls,notices,lock:()=>sandbox.legacyLockV198(),logout:options=>sandbox.window.cloudLogoutV198(options),get cleared(){return cleared;},get resets(){return resets;},get sealed(){return sealed;}};
}
test('idle lock signs out this session and preserves another active device',async()=>{
 const r=logoutFixture();assert.equal(await r.lock(),true);
 assert.deepEqual(r.calls,['local']);assert.deepEqual([...r.sessions],['other-device']);
 assert.equal(r.cleared,1);assert.equal(r.resets,1);
});
test('ordinary logout preserves the other device session',async()=>{
 const r=logoutFixture();assert.equal(await r.logout(),true);
 assert.deepEqual(r.calls,['local']);assert.deepEqual([...r.sessions],['other-device']);
 assert.equal(r.cleared,1);assert.equal(r.resets,1);
});
test('only an explicit global logout revokes both devices',async()=>{
 const r=logoutFixture();assert.equal(await r.logout({scope:'global'}),true);
 assert.deepEqual(r.calls,['global']);assert.equal(r.sessions.size,0);
 assert.equal(r.cleared,1);assert.equal(r.resets,1);
});
test('a stale identity cannot log out a different active identity',async()=>{
 const r=logoutFixture({mismatch:true});assert.equal(await r.lock(),false);
 assert.equal(r.calls.length,0);assert.equal(r.sealed,1);assert.equal(r.sessions.size,2);
});
test('failed local logout cannot reopen the workspace or report success',async()=>{
 const r=logoutFixture({sdkError:true,clearError:true});assert.equal(await r.lock(),false);
 assert.deepEqual(r.calls,['local']);assert.equal(r.resets,0);
 assert.equal(r.notices.at(-1)[1],'bad');assert.equal(r.sessions.size,2);
});
test('a failed global request cannot report success after clearing only the current browser',async()=>{
 const r=logoutFixture({sdkError:true});assert.equal(await r.logout({scope:'global'}),false);
 assert.equal(r.resets,0);assert.equal(r.notices.at(-1)[1],'bad');assert.equal(r.sessions.size,2);
});
test('tenant portal logout revokes only the current device',async()=>{
 const source=fs.readFileSync(path.join(root,'v267-tenant-portal.js'),'utf8');
 const handler=source.split('\n').find(line=>line.startsWith("$('tenantLogout').onclick="));
 assert.ok(handler,'exercise the actual tenant logout handler');
 const button={},sessions=new Set(['current','other-device']);let scope,finished=false;
 const sandbox={$:()=>button,invalidate(){},epoch:1,start:()=>1,current:()=>true,bounded:p=>p,notice(){},finish(){finished=true;},client:{auth:{async signOut(options){scope=options?.scope;if(scope==='local')sessions.delete('current');else sessions.clear();return {error:null};}}}};
 vm.runInNewContext(handler,sandbox);await button.onclick();
 assert.equal(scope,'local');assert.deepEqual([...sessions],['other-device']);assert.equal(finished,true);
});
