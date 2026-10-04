import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReportFilters,createReportFilters} from '../src/v267/api/report-filters.js';
const property='c2670000-0000-4000-8000-000000000011';
test('report filter validation rejects invalid dates, unexpected fields and missing scope',()=>{
 assert.deepEqual(normalizeReportFilters('owner_report',{from:'2026-02-01',to:'2026-02-28'}),{from:'2026-02-01',to:'2026-02-28'});
 for(const bad of [{from:'2026-02-30',to:'2026-03-01'},{from:'2026-03-01',to:'2026-02-01'},{from:'2026-02-01',to:'2026-02-28',secret:'x'}])assert.throws(()=>normalizeReportFilters('owner_report',bad),/INVALID_REPORT_FILTERS/);
 assert.throws(()=>normalizeReportFilters('hr_monthly',{property_id:'',month:'2026-09'}),/INVALID/);
 assert.throws(()=>normalizeReportFilters('hr_monthly',{property_id:property,month:'2026-13'}),/INVALID/);
 assert.throws(()=>normalizeReportFilters('hr_annual',{property_id:'',year:2026}),/INVALID/);
 assert.deepEqual(normalizeReportFilters('hr_annual',{property_id:'',year:'2026'}),{property_id:'',year:'2026'});
});
function harness(){const rows=new Map(),calls=[];let active=true;const session=(user,workspace)=>({bound:{user,workspace},check(){if(!active)throw Error('SESSION_CHANGED');},client:{rpc(name,args){return {name,args,user};}},async request(q){calls.push(q);const key=[q.user,q.args.p_workspace_id,q.args.p_report_key].join(':');if(q.args.p_action==='save')rows.set(key,structuredClone(q.args.p_filters));if(q.args.p_action==='clear')rows.delete(key);return rows.get(key)||{};}});return {session,rows,calls,close:()=>active=false};}
test('saved filters reread across sessions and remain scoped to user, workspace and report',async()=>{
 const h=harness(),a=createReportFilters(h.session('a','w'),'hr_monthly'),values={property_id:property,month:'2026-09'};
 assert.equal(await a.read(),null);await a.save(values);
 assert.deepEqual(await createReportFilters(h.session('a','w'),'hr_monthly').read(),values);
 for(const [u,w,k] of [['b','w','hr_monthly'],['a','other','hr_monthly'],['a','w','property_statements']])assert.equal(await createReportFilters(h.session(u,w),k).read(),null);
 await a.clear();assert.equal(await a.read(),null);h.close();await assert.rejects(a.read(),/SESSION_CHANGED/);
});
test('save does not report success when readback differs or a request fails',async()=>{
 const h=harness(),s=h.session('a','w'),original=s.request;s.request=async q=>q.args.p_action==='get'?{property_id:property,month:'2026-10'}:original(q);
 await assert.rejects(createReportFilters(s,'hr_monthly').save({property_id:property,month:'2026-09'}),/REPORT_FILTERS_CHANGED/);
 s.request=async()=>{throw Error('NETWORK_FAILED');};await assert.rejects(createReportFilters(s,'hr_monthly').read(),/NETWORK_FAILED/);
});

test('save and clear controls persist current choices and expose verified success',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../src/v267/components/report-filters.js',import.meta.url),'utf8');
 const h=harness(),dialog={session:h.session('a','w'),status:{textContent:''},run:async fn=>fn()};
 globalThis.__reportFilterNode=(tag,text)=>({tag,textContent:text,children:[],append(...children){this.children.push(...children);}});
 try{
  const linked=source.replace("import {node} from './dialog.js';","const node=globalThis.__reportFilterNode;").replace("import {t} from './locale.js';","const t=x=>x;").replace("'../api/report-filters.js'",JSON.stringify(new URL('../src/v267/api/report-filters.js',import.meta.url).href));
  const {reportFilterControls}=await import('data:text/javascript;base64,'+Buffer.from(linked).toString('base64'));
  const control=reportFilterControls(dialog,'hr_monthly',()=>({property_id:property,month:'2026-09'}));
  assert.equal(await control.read(),null);await control.bar.children[0].onclick();
  assert.match(dialog.status.textContent,/تم حفظ/);assert.equal((await control.read()).month,'2026-09');
  await control.bar.children[1].onclick();assert.equal(await control.read(),null);assert.match(dialog.status.textContent,/تم مسح/);
 }finally{delete globalThis.__reportFilterNode;}
});
