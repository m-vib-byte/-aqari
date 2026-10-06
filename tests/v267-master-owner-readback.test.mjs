import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {masterOwnersMatch} from '../src/v267/domain/ownership-shares.js';
const rows=[{name:'A',bps:6000,role:'مالك'},{name:'B',bps:4000,role:'شريك'}];
test('master owner comparison permits ordering but preserves identities, values and duplicate counts',()=>{
 assert.equal(masterOwnersMatch([...rows].reverse(),rows),true);
 for(const key of ['name','role','email','phone','whatsapp','bps'])assert.equal(masterOwnersMatch(rows.map((r,i)=>i?{...r,[key]:key==='bps'?3999:'changed'}:r),rows),false,key);
 assert.equal(masterOwnersMatch([rows[0],rows[0]],rows),false);
 assert.equal(masterOwnersMatch(null,[]),false);
 assert.equal(masterOwnersMatch([],[]),true);
});
function fixture(mode){
 const source=readFileSync(new URL('../src/v267/pages/property-master-file.js',import.meta.url),'utf8');
 const element=(tag,value='')=>({tag,value,children:[],append(...xs){this.children.push(...xs)},replaceChildren(...xs){this.children=xs}});
 const original={id:'p',revision:2,name:'test',owners:rows};let reads=0,saves=0,renders=0,pending,errors=[];
 const body=element('body'),scope={file:{property:original},propertyId:'p',read:async()=>{reads++;const property=reads===1?original:{...original,revision:mode==='stale'?2:3,owners:mode==='mismatch'?[{...rows[0],bps:5000},{...rows[1],bps:5000}]:rows};scope.file={property};return scope.file},propertyWritable:()=>true,node:element,input:(t,v='')=>element(t,v??''),section:element,field:(l,c)=>c,action:element,translateStatic:x=>x,ownerEditor:()=>()=>rows,masterPayload:x=>x,masterOwnersMatch,propertyContactUrl:x=>x,render:async()=>{renders++},rpc:async()=>{saves++;if(mode==='lost')throw Error('network');return {property:{id:'p',revision:3}}},d:{body,status:{},session:{bound:{workspace:'w'},check(){}},run:fn=>{pending=fn().catch(e=>errors.push(e.message))}}};
 vm.createContext(scope);vm.runInContext(source.slice(source.indexOf(' async function editProperty()'),source.indexOf(' async function addAsset()')),scope);
 return {async run(){await scope.editProperty();const form=body.children.find(x=>x.tag==='form');await form.onsubmit({preventDefault(){}});await pending;await form.onsubmit({preventDefault(){}});await pending;return {saves,renders,errors,status:scope.d.status.textContent}}};
}
for(const mode of ['mismatch','stale','lost'])test('actual master editor refuses success and repeat send: '+mode,async()=>{const r=await fixture(mode).run();assert.equal(r.saves,1);assert.equal(r.renders,0);assert.equal(r.errors.length,2);assert.match(r.errors[1],/الحفظ السابق/);assert.equal(r.status,undefined)});
test('actual master editor confirms matching owner readback',async()=>{const r=await fixture('ok').run();assert.equal(r.errors.length,0);assert.match(r.status,/تم حفظ/)});
