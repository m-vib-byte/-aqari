const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../demo-v211.html'),'utf8');
const match=html.match(/\.srcdoc=(.*);<\/script>/s);
assert.ok(match,'embedded original V211 UI exists');
const inside=JSON.parse(match[1]);
test('V211 demo cannot inherit production identity or make backend requests',()=>{
 assert.match(html,/sandbox="allow-scripts allow-modals allow-downloads"/);
 assert.doesNotMatch(html,/allow-same-origin|allow-top-navigation|allow-popups/);
 assert.match(inside,/connect-src 'none'/);
 assert.match(inside,/form-action 'none'/);
 assert.doesNotMatch(inside,/<script[^>]+src=|<link[^>]+href=/i);
 assert.doesNotMatch(inside,/supabase\.co|m-vib@hotmail|محمد عوض العدواني|مشاري المطيري|برج شيخة|برج ضحاوي/);
});
test('embedded scripts parse and contain the original V211 follow-up and property components',()=>{
 const scripts=[...inside.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
 for(const source of scripts)new vm.Script(source);
 for(const marker of ['v211FollowUpCenter','v210DailyCommandCenter','v202PropertyWorkspace','v205SimpleHome','v208PortfolioCollections'])assert.ok(inside.includes(marker),marker);
});
test('fictional records are initialized only in memory',()=>{
 const script=[...inside.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)][0][1];
 const context={window:{},Map,Object,setTimeout,document:{getElementById:()=>null}};
 vm.runInNewContext(script,context);
 assert.equal(context.window.demoSeed.contractsV202.length,9);
 assert.equal(context.window.demoSeed.properties.length,2);
 assert.ok(context.window.demoSeed.tenantDirectoryV202.every(r=>r.email.endsWith('@example.invalid')));
 assert.equal(context.window.localStorage.getItem('production-secret'),null);
});
