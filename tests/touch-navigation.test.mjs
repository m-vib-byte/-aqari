import test from 'node:test';
import assert from 'node:assert/strict';
import {installTouchNavigation} from '../src/v267/components/touch-navigation.js';

function fixture(){
 const listeners=new Map();let time=0,actions=0;
 const root={addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)};
 const button={disabled:false,closest:()=>true,click:()=>{const e=emit('click',{isTrusted:false});if(!e.stopped)actions++;}};
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
