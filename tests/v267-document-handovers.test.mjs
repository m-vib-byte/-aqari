import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture(flags={}){
 const nodes=[],calls=[],records=[],cleanups=[];let sequence=0,closed=false;
 class Element{
  constructor(tag,text=''){this.tag=tag;this._text=text;this.children=[];this.value='';this.isConnected=true;nodes.push(this);}
  append(...items){this.children.push(...items);if(this.tag==='select'&&this.children.length===items.length)this.value=items[0]?.value||'';}
  detach(){this.isConnected=false;this.children.forEach(x=>x.detach());}
  replaceChildren(...items){this.children.forEach(x=>x.detach());this.children=[];this.append(...items);}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}set textContent(v){this._text=v;}
 }
 const node=(tag,text)=>new Element(tag,text),field=(label,c)=>{const e=node('label',label);e.append(c);return e;},host=node('article');
 const d={status:node('p'),session:{bound:{workspace:'w',user:'u'},check(){if(closed)throw Error('closed');},request:async p=>p,client:{async rpc(name,a){
  calls.push(JSON.parse(JSON.stringify(a)));assert.equal(name,'aqari_document_handover_register');assert.equal(a.p_workspace_id,'w');assert.equal(a.p_document_id,'doc');
  if(a.p_action==='list'){if(flags.readFails&&calls.some(x=>x.p_action==='record'))throw Error('read unavailable');return {entries:structuredClone(records),can_write:!flags.readOnly,evidence:[{id:'proof',document_no:'P-1',title:'إثبات محفوظ'}]};}
  if(a.p_action==='record'){
   if(flags.rejectRecord)throw Object.assign(Error('INVALID_HANDOVER'),{code:'P0001'});
   if(!records.some(x=>x.id===a.p_data.id)){const {id,evidence_document_id,...details}=a.p_data;records.push({id,workspace_id:'w',document_id:'doc',evidence_document_id,actor_id:'u',actor_name:'الموظف',recorded_at:'2026-09-12T00:00:00Z',details:JSON.parse(JSON.stringify(details)),evidence_snapshot:{document_no:'P-1',title:'إثبات محفوظ'},cancellation:null});}
   if(flags.wrongReadback)records[0].details.recipient_name='مستلم مختلف';if(flags.lostWrite)throw Error('reply lost');return records[0];
  }
  if(a.p_action==='void'){records.find(x=>x.id===a.p_data.handover_id).cancellation={...a.p_data,actor_id:'u',actor_name:'الموظف',recorded_at:'2026-09-12T01:00:00Z'};if(flags.lostWrite)throw Error('reply lost');return records[0].cancellation;}
  throw Error('unexpected action');
 }}},onDispose(fn){cleanups.push(fn);},run(task){d.task=Promise.resolve().then(task).catch(e=>{d.status.textContent=e.message;});return d.task;}};
 const context={node,field,Intl,Date,Map,crypto:{randomUUID:()=> 'retry-'+(++sequence)}};vm.createContext(context);
 vm.runInContext(fs.readFileSync('src/v267/components/document-handovers.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,''),context);context.mountDocumentHandovers(d,host,'doc');
 const control=label=>nodes.find(x=>x.isConnected&&x.tag==='label'&&x._text===label)?.children[0];
 const click=async text=>{const b=nodes.find(x=>x.isConnected&&x.tag==='button'&&x.textContent===text);assert.ok(b,text);await b.onclick();await d.task;};
 const submit=async()=>{const f=nodes.find(x=>x.isConnected&&x.tag==='form');await f.onsubmit({preventDefault(){}});await d.task;};
 return {d,calls,records,flags,control,click,submit,host,async start(){await click('سجل تسليم واستلام هذا المستند');},fill(){control('اسم المسلّم').value='مسلم الورقة';control('اسم المستلم').value='مستلم الورقة';control('وقت التسليم بتوقيت الكويت').value='2026-09-01T12:34';control('مستند إثبات التسليم').value='proof';},close(){closed=true;cleanups.forEach(f=>f());}};
}
test('records a handover, verifies full readback and converts Kuwait time without changing source',async()=>{
 const f=fixture();await f.start();f.fill();await f.submit();const write=f.calls.find(x=>x.p_action==='record');
 assert.equal(write.p_data.handed_at,'2026-09-01T09:34:00.000Z');assert.equal(write.p_data.copies,1);assert.equal(write.p_data.evidence_document_id,'proof');assert.equal(write.p_data.recipient_name,'مستلم الورقة');assert.match(f.d.status.textContent,/تم حفظ التسليم/);assert.equal(f.records.length,1);
});
test('a lost write reply is recovered by saved readback without recording a duplicate',async()=>{
 const f=fixture({lostWrite:true});await f.start();f.fill();await f.submit();assert.match(f.d.status.textContent,/تم حفظ التسليم/);assert.equal(f.records.length,1);assert.equal(f.calls.filter(x=>x.p_action==='record').length,1);
});
test('wrong saved recipient cannot confirm handover success',async()=>{
 const f=fixture({wrongReadback:true});await f.start();f.fill();await f.submit();assert.match(f.d.status.textContent,/لم يتأكد حفظ التسليم/);
});
test('failed readback preserves the request identity and rejects changed payload on retry',async()=>{
 const f=fixture({readFails:true,lostWrite:true});await f.start();f.fill();await f.submit();const first=f.calls.find(x=>x.p_action==='record').p_data.id;
 f.control('اسم المستلم').value='اسم آخر';await f.submit();assert.match(f.d.status.textContent,/نفس البيانات/);assert.equal(f.calls.filter(x=>x.p_action==='record').length,1);
 f.control('اسم المستلم').value='مستلم الورقة';f.flags.readFails=false;await f.submit();assert.equal(f.calls.filter(x=>x.p_action==='record').at(-1).p_data.id,first);assert.equal(f.records.length,1);assert.match(f.d.status.textContent,/تم حفظ التسليم/);
});
test('missing evidence is refused before sending and read-only users have no write form',async()=>{
 const f=fixture();await f.start();f.fill();f.control('مستند إثبات التسليم').value='';await f.submit();assert.equal(f.calls.some(x=>x.p_action==='record'),false);
 const viewer=fixture({readOnly:true});await viewer.start();assert.equal(viewer.control('اسم المستلم'),undefined);
});
test('definitive validation rejection allows a corrected handover without retaining a failed intent',async()=>{
 const f=fixture({rejectRecord:true});await f.start();f.fill();await f.submit();assert.match(f.d.status.textContent,/INVALID_HANDOVER/);assert.equal(f.records.length,0);
 f.flags.rejectRecord=false;f.control('اسم المستلم').value='مستلم مصحح';await f.submit();assert.match(f.d.status.textContent,/تم حفظ التسليم/);assert.equal(f.records[0].details.recipient_name,'مستلم مصحح');
});
test('cancellation keeps the original handover and verifies a lost reply through the saved cancellation',async()=>{
 const f=fixture();await f.start();f.fill();await f.submit();const original=structuredClone(f.records[0].details);f.flags.lostWrite=true;f.control('سبب إلغاء هذا القيد').value='تصحيح واقعة التسليم';await f.click('إلغاء القيد مع حفظ الأصل');
 assert.equal(f.records.length,1);assert.deepEqual(f.records[0].details,original);assert.equal(f.records[0].cancellation.reason,'تصحيح واقعة التسليم');assert.match(f.d.status.textContent,/تم توثيق الإلغاء/);
});
test('closing clears personal form content and prevents a stale action',async()=>{
 const f=fixture();await f.start();f.fill();f.close();assert.equal(f.control('اسم المستلم'),undefined);assert.doesNotMatch(f.host.textContent,/مسلم الورقة|مستلم الورقة/);
 await f.click('سجل تسليم واستلام هذا المستند');assert.match(f.d.status.textContent,/closed/);
});
