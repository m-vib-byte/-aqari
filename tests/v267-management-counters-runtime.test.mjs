import test from 'node:test';
import assert from 'node:assert/strict';
import {createDialog} from '../src/v267/components/dialog.js';
import {mountKpiDashboard} from '../src/v267/pages/kpi-dashboard.js';

async function fixture(){
 const original={window:globalThis.window,document:globalThis.document};let bad=false,denied=false;const calls=[];
 class Element{
  constructor(tag,text=''){this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.value='';this.disabled=false;this.hidden=false;this.style={};this.textContent=String(text??'');}
  get isConnected(){return this.parent?this.parent.isConnected:this.connected===true;}
  append(...nodes){for(const n of nodes){this.children.push(n);n.parent=this;}}
  replaceChildren(...nodes){this.children=[];this.textContent='';this.append(...nodes);}
  querySelectorAll(selector){const all=this.children.flatMap(n=>[n,...n.querySelectorAll()]);return selector?all.filter(n=>selector.split(',').includes(n.tagName)):all;}
  setAttribute(k,v){this.attributes[k]=v;}addEventListener(){}showModal(){}close(){}focus(){}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
 }
 class Query{
  select(){return this;}eq(){return this;}in(){return this;}lte(){return this;}gte(){return this;}lt(){return this;}
  async abortSignal(){return {data:null,count:bad?null:1501};}
 }
 const client={from:()=>new Query(),rpc(name,args){calls.push({name,args});return {abortSignal:async()=>{
  if(denied)return {error:{message:'ACCESS_DENIED',code:'42501'},status:403};
  if(name==='aqari_workspace_access')return {data:{user_id:'u',workspace_id:'w',role:'general_manager',features:{kpi_dashboard:true},permissions:Object.fromEntries(['finance','contracts','properties','tenants','maintenance'].map(k=>[k,{read:true}]))}};
  return {data:{units:{total:42,occupied:39,vacant:3,vacancy_rate:7.14},collections:{expected_monthly_snapshot:'8900',actual:'7550.125',rate:84.83,average_days:2},profit:{actual_income:'7550.125',approved_expenses:'250',actual_net:'7300.125',projected_net:'8650'},sources:['synthetic'],generated_at:'2026-09-12T21:05:00Z'}};
 }}}};
 const body=new Element('body');body.connected=true;
 globalThis.document={body,activeElement:null,createElement:tag=>new Element(tag),documentElement:{lang:'ar',classList:{contains:()=>true}}};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'},AQARI_DATA_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_SUPABASE:{getClient:async()=>client,context:{user:{id:'u'},workspace:{id:'w'},membership:{user_id:'u',workspace_id:'w',role:'general_manager',is_active:true}}},addEventListener(){},removeEventListener(){}};
 const d=createDialog('مؤشرات الأداء'),view=mountKpiDashboard(d);await d.run(view.load);
 const elements=()=>d.el.querySelectorAll(),counts=()=>elements().filter(x=>x.dataset.counter);
 return {d,view,calls,elements,counts,bad:()=>bad=true,deny:()=>denied=true,good:()=>bad=false,cleanup(){if(!d.closed)d.close();Object.assign(globalThis,original);}};
}

test('actual KPI page mounts eleven counters and derives today from the server timestamp',async()=>{
 const f=await fixture();try{assert.equal(f.counts().length,11);assert.ok(f.elements().some(x=>x.textContent.includes('2026-09-13')));assert.equal(f.counts()[0].children[1].textContent,(1501).toLocaleString('ar-KW'));assert.match(f.d.status.textContent,/تم تحديث/);assert.equal(f.d.el.attributes['aria-busy'],'false');}finally{f.cleanup();}
});
test('count errors remove old values and a successful refresh repopulates the report',async()=>{
 const f=await fixture();try{f.bad();await f.d.run(f.view.load);assert.equal(f.counts().length,0);assert.match(f.d.status.textContent,/تعذر التحقق/);f.good();await f.d.run(f.view.load);assert.equal(f.counts().length,11);}finally{f.cleanup();}
});
test('server permission revocation disposes the integrated KPI report',async()=>{
 const f=await fixture();try{f.deny();await f.d.run(f.view.load);assert.equal(f.d.closed,true);assert.equal(f.counts().length,0);}finally{f.cleanup();}
});
test('invalid reporting range removes the old report without starting a new request',async()=>{
 const f=await fixture();try{const dates=f.elements().filter(x=>x.tagName==='input');dates[0].value='2026-09-14';dates[1].value='2026-09-13';const before=f.calls.length;await f.d.run(f.view.load);assert.equal(f.calls.length,before);assert.equal(f.counts().length,0);assert.match(f.d.status.textContent,/تاريخ/);}finally{f.cleanup();}
});
