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
 const windowObject={
  innerWidth:width,scrollY:900,
  AQARI_V199_BASE_GO(route){calls.push('stable:'+route);if(stableOpens)open(route);},
  go(route){calls.push('current:'+route);if(currentOpens)open(route);},
  getComputedStyle(page){return {display:page.visible?'block':'none',visibility:'visible'};},
  scrollTo(options){calls.push('window-scroll:'+options.top+':'+options.behavior);}
 };
 if(withV205)windowObject.AQARI_V205={navigate(route){
  calls.push('shell:'+route);
  if(shellSync)bodyState.route=route;
  return windowObject.go(route);
 }};
 const context={
  Promise,Number,Math,
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
 return {calls,navigate:context.navigateV267,bodyState};
}

for(const [device,width] of [['iPhone',390],['iPad',820],['Desktop',1440]]){
 test(`${device} main section updates shell context and aligns to the opened destination`,()=>{
  const r=runtime(width);
  for(const [route,id] of [['properties','list'],['tenants','list'],['collectionProPage','collectionProPage'],['maintenanceProPage','maintenanceProPage'],['home','home']]){
   r.calls.length=0;
   r.navigate(route);
   assert.equal(r.calls[0],'close');
   assert.deepEqual(r.calls.filter(v=>/^(shell|current|stable|section|window-scroll):/.test(v)),[
    'shell:'+route,'current:'+route,`section:${id}:start:auto`
   ]);
   assert.equal(r.bodyState.route,route);
  }
 });
}

test('failed current primary transition falls back to the preserved base router and keeps shell context',()=>{
 const r=runtime(820,{currentOpens:false,stableOpens:true});
 r.navigate('properties');
 assert.deepEqual(r.calls.filter(v=>/^(shell|current|stable|section|window-scroll):/.test(v)),[
  'shell:properties','current:properties','stable:properties','section:list:start:auto'
 ]);
 assert.equal(r.bodyState.route,'properties');
});

test('visible destination with stale home shell is not treated as a successful section transition',()=>{
 const r=runtime(390,{currentOpens:true,stableOpens:true,shellSync:false});
 r.navigate('properties');
 assert.ok(r.calls.includes('shell:properties'));
 assert.ok(r.calls.includes('current:properties'));
 assert.ok(r.calls.includes('stable:properties'));
 assert.equal(r.bodyState.route,'home');
 assert.equal(r.calls.some(v=>v.startsWith('section:')||v.startsWith('window-scroll:')),false);
});

test('a destination that never opens never scrolls anywhere',()=>{
 const r=runtime(390,{currentOpens:false,stableOpens:false});
 r.navigate('maintenanceProPage');
 assert.ok(r.calls.includes('shell:maintenanceProPage'));
 assert.ok(r.calls.includes('stable:maintenanceProPage'));
 assert.equal(r.calls.some(v=>v.startsWith('section:')||v.startsWith('window-scroll:')),false);
});

test('internal section keeps the current router chain and aligns to its own page',()=>{
 const r=runtime(1440);
 r.navigate('documentsHub');
 assert.deepEqual(r.calls.filter(v=>/^(shell|current|stable|section|window-scroll):/.test(v)),[
  'current:documentsHub','section:documentsHub:start:auto'
 ]);
});

test('primary navigation remains usable before V205 boot by using the current router',()=>{
 const r=runtime(820,{withV205:false});
 r.navigate('collectionProPage');
 assert.deepEqual(r.calls.filter(v=>/^(shell|current|stable|section|window-scroll):/.test(v)),[
  'current:collectionProPage','section:collectionProPage:start:auto'
 ]);
});
