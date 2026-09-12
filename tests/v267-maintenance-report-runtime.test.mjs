import test from 'node:test';
import assert from 'node:assert/strict';
import {createDialog} from '../src/v267/components/dialog.js';
import {mountMaintenanceReport,mountAvailableMaintenanceReport} from '../src/v267/pages/maintenance-report.js';

async function fixture({discovery,bad=false}={}){
 const original={window:globalThis.window,document:globalThis.document};const calls=[];let denied=false;
 class Element{
  constructor(tag,text=''){this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.value='';this.disabled=false;this.hidden=false;this.style={};this.textContent=String(text??'');}
  get isConnected(){return this.parent?this.parent.isConnected:this.connected===true;}
  append(...nodes){for(const n of nodes){if(typeof n==='string'){const x=new Element('#text',n);x.parent=this;this.children.push(x);}else{this.children.push(n);n.parent=this;}}}
  replaceChildren(...nodes){this.children=[];this.textContent='';this.append(...nodes);}
  querySelectorAll(selector){const all=this.children.flatMap(n=>[n,...n.querySelectorAll()]);return selector?all.filter(n=>selector.split(',').includes(n.tagName)):all;}
  setAttribute(k,v){this.attributes[k]=v;}addEventListener(){}showModal(){}close(){}focus(){}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
 }
 const client={rpc(name,args){return {abortSignal:async()=>{
  if(name==='aqari_workspace_access')return {data:discovery};assert.equal(name,'aqari_maintenance_report');calls.push(structuredClone(args));if(denied)return {error:{message:'ACCESS_DENIED',code:'42501'}};
  const data={from:args.p_from,to:args.p_to,summary:{total_requests:1,open_requests:0,completed_requests:1,cancelled_requests:0,total_cost:12.345,average_response_minutes:3.5,average_resolution_minutes:14.2},statuses:{completed:{count:1,cost:12.345}},truncated:false,requests:[{id:'r1',request_no:'MR-001',request_type:'plumbing',status:'completed',cost:12.345,property_id:'p1',property_name:'عقار <script>محفوظ</script>',unit_no:'401',tenant_name:'مستأجر محفوظ',created_at:'2026-09-12T10:00:00Z',updated_at:'2026-09-12T10:14:00Z',first_response_at:'2026-09-12T10:03:00Z',completed_at:'2026-09-12T10:14:00Z',response_minutes:3.5,resolution_minutes:14.2}]};
  if(bad)data.summary.total_requests=-1;return {data};
 }}}};
 const body=new Element('body');body.connected=true;globalThis.document={body,activeElement:null,createElement:tag=>new Element(tag),documentElement:{lang:'ar',classList:{contains:()=>true}}};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'},AQARI_DATA_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_SUPABASE:{getClient:async()=>client,context:{user:{id:'u'},workspace:{id:'w'},membership:{user_id:'u',workspace_id:'w',is_active:true,role:'general_manager'}}},addEventListener(){},removeEventListener(){}};
 const d=createDialog('التقرير');if(discovery!==undefined)await d.run(()=>mountAvailableMaintenanceReport(d));else await d.run(()=>mountMaintenanceReport(d).load());
 const elements=()=>d.el.querySelectorAll();const fieldControl=label=>elements().find(x=>x.children?.[0]?.tagName==='label'&&x.children[0].textContent===label)?.children[1];
 return {d,calls,elements,fieldControl,submit:()=>elements().find(x=>x.tagName==='form').onsubmit({preventDefault(){}}),deny(){denied=true;},cleanup(){if(!d.closed)d.el.children[0].onclick();Object.assign(globalThis,original);}};
}

test('maintenance report renders saved values as text and keeps server metrics intact',async()=>{
 const f=await fixture();try{assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0],{p_workspace_id:'w',p_from:null,p_to:null});assert.ok(f.elements().some(x=>x.textContent==='طلب MR-001'));assert.ok(f.elements().some(x=>x.textContent==='عقار <script>محفوظ</script> • 401'));assert.equal(f.elements().some(x=>x.tagName==='script'),false);assert.ok(f.elements().some(x=>x.textContent==='إجمالي التكلفة'));assert.ok(f.elements().some(x=>x.textContent==='12.345 د.ك'));}finally{f.cleanup();}
});

test('date filters are sent exactly and invalid local ranges never reach the backend',async()=>{
 const f=await fixture();try{f.fieldControl('من تاريخ').value='2026-09-01';f.fieldControl('إلى تاريخ').value='2026-09-12';await f.submit();assert.deepEqual(f.calls.at(-1),{p_workspace_id:'w',p_from:'2026-09-01',p_to:'2026-09-12'});const before=f.calls.length;f.fieldControl('من تاريخ').value='2026-09-13';f.fieldControl('إلى تاريخ').value='2026-09-12';await f.submit();assert.equal(f.calls.length,before);assert.match(f.d.status.textContent,/تاريخ النهاية/);}finally{f.cleanup();}
});

test('malformed report totals are rejected without rendering a trusted report',async()=>{
 const f=await fixture({bad:true});try{assert.match(f.d.status.textContent,/تعذر التحقق/);assert.equal(f.elements().some(x=>x.textContent==='طلب MR-001'),false);}finally{f.cleanup();}
});

test('feature discovery and both report and maintenance read permissions are required',async()=>{
 const good={user_id:'u',workspace_id:'w',role:'general_manager',features:{maintenance_report:true},permissions:{reports:{read:true},maintenance:{read:true}}};
 for(const discovery of [{...good,features:{}},{...good,user_id:'foreign'},{...good,permissions:{reports:{read:false},maintenance:{read:true}}},{...good,permissions:{reports:{read:true},maintenance:{read:false}}}]){const f=await fixture({discovery});try{assert.equal(f.calls.length,0);}finally{f.cleanup();}}
});

test('server permission loss closes the shared dialog on a subsequent read',async()=>{
 const f=await fixture();try{f.deny();await f.submit();assert.equal(f.d.closed,true);}finally{f.cleanup();}
});
