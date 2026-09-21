const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let localeBindings;
test.before(async()=>{const locale=await import('../src/v267/components/locale.js');localeBindings={translateStatic:locale.t,visibleText:locale.t,visibleMessage:locale.message,dateLocale:locale.dateLocale};});
const runtimeSource=fs.readFileSync('v267-rental-records.js','utf8');
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(status='approved'){
 const record={id:123,source:'v267-cloud',contract_no:'SYNTHETIC-123',status,property:'عقار اختبار',unit:'4',rent:90.125,contractRent:100.125,discount:10,writtenOn:'2026-09-09',tenantProfile:{nameAr:'مستأجر اختبار',nameEn:'Synthetic <Tenant>'},clauses:[],rentAdjustments:[]};
 const state={reads:0,record,rows:null,workspace:'test-workspace',format:'direct',afterRead:null,fail:false,hang:false};
 const scope={userId:'test-user',workspaceId:'test-workspace'};
 const context={module:{exports:{}},document:{documentElement:{classList:{contains:()=>true}}},setTimeout,clearTimeout,
  AQARI_DATA_GATE:{scope:clone(scope)},AQARI_EARLY_STORAGE_GATE:{scope:clone(scope)},
  db:{contractsV202:[{...record,status:'signed',contract_no:'UNTRUSTED-LOCAL'}]},
  AQARI_SUPABASE:{context:{user:{id:scope.userId},workspace:{id:scope.workspaceId},membership:{user_id:scope.userId,workspace_id:scope.workspaceId,is_active:true,role:'general_manager'}},
   async loadAppState(bound){state.reads++;assert.equal(bound.role,'general_manager');if(state.fail)throw Error('read denied');if(state.hang)return new Promise(()=>{});
    const db={contractsV202:clone(state.rows||[state.record])};const payload=state.format==='envelope'?{format:'aqari-cloud-state-v1',snapshot:{values:{aqari_v30:db}}}:state.format==='snapshot'?{schema:'aqari-local-snapshot-v1',values:{aqari_v30:db}}:db;
    state.afterRead?.();return {workspace_id:state.workspace,revision:7,payload};
   }}
 };
 vm.runInNewContext(runtimeSource,context);
 return {api:context.module.exports,state,context};
}
test('official issuance uses fresh saved approval and never the local signed copy',async()=>{
 const f=fixture('draft');await assert.rejects(f.api.prepareContractPrint(123),/اعتماد المدير العام/);assert.equal(f.state.reads,1);
 f.state.record.status='approved';const file=await f.api.prepareContractPrint(123);assert.equal(f.state.reads,2);assert.equal(file.revision,7);
 assert.match(file.html,/SYNTHETIC-123/);assert.doesNotMatch(file.html,/UNTRUSTED-LOCAL|NOT FOR SIGNATURE/);assert.match(file.html,/توقيع المستأجر/);
 f.state.record.status='cancelled';await assert.rejects(f.api.prepareContractPrint(123),/اعتماد المدير العام/);
});
test('every non-approved or unknown saved state rejects official issuance',async()=>{
 for(const status of ['draft','ready','cancelled','expired','unknown',undefined]){const f=fixture(status);f.state.record.status=status;await assert.rejects(f.api.prepareContractPrint(123),/اعتماد المدير العام/);}
 for(const status of ['approved','signing','signed']){const f=fixture(status);assert.equal((await f.api.prepareContractPrint(123)).mode,'official');}
});
test('each draft contract and annex is marked and omits signature fields, even with an approved input',async()=>{
 const f=fixture();for(const html of [f.api.contractMarkup(f.state.record,2),f.api.contractAnnexMarkup(f.state.record),(await f.api.prepareContractPrint(123,2,'draft')).html]){
  assert.match(html,/DRAFT — NOT FOR SIGNATURE/);assert.doesNotMatch(html,/________________|data-contract-print="approved"/);
  assert.equal((html.match(/class="v267-draft-notice"/g)||[]).length,(html.match(/class="v267-contract-copy"/g)||[]).length*2);
 }
});
test('two issued sets each include an identical contract and annex from one saved revision',async()=>{
 const f=fixture();const file=await f.api.prepareContractPrint(123,2);
 assert.equal(f.state.reads,1);assert.equal((file.html.match(/class="v267-contract-copy"/g)||[]).length,4);
 const sets=Array.from(file.html.matchAll(/<section data-contract-set="\d">([\s\S]*?)<\/section>/g),m=>m[1]);
 assert.equal(sets.length,2);assert.equal(sets[0].replace('نسخة 1 من 2','نسخة N من 2'),sets[1].replace('نسخة 2 من 2','نسخة N من 2'));
 assert.doesNotMatch(file.html,/نسخة 1 من 1|<Tenant>/);assert.match(file.html,/Synthetic &lt;Tenant&gt;/);
});
test('contract copies retain original rent and keep collection discounts out of the contract and annex',async()=>{
 for(const mode of ['draft','official'])for(const count of [1,2]){
  const f=fixture();Object.assign(f.state.record,{rentalTermsVersion:1,deposit:250.375,advance:35.875,cleaningFee:7.625,freeMonthApproved:true,freeMonthPeriod:'2026-10',rentAdjustments:[{effectiveMonth:'2026-11',discount:20,rent:80.125,reason:'Saved collection-only adjustment'}]});
  const before=clone(f.state.record),file=await f.api.prepareContractPrint(123,count,mode);
  assert.equal(file.revision,7);assert.equal(f.state.reads,1);assert.deepEqual(f.state.record,before);
  assert.equal((file.html.match(/الإيجار عند كتابة العقد:<\/b> <bdi dir="auto">100\.125<\/bdi>/g)||[]).length,count);
  assert.equal((file.html.match(/الإيجار الأصلي \/ Original rent:<\/b> <bdi>100\.125<\/bdi>/g)||[]).length,count);
  assert.doesNotMatch(file.html,/الخصم|Discount|Dated rent adjustments|90\.125|80\.125|Saved collection-only adjustment/);
  for(const value of ['250.375','35.875','7.625','2026-10'])assert.ok(file.html.includes(value));
 }
});
test('hiding calculated collection fields does not alter saved contractual clauses',async()=>{
 const f=fixture();f.state.record.clauses=[{title:'بند محفوظ',text:'صياغة أصلية محفوظة عن الخصم لا يعيد العارض تحريرها <source>'}];
 const before=clone(f.state.record),file=await f.api.prepareContractPrint(123,2);
 assert.equal((file.html.match(/صياغة أصلية محفوظة عن الخصم لا يعيد العارض تحريرها &lt;source&gt;/g)||[]).length,2);
 assert.deepEqual(f.state.record,before);assert.doesNotMatch(file.html,/<source>|الإيجار الحالي بعد الخصم|تعديلات الخصم المؤرخة/);
});
test('all supported server payload formats use the same printing gate',async()=>{
 for(const format of ['direct','envelope','snapshot']){const f=fixture();f.state.format=format;assert.equal((await f.api.prepareContractPrint('123')).contractId,'123');}
});
test('missing, ambiguous, imported and cross-workspace records cannot be issued',async()=>{
 for(const change of [f=>{f.state.rows=[];f.state.record.id=456;},f=>{f.state.rows=[f.state.record,f.state.record];},f=>{f.state.record.source='statement-import';},f=>{f.state.workspace='other-workspace';}]){
  const f=fixture();change(f);await assert.rejects(f.api.prepareContractPrint(123),/العقد|مساحة العمل/);
 }
});
test('session, membership, role or data-gate changes during the read discard the document',async()=>{
 for(const change of [c=>c.AQARI_SUPABASE.context.user.id='other',c=>c.AQARI_SUPABASE.context.workspace.id='other',c=>c.AQARI_SUPABASE.context.membership.is_active=false,c=>c.AQARI_SUPABASE.context.membership.role='accountant',c=>c.AQARI_DATA_GATE.scope=null]){
  const f=fixture();f.state.afterRead=()=>change(f.context);await assert.rejects(f.api.prepareContractPrint(123),/جلسة الدخول/);
 }
 const f=fixture();f.context.AQARI_SUPABASE.context.membership.is_active=false;await assert.rejects(f.api.prepareContractPrint(123));assert.equal(f.state.reads,0);
});
test('invalid mode or copies are rejected before reading, and read errors have no local fallback',async()=>{
 const f=fixture();for(const args of [[123,3,'official'],[123,1,'<html>cached</html>'],['',1,'draft']])await assert.rejects(f.api.prepareContractPrint(...args),/غير صالح/);
 assert.equal(f.state.reads,0);f.state.fail=true;await assert.rejects(f.api.prepareContractPrint(123),/read denied/);
});
test('a hanging authoritative read times out without issuing a document',async()=>{
 const f=fixture();f.context.setTimeout=(fn)=>setTimeout(fn,5);f.state.hang=true;await assert.rejects(f.api.prepareContractPrint(123),/مهلة الاتصال/);
});

