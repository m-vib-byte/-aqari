const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script id="(aqari-v(?:13[1-9]|14[0-9]|15[0-7])-[^"]+-js)">([\s\S]*?)<\/script>/g)];
test('V267 retires 27 hidden dashboard layers without timers, DOM builds or render wrappers',()=>{
 assert.equal(scripts.length,27);
 let calls=0;const render=()=>{calls++};
 const window={render};
 const ctx=vm.createContext({window,document:{querySelector(selector){assert.equal(selector,'meta[name="aqari-release"]');return {content:'V267'}}},setTimeout(){assert.fail('retired layer scheduled background work')},setInterval(){assert.fail('retired layer scheduled polling')}});
 for(const [,id,script] of scripts){vm.runInContext(script,ctx,{timeout:1000,filename:id});assert.equal(window.render,render,id)}
 for(let i=0;i<1000;i++)window.render();
 assert.equal(calls,1000);
});
