const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function scheduler(file,start,end,extra={}){
 const source=fs.readFileSync(file,'utf8');const work=[];let home=false,collection=false;
 const ctx={document:{visibilityState:'visible',getElementById:id=>['home','collectionProPage'].includes(id)?{classList:{contains:()=>id==='home'?home:collection}}:null},timer:0,render(){},setTimeout(fn){work.push(fn);return work.length},clearTimeout(){},...extra};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)))+'\nthis.run='+start.match(/function (\w+)/)[1],ctx);
 return {ctx,work,setPages(h,c){home=h;collection=c}};
}
test('property page mutations do not queue hidden portfolio or daily calculations; returning home resumes',()=>{
 for(const [file,end] of [['v208-portfolio-collections.js','  function restoreSearchFocus'],['v210-daily-command-center.js','  function syncPeriod']]){
  const r=scheduler(file,'  function schedule(',end);
  for(let i=0;i<100;i++)r.ctx.run([]);
  assert.equal(r.work.length,0);
  r.setPages(true,false);r.ctx.run([]);assert.equal(r.work.length,1);
 }
});
test('collection page resumes the portfolio while the daily home remains idle',()=>{
 const r=scheduler('v208-portfolio-collections.js','  function schedule(','  function restoreSearchFocus');r.setPages(false,true);r.ctx.run();assert.equal(r.work.length,1);
});
test('timeline output and unrelated property mutations cannot retrigger cloud timeline reads',()=>{
 const panel={contains:node=>node?.inside===true};
 const r=scheduler('v211-follow-up-center.js','  function scheduleTimelines(','  function installGuard(',{
  timelineTimer:0,hydrateVisibleTimelines(){},document:{getElementById:()=>panel,body:{classList:{contains:()=>true}}}
 });
 r.ctx.run([{target:{inside:false},addedNodes:[],removedNodes:[]}]);assert.equal(r.work.length,0);
 r.ctx.run([{target:{inside:true,closest:()=>true},addedNodes:[],removedNodes:[]}]);assert.equal(r.work.length,0);
 r.ctx.run([{target:{inside:true},addedNodes:[{nodeType:1,matches:()=>true}],removedNodes:[]}]);assert.equal(r.work.length,0);
 r.ctx.run([{target:{inside:true},addedNodes:[],removedNodes:[]}]);assert.equal(r.work.length,1);
});
test('continuous home mutations retain the first render deadline and allow subsequent refresh',()=>{
 for(const [file,end] of [['v208-portfolio-collections.js','  function restoreSearchFocus'],['v210-daily-command-center.js','  function syncPeriod']]){
  let renders=0;const r=scheduler(file,'  function schedule(',end,{render(){renders++}});r.setPages(true,false);
  for(let i=0;i<1000;i++)r.ctx.run([]);
  assert.equal(r.work.length,1);r.work[0]();assert.equal(renders,1);
  r.ctx.run([]);assert.equal(r.work.length,2);
  r.setPages(false,false);r.work[1]();assert.equal(renders,1);
 }
});
test('entry dialogs suspend background summaries throughout typing and resume after close',()=>{
 for(const [file,end] of [['v208-portfolio-collections.js','  function restoreSearchFocus'],['v210-daily-command-center.js','  function syncPeriod']]){
  let dialog=true;const r=scheduler(file,'  function schedule(',end);r.setPages(true,false);
  r.ctx.document.querySelector=()=>dialog?{}:null;
  for(let i=0;i<1000;i++)r.ctx.run([]);
  assert.equal(r.work.length,0);
  dialog=false;r.ctx.run([]);assert.equal(r.work.length,1);
 }
});
