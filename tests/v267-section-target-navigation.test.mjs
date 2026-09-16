import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../v199-ui.js',import.meta.url),'utf8');

function runtime(width,{stableOpens=true,currentOpens=true}={}){
 const start=source.indexOf('  function routeNode(target){');
 const end=source.indexOf('  function quickAdd(target){',start);
 assert.ok(start>=0&&end>start,'transformed V199 navigation block must exist');
 const calls=[];
 const pages=new Map();
 for(const id of ['home','list','collectionProPage','maintenanceProPage','documentsHub']){
  const page={
   id,hidden:false,visible:id==='home',
   getAttribute(name){return name==='aria-hidden'&&!this.visible?'true':null;},
   scrollIntoView(options){calls.push(`section:${this.id}:${options?.block}:${options?.behavior}`);},
   getBoundingClientRect(){return {top:240};}
  };
  pages.set(id,page);
 }
 const open=route=>{
  for(const page of pages.values())page.visible=false;
  const id=['properties','tenants'].includes(route)?'list':route;
  if(pages.has(id))pages.get(id).visible=true;
 };
 const context={
  Promise,
  document:{getElementById:id=>pages.get(id)||null},
  markActive:target=>calls.push('active:'+target),
  closeLayers:()=>calls.push('close'),
  requestAnimationFrame:fn=>fn(),
  Number,Math,
  window:{
   innerWidth:width,scrollY:900,
   AQARI_V199_BASE_GO(route){calls.push('stable:'+route);if(stableOpens)open(route);},
   go(route){calls.push('current:'+route);if(currentOpens)open(route);},
   getComputedStyle(page){return {display:page.visible?'block':'none',visibility:'visible'};},
   scrollTo(options){calls.push('window-scroll:'+options.top+':'+options.behavior);}
  }
 };
 vm.runInNewContext(source.slice(start,end)+';this.navigateV267=navigate;',context);
 return {calls,navigate:context.navigateV267};
}

for(const [device,width] of [['iPhone',390],['iPad',820],['Desktop',1440]]){
 test(`${device} main sections align the viewport to the opened section`,()=>{
  const r=runtime(width);
  for(const [route,id] of [['properties','list'],['tenants','list'],['collectionProPage','collectionProPage'],['maintenanceProPage','maintenanceProPage'],['home','home']]){
   r.calls.length=0;
   r.navigate(route);
   assert.equal(r.calls[0],'close');
   assert.ok(r.calls.includes('stable:'+route),route+' must open through the stable router');
   assert.ok(r.calls.includes(`section:${id}:start:auto`),route+' must align to its actual section');
   assert.equal(r.calls.some(value=>value.startsWith('window-scroll:0:')),false,route+' must not jump to page top');
  }
 });
}

test('failed stable transition retries current router and then aligns to the destination',()=>{
 const r=runtime(820,{stableOpens:false,currentOpens:true});
 r.navigate('properties');
 assert.deepEqual(r.calls.filter(v=>/^(stable|current|section|window-scroll):/.test(v)),['stable:properties','current:properties','section:list:start:auto']);
});

test('a destination that never opens never scrolls anywhere',()=>{
 const r=runtime(390,{stableOpens:false,currentOpens:false});
 r.navigate('properties');
 assert.ok(r.calls.includes('stable:properties'));
 assert.ok(r.calls.includes('current:properties'));
 assert.equal(r.calls.some(v=>v.startsWith('section:')||v.startsWith('window-scroll:')),false);
});

test('internal section keeps current router and aligns to its own page',()=>{
 const r=runtime(1440);
 r.navigate('documentsHub');
 assert.ok(r.calls.includes('current:documentsHub'));
 assert.equal(r.calls.includes('stable:documentsHub'),false);
 assert.ok(r.calls.includes('section:documentsHub:start:auto'));
});
