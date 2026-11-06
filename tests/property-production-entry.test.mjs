import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../v202-property-os.js',import.meta.url),'utf8');
const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
function fixture({rows=[{id:'canonical-id',name:'Test'}],stage='production',changeAt='',error=null}={}){
 const opened=[],alerts=[],filters={};let reads=0,legacy=0,allowed=true;
 const context={workspace:{id:'w'},user:{id:'u'}};
 const change=where=>{if(changeAt===where)context.user={id:'other'};};
 const query={select(){return this;},eq(k,v){filters[k]=v;return this;},async limit(n){assert.equal(n,2);reads++;change('query');return {data:rows,error};}};
 const window={AQARI_PUBLIC_CONFIG:{releaseStage:stage},AQARI_SUPABASE:{context,async getClient(){change('client');return {from(name){assert.equal(name,'aqari_properties');return query;}};}},alert(x){alerts.push(x);}};
 const code=extract('  function openWorkspace(', '  function closeWorkspace(')+extract('  async function openAuthoritativePropertyFile(', '  function routeAction(');
 const sandbox={window,protectedAccessReady:()=>allowed,propertyRecord(){legacy++;return null;},reportPropertyAmbiguity(){},loadModule:async()=>{change('module');return {openPropertyHub(id){opened.push(id);return true;}};}};
 vm.createContext(sandbox);vm.runInContext(code.replace("import('./src/v267/pages/property-hub.js')",'loadModule()')+'\nglobalThis.open=openWorkspace;',sandbox);
 return {open:()=>sandbox.open('Test'),opened,alerts,filters,get reads(){return reads;},get legacy(){return legacy;},deny(){allowed=false;}};
}
test('production entry uses the canonical scoped ID and never imported display rows',async()=>{
 const f=fixture();assert.equal(await f.open(),true);assert.deepEqual(f.opened,['canonical-id']);assert.deepEqual(f.filters,{workspace_id:'w',name:'Test'});assert.equal(f.legacy,0);
});
test('unresolved and ambiguous properties fail closed without legacy fallback',async()=>{
 for(const rows of [[],[{id:'a'},{id:'b'}]]){const f=fixture({rows});assert.equal(await f.open(),false);assert.deepEqual(f.opened,[]);assert.equal(f.legacy,0);assert.equal(f.alerts.length,1);}
 const f=fixture({error:{message:'unavailable'}});assert.equal(await f.open(),false);assert.equal(f.legacy,0);
});
test('session changes at every asynchronous boundary prevent opening another scope',async()=>{
 for(const changeAt of ['client','query','module']){const f=fixture({changeAt});assert.equal(await f.open(),false);assert.deepEqual(f.opened,[]);assert.equal(f.legacy,0);}
});
test('denied access performs no read and preview keeps its existing route',async()=>{
 const denied=fixture();denied.deny();assert.equal(await denied.open(),false);assert.equal(denied.reads,0);
 const preview=fixture({stage:'preview'});assert.equal(await preview.open(),false);assert.equal(preview.legacy,1);assert.equal(preview.reads,0);
});
