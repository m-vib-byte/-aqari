import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMonthlyMaintenanceReport,mountMonthlyMaintenanceReport} from '../src/v267/pages/maintenance-monthly-report.js';

const options={workspaceId:'w',propertyId:'p',month:'2026-10',today:'2026-10-06'};
const task={id:'t',workspace_id:'w',property_id:'p',task_no:'MT1',status:'completed',due_on:'2026-10-01',completed_at:'2026-10-03T09:00:00Z',completed_by:'u',assigned_vendor_id:'v',completion_document_id:'doc',photo_document_ids:['after'],cost:'1.001'};
function fixture(){return {
 data:{properties:[{id:'p',name:'عقار أول'},{id:'other',name:'عقار ثان'}],tasks:[{...task}],vendors:[{id:'v',name:'شركة الصيانة'}],documents:[{id:'doc',property_id:'p',document_no:'D1',mime_type:'application/pdf'},{id:'before',property_id:'p',mime_type:'image/jpeg'},{id:'after',property_id:'p',mime_type:'image/png'}]},
 context:{workspace_id:'w',propertyId:'p',evidence:[{taskId:'t',stage:'before',documentId:'before'},{taskId:'t',stage:'after',documentId:'after'}],imageDocuments:[{id:'before',mimeType:'image/jpeg'},{id:'after',mimeType:'image/png'}]}
};}
const report=f=>buildMonthlyMaintenanceReport(f.data,f.context,options);

test('documented recorded completion appears done with exact fils and company',()=>{
 const f=fixture(),snapshot=JSON.stringify(f),r=report(f);
 assert.equal(r.rows[0].state,'done');assert.equal(r.rows[0].vendor,'شركة الصيانة');assert.equal(r.summary.total_cost,'1.001');assert.equal(r.summary.done,1);assert.equal(JSON.stringify(f),snapshot);
});
test('completed status without evidence is undocumented, never done',()=>{
 for(const change of [f=>f.data.documents=[],f=>f.context.evidence=[],f=>f.data.tasks[0].completed_by=null,f=>f.data.tasks[0].completed_at='invalid',f=>f.data.tasks[0].photo_document_ids=[]]){
  const f=fixture();change(f);const r=report(f);assert.equal(r.rows[0].state,'undocumented');assert.equal(r.summary.done,0);assert.ok(r.rows[0].missing.length);
 }
});
test('documents of another property cannot verify completion',()=>{
 const f=fixture();f.data.documents.forEach(d=>d.property_id='other');assert.equal(report(f).rows[0].state,'undocumented');
});
test('selection uses property, workspace and due month, not completion month',()=>{
 const f=fixture();f.data.tasks.push({...task,id:'other-property',property_id:'other'},{...task,id:'other-workspace',workspace_id:'foreign'},{...task,id:'old',due_on:'2026-09-30'});f.data.tasks[0].completed_at='2026-11-01T00:00:00Z';
 assert.deepEqual(report(f).rows.map(r=>r.id),['t']);
});
test('scheduled, assigned and active tasks are not done and overdue is date bounded',()=>{
 const f=fixture();f.data.tasks=['scheduled','assigned','in_progress'].map((status,i)=>({...task,id:String(i),status,due_on:i===2?'2026-10-06':'2026-10-01'}));
 const r=report(f);assert.equal(r.summary.not_done,3);assert.equal(r.summary.overdue,2);assert.equal(r.summary.done,0);
});
test('cancelled tasks remain visible, not done, and not overdue',()=>{
 const f=fixture();f.data.tasks[0].status='cancelled';const r=report(f);assert.equal(r.summary.not_done,1);assert.equal(r.summary.cancelled,1);assert.equal(r.summary.overdue,0);
});
test('unknown status is undocumented',()=>{const f=fixture();f.data.tasks[0].status='future';assert.equal(report(f).summary.undocumented,1);});
test('fils sums are exact and missing cost is not treated as zero',()=>{
 const f=fixture();f.data.tasks=[{...task,cost:'999999999999.999'},{...task,id:'t2',cost:'0.001'},{...task,id:'t3',cost:null}];const r=report(f);assert.equal(r.summary.total_cost,'1000000000000.000');assert.equal(r.summary.unknown_cost,1);assert.equal(r.rows[2].cost,null);
});
test('invalid month, impossible task date and foreign context fail closed',()=>{
 const f=fixture();for(const month of ['2026-13','2026-1','bad'])assert.throws(()=>buildMonthlyMaintenanceReport(f.data,f.context,{...options,month}));
 f.data.tasks[0].due_on='2026-02-30';assert.throws(()=>report(f),/استحقاق/);f.data.tasks[0].due_on=task.due_on;f.context.propertyId='other';assert.throws(()=>report(f),/نطاق/);
});
test('no saved tasks is an empty report rather than inferred completion',()=>{const f=fixture();f.data.tasks=[];assert.equal(report(f).summary.done,0);assert.deepEqual(report(f).rows,[]);});

async function uiFixture(){
 const original=globalThis.document,f=fixture(),calls=[],dispose=[];
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.value='';this._text='';this.style={};}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;this._text='';}
  set textContent(value){this._text=String(value??'');}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join('\n');}
  setAttribute(){}
 }
 globalThis.document={createElement:tag=>new Element(tag)};
 const d={body:new Element('div'),status:new Element('p'),onDispose(fn){dispose.push(fn);},session:{bound:{workspace:'w',user:'u'},check(){},async request(p){return p;},client:{async rpc(name,args){calls.push({name,args});if(name==='aqari_maintenance_plans')return structuredClone(f.data);return {...structuredClone(f.context),user_id:f.context.user_id||'u'};}}},run(fn){return Promise.resolve().then(fn);}};
 const api=mountMonthlyMaintenanceReport(d);await api.initialize();
 const form=d.body.children.find(x=>x.tagName==='form'),property=form.children[0].children[1],month=form.children[1].children[1];property.value='p';month.value='2026-10';
 return {d,f,api,calls,property,month,cleanup(){for(const fn of dispose)fn();globalThis.document=original;}};
}
test('actual monthly UI renders the selected property and labels unavailable fields',async()=>{
 const u=await uiFixture();try{
  u.f.data.properties[0].name='<script>عقار</script>';await u.api.load();
  assert.match(u.d.body.textContent,/<script>عقار<\/script> — 2026-10/);
  assert.match(u.d.body.textContent,/MT1 · تم/);assert.match(u.d.body.textContent,/مستند الإغلاق لا يُفترض أنه فاتورة/);
  assert.ok(u.calls.every(c=>c.args.p_action==='context'||c.args.p_action==='list'));
 }finally{u.cleanup();}
});
test('failed scope reread clears the previous property report',async()=>{
 const u=await uiFixture();try{await u.api.load();assert.match(u.d.body.textContent,/MT1/);u.f.context.propertyId='other';await assert.rejects(u.api.load(),/نطاق/);assert.doesNotMatch(u.d.body.textContent,/MT1/);}finally{u.cleanup();}
});
test('invalid filters make no request and a different user response is rejected',async()=>{
 const u=await uiFixture();try{const count=u.calls.length;u.month.value='2026-13';await assert.rejects(u.api.load());assert.equal(u.calls.length,count);u.month.value='2026-10';u.f.context.user_id='foreign';await assert.rejects(u.api.load(),/حساب/);assert.doesNotMatch(u.d.body.textContent,/MT1/);}finally{u.cleanup();}
});
