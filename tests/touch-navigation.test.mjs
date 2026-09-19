import test from 'node:test';
import assert from 'node:assert/strict';
import {installTouchNavigation} from '../src/v267/components/touch-navigation.js';

function fixture(scope='#aqOwnerExactHome'){
 const listeners=new Map();let time=0,actions=0;
 const root={addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)};
 const button={disabled:false,closest:selector=>selector.split(',').includes(scope),click:()=>{const e=emit('click',{isTrusted:false});if(!e.stopped)actions++;}};
 function emit(name,extra={}){const e={target:{closest:()=>button},pointerType:'touch',pointerId:1,isPrimary:true,clientX:20,clientY:30,isTrusted:true,detail:1,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};listeners.get(name)?.(e);return e;}
 const dispose=installTouchNavigation(root,()=>time);
 return {emit,button,dispose,listeners,get actions(){return actions;},advance:n=>time+=n};
}
test('touch navigation activates once and consumes the later native click',()=>{
 const f=fixture();f.emit('pointerdown');f.advance(60);f.emit('pointerup');assert.equal(f.actions,1);
 assert.equal(f.emit('click').stopped,true);assert.equal(f.actions,1);
 assert.equal(f.emit('click',{detail:0}).stopped,undefined);
});
test('scroll, drag, cancel, long press and multitouch do not activate navigation',()=>{
 for(const kind of ['scroll','drag','cancel','long','multi','release-moved']){
  const f=fixture();f.emit('pointerdown');
  if(kind==='scroll')f.emit('scroll');if(kind==='drag')f.emit('pointermove',{clientX:50});
  if(kind==='cancel')f.emit('pointercancel');if(kind==='long')f.advance(700);
  if(kind==='multi')f.emit('pointerdown',{isPrimary:false,pointerId:2});
  f.emit('pointerup',kind==='release-moved'?{clientX:50}:{});assert.equal(f.actions,0,kind);
 }
});
test('mouse, keyboard, disabled controls and unrelated forms retain native behavior',()=>{
 const f=fixture();f.emit('pointerdown',{pointerType:'mouse'});f.emit('pointerup',{pointerType:'mouse'});assert.equal(f.actions,0);
 assert.equal(f.emit('click',{detail:0}).stopped,undefined);
 f.button.disabled=true;f.emit('pointerdown');f.emit('pointerup');assert.equal(f.actions,0);
 f.button.disabled=false;f.emit('pointerdown',{target:{closest:()=>null}});f.emit('pointerup');assert.equal(f.actions,0);
});
test('second touch is a separate activation and stale suppression expires',()=>{
 const f=fixture();for(let i=0;i<2;i++){f.emit('pointerdown');f.advance(40);f.emit('pointerup');f.emit('click');}assert.equal(f.actions,2);
 f.emit('pointerdown');f.emit('pointerup');f.advance(900);assert.equal(f.emit('click').stopped,undefined);
 f.dispose();assert.equal(f.listeners.size,0);
});

test('touch fallback also activates search submit and property-card buttons',()=>{
 for(const kind of ['search-submit','property-card']){
  const listeners=new Map();let clicks=0;
  const root={addEventListener:(n,f)=>listeners.set(n,f),removeEventListener(){}};
  const button={disabled:false,closest:()=>true,click:()=>clicks++};
  const icon={closest:selector=>selector==='button'?button:null};
  installTouchNavigation(root,()=>100);
  const event={target:icon,pointerType:'touch',pointerId:1,isPrimary:true,clientX:10,clientY:10,preventDefault(){}};
  listeners.get('pointerdown')(event);listeners.get('pointerup')(event);
  assert.equal(clicks,1,kind);
 }
});

test('service dialog close, upload and section icon taps activate once',()=>{
 for(const action of ['close','upload','expand']){
  const f=fixture('#aq267-service-dialog');
  f.emit('pointerdown');f.advance(50);f.emit('pointerup');
  assert.equal(f.actions,1,action);
  // Upload/close can move the original button out of its dialog before the native click.
  f.button.closest=()=>null;
  assert.equal(f.emit('click').stopped,true,action);
  assert.equal(f.actions,1,action);
 }
});
test('service scrolling does not open a section or a document form',()=>{
 const f=fixture('#aq267-service-dialog');
 f.emit('pointerdown');f.emit('pointermove',{clientY:80});f.emit('pointerup',{clientY:80});
 assert.equal(f.actions,0);
 f.emit('pointerdown');f.emit('scroll');f.emit('pointerup');assert.equal(f.actions,0);
});
test('document upload forms outside the directory retain native file selection',()=>{
 const f=fixture('.aq267-scanner');
 f.emit('pointerdown');f.emit('pointerup');assert.equal(f.actions,0);
 assert.equal(f.emit('click').stopped,undefined);
});

test('directory clicks route before legacy handlers and retain the original authorization action',()=>{
 let handler,actions=0;
 const root={addEventListener:(name,fn)=>{if(name==='click')handler=fn;},removeEventListener(){}};
 const button={disabled:false,closest:s=>s==='#aq267-service-dialog[open]',onclick(){assert.equal(this,button);actions++;}};
 installTouchNavigation(root);
 const event=()=>({target:{closest:()=>button},isTrusted:true,detail:1,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}});
 const e=event();handler(e);assert.equal(actions,1);assert.equal(e.stopped,true);
 button.disabled=true;const blocked=event();handler(blocked);assert.equal(actions,1);assert.equal(blocked.stopped,undefined);
 button.disabled=false;button.closest=()=>false;const outside=event();handler(outside);assert.equal(actions,1);assert.equal(outside.stopped,undefined);
});
