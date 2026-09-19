import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/v267/owner-feedback-runtime.js',import.meta.url),'utf8');
function runtime(value,active=true){
 const input={value},calls=[],status={textContent:'',classList:{toggle(){}}},notice={textContent:'',setAttribute(){}};
 const context={user:{id:'u'},workspace:{id:'w'},membership:{is_active:active,user_id:'u',workspace_id:'w',role:'general_manager'}};
 const box={CustomEvent:class {constructor(type){this.type=type;}},setTimeout,t:s=>s,document:{readyState:'loading',addEventListener(){},documentElement:{classList:{contains:()=>true}},getElementById:id=>id==='aqExactHeroQuestion'?input:id==='aqNavigationNotice'?notice:id==='aqExactStatus'?status:null},window:{dispatchEvent(){},AQARI_SUPABASE:{context},AQARI_DATA_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_EARLY_STORAGE_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_V209:{open:q=>{calls.push(['search',q]);return true;}}}};
 vm.createContext(box);vm.runInContext(source.replace(/^import .*;$/gm,''),box);
 box.calls=calls;vm.runInContext('openDefinition=async def=>{calls.push(["section",def.key]);return true;}',box);
 return {box,input,calls,status,run:()=>vm.runInContext('searchFromHero({preventDefault(){}})',box)};
}
test('an Arabic section command opens its existing route without an AI request',async()=>{
 const r=runtime('أفتح العقود');await r.run();assert.deepEqual(JSON.parse(JSON.stringify(r.calls)),[['section','contracts']]);assert.equal(r.input.value,'');
});
test('record names, contract numbers and Arabic unit numbers reach guarded record search unchanged',async()=>{
 for(const q of ['برج مرزوق','TEST-V267-20260910-01','٤٠١']){const r=runtime(q);await r.run();assert.deepEqual(r.calls,[['search',q]]);assert.equal(r.input.value,'');}
});
test('signed-out and mismatched workspace boundaries cannot dispatch a search',async()=>{
 const inactive=runtime('العقود',false);await inactive.run();assert.deepEqual(inactive.calls,[]);
 const mismatch=runtime('٤٠١');mismatch.box.window.AQARI_DATA_GATE.scope.workspaceId='another';await mismatch.run();assert.deepEqual(mismatch.calls,[]);assert.equal(mismatch.input.value,'٤٠١');
});
test('an unavailable local search retains the query and shows a failure instead of claiming success',async()=>{
 const r=runtime('٤٠١');delete r.box.window.AQARI_V209;await r.run();assert.equal(r.input.value,'٤٠١');assert.equal(r.status.textContent,'تعذر فتح الخدمة.');
});
test('receipt shortcut uses the contract search rather than the read-only report',async()=>{
 const r=runtime('');await vm.runInContext("handleExactClick({target:{closest:s=>s.includes('[data-exact-special]')?{dataset:{exactSpecial:'receipts'}}:null}})",r.box);assert.deepEqual(r.calls,[['search','']]);
 const live=readFileSync(new URL('../src/v267/live-stability-runtime.js',import.meta.url),'utf8');assert.ok(live.includes("refAction('إصدار وصل','special','receipts','wallet')"));
});
test('initial search query is bounded and cannot open across a closed scope',async()=>{
 const search=readFileSync(new URL('../v209-global-search.js',import.meta.url),'utf8');const fn=search.match(/open:async function\(initialQuery\)\{([\s\S]*?)\n      \}/);assert.ok(fn);
 const input={value:''};let allowed=true,opened=0;const box={query:'',handleAuthStateChange:async()=>{},scopeKey:()=>allowed?'u|w':'',ensureUi:()=>({input}),document:{querySelector:()=>null},setSearchExpanded:()=>{opened++;return true;}};vm.createContext(box);vm.runInContext('open=async function(initialQuery){'+fn[1]+'}',box);
 assert.equal(await box.open('  TEST-01  '),true);assert.equal(input.value,'TEST-01');assert.equal(box.query,'TEST-01');await box.open('x'.repeat(1400));assert.equal(input.value.length,1200);allowed=false;assert.equal(await box.open('other'),false);assert.equal(opened,2);
});

