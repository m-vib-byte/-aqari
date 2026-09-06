'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','v205-simplified-shell.js'),'utf8');
const start=source.indexOf('  function simplifyCreateMenu(){'),end=source.indexOf('  function syncDashboard()',start);
assert.ok(start>=0&&end>start);
function runtime(){
  let moves=0,writes=0;
  const keys=['collections','tenants','maintenance','properties'];
  const options=Object.fromEntries(keys.map(key=>[key,{key}]));
  const grid={children:[options.properties,options.tenants,options.collections,options.maintenance],
    querySelector(selector){return options[selector.match(/data-v201-create="([^"]+)"/)[1]];},
    appendChild(node){moves++;this.children=this.children.filter(x=>x!==node);this.children.push(node);return node;}};
  const nodes={};
  for(const key of ['kicker','v201CreateTitle','v201CreateDescription','brand','addLabel']){
    let value='';nodes[key]={get textContent(){return value;},set textContent(next){writes++;value=next;}};
  }
  const document={getElementById:id=>nodes[id],querySelector(selector){
    if(selector.includes('create-grid'))return grid;
    return nodes[selector.includes('header p')?'kicker':selector.includes('brand')?'brand':'addLabel'];}};
  const context=vm.createContext({document});vm.runInContext(source.slice(start,end),context);
  return {run:()=>vm.runInContext('simplifyCreateMenu()',context),grid,get moves(){return moves;},get writes(){return writes;}};
}
test('quick-create options retain their intended order without repeated DOM moves',()=>{
  const r=runtime();r.run();assert.deepEqual(r.grid.children.map(n=>n.key),['collections','tenants','maintenance','properties']);
  const moves=r.moves;for(let i=0;i<20;i++)r.run();assert.equal(r.moves,moves,'repeated moves can discard browser focus');
});
test('unchanged quick-create and brand labels do not produce new mutation records',()=>{
  const r=runtime();r.run();const writes=r.writes;for(let i=0;i<20;i++)r.run();assert.equal(r.writes,writes);
});
