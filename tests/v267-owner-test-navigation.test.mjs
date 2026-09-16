import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../v199-ui.js',import.meta.url),'utf8');

function runtime(width,{currentOpens=true,stableOpens=true,shellSync=true,withV205=true}={}){
 const start=source.indexOf('  function routeNode(target){');
 const end=source.indexOf('  function quickAdd(target){',start);
 assert.ok(start>=0&&end>start,'transformed V199 navigation block must exist');
 const calls=[];
 const bodyState={route:'home'};
 const pages=new Map();
 for(const id of ['home','list','collectionProPage','maintenanceProPage','documentsHub']){
  pages.set(id,{hidden:false,visible:id==='home',getAttribute(name){return name==='aria-hidden'&&!this.visible?'true':null;}});
 }
 const open=route=>{
  for(const page of pages.values())page.visible=false;
  const id=['properties','tenants'].includes(route)?'list':route;
  if(pages.has(id))pages.get(id).visible=true;
 };
 const windowObject={
  innerWidth:width,
  AQARI_V199_BASE_GO(route){calls.push('stable:'+route);if(stableOpens)open(route);},
  go(route){calls.push('current:'+route);if(currentOpens)open(route);},
  getComputedStyle(page){return {display:page.visible?'block':'none',visibility:'visible'};},
  scrollTo(options){calls.push('scroll:'+options.top+':'+options.behavior);}
 };
 if(withV205)windowObject.AQARI_V205={navigate(route){
  calls.push('shell:'+route);
  if(shellSync)bodyState.route=route;
  return windowObject.go(route);
 }};
 const context={
  Promise,
  document:{
   body:{getAttribute(name){return name==='data-v205-route'?bodyState.route:null;}},
   getElementById:id=>pages.get(id)||null
  },
  markActive:target=>calls.push('active:'+target),
  closeLayers:()=>calls.push('close'),
  requestAnimationFrame:fn=>fn(),
  window:windowObject
 };
 vm.runInNewContext(source.slice(start,end)+';this.navigateV267=navigate;',context);
 return {calls,navigate:context.navigateV267,pages,bodyState};
}

for(const [device,width] of [['iPhone',390],['iPad',820],['Desktop',1440]]){
 test(`${device} primary section uses the current V205 shell context before scrolling`,()=>{
  const r=runtime(width);
  for(const route of ['properties','tenants','collectionProPage','maintenanceProPage','home']){
   r.calls.length=0;
   r.navigate(route);
   assert.deepEqual(r.calls.filter(value=>/^(shell|current|stable|scroll):/.test(value)),[
    'shell:'+route,'current:'+route,'scroll:0:auto'
   ]);
   assert.equal(r.bodyState.route,route);
  }
 });
}

test('primary navigation falls back to the preserved base router only when the current route did not open',()=>{
 const r=runtime(820,{currentOpens:false,stableOpens:true});
 r.navigate('properties');
 assert.deepEqual(r.calls.filter(value=>/^(shell|current|stable|scroll):/.test(value)),[
  'shell:properties','current:properties','stable:properties','scroll:0:auto'
 ]);
 assert.equal(r.bodyState.route,'properties');
});

test('visible content with a stale home shell is not treated as a successful section transition',()=>{
 const r=runtime(390,{currentOpens:true,stableOpens:true,shellSync:false});
 r.navigate('properties');
 assert.ok(r.calls.includes('shell:properties'));
 assert.ok(r.calls.includes('current:properties'));
 assert.ok(r.calls.includes('stable:properties'));
 assert.equal(r.bodyState.route,'home');
 assert.equal(r.calls.some(value=>value.startsWith('scroll:')),false);
});

test('failed primary transition never degrades into scroll-to-top only',()=>{
 const r=runtime(390,{currentOpens:false,stableOpens:false});
 r.navigate('maintenanceProPage');
 assert.ok(r.calls.includes('shell:maintenanceProPage'));
 assert.ok(r.calls.includes('stable:maintenanceProPage'));
 assert.equal(r.calls.some(value=>value.startsWith('scroll:')),false);
});

test('secondary destinations keep the current router chain and never use the legacy base router',()=>{
 const r=runtime(1440);
 r.navigate('documentsHub');
 assert.deepEqual(r.calls.filter(value=>/^(shell|current|stable|scroll):/.test(value)),[
  'current:documentsHub','scroll:0:auto'
 ]);
});

test('navigation still works before V205 is available by using the current router',()=>{
 const r=runtime(820,{withV205:false});
 r.navigate('collectionProPage');
 assert.deepEqual(r.calls.filter(value=>/^(shell|current|stable|scroll):/.test(value)),[
  'current:collectionProPage','scroll:0:auto'
 ]);
});
