const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('v211-follow-up-center.js','utf8');
const fn=source.slice(source.indexOf('async function hydrateTimeline('),source.indexOf('function hydrateVisibleTimelines('));
function fixture(list){
 const target={textContent:'previous'},row={isConnected:true,querySelector:()=>target};
 let scope='scope-a';
 const hydrate=vm.runInNewContext('('+fn+')',{timelineEpoch:1,accessScope:()=>({key:scope}),text:x=>String(x||''),window:{AQARI_FOLLOW_UP_CLOUD:{list}},TIMELINE_LABEL:{reviewed:'تمت المراجعة'},Date,Array});
 return {target,read:()=>hydrate(row,{scope:'scope-a',period:'2026-09'},{record:{key:'opaque'}}),setScope:x=>{scope=x}};
}
test('timeline displays a failed request separately from an empty saved history',async()=>{
 const failed=fixture(async()=>{throw Error('network or missing RPC')});
 assert.equal(await failed.read(),false);assert.match(failed.target.textContent,/تعذر تحميل/);assert.doesNotMatch(failed.target.textContent,/لا توجد/);
 const empty=fixture(async()=>[]);assert.equal(await empty.read(),true);assert.equal(empty.target.textContent,'لا توجد متابعة سحابية مسجلة');
});
test('timeline keeps an old account response from changing the active display',async()=>{
 let resolve;const f=fixture(()=>new Promise(r=>{resolve=r}));const pending=f.read();f.setScope('scope-b');resolve([]);
 assert.equal(await pending,false);assert.equal(f.target.textContent,'previous');
});
test('timeline shows a valid saved action after recovery',async()=>{
 const f=fixture(async()=>[{actionKind:'reviewed',createdAt:'2026-11-01T00:00:00Z'}]);
 assert.equal(await f.read(),true);assert.match(f.target.textContent,/تمت المراجعة/);
});
