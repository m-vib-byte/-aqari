import test from 'node:test';
import assert from 'node:assert/strict';
import {installExactNavigationEvents} from '../src/v267/components/exact-navigation-events.js';
function fixture(){
 let handler,capture,actions=[];
 const root={addEventListener(n,h,c){assert.equal(n,'click');handler=h;capture=c;},removeEventListener(n,h,c){assert.equal(h,handler);assert.equal(c,true);handler=null;}};
 const dispose=installExactNavigationEvents(root,e=>actions.push(e.target));
 const control=(inside=true)=>({disabled:false,closest:()=>inside,getAttribute:()=>null});
 const fire=(button,child=button)=>{let prevented=false,stopped=false;const e={target:{closest:()=>child},preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}};if(child===button)e.target={closest:()=>button};handler(e);return {prevented,stopped};};
 return {root,control,fire,actions,dispose,get capture(){return capture;},get handler(){return handler;}};
}
test('routes a shell action before legacy document routers',()=>{const f=fixture(),b=f.control();assert.equal(f.capture,true);assert.deepEqual(f.fire(b),{prevented:true,stopped:true});assert.deepEqual(f.actions,[b]);});
test('new menu and dashboard controls keep working after replacement without rebinding',()=>{const f=fixture(),old=f.control(),replacement=f.control();f.fire(old);f.fire(replacement);assert.deepEqual(f.actions,[old,replacement]);});
test('passes the button for nested icon taps and keyboard clicks exactly once',()=>{const f=fixture(),b=f.control();f.fire(b);assert.deepEqual(f.actions,[b]);});
test('does not intercept other forms, service dialogs or disabled controls',()=>{const f=fixture(),outside=f.control(false);assert.deepEqual(f.fire(outside),{prevented:false,stopped:false});const disabled=f.control();disabled.disabled=true;f.fire(disabled);const aria=f.control();aria.getAttribute=()=> 'true';f.fire(aria);assert.deepEqual(f.actions,[]);});
test('disposes the exact capture listener',()=>{const f=fixture();f.dispose();assert.equal(f.handler,null);});

test('section return controls are captured before legacy text-based routers',()=>{
 let listener,handled=0,stopped=false;
 const root={addEventListener:(n,fn)=>listener=fn,removeEventListener(){}};
 const button={disabled:false,getAttribute:()=>null,closest:selector=>selector.split(',').includes('.aq-exact-section-head')};
 installExactNavigationEvents(root,()=>handled++);
 listener({target:{closest:()=>button},preventDefault(){},stopImmediatePropagation(){stopped=true;}});
 assert.equal(handled,1);assert.equal(stopped,true);
});
