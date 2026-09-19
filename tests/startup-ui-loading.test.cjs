'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','final-release-ui.js'),'utf8');
const uiSource=source.slice(source.indexOf('(function(){',source.indexOf('})();')+5));
const ids=['aqari-v201-experience-js','aqari-v202-property-os-js','aqari-v205-simplified-shell-js','aqari-v206-rent-ledger-js','aqari-v208-portfolio-collections-js','aqari-v209-global-search-js','aqari-v210-daily-command-center-js','aqari-v211-follow-up-center-js','aqari-v266-scheduler-control-js'];
const extensions=['owner-reference','owner-feedback','owner-final','unified-layout','premium-navigation','live-stability'].map(name=>'aqari-v267-'+name+'-js').filter(id=>source.includes(id));
function runtime(){
  const nodes=new Map(),timers=[],listeners=new Map(),scripts=[],rootClasses=new Set();
  const context={user:{id:'user-a'},workspace:{id:'workspace-a'},membership:{user_id:'user-a',workspace_id:'workspace-a',role:'general_manager',is_active:true}};
  const scope={userId:'user-a',workspaceId:'workspace-a'};
  function element(tag){return {tagName:tag,style:{},dataset:{},listeners:new Map(),classList:{add(){},contains(){return false;}},addEventListener(type,fn){this.listeners.set(type,fn);},getAttribute(){return null;}};}
  const append=node=>{nodes.set(node.id||node.name,node);if(node.tagName==='script')scripts.push(node.id);};
  const window={AQARI_SUPABASE:{context},AQARI_DATA_GATE:{scope:null},AQARI_EARLY_STORAGE_GATE:{scope:null},addEventListener(type,fn){listeners.set(type,fn);}};
  const document={readyState:'complete',title:'',head:{appendChild:append},body:{appendChild:append,classList:{add(){}},getAttribute(){return null;}},documentElement:{classList:{contains:name=>rootClasses.has(name)}},createElement:element,getElementById:id=>nodes.get(id)||null,querySelector(selector){return null;},addEventListener(){}};
  vm.runInNewContext(uiSource,{window,document,console,setTimeout(fn){timers.push(fn);return timers.length;}});
  function load(id){const node=nodes.get(id);assert.ok(node,'script should exist: '+id);const callback=node.listeners.get('load');if(callback)callback({type:'load',target:node});}
  function ready(){window.AQARI_DATA_GATE.scope={...scope};window.AQARI_EARLY_STORAGE_GATE.scope={...scope};rootClasses.add('aqari-auth-unlocked');}
  function event(state){listeners.get('aqari:auth-boundary')?.({detail:{state}});}
  function drain(){for(let i=0;timers.length&&i<30;i++)timers.shift()();assert.equal(timers.length,0,'bounded task queue');}
  return {window,nodes,scripts,timers,context,rootClasses,load,ready,event,drain};
}
test('login presentation loads, but authenticated modules wait for the real workspace boundary',()=>{
 const r=runtime();r.load('aqari-v199-ui-js');assert.deepEqual(r.scripts,['aqari-v199-ui-js']);
});
test('an event or verified context alone cannot start the authenticated UI',()=>{
 const r=runtime();r.load('aqari-v199-ui-js');r.event('ready');r.drain();assert.deepEqual(r.scripts,['aqari-v199-ui-js']);
});
test('both workspace scopes and the unlocked page must match',()=>{
 const r=runtime();r.load('aqari-v199-ui-js');r.ready();r.window.AQARI_EARLY_STORAGE_GATE.scope.workspaceId='other';r.event('ready');r.drain();assert.deepEqual(r.scripts,['aqari-v199-ui-js']);
 r.window.AQARI_EARLY_STORAGE_GATE.scope.workspaceId='workspace-a';r.window.AQARI_SUPABASE.context.membership.is_active=false;r.event('ready');r.drain();assert.deepEqual(r.scripts,['aqari-v199-ui-js']);
});
test('the complete UI chain loads once after validated home activation',()=>{
 const r=runtime();r.load('aqari-v199-ui-js');r.ready();r.event('ready');assert.deepEqual(r.scripts,['aqari-v199-ui-js'],'yield before starting optional modules');r.drain();
 for(const id of ids){assert.ok(r.scripts.includes(id),id);r.load(id);}
 assert.deepEqual([...r.scripts].sort(),['aqari-v199-ui-js',...ids,...extensions].sort());r.event('ready');r.drain();assert.equal(r.scripts.length,ids.length+extensions.length+1);
});
test('a sign-out before the scheduled task prevents UI initialization',()=>{
 const r=runtime();r.load('aqari-v199-ui-js');r.ready();r.event('ready');r.window.AQARI_DATA_GATE.scope=null;r.rootClasses.clear();r.event('locked');r.drain();assert.deepEqual(r.scripts,['aqari-v199-ui-js']);
 r.ready();r.event('ready');r.drain();assert.ok(r.scripts.includes(ids[0]));
});
test('sign-out during an asset download prevents the next module, then resumes on valid login',()=>{
 const r=runtime();r.load('aqari-v199-ui-js');r.ready();r.event('ready');r.drain();r.rootClasses.clear();r.load(ids[0]);assert.equal(r.scripts.includes(ids[1]),false);
 r.ready();r.event('ready');r.drain();assert.equal(r.scripts.includes(ids[1]),true);
});
test('UI assets arriving after the verified home can initialize without another login',()=>{
 const r=runtime();r.ready();r.event('ready');r.drain();r.load('aqari-v199-ui-js');assert.ok(r.scripts.includes(ids[0]));
});

require('./secure-navigation.test.cjs');
require('./v205-click-routing.test.cjs');
