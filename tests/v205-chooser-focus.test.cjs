'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','v205-simplified-shell.js'),'utf8');
const start=source.indexOf('  function closeChooser(restoreFocus){'),end=source.indexOf('  function openPropertyAction(',start);
assert.ok(start>=0&&end>start);
function setup(){
 const timers=[];let calls=0,open=true;
 class Element{constructor(){this.isConnected=true;}focus(){calls++;}}
 const trigger=new Element();
 const overlay={classList:{contains:()=>open,remove(){open=false;}},setAttribute(){}};
 const ctx=vm.createContext({HTMLElement:Element,chooserTrigger:trigger,document:{getElementById:()=>overlay,body:{classList:{remove(){}}}},setChooserBackgroundInert(){},setTimeout(fn){timers.push(fn);}});
 vm.runInContext(source.slice(start,end),ctx);
 return{trigger,ctx,timers,run(value){vm.runInContext('closeChooser('+value+')',ctx);},flush(){while(timers.length)timers.shift()();},get calls(){return calls;}};
}
test('chooser restores focus after clearing its stored trigger without a null dereference',()=>{const r=setup();r.run(true);assert.equal(r.ctx.chooserTrigger,null);assert.doesNotThrow(()=>r.flush());assert.equal(r.calls,1);});
test('a trigger detached before the deferred focus is not focused',()=>{const r=setup();r.run(true);r.trigger.isConnected=false;assert.doesNotThrow(()=>r.flush());assert.equal(r.calls,0);});
test('closing without focus restoration leaves subsequent navigation undisturbed',()=>{const r=setup();r.run(false);r.flush();assert.equal(r.calls,0);});
test('closing an already closed chooser cannot schedule another focus callback',()=>{const r=setup();r.run(true);r.flush();r.run(true);r.flush();assert.equal(r.calls,1);});
