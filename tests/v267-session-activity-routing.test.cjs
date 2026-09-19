const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const navigation=fs.readFileSync(path.join(root,'src/v267/unified-layout-runtime.js'),'utf8');

function fixture(){
 let now=Date.parse('2026-09-18T21:00:00Z'),locks=0,navigations=0,tick;
 const values=new Map([['aqari_v75_last_activity',String(now)],['aqari_last_activity_v119',new Date(now).toISOString()]]);
 const listeners=[];
 const target=name=>({addEventListener(type,handler,options){listeners.push({name,type,handler,capture:options===true||options?.capture===true});}});
 const window=target('window'),document=Object.assign(target('document'),{getElementById:()=>null,body:{style:{}}});
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const sandbox={window,document,Date:Clock,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v))},refreshSessionV75(){},SESSION_TIMEOUT_V75:15*60000,lockSessionV75(){locks++;},setInterval(fn){tick=fn;},openSection:async()=>{navigations++;},setStatus(){}};
 const touch75=html.match(/function touchSessionV75\(\)\{[^\n]+/)?.[0];
 const touch119=html.slice(html.indexOf('function touchSessionV119(){'),html.indexOf('\nfunction refreshSessionV119(){'));
 const registration75=html.split('\n').find(line=>line.includes('.forEach(')&&line.includes('addEventListener(')&&line.includes('touchSessionV75'));
 const registration119=html.split('\n').find(line=>line.includes('.forEach(')&&line.includes('addEventListener(')&&line.includes('touchSessionV119'));
 const idle=html.match(/setInterval\(\(\)=>\{const at=Number\(localStorage\.getItem\('aqari_v75_last_activity'\)[\s\S]*?\},60000\);/)?.[0];
 const intercept=navigation.split('\n').find(line=>line.startsWith('function intercept(event)'));
 assert.ok(touch75&&touch119&&registration75&&registration119&&idle&&intercept);
 vm.runInNewContext('let lastActivityV75=Date.now();\n'+[touch75,touch119,registration75,registration119,idle,intercept,"document.addEventListener('click',intercept,true);"].join('\n'),sandbox);
 function dispatch(type,{trusted=true,route=false}={}){
  let stopped=false;
  const button={dataset:{unifiedSection:'properties'},closest:()=>null};
  const event={type,isTrusted:trusted,target:{closest:()=>route?button:null},preventDefault(){},stopImmediatePropagation(){stopped=true;}};
  // DOM propagation visits window capture before document capture/bubble.
  for(const [name,capture] of [['window',true],['document',true],['document',false],['window',false]]){
   for(const listener of listeners){if(stopped)return;if(listener.name===name&&listener.type===type&&listener.capture===capture)listener.handler(event);}
  }
 }
 return {values,dispatch,tick:()=>tick(),advance:ms=>{now+=ms;},get now(){return now;},get locks(){return locks;},get navigations(){return navigations;}};
}

test('real routed clicks keep an active session alive even when navigation stops propagation',()=>{
 const r=fixture();
 for(let i=0;i<4;i++){r.advance(5*60000);r.dispatch('click',{route:true});r.tick();}
 assert.equal(r.navigations,4);
 assert.equal(r.locks,0,'twenty minutes of active navigation is not idle');
 assert.equal(r.values.get('aqari_v75_last_activity'),String(r.now));
 assert.equal(r.values.get('aqari_last_activity_v119'),new Date(r.now).toISOString());
 r.advance(16*60000);r.tick();assert.equal(r.locks,1,'the existing inactivity lock still applies');
});

for(const type of ['pointerdown','touchstart','keydown','wheel','input','change'])test('trusted '+type+' updates both activity clocks',()=>{
 const r=fixture();r.advance(14*60000);r.dispatch(type);
 assert.equal(r.values.get('aqari_v75_last_activity'),String(r.now));
 assert.equal(r.values.get('aqari_last_activity_v119'),new Date(r.now).toISOString());
 r.advance(2*60000);r.tick();assert.equal(r.locks,0);
});

test('scripted UI events cannot extend the idle session',()=>{
 const r=fixture(),before=[...r.values];r.advance(16*60000);
 for(const type of ['click','pointerdown','touchstart','keydown','wheel','input','change'])r.dispatch(type,{trusted:false});
 assert.deepEqual([...r.values],before);r.tick();assert.equal(r.locks,1);
});
