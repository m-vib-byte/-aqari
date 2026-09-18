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
