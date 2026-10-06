import test from 'node:test';
import assert from 'node:assert/strict';
import {ownershipReadbackMatches} from '../src/v267/pages/property-ownership.js';
import {ownershipShareBasisPoints} from '../src/v267/domain/ownership-shares.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const owner={id:'o1',name:'مالك اختبار',role:'مالك',bps:8088,email:'owner@example.test',phone:'+96511111111',whatsapp:'+96522222222',supportingDocumentId:'doc1'};
const expected={area:'1000.100',masterRevision:4,ownershipRevision:2,owners:[owner,{...owner,id:'o2',name:'مالك ثان',bps:1912,supportingDocumentId:'doc2'}]};
const actual=()=>({property:{totalAreaSqm:1000.1},masterRevision:4,ownershipRevision:2,owners:structuredClone(expected.owners)});
test('exact saved ownership is matched by identity regardless of row order',()=>{const a=actual();a.owners.reverse();assert.equal(ownershipReadbackMatches(a,expected),true);});
for(const key of ['id','name','role','bps','email','phone','whatsapp','supportingDocumentId'])test('changed '+key+' cannot be accepted with the same owner count',()=>{const a=actual();a.owners[0][key]=key==='bps'?8000:'different';assert.equal(ownershipReadbackMatches(a,expected),false);});
test('stale or newer revisions cannot masquerade as the accepted save',()=>{for(const key of ['masterRevision','ownershipRevision'])for(const delta of [-1,1]){const a=actual();a[key]+=delta;assert.equal(ownershipReadbackMatches(a,expected),false);}});
test('duplicate identities, missing owners and changed area are rejected',()=>{for(const change of [a=>a.owners[1].id='o1',a=>a.owners.pop(),a=>a.owners=null,a=>a.property.totalAreaSqm='1000.101']){const a=actual();change(a);assert.equal(ownershipReadbackMatches(a,expected),false);}});
test('large area comparison retains all three decimals',()=>{const e={...expected,area:'999999999999.999'},a=actual();a.property.totalAreaSqm=e.area;assert.equal(ownershipReadbackMatches(a,e),true);a.property.totalAreaSqm='999999999999.998';assert.equal(ownershipReadbackMatches(a,e),false);});

async function screen(corrupt=false){
 class Element{
  constructor(tag,value=''){this.tag=tag;this.value='';this._text=value;this.children=[];}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join('\n');}
  set textContent(value){this._text=value;}
  addEventListener(){}remove(){}
  all(){return this.children.flatMap(x=>[x,...x.all()]);}
 }
 const node=(tag,value)=>new Element(tag,value),field=(label,control)=>{const n=node('label',label);n.append(control);return n;};
 let state={...actual(),workspace_id:'w',property_id:'p',user_id:'u',manager:true,documents:[{id:'doc1'},{id:'doc2'}],history:[]};const calls=[];
 const d={body:node('div'),status:node('p'),session:{bound:{workspace:'w',user:'u'},check(){},async request(p){return p;},client:{async rpc(name,{p_action:action,p_data:data}){calls.push(action);if(action==='save'){state={...state,masterRevision:state.masterRevision+1,ownershipRevision:state.ownershipRevision+1,property:{totalAreaSqm:data.totalAreaSqm},owners:structuredClone(data.owners)};if(corrupt)state.owners[0].name='different';return {masterRevision:state.masterRevision,ownershipRevision:state.ownershipRevision};}return structuredClone(state);}}},run(fn){return this.last=Promise.resolve().then(fn).catch(e=>{this.status.textContent=e.message;});}};
 const scope={ownershipShareBasisPoints,node,field,createDialog:()=>d,translateStatic:x=>x,visibleText:x=>x,visibleMessage:(s,v)=>s.replace(/\{(\w+)\}/g,(_,k)=>v[k]),crypto:{randomUUID:()=> 'new-id'}};vm.createContext(scope);
 vm.runInContext(readFileSync(new URL('../src/v267/pages/property-ownership.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,''),scope);scope.openPropertyOwnership('p');await d.last;
 d.body.all().find(x=>x.tag==='button'&&x._text==='تعديل الملكية والمساحات').onclick();await d.last;
 return {d,calls,async submit(){d.body.all().find(x=>x.tag==='form').onsubmit({preventDefault(){}});await d.last;}};
}
test('actual ownership screen confirms a matching persisted save',async()=>{const f=await screen();await f.submit();assert.match(f.d.status.textContent,/تم حفظ الملكية/);assert.equal(f.calls.filter(x=>x==='save').length,1);});
test('actual ownership screen rejects altered readback and blocks blind resubmission',async()=>{const f=await screen(true);await f.submit();assert.match(f.d.status.textContent,/فشل Readback/);await f.submit();assert.match(f.d.status.textContent,/لم يتأكد الحفظ السابق/);assert.equal(f.calls.filter(x=>x==='save').length,1);});
test('ownership form must reject excess precision rather than silently rounding shares to 100%',async()=>{
 const f=await screen();const shares=f.d.body.all().filter(x=>x.tag==='label'&&x._text==='النسبة %').map(x=>x.children[0]);
 shares[0].value='80.884';shares[1].value='19.116';await f.submit();
 assert.equal(f.calls.filter(x=>x==='save').length,0);assert.match(f.d.status.textContent,/النسبة/);
});
test('share parser supports Arabic and Persian digits with exact hundredths',()=>{
 for(const [value,bps] of [['٨٠٫٨٨',8088],['۱۶',1600],['3.12',312],['.01',1],['100.00',10000]])assert.equal(ownershipShareBasisPoints(value),bps);
 assert.equal(['٨٠٫٨٨','١٦','٣٫١٢'].reduce((sum,value)=>sum+ownershipShareBasisPoints(value),0),10000);
});
test('share parser rejects rounding, exponential notation and out-of-range values',()=>{
 for(const value of ['',null,'0','-1','100.01','80.884','1e2','1,00','Infinity','NaN'])assert.throws(()=>ownershipShareBasisPoints(value));
});
test('Arabic shares are sent exactly after form validation',async()=>{
 const f=await screen();const shares=f.d.body.all().filter(x=>x.tag==='label'&&x._text==='النسبة %').map(x=>x.children[0]);
 shares[0].value='٨٠٫٨٨';shares[1].value='١٩٫١٢';await f.submit();assert.match(f.d.status.textContent,/تم حفظ الملكية/);assert.equal(f.calls.filter(x=>x==='save').length,1);
});
