const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('v267-service-desk.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(count=2){
 const rows=Array.from({length:count},(_,i)=>({id:'request-'+i,request_no:i+1,workspace_id:'fixture-workspace',description:'طلب اختبار '+i,request_type:'general',status:'received',cost:'0',revision:1,lease:{contract_no:'C-'+i,snapshot:{property:'عقار اختبار',unit:String(i+1)}},tenant:{full_name:'مستأجر اختبار'}}));
 const state={failList:false,readError:null,locationError:null,locations:null,sessionLost:false,loseSessionOnRead:false,loseSessionOnLocation:false,lostUpdate:false,badReadback:false,closed:false},calls=[];let dispose;
 const locations=rows.map(row=>({request_id:row.id,property_name:row.lease.snapshot.property,unit_no:row.lease.snapshot.unit}));
 const descendants=x=>[x,...x.children.flatMap(descendants)];
 class Element{
  constructor(tag,text=''){this.tag=tag;this.children=[];this.value='';this.disabled=false;this.hidden=false;this._text=text;this.classList={add(){}};}
  append(...children){for(const c of children){c.parent=this;this.children.push(c);}}
  replaceChildren(...children){for(const c of this.children)c.parent=null;this.children=[];this.append(...children);}
  get isConnected(){return !state.closed&&(this.root||this.parent?.isConnected===true);}
  set textContent(value){this._text=value;this.replaceChildren();}
  get textContent(){return String(this._text)+this.children.map(c=>c.textContent).join('');}
 }
 const node=(tag,text)=>new Element(tag,text),field=(label,control)=>{const group=node('label',label);group.append(control);return group;};
 function from(table){assert.equal(table,'aqari_maintenance_requests');const query={filters:{},select(columns){calls.push({kind:'select',columns});assert.doesNotMatch(columns,/aqari_leases|snapshot/);return query;},eq(key,value){query.filters[key]=value;return query;},order(){return query;},update(values){query.values=values;return query;},
  async range(start,end){calls.push({kind:'list',start,end});if(state.loseSessionOnRead)state.sessionLost=true;if(state.readError)throw state.readError;if(state.failList)throw Error('network unavailable');return clone(rows.slice(start,end+1));},
  async maybeSingle(){calls.push({kind:'update',filters:clone(query.filters),values:clone(query.values)});assert.equal(query.filters.workspace_id,'fixture-workspace');if(state.updateError)throw state.updateError;const row=rows.find(r=>r.id===query.filters.id&&r.revision===query.filters.revision);if(!row)return null;Object.assign(row,query.values,{revision:row.revision+1});if(state.lostUpdate)throw Error('reply lost');return clone(row);},
  async single(){calls.push({kind:'readback',filters:clone(query.filters)});if(state.readbackError)throw state.readbackError;const row=clone(rows.find(r=>r.id===query.filters.id));if(state.badReadback)row.id='another-request';return row;}
 };return query;}
 async function rpc(name,args){assert.equal(name,'aqari_maintenance_locations');assert.equal(args.p_workspace_id,'fixture-workspace');assert.ok(args.p_request_ids.length<=50);calls.push({kind:'locations',args:clone(args)});if(state.loseSessionOnLocation)state.sessionLost=true;if(state.locationError)throw state.locationError;return clone(state.locations??locations.filter(row=>args.p_request_ids.includes(row.request_id)));}
 const d={body:node('div'),el:node('dialog'),status:node('p'),session:{bound:{workspace:'fixture-workspace'},client:{from,rpc},request:query=>query,check(){if(state.closed||state.sessionLost)throw Error('closed');}},onDispose(fn){dispose=fn;},get closed(){return state.closed;},async run(task){if(d.busy||state.closed)return;d.busy=true;const controls=descendants(d.body).filter(e=>['button','input','select'].includes(e.tag)),disabled=controls.map(e=>e.disabled);controls.forEach(e=>e.disabled=true);try{await task();}catch(e){state.lastError=e;d.status.textContent=e.message;}finally{d.busy=false;controls.forEach((e,i)=>{if(e.isConnected)e.disabled=disabled[i];});}}};d.body.root=true;
 const context={node,field,createDialog:()=>d,currentScope:()=>({role:'general_manager'}),maintenanceTypeLabel:x=>({general:'عام',electrical:'كهرباء',plumbing:'سباكة',air_conditioning:'تكييف',elevator:'مصعد',fire_safety:'إطفاء وسلامة',other:'أخرى'}[x]||'أخرى'),t:x=>x,message:(x,args)=>x.replace(/\{(\w+)\}/g,(_,k)=>args[k]),window:{}};vm.createContext(context);vm.runInContext(source,context);
 const cards=()=>descendants(d.body).filter(e=>e.tag==='article');
 const button=(label,parent=d.body)=>descendants(parent).find(e=>e.tag==='button'&&e.textContent===label);
 const cost=index=>descendants(cards()[index]).find(e=>e.tag==='input');
 const status=index=>descendants(cards()[index]).find(e=>e.tag==='select');
 return {d,state,rows,locations,calls,cards,cost,status,button,start:()=>context.openDesk(),refresh:()=>button('تحديث السجلات').onclick(),save:i=>button('حفظ الحالة والتكلفة',cards()[i]).onclick(),close:()=>{state.closed=true;dispose();}};
}
test('maintenance location survives contract RLS and uses only the requested page metadata',async()=>{
 const f=fixture(51);for(const row of f.rows){row.lease=null;row.tenant=null;}await f.start();
 assert.match(f.cards()[0].textContent,/العقار: عقار اختبار • الوحدة: 1/);assert.doesNotMatch(f.d.body.textContent,/العقد/);
 assert.equal(f.calls.find(c=>c.kind==='locations').args.p_request_ids.length,50);
 await f.button('التالي').onclick();assert.deepEqual(f.calls.filter(c=>c.kind==='locations').at(-1).args.p_request_ids,['request-50']);assert.match(f.cards()[0].textContent,/الوحدة: 51/);
});
test('location permission denial or session loss clears requests and drafts',async()=>{
 for(const error of [Error('ACCESS_DENIED'),Object.assign(Error('permission'),{code:'42501'}),Object.assign(Error('denied'),{status:403}),Object.assign(Error('expired'),{status:401}),null]){
  const f=fixture();await f.start();f.cost(0).value='91.125';f.state.locationError=error;f.state.loseSessionOnLocation=error===null;await f.refresh();
  assert.equal(f.cards().length,0);assert.doesNotMatch(f.d.body.textContent,/عقار اختبار|طلب اختبار|مستأجر اختبار/);
  f.state.locationError=null;f.state.loseSessionOnLocation=false;f.state.sessionLost=false;await f.refresh();assert.equal(f.cost(0).value,'0');
 }
});
test('temporary or malformed location responses do not replace the displayed page or lose drafts',async()=>{
 for(const invalid of [null,[],[{request_id:'request-0',property_name:'other',unit_no:'1'},{request_id:'request-0',property_name:'other',unit_no:'2'}],[{request_id:'request-0',property_name:'other',unit_no:'1'},{request_id:'another-request',property_name:'other',unit_no:'2'}]]){
  const f=fixture();await f.start();const card=f.cards()[0];f.cost(0).value='6.125';
  if(invalid===null)f.state.locationError=Object.assign(Error('unavailable'),{status:503});else f.state.locations=invalid;
  await f.refresh();assert.equal(f.cards()[0],card);assert.equal(f.cost(0).value,'6.125');assert.doesNotMatch(f.d.body.textContent,/other/);
  f.state.locationError=null;f.state.locations=null;await f.refresh();assert.equal(f.cost(0).value,'6.125');
 }
});
test('metadata reflects current saved location while an edited request retains its original revision',async()=>{
 const f=fixture();await f.start();f.cost(0).value='7';f.locations[0].property_name='اسم العقار المصحح';f.locations[0].unit_no='101';await f.refresh();
 assert.match(f.cards()[0].textContent,/العقار: اسم العقار المصحح • الوحدة: 101/);assert.equal(f.cost(0).value,'7');await f.save(0);assert.equal(f.calls.find(c=>c.kind==='update').filters.revision,1);
});
test('failed refresh leaves the displayed requests, edited fields and navigation intact',async()=>{
 const f=fixture();await f.start();const card=f.cards()[0];f.cost(0).value='12.125';f.status(0).value='in_progress';f.state.failList=true;await f.refresh();
 assert.equal(f.cards()[0],card);assert.equal(f.cost(0).value,'12.125');assert.equal(f.status(0).value,'in_progress');assert.match(f.d.status.textContent,/network unavailable/);
});
test('successful refresh retains edits and the original server revision',async()=>{
 const f=fixture();await f.start();f.cost(0).value='12.125';f.status(0).value='in_progress';await f.refresh();assert.equal(f.cost(0).value,'12.125');assert.equal(f.status(0).value,'in_progress');
 await f.save(0);const update=f.calls.find(c=>c.kind==='update');assert.equal(update.filters.revision,1);assert.equal(f.rows[0].revision,2);assert.equal(f.rows[0].cost,'12.125');assert.match(f.d.status.textContent,/تم حفظ الطلب/);
});
test('denied reads clear request data and drafts, including when access later returns',async()=>{
 for(const error of [Error('ACCESS_DENIED'),Object.assign(Error('database denied'),{code:'42501'}),Object.assign(Error('opaque rejection'),{status:403}),Object.assign(Error('expired'),{status:401})]){
  const f=fixture();await f.start();f.cost(0).value='91.125';await f.refresh();f.state.readError=error;await f.refresh();
  assert.equal(f.cards().length,0);assert.doesNotMatch(f.d.body.textContent,/طلب اختبار|مستأجر اختبار/);
  f.state.readError=null;await f.refresh();assert.equal(f.cost(0).value,'0','revoked-session draft is not restored');
 }
});
test('temporary service errors preserve drafts without treating an outage as an authorization denial',async()=>{
 const f=fixture();await f.start();const card=f.cards()[0];f.cost(0).value='7.125';f.state.readError=Object.assign(Error('unavailable'),{status:503});await f.refresh();
 assert.equal(f.cards()[0],card);assert.equal(f.cost(0).value,'7.125');f.state.readError=null;await f.refresh();assert.equal(f.cost(0).value,'7.125');
});
test('loss of session before or during a reread clears the old private view',async()=>{
 for(const during of [false,true]){
  const f=fixture();await f.start();f.cost(0).value='14';if(during)f.state.loseSessionOnRead=true;else f.state.sessionLost=true;
  await f.refresh();assert.equal(f.cards().length,0);assert.doesNotMatch(f.d.body.textContent,/طلب اختبار|مستأجر اختبار/);
 }
});
test('a changed server revision never silently rebases a local draft over another employee',async()=>{
 const f=fixture();await f.start();f.cost(0).value='20';f.rows[0].revision=2;f.rows[0].cost='15';await f.refresh();
 assert.equal(f.cost(0).value,'20');assert.equal(f.button('حفظ الحالة والتكلفة',f.cards()[0]).disabled,true);await f.save(0);assert.equal(f.calls.filter(c=>c.kind==='update').length,0);
 await f.button('تجاهل التعديل المحلي واسترجاع المحفوظ',f.cards()[0]).onclick();assert.equal(f.cost(0).value,'15');assert.equal(f.button('حفظ الحالة والتكلفة',f.cards()[0]).disabled,false);
});
test('saving one request does not erase the unsaved cost and status of another request',async()=>{
 const f=fixture();await f.start();f.cost(0).value='5.001';f.cost(1).value='7.125';f.status(1).value='assigned';await f.save(0);
 assert.equal(f.rows[0].cost,'5.001');assert.equal(f.rows[1].cost,'0');assert.equal(f.cost(1).value,'7.125');assert.equal(f.status(1).value,'assigned');
});
test('lost write reply stays locked across refresh and cannot duplicate a request update',async()=>{
 const f=fixture();await f.start();f.cost(0).value='8.125';f.state.lostUpdate=true;await f.save(0);assert.equal(f.rows[0].revision,2);await f.save(0);await f.refresh();await f.save(0);
 assert.equal(f.calls.filter(c=>c.kind==='update').length,1);assert.equal(f.cost(0).value,'8.125');assert.equal(f.button('حفظ الحالة والتكلفة',f.cards()[0]).disabled,true);
 await f.button('تجاهل التعديل المحلي واسترجاع المحفوظ',f.cards()[0]).onclick();assert.equal(f.cost(0).value,'8.125');assert.equal(f.button('حفظ الحالة والتكلفة',f.cards()[0]).disabled,false);
});
test('a readback for another request cannot confirm this save',async()=>{
 const f=fixture();await f.start();f.cost(0).value='3';f.state.badReadback=true;await f.save(0);assert.match(f.d.status.textContent,/لم يتأكد الحفظ/);assert.equal(f.button('حفظ الحالة والتكلفة',f.cards()[0]).disabled,true);
});
test('read permission revoked after a write clears private data and preserves the boundary error',async()=>{
 for(const error of [Object.assign(Error('denied'),{status:403}),Object.assign(Error('expired'),{status:401}),Object.assign(Error('permission'),{code:'42501'}),Error('ACCESS_DENIED')]){
  const f=fixture();await f.start();f.cost(0).value='3';f.cost(1).value='8';f.state.readbackError=error;await f.save(0);
  assert.equal(f.cards().length,0);assert.doesNotMatch(f.d.body.textContent,/طلب اختبار|مستأجر اختبار/);assert.equal(f.state.lastError,error,'dialog receives the original error and can close on permission revocation');
  assert.equal(f.calls.filter(c=>c.kind==='update').length,1);f.state.readbackError=null;await f.refresh();assert.equal(f.cost(0).value,'3');assert.equal(f.cost(1).value,'0','discarded draft cannot return');
 }
});
test('direct write denial clears every draft and propagates the original authorization error',async()=>{
 for(const error of [Object.assign(Error('provider private detail'),{status:403}),Object.assign(Error('expired'),{status:401}),Object.assign(Error('permission'),{code:'42501'}),Error('ACCESS_DENIED')]){
  const f=fixture();await f.start();f.cost(0).value='3';f.cost(1).value='8';f.state.updateError=error;await f.save(0);
  assert.equal(f.cards().length,0);assert.doesNotMatch(f.d.body.textContent,/طلب اختبار|مستأجر اختبار|عقار اختبار/);assert.equal(f.state.lastError,error);
  assert.equal(f.calls.filter(c=>c.kind==='update').length,1);assert.equal(f.calls.filter(c=>c.kind==='readback').length,0);assert.equal(f.rows[0].revision,1);
  f.state.updateError=null;await f.refresh();assert.equal(f.cost(0).value,'0');assert.equal(f.cost(1).value,'0');assert.equal(f.calls.filter(c=>c.kind==='update').length,1,'read recovery does not retry the denied write');
 }
});
test('direct 503 write failure retains input and blocks duplicate writes across refresh',async()=>{
 const f=fixture();await f.start();f.cost(0).value='3';f.cost(1).value='8';f.state.updateError=Object.assign(Error('unavailable'),{status:503});await f.save(0);
 assert.equal(f.cards().length,2);assert.equal(f.cost(0).value,'3');assert.equal(f.cost(1).value,'8');assert.match(f.d.status.textContent,/لم يتأكد الحفظ/);
 await f.save(0);await f.refresh();await f.save(0);assert.equal(f.calls.filter(c=>c.kind==='update').length,1);assert.equal(f.button('حفظ الحالة والتكلفة',f.cards()[0]).disabled,true);
 assert.equal(f.rows[0].revision,1);assert.equal(f.cost(0).value,'3');assert.equal(f.cost(1).value,'8');
});
test('temporary failure during post-save verification preserves input and prevents a duplicate write',async()=>{
 const f=fixture();await f.start();f.cost(0).value='3';f.cost(1).value='8';f.state.readbackError=Object.assign(Error('unavailable'),{status:503});await f.save(0);
 assert.equal(f.cards().length,2);assert.equal(f.cost(1).value,'8');assert.equal(f.button('حفظ الحالة والتكلفة',f.cards()[0]).disabled,true);await f.save(0);assert.equal(f.calls.filter(c=>c.kind==='update').length,1);
});
test('paging preserves local drafts and failed paging leaves the current page selected',async()=>{
 const f=fixture(51);await f.start();f.cost(0).value='9.250';await f.button('التالي').onclick();assert.equal(f.cards().length,1);await f.button('السابق').onclick();assert.equal(f.cost(0).value,'9.250');
 f.state.failList=true;await f.button('التالي').onclick();assert.equal(f.cards().length,50);assert.equal(f.button('السابق').hidden,true);assert.equal(f.cost(0).value,'9.250');
});
test('dialog disposal removes visible request data and retained local drafts',async()=>{
 const f=fixture();await f.start();f.cost(0).value='13';await f.refresh();f.close();assert.equal(f.cards().length,0);assert.doesNotMatch(f.d.body.textContent,/طلب اختبار|مستأجر اختبار/);
});
