import test from 'node:test';
import assert from 'node:assert/strict';
import {readCanonicalPropertyRows} from '../src/v267/domain/property-canonical-list.js';
const records=[{id:'a',name:'old'},{id:'b',name:'old'}];
const project=r=>[r.name,'owner '+r.id,'12','100',{aqariPropertyPresentation:1,location:'stale',price:'50',photos:[]}];
const file=id=>({workspace_id:'w',property:{id,name:'new '+id,address:id==='a'?'':'address b'}});
function run(overrides={}){return readCanonicalPropertyRows({workspace:'w',records,check(){},project,client:{rpc:async(name,args)=>{assert.equal(name,'aqari_property_full_file');assert.equal(args.p_workspace_id,'w');return {data:file(args.p_property_id)};}},...overrides});}
test('canonical name and cleared address replace stale metadata without mixing duplicate names',async()=>{
 const rows=await run();assert.equal(rows.size,2);assert.equal(rows.get('a')[0],'new a');assert.equal(rows.get('a')[4].location,'');assert.equal(rows.get('b')[4].location,'address b');assert.equal(rows.get('b')[1],'owner b');assert.equal(rows.get('b')[4].price,'50');
});
test('server permission error rejects the list instead of falling back to stale data',async()=>{
 await assert.rejects(run({client:{rpc:async()=>({error:Error('ACCESS_DENIED')})}}),/ACCESS_DENIED/);
});
for(const [label,data] of [['workspace',{...file('a'),workspace_id:'other'}],['property',file('other')],['missing address',{workspace_id:'w',property:{id:'a',name:'new'}}]])test('rejects mismatched '+label,async()=>{
 await assert.rejects(run({records:[records[0]],client:{rpc:async()=>({data})}}),/MISMATCH/);
});
test('changed session during a pending read prevents any result from being returned',async()=>{
 let current=true;
 await assert.rejects(run({records:[records[0]],check(){if(!current)throw Error('SCOPE_CHANGED');},client:{rpc:async()=>{current=false;return {data:file('a')};}}}),/SCOPE_CHANGED/);
});
test('invalid or duplicate ids are rejected before any request',async()=>{
 for(const rows of [[{id:'a'},{id:'a'}],[{id:null}]])await assert.rejects(run({records:rows,client:{rpc(){assert.fail('unexpected request');}}}),/INVALID_PROPERTY_ID/);
});
test('empty list does not make requests or invent records',async()=>{
 assert.equal((await run({records:[],client:{rpc(){assert.fail('unexpected request');}}})).size,0);
});
test('request concurrency is bounded and output order remains stable',async()=>{
 let pending=0,peak=0;const rows=Array.from({length:8},(_,i)=>({id:String(i)}));
 const result=await run({records:rows,client:{rpc:async(_,args)=>{peak=Math.max(peak,++pending);await new Promise(setImmediate);pending--;return {data:file(args.p_property_id)};}}});
 assert.equal(peak,3);assert.deepEqual([...result.keys()],rows.map(x=>x.id));
});
