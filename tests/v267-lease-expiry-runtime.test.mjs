import test from 'node:test';
import assert from 'node:assert/strict';
import {createDialog} from '../src/v267/components/dialog.js';
import {mountLeaseExpiryReport,mountAvailableLeaseExpiryReport} from '../src/v267/pages/lease-expiry-report.js';

async function fixture({discovery,mismatch=false}={}){
 const original={window:globalThis.window,document:globalThis.document};const calls=[];let denied=false;
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.value='';this.disabled=false;this.style={};}
  get isConnected(){return this.parent?this.parent.isConnected:this.connected===true;}
  append(...nodes){for(const n of nodes){this.children.push(n);n.parent=this;}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  querySelectorAll(selector){const all=this.children.flatMap(n=>[n,...n.querySelectorAll()]);return selector?all.filter(n=>selector.split(',').includes(n.tagName)):all;}
  setAttribute(k,v){this.attributes[k]=v;}addEventListener(){}showModal(){}close(){}focus(){}
  remove(){this.parent.children=this.parent.children.filter(x=>x!==this);}
 }
 const client={rpc(name,args){return {abortSignal:async()=>{
  if(name==='aqari_workspace_access')return {data:discovery};assert.equal(name,'aqari_lease_expiry_report');calls.push(structuredClone(args));if(denied)return {error:{message:'ACCESS_DENIED',code:'42501'}};
  const {p_status:status,p_days:days,p_property_id:property_id,p_search:search,p_offset:offset}=args;
  return {data:{as_of:'2026-09-12',timezone:'Asia/Kuwait',status,days,property_id,search,offset:mismatch?offset+50:offset,page_size:50,total:51,properties:[{id:'p1',name:'عقار محفوظ'}],rows:[{id:'l'+offset,contract_no:'EXP-'+offset,property_name:'عقار محفوظ',unit_no:'401',tenant_name:'اسم <script>محفوظ</script>',start_date:'2026-01-01',end_date:'2026-09-12',days_remaining:status==='expired'?-2:0,monthly_rent:'125.750'}]}};
 }}}};
 const body=new Element('body');body.connected=true;globalThis.document={body,activeElement:null,createElement:tag=>new Element(tag),documentElement:{lang:'ar',classList:{contains:()=>true}}};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'},AQARI_DATA_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_SUPABASE:{getClient:async()=>client,context:{user:{id:'u'},workspace:{id:'w'},membership:{user_id:'u',workspace_id:'w',is_active:true,role:'general_manager'}}},addEventListener(){},removeEventListener(){}};
 const d=createDialog('التقرير');if(discovery!==undefined)await d.run(()=>mountAvailableLeaseExpiryReport(d));else{const view=mountLeaseExpiryReport(d);await d.run(view.load);}
 const elements=()=>d.el.querySelectorAll();const control=label=>elements().find(x=>x.children?.[0]?.tagName==='label'&&x.children[0].textContent===label).children[1];
 return {d,calls,elements,control,submit:()=>elements().find(x=>x.tagName==='form').onsubmit({preventDefault(){}}),click:label=>elements().find(x=>x.tagName==='button'&&x.textContent===label).onclick(),deny(){denied=true;},cleanup(){if(!d.closed)d.el.children[0].onclick();Object.assign(globalThis,original);}};
}
test('report displays saved values as text and loads the next page with unchanged verified filters',async()=>{
 const f=await fixture();try{assert.ok(f.elements().some(x=>x.textContent==='المستأجر: اسم <script>محفوظ</script>'));assert.equal(f.elements().some(x=>x.tagName==='script'),false);assert.ok(f.elements().some(x=>x.textContent==='ينتهي اليوم'));await f.click('التالي');assert.equal(f.calls.at(-1).p_offset,50);assert.equal(f.calls.at(-1).p_workspace_id,'w');assert.ok(f.elements().some(x=>x.textContent==='عقد EXP-50'));}finally{f.cleanup();}
});
test('submitting status, period, property and search reloads page one from the backend',async()=>{
 const f=await fixture();try{await f.click('التالي');f.control('نوع التقرير').value='expired';f.control('الفترة القادمة').value='90';f.control('العقار').value='p1';f.control('بحث بالاسم أو الوحدة أو رقم العقد').value=' أحمد ';await f.submit();assert.deepEqual(f.calls.at(-1),{p_workspace_id:'w',p_status:'expired',p_days:90,p_property_id:'p1',p_search:'أحمد',p_offset:0});assert.ok(f.elements().some(x=>x.textContent==='انتهى منذ 2 يومًا'));}finally{f.cleanup();}
});
test('a response for a different page is refused without leaving a success or cached report',async()=>{
 const f=await fixture({mismatch:true});try{assert.match(f.d.status.textContent,/تعذر التحقق/);assert.equal(f.elements().some(x=>x.tagName==='article'),false);}finally{f.cleanup();}
});
test('server permission loss closes the real shared dialog and removes saved names',async()=>{
 const f=await fixture();try{f.deny();await f.submit();assert.equal(f.d.closed,true);assert.equal(f.elements().some(x=>String(x.textContent).includes('اسم <script>')),false);}finally{f.cleanup();}
});
test('missing feature, foreign account or denied report permission cannot start the report request',async()=>{
 const good={user_id:'u',workspace_id:'w',role:'general_manager',features:{lease_expiry_report:true},permissions:{contracts:{read:true},reports:{read:true}}};
 for(const discovery of [{...good,features:{}},{...good,user_id:'foreign'},{...good,permissions:{contracts:{read:true},reports:{read:false}}}]){const f=await fixture({discovery});try{assert.equal(f.calls.length,0);}finally{f.cleanup();}}
});
