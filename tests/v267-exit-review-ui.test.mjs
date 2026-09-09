import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import * as domain from '../src/v267/domain/exit-review.js';
import {depositToday,isDepositDenied} from '../src/v267/domain/deposit-ledger.js';
import {t as translate} from '../src/v267/components/locale.js';
const source=fs.readFileSync('src/v267/pages/exit-review.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
const leaseId='f267d400-0000-4000-8000-000000000001',user='f267d000-0000-4000-8000-000000000001',workspace='70000000-0000-4000-8000-000000000001';
function fixture(locale='ar',records=[],store=new Map()){
 let serial=records.length;const state={closed:false,denied:false,lostReply:false,noCommit:false};const cleanups=[],urls=[];
 class Element{
  constructor(tag,value=''){this.tag=tag;this.children=[];this._text=value;this.value='';this.dataset={};this.disabled=false;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  get textContent(){return this._text+this.children.map(e=>e.textContent).join('');}
  set textContent(v){this._text=v;this.children=[];}
 }
 const node=(tag,value)=>new Element(tag,value),field=(label,control)=>{const n=node('div');n.label=label;n.append(control);return n;};
 const walk=e=>[e,...e.children.flatMap(walk)],calls=[],tr=s=>translate(s,locale);
 const rpc=async(name,args)=>{
  assert.equal(name,'aqari_exit_review');assert.equal(args.p_workspace_id,workspace);calls.push(args);
  if(state.denied)throw Object.assign(Error('ACCESS_DENIED'),{code:'42501'});
  const a=args.p_action,v=args.p_data;
  if(a==='list')return {can_write:true,leases:[{id:leaseId,contract_no:'C-A',tenant_name:'مستأجر <محفوظ>',property_name:'العقار',unit_no:'101',start_date:'2026-01-01',status:'signed'}],documents:[],entries:v.lease_id?structuredClone(records):[]};
  if(a==='get')return {entry:structuredClone(records.find(e=>e.request_id===v.request_id)||null)};
  if(!state.noCommit&&!records.some(e=>e.request_id===v.request_id))records.unshift({...structuredClone(v),id:v.request_id,workspace_id:workspace,actor_id:user,actor_name:'مدير الاختبار',revision:v.revision+1,document_no:'EX-'+(v.revision+1),created_at:'2026-09-09T20:00:00Z',snapshot:{lease_id:leaseId,tenant_name:'مستأجر <محفوظ>',clearance_issued:false,deposit_balance:'20.125',rent_payments_total:'30.333'}});
  if(state.lostReply)throw Error('response lost');return {entry:records[0]};
 };
 const d={body:node('div'),status:node('p'),session:{bound:{user,workspace,role:'general_manager'},client:{rpc},request:x=>x,check(){if(state.closed)throw Error('closed');}},get closed(){return state.closed;},onDispose:f=>cleanups.push(f),async run(fn){if(state.closed||d.busy)return;d.busy=true;try{await fn();}catch(e){if(isDepositDenied(e)){state.closed=true;cleanups.forEach(f=>f());}else d.status.textContent=e.message;}finally{d.busy=false;}}};
 const context={...domain,node,field,createDialog:()=>d,t:tr,getLocale:()=>locale,direction:()=>['ar','ur'].includes(locale)?'rtl':'ltr',depositToday,isDepositDenied,structuredClone,Blob,
  createExitWriter:args=>domain.createExitWriter({...args,makeId:()=>`f267e500-0000-4000-8000-${String(++serial).padStart(12,'0')}`,hash:async s=>createHash('sha256').update(s).digest('hex'),storage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}}),
  createPrivateUrls:()=>({clear:()=>{urls.length=0;},create:blob=>{urls.push(blob);return 'blob:test';}})};
 vm.createContext(context);vm.runInContext(source,context);
 const control=label=>walk(d.body).find(e=>e.label===tr(label))?.children[0];
 const fill=(label,value)=>{const c=control(label);assert.ok(c,label);c.value=value;(c.oninput||c.onchange)?.();};
 const button=label=>walk(d.body).find(e=>e.tag==='button'&&e.textContent===tr(label));
 return {d,state,records,store,urls,calls,control,fill,button,start:()=>context.openExitReview(),async select(){const c=control('العقد المحفوظ');c.value=leaseId;await c.onchange();},submit:()=>walk(d.body).find(e=>e.tag==='form').onsubmit({preventDefault(){}})};
}
test('five-language exit UI saves, rereads and prints a fixed version; reopening keeps history',async()=>{
 for(const locale of ['ar','en','hi','ur','ml']){
  const f=fixture(locale);await f.start();await f.select();f.fill('سبب الإخلاء أو البيان','طلب مراجعة فقط');f.fill('تاريخ الإخلاء المطلوب','2026-09-30');await f.submit();
  assert.equal(f.records.length,1);assert.equal(f.calls.at(-1).p_action,'list');assert.equal(f.d.status.textContent,translate('حُفظ طلب الإخلاء وتم التحقق من نسخته.',locale));
  await f.button('فتح النسخة المحفوظة للطباعة').onclick();assert.equal(f.urls.length,1);const html=await f.urls[0].text();assert.ok(html.includes('EX-1'));assert.ok(html.includes('مستأجر &lt;محفوظ&gt;'));
  const g=fixture(locale,f.records,f.store);await g.start();await g.select();assert.equal(g.control('سبب الإخلاء أو البيان').value,'طلب مراجعة فقط');await g.submit();assert.equal(g.records.length,2);assert.equal(g.records[0].revision,2);assert.equal(g.records[1].revision,1);
 }
});
test('failed validation keeps editable draft; uncertain save retains immutable retry identity',async()=>{
 const f=fixture();await f.start();await f.select();f.fill('سبب الإخلاء أو البيان','');await f.submit();assert.equal(f.records.length,0);
 f.fill('سبب الإخلاء أو البيان','سبب صحيح');f.state.noCommit=true;f.state.lostReply=true;await f.submit();assert.equal(f.records.length,0);assert.equal(f.control('العقد المحفوظ').disabled,true);assert.equal(f.control('سبب الإخلاء أو البيان').value,'سبب صحيح');assert.equal(f.control('سبب الإخلاء أو البيان').disabled,true);
 f.state.noCommit=false;await f.submit();assert.equal(f.records.length,1);const writes=f.calls.filter(x=>x.p_action==='save');assert.equal(writes[0].p_data.request_id,writes[1].p_data.request_id);assert.equal(f.control('سبب الإخلاء أو البيان').disabled,false);
});
test('server denial clears private review text and print URLs through dialog disposal',async()=>{
 const f=fixture();await f.start();await f.select();f.fill('سبب الإخلاء أو البيان','بيان خاص');await f.submit();await f.button('فتح النسخة المحفوظة للطباعة').onclick();assert.equal(f.urls.length,1);
 f.state.denied=true;await f.button('تحديث السجل والتحقق من العملية').onclick();assert.equal(f.state.closed,true);assert.equal(f.d.body.textContent,'');assert.equal(f.urls.length,0);
});
