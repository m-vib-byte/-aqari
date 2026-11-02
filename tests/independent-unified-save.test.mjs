import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {readCanonicalPropertyRows} from '../src/v267/domain/property-canonical-list.js';
import {presentation,searchProperties,priceLabel,summaryMarkup} from '../src/v267/domain/property-presentation.js';
function fixture(){
 class Element{
  constructor(tag,text=''){this.tagName=tag;this.textContent=text;this.children=[];this.classList={contains:()=>false};}
  append(...nodes){this.children.push(...nodes);} prepend(node){this.children=this.children.filter(x=>x!==node);this.children.unshift(node);}
  replaceChildren(...nodes){this.children=nodes;}setAttribute(key,value){(this.attrs??={})[key]=value;}
  get firstChild(){return this.children[0];}querySelector(){return null;}
 }
 const home=new Element('main'),head=new Element('head'),events=new Map();
 const descend=el=>[el,...el.children.flatMap(descend)];
 const state={address:'new address',legacyCalls:0,reads:0,allowed:true};
 const client={from(){return {select(){return this;},eq(){return this;},async order(){return {data:[{id:'p',name:'Synthetic',metadata:['Synthetic','owner','','',{aqariPropertyPresentation:1,location:'old address',photos:[]}]}]};}};},async rpc(_,args){state.reads++;return {data:{workspace_id:args.p_workspace_id,property:{id:'p',name:'Synthetic',address:state.address}}};}};
 const window={AQARI_SUPABASE:{context:{workspace:{id:'w'},user:{id:'u'},membership:{role:'general_manager'}},getClient:async()=>client},AQARI_V202:{propertyRecords(){state.legacyCalls++;return [['Synthetic','','','',{aqariPropertyPresentation:1,location:'stale legacy',photos:[]}]];}},addEventListener(name,fn){events.set(name,fn);}};
 const document={head,getElementById(id){if(id==='home')return home;return descend(home).find(x=>x.id===id)||null;},addEventListener(){}};
 const source=readFileSync(new URL('../src/v267/components/property-experience.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export function installPropertyExperience','function installPropertyExperience');
 const context={window,document,structuredClone,queueMicrotask,readCanonicalPropertyRows,presentation,searchProperties,priceLabel,summaryMarkup,node:(tag,text)=>new Element(tag,text),readable:()=>state.allowed};
 vm.runInNewContext(source+';this.view=installPropertyExperience({readable,writable:readable});',context);
 return {state,window,view:context.view,emit:(name,detail)=>events.get(name)?.({detail}),cards:()=>document.getElementById('aq267-property-results').children.map(card=>card.children.flatMap(x=>[x.textContent,...x.children.map(c=>c.textContent)]).join(' ')),async settle(){for(let i=0;i<12;i++)await new Promise(setImmediate);}};
}
test('real installer loads canonical address after a fresh mount and refreshes after confirmed save',async()=>{
 const f=fixture();await f.settle();assert.match(f.cards().join(),/new address/);assert.doesNotMatch(f.cards().join(),/old address|stale legacy/);
 f.state.address='';f.emit('aqari:property-saved',{workspaceId:'w',userId:'u',propertyId:'p',property:{id:'p',name:'Synthetic',address:''}});await f.settle();
 assert.match(f.cards().join(),/الموقع غير مضاف/);assert.equal(f.cards().length,1);assert.equal(f.state.reads,2);
});
test('real installer hides records after access is revoked and ignores foreign saved events',async()=>{
 const f=fixture();await f.settle();f.emit('aqari:property-saved',{workspaceId:'foreign',userId:'other',propertyId:'p',property:{id:'p',name:'Injected',address:'secret'}});await f.settle();assert.equal(f.state.reads,1);assert.doesNotMatch(f.cards().join(),/Injected|secret/);
 f.state.allowed=false;f.emit('aqari:auth-boundary');await f.settle();assert.equal(f.cards().length,0);
});