function pageFixture(){
 const descendants=x=>[x,...x.children.flatMap(descendants)];
 class Element{constructor(tag,text=''){this.tag=tag;this.style={};this.children=[];this.textContent=text;}setAttribute(name,value){this[name]=value;}append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}}
 const node=(tag,text)=>new Element(tag,text),created=[],released=[],calls=[];let closed=false;
 const state={fail:false,pending:null};
 const api={async prepareContractPrint(...args){calls.push(args);if(state.pending)await state.pending;if(state.fail)throw Error('اعتماد المدير العام مطلوب');return {html:'<html>saved synthetic contract</html>'};}};
 const urls={create(blob){if(closed)throw Error('closed');created.push(blob);return 'blob:fixture-'+created.length;},release(url){released.push(url);}};
 const d={body:node('div'),status:node('p'),session:{check(){if(closed)throw Error('closed');}},run(task){d.pending=Promise.resolve().then(task).catch(error=>{d.status.textContent=error.message;});return d.pending;}};
 const page=fs.readFileSync('src/v267/pages/rental-contracts.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
 const context={...localeBindings,node,createDialog:()=>d,createPage:()=>d,createPrivateUrls:()=>urls,window:{AQARI_RENTAL_RECORDS:api},Blob};vm.createContext(context);vm.runInContext(page,context);
 return {d,state,calls,created,released,open:()=>context.openContractPrint(123,2,'official'),links:()=>descendants(d.body).filter(e=>e.tag==='a'),retry:()=>descendants(d.body).find(e=>e.tag==='button').onclick(),close:()=>{closed=true;}};
}
test('print dialog creates no file until verified and clears an old file before a denied retry',async()=>{
 const f=pageFixture();f.open();assert.equal(f.created.length,0);await f.d.pending;assert.deepEqual(f.calls,[[123,2,'official']]);assert.equal(f.links().length,1);assert.match(await f.created[0].text(),/saved synthetic/);
 f.state.fail=true;await f.retry();assert.deepEqual(f.released,['blob:fixture-1']);assert.equal(f.links().length,0);assert.equal(f.created.length,1);assert.match(f.d.status.textContent,/اعتماد المدير العام/);
});
test('closing during preparation prevents creation of a late private file',async()=>{
 const f=pageFixture();let resolve;f.state.pending=new Promise(r=>{resolve=r;});f.open();await new Promise(r=>setImmediate(r));f.close();resolve();await f.d.pending;assert.equal(f.links().length,0);assert.equal(f.created.length,0);
});

test('rental page initializes its runtime on a direct first visit and shares legacy state',()=>{
 const {spawnSync}=require('node:child_process');
 for(const legacyFirst of [false,true]){
  const script=`
   import assert from 'node:assert/strict';
   import fs from 'node:fs';
   import vm from 'node:vm';
   globalThis.window={document:{},addEventListener(){}};
   const source=fs.readFileSync('v267-rental-records.js','utf8');
   const legacy=()=>vm.runInNewContext(source,{window});
   if(${legacyFirst})legacy();
   const previous=window.AQARI_RENTAL_RECORDS;
   await import('./src/v267/pages/rental-contracts.js');
   const api=window.AQARI_RENTAL_RECORDS;
   for(const method of ['primary','saveLease','prepareContractPrint'])assert.equal(typeof api?.[method],'function');
   if(previous)assert.equal(api,previous);
   const list=window.loadContractsV55;
   legacy();
   assert.equal(window.AQARI_RENTAL_RECORDS,api);
   assert.equal(window.loadContractsV55,list);
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:require('node:path').join(__dirname,'..'),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
 }
});
