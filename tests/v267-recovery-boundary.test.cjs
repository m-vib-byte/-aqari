const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('recovery.js','utf8');
const callback=source.slice(source.indexOf('  api.onAuthStateChange((event,session)=>{'),source.indexOf('  }).catch('))+'  });';
function fixture(){
 const queue=[],state={privateText:'private tenant',reads:0,disabled:true};let notify;
 const context={state,api:{onAuthStateChange:fn=>{notify=fn}},setTimeout:fn=>queue.push(fn)};
 vm.createContext(context);vm.runInContext(`let generation=0,flight=0,active={userId:'user-a'},paused=false;
 function lock(){generation++;active=null;state.privateText='';}
 function busy(value){state.disabled=value;}
 function open(){state.reads++;}
 ${callback}
 globalThis.restore=()=>{active={userId:'user-b'};paused=false;generation++;};`,context);
 return {state,emit:(event,user='user-a')=>notify(event,user?{user:{id:user}}:null),flush:()=>{while(queue.length)queue.shift()()},restore:context.restore};
}
for(const event of ['SIGNED_OUT','PASSWORD_RECOVERY'])test(event+' removes private state inside the auth callback',()=>{
 const f=fixture();f.emit(event,null);assert.equal(f.state.privateText,'');assert.equal(f.state.disabled,false);f.flush();assert.equal(f.state.reads,0);
});
test('a queued token refresh cannot reopen data after sign-out',()=>{
 const f=fixture();f.emit('TOKEN_REFRESHED');f.emit('SIGNED_OUT',null);f.flush();assert.equal(f.state.privateText,'');assert.equal(f.state.reads,0);
});
test('account switch clears immediately and defers the new read outside the auth callback',()=>{
 const f=fixture();f.emit('SIGNED_IN','user-b');assert.equal(f.state.privateText,'');assert.equal(f.state.reads,0);f.flush();assert.equal(f.state.reads,1);
});
test('a stale account-switch callback cannot affect a newer session',()=>{
 const f=fixture();f.emit('SIGNED_IN','user-b');f.restore();f.flush();assert.equal(f.state.reads,0);
});
