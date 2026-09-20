import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/v267/pages/contract-foundation.js',import.meta.url),'utf8');
test('contract reads start together and closed sessions cannot apply their results',async()=>{
 const load=source.slice(source.indexOf(' async function load(){'),source.indexOf(' async function readBinding'));
 for(const closed of [false,true]){
  const started=[],pending=[],filters=[];
  const read=name=>{started.push(name);return new Promise(resolve=>pending.push(resolve));};
  const query=name=>({select(){return this;},eq(){return this;},or(value){filters.push({name,value});return this;},order(){return name;}});
  const box={window:{AQARI_SUPABASE:{loadAppState:()=>read('state')}},scope:()=>({}),api:{primary:x=>x},validTemplate:()=>true,rpc:()=>read('templates'),d:{session:{bound:{workspace:'w',role:'general_manager'},client:{from:query},request:read,check(){if(closed)throw Error('closed');}}}};
  vm.createContext(box);vm.runInContext('let state=null,properties=[],units=[],templates=[];'+load+';this.load=load;this.state=()=>state;',box);
  const task=box.load();assert.deepEqual(started,['state','aqari_properties','aqari_units','templates']);
  assert.deepEqual(filters,[{name:'aqari_properties',value:'metadata->>source_only.is.null,metadata->>source_only.neq.true'}],'source-only archive properties must remain excluded from new contracts');
  pending.forEach((resolve,i)=>resolve(i===0?{payload:{ok:true}}:i===3?{items:[]}:[]));
  if(closed){await assert.rejects(task,/closed/);assert.equal(box.state(),null);}else{await task;assert.equal(box.state().ok,true);}
 }
});

test('staff cannot enter the manager foundation or start a data read',async()=>{
 const load=source.slice(source.indexOf(' async function load(){'),source.indexOf(' async function readBinding'));
 const box={d:{session:{bound:{workspace:'w',role:'staff'}}}};
 vm.runInNewContext(load+';this.load=load;',box);
 await assert.rejects(box.load(),{code:'42501',message:'ACCESS_DENIED'});
});
