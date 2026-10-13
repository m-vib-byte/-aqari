const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('src/v267/home-presentation.js','utf8');
function fixture(){
  let clock=0;const timers=new Map(),frames=new Map(),events={},docEvents={},nodes=new Map(),classes=new Set(),bodyClasses=new Set();let next=0;
  const list=set=>({contains:key=>set.has(key),add:key=>set.add(key),remove:key=>set.delete(key)});
  function node(id,tagName='DIV'){const attrs=new Set();return {id,tagName,hidden:true,textContent:'',children:[],classList:list(new Set()),hasAttribute:key=>attrs.has(key),setAttribute:key=>attrs.add(key),removeAttribute:key=>attrs.delete(key),addEventListener(){},querySelector(){return null;}};}
  const main=node('main'),screen=node('aqHomePresentation','SECTION'),message=node('message'),retry=node('retry','BUTTON'),home=node('aqOwnerExactHome');
  screen.querySelector=selector=>selector==='button'?retry:message;
  const document={documentElement:{classList:list(classes)},body:{children:[main,screen],classList:list(bodyClasses)},getElementById:id=>id===screen.id?screen:nodes.get(id),querySelectorAll:()=>[...nodes.values()].filter(n=>n.tagName==='LINK'),addEventListener:(name,fn)=>docEvents[name]=fn};
  const window={addEventListener:(name,fn)=>events[name]=fn,location:{reload(){}}};
  vm.runInNewContext(source,{window,document,Date:{now:()=>clock},setTimeout:fn=>{timers.set(++next,fn);return next},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>{frames.set(++next,fn);return next},cancelAnimationFrame:id=>frames.delete(id),MutationObserver:class{observe(){}disconnect(){}}});
  function auth(){window.AQARI_SUPABASE={context:{user:{id:'u'},workspace:{id:'w'},membership:{user_id:'u',workspace_id:'w',role:'general_manager',is_active:true}}};window.AQARI_DATA_GATE={scope:{userId:'u',workspaceId:'w'}};window.AQARI_EARLY_STORAGE_GATE={scope:{userId:'u',workspaceId:'w'}};classes.add('aqari-auth-unlocked');events['aqari:auth-boundary']();}
  function assets(){
    for(const name of ['V201','V202','V205','V206','V208','V209','V210','V211','OWNER_EXACT','OWNER_FINAL','UNIFIED_EXPERIENCE','PREMIUM_NAVIGATION','LIVE_STABILITY'])window['AQARI_'+name]={};
    for(const id of ['aqari-owner-feedback-css','aqari-owner-final-beige-css','aqari-v267-unified-layout-css','aqari-v267-unified-virtual-css','aqari-v267-premium-refinement-css','aqari-v267-luxury-warm-css','aqari-live-stability-css'])nodes.set(id,{id,tagName:'LINK',sheet:{}});
    bodyClasses.add('aq-live-stable');home.querySelector=()=>({});nodes.set(home.id,home);nodes.set('aqOwnerExactBottom',node('aqOwnerExactBottom'));
    for(const name of ['owner-reference','owner-feedback','owner-final','unified-layout','premium-navigation','live-stability'])docEvents.load({target:{tagName:'SCRIPT',id:'aqari-v267-'+name+'-js'}});
  }
  function paint(){for(let i=0;i<2;i++){const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());}}
  function tick(ms=100){clock+=ms;const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());}
  return {window,auth,assets,paint,tick,main,retry,message,nodes,classes,events,timers};
}
test('early legacy home remains inaccessible until the final styled surface is ready',()=>{const r=fixture();r.auth();assert.ok(r.main.hasAttribute('inert'));assert.equal(r.classes.has('aqari-home-presented'),false);r.assets();assert.equal(r.classes.has('aqari-home-presented'),false);r.paint();assert.ok(r.classes.has('aqari-home-presented'));assert.equal(r.main.hasAttribute('inert'),false);assert.equal(r.timers.size,0);});
test('late final stylesheet keeps the loader and never exposes the intermediate theme',()=>{const r=fixture();r.auth();r.assets();r.nodes.get('aqari-v267-luxury-warm-css').sheet=null;r.paint();assert.equal(r.classes.has('aqari-home-presented'),false);r.nodes.get('aqari-v267-luxury-warm-css').sheet={};r.tick();r.paint();assert.ok(r.classes.has('aqari-home-presented'));});
test('sign-out between paint frames cannot reveal a stale workspace',()=>{const r=fixture();r.auth();r.assets();r.classes.delete('aqari-auth-unlocked');r.events['aqari:auth-boundary']();r.paint();assert.equal(r.classes.has('aqari-home-presented'),false);});
test('mismatched data scope is never marked presented',()=>{const r=fixture();r.auth();r.assets();r.window.AQARI_DATA_GATE.scope.workspaceId='different';r.paint();assert.equal(r.classes.has('aqari-home-presented'),false);});
test('slow or failed assets show recovery, stop polling, and preserve existing inert state',()=>{const r=fixture();r.main.setAttribute('inert','');r.auth();r.tick(16000);assert.equal(r.retry.hidden,false);assert.match(r.message.textContent,/تعذر/);assert.equal(r.timers.size,0);r.assets();r.paint();assert.ok(r.classes.has('aqari-home-presented'));assert.ok(r.main.hasAttribute('inert'));});
test('repeated ready events do not flash the loader over an already presented account',()=>{const r=fixture();r.auth();r.assets();r.paint();r.events['aqari:auth-boundary']();assert.ok(r.classes.has('aqari-home-presented'));assert.equal(r.main.hasAttribute('inert'),false);});
