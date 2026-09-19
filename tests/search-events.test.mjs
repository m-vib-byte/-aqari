import test from 'node:test';
import assert from 'node:assert/strict';
import {installSearchEvents} from '../src/v267/components/search-events.js';
import {installTouchNavigation} from '../src/v267/components/touch-navigation.js';

function setup(){
 const listeners=new Map();let searches=0,shortcuts=0,valid=true,active=true;
 const root={addEventListener(type,fn,capture){assert.equal(capture,true);listeners.set(type,fn);},removeEventListener(type){listeners.delete(type);}};
 const event=target=>({target,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}});
 const form={id:'aqExactHeroSearch',requestSubmit(button){assert.equal(button,control);if(valid)listeners.get('submit')(event(form));}};
 const control={form,type:'submit',disabled:false};
 const dispose=installSearchEvents(root,{submit(){searches++;},shortcut(){shortcuts++;},ready:()=>active});
 return {listeners,form,control,event,dispose,get searches(){return searches;},get shortcuts(){return shortcuts;},set valid(v){valid=v;},set active(v){active=v;}};
}
test('search icon click submits once before a legacy router can cancel default activation',()=>{
 const f=setup(),e=f.event({closest:()=>f.control});
 f.listeners.get('click')(e);
 if(!e.stopped)e.preventDefault(); // Legacy document router.
 assert.equal(f.searches,1);assert.equal(e.prevented,true);assert.equal(e.stopped,true);
});
test('empty search retains browser validation; Enter follows the same submit handler',()=>{
 const f=setup();f.valid=false;f.listeners.get('click')(f.event({closest:()=>f.control}));assert.equal(f.searches,0);
 f.valid=true;f.listeners.get('submit')(f.event(f.form));assert.equal(f.searches,1);
});
test('unrelated forms, shortcut buttons and disabled search are left alone',()=>{
 for(const change of [f=>f.form.id='payment',f=>f.control.type='button',f=>f.control.disabled=true]){
  const f=setup();change(f);const e=f.event({closest:()=>f.control});f.listeners.get('click')(e);
  assert.equal(e.prevented,undefined);assert.equal(f.searches,0);
 }
});
test('Ctrl/Cmd+K opens search once and stops older assistant and search handlers',()=>{
 for(const modifier of ['ctrlKey','metaKey']){
  const f=setup(),e={...f.event({}),[modifier]:true,key:'K'};let legacy=0;
  f.listeners.get('keydown')(e);if(!e.stopped)legacy+=3;
  assert.equal(f.shortcuts,1);assert.equal(legacy,0);
  f.listeners.get('keydown')({...e,repeat:true});assert.equal(f.shortcuts,1);
 }
});
test('signed-out shortcuts do not open records and all handlers are removable',()=>{
 const f=setup();f.active=false;const e={...f.event({}),ctrlKey:true,key:'k'};f.listeners.get('keydown')(e);
 assert.equal(f.shortcuts,0);assert.equal(e.stopped,undefined);f.dispose();assert.equal(f.listeners.size,0);
});
test('touch fallback and its delayed native click submit only once',()=>{
 const listeners=new Map();let submissions=0;
 const root={addEventListener(type,fn){const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);}};
 const dispatch=(type,extra={})=>{const e={target:{closest:()=>button},pointerType:'touch',pointerId:1,isPrimary:true,clientX:0,clientY:0,isTrusted:true,detail:1,preventDefault(){},stopImmediatePropagation(){this.stopped=true;},...extra};for(const fn of listeners.get(type)||[]){fn(e);if(e.stopped)break;}};
 const form={id:'aqExactHeroSearch',requestSubmit(){dispatch('submit',{target:form});}};
 const button={form,type:'submit',disabled:false,closest:selector=>selector.includes('#aqOwnerExactHome'),click(){dispatch('click',{isTrusted:false});}};
 installTouchNavigation(root,()=>0);installSearchEvents(root,{submit(){submissions++;},shortcut(){},ready:()=>true});
 dispatch('pointerdown');dispatch('pointerup');dispatch('click');assert.equal(submissions,1);
});
