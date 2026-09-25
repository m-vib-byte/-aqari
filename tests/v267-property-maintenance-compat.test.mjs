import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/v267/pages/property-master-file.js',import.meta.url),'utf8')
 .replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const missingCategory={code:'42703',message:'column aqari_maintenance_requests.category_code does not exist'};
const missingCategoryFromDataApi={code:'PGRST204',message:"Could not find the 'category_code' column of 'aqari_maintenance_requests' in the schema cache"};
const row={id:'request-1',request_no:'17',lease_id:'lease-1',description:'Fixture maintenance',status:'open',cost:12};
function node(tag,text=''){
 return {tag,text:String(text),children:[],append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;}};
}
function textOf(el){return typeof el==='string'?el:el.text+' '+el.children.map(textOf).join(' ');}
function fixture({failure,secondFailure,category='plumbing',changeScope=false,permissions={},contracts=[{id:'lease-1',contractNo:'1'}]}={}){
 const calls=[];let expired=false;
 const file={workspace_id:'workspace-1',property:{id:'property-1',name:'Fixture property'},contracts,
  permissions:{collections:false,finance:false,employees:false,documents:false,notifications:false,...permissions},units:[]};
 const d={body:node('div'),status:{},session:{bound:{workspace:'workspace-1',user:'user-1',role:'general_manager'},
  check(){if(expired)throw Error('scope changed');},client:{
   rpc(name,args){return {rpc:name,args};},
   from(table){const query={table,filters:[],select(columns){this.columns=columns;return this;},eq(...v){this.filters.push(['eq',...v]);return this;},in(...v){this.filters.push(['in',...v]);return this;},order(...v){this.orderBy=v;return this;},limit(n){this.max=n;return this;}};return query;}
  },async request(q){
   if(q.rpc==='aqari_property_full_file')return file;
   if(q.rpc==='aqari_workspace_access')return {workspace_id:'workspace-1',user_id:'user-1',role:'general_manager',permissions:{}};
   if(q.rpc==='aqari_property_tenant_ledger')throw Object.assign(Error('missing optional RPC'),{code:'PGRST202'});
   if(q.rpc)throw Error('unexpected RPC '+q.rpc);
   calls.push(q);
   if(calls.length===1&&failure){expired=changeScope;throw failure;}
   if(calls.length===2&&secondFailure)throw secondFailure;
   return [{...row,...(q.columns.includes('category_code')?{category_code:category}:{})}];
  }},run(fn){this.pending=fn();}};
 const box={node,field:(_,control)=>control,createDialog:()=>d,translateStatic:x=>x,
  translateMessage:(s,args)=>s.replace(/\{(\w+)\}/g,(_,key)=>args[key]),document:{createTextNode:t=>String(t)},Intl,Date};
 vm.runInNewContext(source,box);box.openPropertyMasterFile('property-1');return {d,calls};
}
for(const missingColumnFailure of [missingCategory,missingCategoryFromDataApi]){
 test('missing category column '+missingColumnFailure.code+' does not prevent the property and maintenance rows rendering',async()=>{
  const {d,calls}=fixture({failure:missingColumnFailure});await d.pending;
  assert.equal(calls.length,2);assert.match(textOf(d.body),/Fixture property/);assert.match(textOf(d.body),/Fixture maintenance/);
  assert.match(textOf(d.body),/#17 · open · غير متاح/);
  for(const q of calls){assert.equal(q.table,'aqari_maintenance_requests');assert.deepEqual(JSON.parse(JSON.stringify(q.filters)),[['eq','workspace_id','workspace-1'],['in','lease_id',['lease-1']]]);assert.equal(q.max,100);}
  assert.ok(calls[0].columns.includes('category_code'));assert.ok(!calls[1].columns.includes('category_code'));
 });
}
test('new schema retains the actual category without a retry',async()=>{
 const {d,calls}=fixture();await d.pending;assert.equal(calls.length,1);assert.match(textOf(d.body),/#17 · open · plumbing/);
});
for(const [name,failure] of [['permission',{code:'42501',message:'ACCESS_DENIED'}],['network',{message:'Failed to fetch'}],['unrelated postgres column',{code:'42703',message:'column aqari_maintenance_requests.cost does not exist'}],['unrelated Data API column',{code:'PGRST204',message:"Could not find the 'cost' column of 'aqari_maintenance_requests' in the schema cache"}]]){
 test(name+' errors remain failures and do not retry',async()=>{const {d,calls}=fixture({failure});await assert.rejects(d.pending,e=>e===failure);assert.equal(calls.length,1);assert.doesNotMatch(textOf(d.body),/Fixture property/);});
}
test('an expired session stops fallback before a second request',async()=>{
 const {d,calls}=fixture({failure:missingCategory,changeScope:true});await assert.rejects(d.pending,/scope changed/);assert.equal(calls.length,1);
});
test('fallback request failures are not displayed as empty maintenance',async()=>{
 const error={code:'42501',message:'ACCESS_DENIED'}, {d,calls}=fixture({failure:missingCategory,secondFailure:error});await assert.rejects(d.pending,e=>e===error);assert.equal(calls.length,2);assert.doesNotMatch(textOf(d.body),/Fixture property/);
});
for(const options of [{permissions:{maintenance:false}},{permissions:{contracts:false}},{contracts:[]}]){
 test('no maintenance request when scope or permission excludes it '+JSON.stringify(options),async()=>{const {d,calls}=fixture(options);await d.pending;assert.equal(calls.length,0);assert.match(textOf(d.body),/Fixture property/);});
}
