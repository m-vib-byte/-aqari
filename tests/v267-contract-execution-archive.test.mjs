import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {readContractExecutionPdf} from '../src/v267/pages/contract-execution.js';
import {createPrivateUrls} from '../src/v267/components/private-urls.js';
import {t as translate,hasTranslation} from '../src/v267/components/locale.js';
const source=fs.readFileSync(new URL('../src/v267/pages/contract-execution-archive.js',import.meta.url),'utf8');
const row={settlement_id:'10000000-0000-4000-8000-000000000001',contract_no:'CT-1',tenant_document_id:'10000000-0000-4000-8000-000000000002',owner_document_id:'10000000-0000-4000-8000-000000000003',rent_receipt_no:null,contract_receipt_sequence:null};
const all=e=>[e,...e.children.flatMap(all)];
async function fixture(t,{paid=false,scope={},artifact={}}={}){
 class Element{constructor(tag,text=''){this.tag=tag;this.children=[];this._text=text;}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}set textContent(v){this._text=v;this.children=[];}}
 const node=(tag,text)=>new Element(tag,text),calls=[],created=[],revoked=[],disposers=[];
 const state={row:{...row,...(paid?{rent_receipt_no:'AQ-R-2026-00000001',contract_receipt_sequence:1}:{}),...artifact},fail:null,revoked:false,afterPdf:null,corrupt:false,reads:0,readHook:null};
 const session={bound:{workspace:'w',user:'u',...scope},check(){if(state.revoked)throw Error('SESSION_CHANGED');},request:async p=>p,operation:fn=>fn(new AbortController().signal),client:{auth:{getSession:async()=>({data:{session:{access_token:'fixture-token',user:{id:'u'}}}})},rpc(name,args){calls.push({name,args});assert.equal(name,'aqari_contract_execution_artifacts','no write RPC is allowed');state.reads++;state.readHook?.();if(state.fail)throw state.fail;return structuredClone(state.row);}}};
 const d={body:node('main'),status:node('p'),session,closed:false,onDispose(fn){disposers.push(fn);},close(){this.closed=true;state.revoked=true;for(const dispose of disposers)dispose();this.body.replaceChildren();},run(task){return this.pending=Promise.resolve().then(task).catch(error=>{this.error=error;this.status.textContent=error.message;});}};
 const urlAPI={createObjectURL(blob){const id='blob:fixture-'+created.length;created.push({id,blob});return id;},revokeObjectURL(id){revoked.push(id);}};
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(path,options)=>{calls.push({path,body:JSON.parse(options.body)});const bytes='%PDF-1.7\narchived fixture\n%%EOF';state.afterPdf?.();return new Response(bytes,{headers:{'Content-Type':'application/pdf','X-Aqari-Archived-SHA256':state.corrupt?'0'.repeat(64):createHash('sha256').update(bytes).digest('hex')}});};
 t.after(()=>{d.close();globalThis.fetch=originalFetch;});
 const context={createPage:()=>d,node,t:translate,readContractExecutionPdf,createPrivateUrls:dialog=>createPrivateUrls(dialog,urlAPI)};
 vm.createContext(context);vm.runInContext(source.replace(/^import .*;$/gm,'').replace(/\bexport /g,''),context);
 context.openContractExecutionArchive({contractRef:'lease-ref',contractNo:'CT-1',workspaceId:'w',userId:'u',onBack:()=>{calls.push({back:true});}});await d.pending;
 const find=(tag,label)=>all(d.body).find(x=>x.tag===tag&&x.textContent===translate(label));
 return {d,state,calls,created,revoked,find,links:()=>all(d.body).filter(x=>x.tag==='a'),async click(label){const b=find('button',label);assert.ok(b,label);await b.onclick();}};
}
const tenant='نسخة المستأجر — PDF رسمي مؤرشف',owner='نسخة المالك / الإدارة — PDF رسمي مؤرشف',receipt='تنزيل وصل الإيجار المؤرشف',refresh='إعادة تحميل مستندات الإبرام';
test('reopens both original execution PDFs through authorized reads without a settlement write',async t=>{
 const f=await fixture(t);assert.equal(f.calls.length,1);assert.equal(f.created.length,0);
 for(const [label,key]of [[tenant,'tenant_document_id'],[owner,'owner_document_id']]){
  await f.click(label);assert.equal(f.links().length,1);assert.match(f.d.status.textContent,/تم التحقق/);
  assert.deepEqual(f.calls.filter(x=>x.path).at(-1),{path:'/api/official-document',body:{workspaceId:'w',documentId:row[key],version:1}});
 }
 assert.equal(f.revoked.length,1);assert.equal(f.state.reads,5);assert.equal(f.find('button',receipt),undefined);
 assert.match(f.d.body.textContent,/لا يوجد وصل إيجار/);assert.equal(f.calls.filter(x=>x.name).every(x=>x.args.p_contract_ref==='lease-ref'&&x.args.p_workspace_id==='w'),true);
});
test('paid contract retrieves its original receipt number without creating another payment',async t=>{
 const f=await fixture(t,{paid:true});await f.click(receipt);
 assert.deepEqual(f.calls.find(x=>x.path),{path:'/api/rent-receipt',body:{workspaceId:'w',receiptNo:'AQ-R-2026-00000001'}});
 assert.equal(f.links()[0].download,'rent-receipt-AQ-R-2026-00000001.pdf');
});
test('unknown outcome can be inspected again using reads only',async t=>{
 const f=await fixture(t);f.state.fail=Error('unavailable');await f.click(refresh);assert.equal(f.links().length,0);assert.equal(f.find('button',tenant),undefined);
 f.state.fail=null;await f.click(refresh);await f.click(owner);assert.equal(f.links().length,1);assert.equal(f.calls.some(x=>/reserve|save|settle|prepare/.test(x.name||'')),false);
});
test('malformed or mismatched saved artifact binding never offers documents',async t=>{
 for(const artifact of [{contract_no:'OTHER'},{settlement_id:null},{tenant_document_id:'bad'},{owner_document_id:row.tenant_document_id},{rent_receipt_no:'bad',contract_receipt_sequence:1},{rent_receipt_no:'AQ-R-2026-00000001',contract_receipt_sequence:0},{rent_receipt_no:null,contract_receipt_sequence:1}])await t.test(JSON.stringify(artifact),async t=>{
  const f=await fixture(t,{artifact});assert.match(f.d.status.textContent,/تعذر تأكيد ربط/);assert.equal(f.find('button',tenant),undefined);assert.equal(f.created.length,0);
 });
});
test('changed workspace or user is refused before reading any contract data',async t=>{
 for(const scope of [{workspace:'other'},{user:'other'}])await t.test(JSON.stringify(scope),async t=>{const f=await fixture(t,{scope});assert.equal(f.calls.length,0);assert.equal(f.d.error.status,403);});
});
test('a changed document binding before export cannot export a different copy',async t=>{
 const f=await fixture(t);f.state.row.owner_document_id='10000000-0000-4000-8000-000000000004';await f.click(owner);
 assert.match(f.d.status.textContent,/تغير ربط/);assert.equal(f.calls.filter(x=>x.path).length,0);assert.equal(f.created.length,0);
});
test('a binding change while downloading never publishes a link',async t=>{
 const f=await fixture(t);f.state.afterPdf=()=>{f.state.row.settlement_id='10000000-0000-4000-8000-000000000005';};await f.click(tenant);
 assert.match(f.d.status.textContent,/تغير ربط/);assert.equal(f.created.length,0);
});
test('corrupt PDF bytes do not produce a downloadable archive',async t=>{
 const f=await fixture(t);f.state.corrupt=true;await f.click(tenant);assert.match(f.d.status.textContent,/بصمة/);assert.equal(f.created.length,0);
});
test('refresh failure revokes the previous PDF and removes every stale link',async t=>{
 const f=await fixture(t);await f.click(tenant);f.state.fail=Error('network');await f.click(refresh);
 assert.equal(f.links().length,0);assert.deepEqual(f.revoked,[f.created[0].id]);assert.equal(f.find('button',owner),undefined);
});
test('session loss while exporting cannot publish a late link',async t=>{
 const f=await fixture(t);f.state.afterPdf=()=>{f.state.revoked=true;};await f.click(tenant);assert.equal(f.created.length,0);assert.equal(f.links().length,0);
});
test('returning to the contract disposes its temporary PDF URL',async t=>{
 const f=await fixture(t);await f.click(tenant);await f.click('العودة إلى العقد');assert.equal(f.d.closed,true);assert.deepEqual(f.revoked,[f.created[0].id]);assert.equal(f.calls.at(-1).back,true);
});
test('archive interface messages are translated in every supported non-Arabic language',()=>{
 for(const label of ['مستندات الإبرام المؤرشفة','تعذر تأكيد ربط مستندات الإبرام بهذا العقد.','تغير ربط مستندات العقد؛ أعد تحميل الأرشيف.','تم التحقق من الملف المؤرشف. يمكنك تنزيله.','تنزيل وصل الإيجار المؤرشف','لا يوجد وصل إيجار ضمن مستندات إبرام هذا العقد.','استرجاع نسختي المالك والمستأجر ووصل الإبرام المحفوظ عند وجوده.','إعادة تحميل مستندات الإبرام','تعذر فتح مستندات الإبرام المؤرشفة.'])for(const language of ['en','hi','ur','ml'])assert.ok(hasTranslation(label,language),language+': '+label);
});
