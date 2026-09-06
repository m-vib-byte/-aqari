'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','v205-simplified-shell.js'),'utf8');
const start=source.indexOf('  function handleClick(event){');
const end=source.indexOf('  function handleKeydown(event){',start);
assert.ok(start>=0&&end>start,'real V205 handler boundaries');

// Minimal ancestor tree for the selectors used by the actual handler.
// Browser propagation is independently covered by the Chromium reproduction.
class Element {
  constructor(tag,attrs={},parent=null){this.tag=tag;this.attrs=attrs;this.parent=parent;}
  getAttribute(name){return Object.hasOwn(this.attrs,name)?this.attrs[name]:null;}
  matches(selector){
    const match=selector.match(/^([a-z]+)?\[([^\]]+)\]$/);
    if(!match)throw new Error('Unsupported fixture selector: '+selector);
    return (!match[1]||this.tag===match[1])&&Object.hasOwn(this.attrs,match[2]);
  }
  closest(selector){
    if(selector==='#v205PrimarySections [data-v205-section]'){
      const section=this.closest('[data-v205-section]');
      for(let node=section?.parent;node;node=node.parent){if(node.attrs.id==='v205PrimarySections')return section;}
      return null;
    }
    for(let node=this;node;node=node.parent){
      if(selector.split(',').some(part=>node.matches(part)))return node;
    }
    return null;
  }
}
function runtime(){
  const calls=[],timers=[];
  const root=new Element('body',{'data-v205-route':'home'});
  const context={Element,window:{go(route){calls.push('go:'+route);}},document:{getElementById(){return null;}},
    closeChooser(){calls.push('close');},syncPrimaryNavigation(route){calls.push('select:'+route);},
    setTimeout(fn){timers.push(fn);},chooserProperties:[],chooserAction:''};
  vm.runInNewContext(source.slice(start,end)+';this.handler=handleClick;',context);
  function click(target){
    const event={target,preventDefault(){calls.push('prevent');},stopImmediatePropagation(){calls.push('stop');}};
    context.handler(event);
    return calls;
  }
  return {root,calls,timers,click};
}
for(const [name,tag,attrs,nested] of [
  ['return-to-login link','a',{href:'/login?manual=1'},false],
  ['quick-create icon','button',{'data-v201-quick':'true'},true],
  ['ordinary form field','input',{type:'email'},false],
  ['background','div',{},false]
])test('V205 does not consume '+name,()=>{
  const r=runtime(),control=new Element(tag,attrs,r.root);
  r.click(nested?new Element('span',{},control):control);
  assert.deepEqual(r.calls,[]);
});
test('primary-section navigation is not replaced by body home state',()=>{
  const r=runtime(),nav=new Element('nav',{id:'v205PrimarySections'},r.root);
  const button=new Element('button',{'data-v205-section':'properties','data-v199-go':'properties'},nav);
  r.click(new Element('span',{},button));
  assert.deepEqual(r.calls,['prevent','stop','select:properties','go:properties']);
});
for(const tag of ['button','a'])test('explicit '+tag+' route remains functional',()=>{
  const r=runtime(),control=new Element(tag,{'data-v205-route':'properties'},r.root);
  r.click(new Element('span',{},control));
  assert.deepEqual(r.calls,['prevent','stop','close','go:properties']);
});
test('legacy navigation bubbles and synchronizes selection afterward',()=>{
  const r=runtime(),button=new Element('button',{'data-v199-go':'tenants'},r.root);
  r.click(button);assert.deepEqual(r.calls,[]);assert.equal(r.timers.length,1);
  r.timers[0]();assert.deepEqual(r.calls,['select:tenants']);
});
test('non-element event targets are ignored',()=>{
  const r=runtime();r.click(null);assert.deepEqual(r.calls,[]);
});
