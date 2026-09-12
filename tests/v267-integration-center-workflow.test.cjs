const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const initial={id:'config-001',revision:1,provider:'knet',purpose:'rent',mode:'sandbox',endpoint_origin:'https://payments.example.invalid',secret_reference:'vault/knet/sandbox',public_metadata:{currency:'KWD',region:'KW'}};

function fixture(configs=[]){
 const state={configs:structuredClone(configs),outbox:[],webhooks:[],lostResponse:false,corruptRead:false},calls=[];let serial=0;
 class Element{
  constructor(tag,text=''){this.tag=tag;this._text=text;this.children=[];this.value='';this.hidden=false;}
  append(...children){this.children.push(...children);if(this.tag==='select'&&!this.value)this.value=children[0]?.value||'';}
  replaceChildren(...children){this.children=children;}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
  set textContent(value){this._text=value;}
 }
 const node=(tag,text)=>new Element(tag,text),field=(text,control)=>{const result=node('label',text);result.append(control);return result;};
 const session={bound:{workspace:'workspace-001'},request:async value=>value,client:{async rpc(name,args){
  assert.equal(name,'aqari_external_integrations');assert.equal(args.p_workspace_id,'workspace-001');calls.push(structuredClone(args));
  if(args.p_action==='list'){
   const result=structuredClone({configs:state.configs,outbox:state.outbox,webhooks:state.webhooks});
   if(state.corruptRead&&result.configs.length)result.configs[0].endpoint_origin='https://wrong.example.invalid';
   return result;
  }
  if(args.p_action==='save'){
   const input=args.p_data,existing=state.configs.find(c=>c.id===input.id);
   if(existing&&existing.revision!==input.revision)throw Error('REVISION_CONFLICT');
   if(!existing&&state.configs.some(c=>c.provider===input.provider&&c.purpose===input.purpose))throw Error('DUPLICATE_CONFIG');
   const row={...structuredClone(input),revision:input.revision+1};
   if(existing)Object.assign(existing,row);else state.configs.push(row);
   if(state.lostResponse)throw Error('LOST_WRITE_RESPONSE');
   return structuredClone(row);
  }
  throw Error('UNEXPECTED_ACTION');
 }}};
 let busy=false;const cleanups=[];
 const d={body:node('div'),status:node('p'),session,closed:false,onDispose(fn){cleanups.push(fn);},close(){d.closed=true;for(const fn of cleanups)fn();},run(fn){
  if(busy||d.closed)return;busy=true;d.status.textContent='جارٍ الاتصال…';
  d.last=Promise.resolve().then(fn).catch(error=>{d.status.textContent=error.message;}).finally(()=>{busy=false;});return d.last;
 }};
 const context=vm.createContext({node,field,createDialog:()=>d,crypto:{randomUUID:()=>`draft-${++serial}`}});
 vm.runInContext(fs.readFileSync('src/v267/pages/integration-center.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,''),context);
 const walk=element=>[element,...element.children.flatMap(walk)];
 const button=text=>walk(d.body).find(e=>e.tag==='button'&&e.textContent===text);
 const control=text=>walk(d.body).find(e=>e.tag==='label'&&e._text===text).children[0];
 return {d,state,calls,button,control,async start(){context.openIntegrationCenter();await d.last;},async submit(){await walk(d.body).find(e=>e.tag==='form').onsubmit({preventDefault(){}});}};
}

test('a saved integration can be edited and disabled using the existing ID and revision',async()=>{
 const f=fixture([initial]);await f.start();f.button('تعديل الإعداد أو إيقافه').onclick();
 assert.equal(f.control('الغرض').value,'rent');assert.equal(f.control('الوضع').value,'sandbox');
 f.control('الوضع').value='disabled';await f.submit();
 const writes=f.calls.filter(call=>call.p_action==='save');assert.equal(writes.length,1);assert.equal(writes[0].p_data.id,initial.id);assert.equal(writes[0].p_data.revision,1);
 assert.equal(f.state.configs.length,1);assert.equal(f.state.configs[0].mode,'disabled');assert.equal(f.state.configs[0].revision,2);
 assert.match(f.d.status.textContent,/تم الحفظ والتحقق/);assert.ok(f.button('إلغاء التعديل').hidden);assert.equal(f.control('الغرض').value,'');
});

test('a lost create response is recovered by exact readback without a duplicate config',async()=>{
 const f=fixture();await f.start();f.control('الغرض').value='rent';f.state.lostResponse=true;await f.submit();
 assert.equal(f.state.configs.length,1);assert.equal(f.calls.filter(call=>call.p_action==='save').length,1);assert.match(f.d.status.textContent,/تم الحفظ والتحقق/);
});

test('readback verifies the full config, retains an uncertain draft ID, and recovers on retry',async()=>{
 const f=fixture();await f.start();f.control('الغرض').value='rent';f.control('Origin HTTPS فقط').value='https://payments.example.invalid';f.state.corruptRead=true;await f.submit();
 assert.match(f.d.status.textContent,/تعذر إثبات الحفظ/);assert.equal(f.control('الغرض').value,'rent');
 f.state.corruptRead=false;await f.submit();const writes=f.calls.filter(call=>call.p_action==='save');
 assert.equal(writes.length,2);assert.equal(writes[0].p_data.id,writes[1].p_data.id);assert.equal(f.state.configs.length,1);assert.equal(f.state.configs[0].revision,1);assert.match(f.d.status.textContent,/تم الحفظ والتحقق/);
});

test('a concurrent revision cannot be overwritten or reported as the requested edit',async()=>{
 const f=fixture([initial]);await f.start();f.button('تعديل الإعداد أو إيقافه').onclick();f.control('الوضع').value='disabled';
 f.state.configs[0].revision=2;f.state.configs[0].purpose='concurrent-change';await f.submit();
 assert.equal(f.d.status.textContent,'REVISION_CONFLICT');assert.equal(f.state.configs[0].purpose,'concurrent-change');assert.equal(f.state.configs[0].mode,'sandbox');assert.equal(f.state.configs[0].revision,2);
});

test('cancel and refresh never save a configuration, and non-object metadata is rejected',async()=>{
 const f=fixture([initial]);await f.start();f.button('تعديل الإعداد أو إيقافه').onclick();f.button('إلغاء التعديل').onclick();
 assert.equal(f.control('الغرض').value,'');await f.button('تحديث حالة التكاملات').onclick();assert.equal(f.calls.filter(call=>call.p_action==='save').length,0);
 for(const value of ['null','[]','"text"']){f.control('بيانات عامة JSON').value=value;await f.submit();assert.match(f.d.status.textContent,/كائن JSON/);}
 assert.equal(f.calls.filter(call=>call.p_action==='save').length,0);
});
