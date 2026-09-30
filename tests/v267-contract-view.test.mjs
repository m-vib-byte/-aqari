import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {readStoredOriginal} from '../src/v267/components/stored-original.js';
import {checksum} from '../src/v267/components/scan-image.js';
import {groupRentalContractsByProperty,assertContractProperty,resolveContractPropertyBinding,resolveRentalDocumentContext,linkedDocumentFieldKeys} from '../src/v267/domain/rental-document-cycle.js';
const source=readFileSync(new URL('../src/v267/pages/rental-contracts.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'').replace("import('./contract-execution.js')",'loadExecution()').replace("import('./property-statements.js')",'loadStatements()');
function fixture({imported=false,closedAfterRead=false,status='signed',role='staff',moduleFailure=false,closeDuringImport=false,contractOverrides={},profiles=[],historyFailures=0,documentFailures=0,emptyDocuments=false,documentsError=false,stateFailures=0,connectionFailures=0,secondBuilding=false,unbound=false,renamedProperty=false}={}){
 const calls=[],tasks=[],urls=[],queries=[];let closed=false;const attachment={id:'doc',workspace_id:'workspace',status:'uploaded',entity_type:'lease',entity_ref:'123',original_filename:'original.pdf',storage_bucket:'aqari-documents',storage_path:'workspace/original.pdf',checksum_sha256:null,size_bytes:null};
 class Element{constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.value='';this.style={};this.dataset={};this.classList={add(){}};}addEventListener(){}reportValidity(){return true;}setAttribute(name,value){this[name]=value;}prepend(...nodes){this.children.unshift(...nodes);}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}}
 const node=(tag,text)=>new Element(tag,text);
 const contract={id:123,contract_no:'C-123',tenant:'Test Tenant',tenantId:'tenant-1',property:'Test property',unit:'1',status,source:imported?'statement-import':'v267-cloud',...contractOverrides};
 const contracts=[contract],db={aqari_properties:[{id:'property-a',workspace_id:'workspace',name:renamedProperty?'Renamed property':contract.property}],aqari_units:[{id:'unit-a',workspace_id:'workspace',property_id:'property-a',unit_no:contract.unit}],aqari_leases:[{id:'lease-a',workspace_id:'workspace',external_ref:String(contract.id),unit_id:'unit-a',tenant_id:'db-tenant-a'}],aqari_tenants:[{id:'db-tenant-a',workspace_id:'workspace',external_ref:contract.tenantId}]};
 if(secondBuilding){contracts.push({...contract,id:456,contract_no:'OTHER-456',property:'Other property',tenantId:'tenant-2',tenant:'Other tenant',unit:'1'});db.aqari_properties.push({id:'property-b',workspace_id:'workspace',name:'Other property'});db.aqari_units.push({id:'unit-b',workspace_id:'workspace',property_id:'property-b',unit_no:'1'});db.aqari_leases.push({id:'lease-b',workspace_id:'workspace',external_ref:'456',unit_id:'unit-b',tenant_id:'db-tenant-b'});db.aqari_tenants.push({id:'db-tenant-b',workspace_id:'workspace',external_ref:'tenant-2'});}
 if(unbound)contracts.push({id:'unbound',contract_no:'UNBOUND-1',tenant:'Unbound tenant',property:contract.property,unit:contract.unit});
 const api={saveLease:async candidate=>{calls.push('saveLease');calls.push(candidate);contracts.push(candidate);db.aqari_leases.push({id:'new-lease',workspace_id:'workspace',external_ref:String(candidate.id),unit_id:candidate.unitId,tenant_id:'db-tenant-a'});},primary:x=>x,contractMarkup:()=>'<p>saved contract</p>',kuwaitDate:()=> '2026-09-21',effectiveRent:()=>350};
 const session={bound:{workspace:'workspace',user:'manager',role},check(){if(closed)throw Error('closed');},client:{rpc(name,args){calls.push(name);return {name,args};},from(table){calls.push(table);const query={table,filters:[],start:0,end:Infinity};queries.push(query);query.select=()=>query;query.eq=(name,value)=>{query.filters.push([name,value]);return query;};query.order=()=>query;query.single=()=>{query.isSingle=true;return query;};query.range=(start,end)=>{query.start=start;query.end=end;return query;};return query;}},async request(query){if(query.name==='aqari_read_state_v267'){if(stateFailures-->0)throw Error('state temporarily unavailable');if(closedAfterRead)closed=true;return {workspace_id:'workspace',payload:{contractsV202:contracts,tenantProfilesV267:profiles}};}if(query.name==='aqari_property_contract_context')return {workspace_id:'workspace',user_id:'manager',property:db.aqari_properties.find(row=>row.id===query.args.p_property_id),unit:{id:query.args.p_unit_id,propertyId:query.args.p_property_id}};if(query.name==='aqari_contract_history'){if(historyFailures-->0)throw Error('history temporarily unavailable');return [];}if(query.table==='aqari_documents'&&(documentsError||documentFailures-->0))throw Error('attachment read unavailable');if(query.table==='aqari_documents'&&emptyDocuments)return [];if(query.table==='aqari_documents')return query.isSingle?attachment:[attachment];if(db[query.table])return db[query.table].filter(row=>query.filters.every(([name,value])=>row[name]===value)).slice(query.start,query.end+1);throw Error('unrelated property read denied');},async storage(method,path){calls.push(method+':'+path);return new Blob(['saved original']);}};
 const d={el:node('dialog'),body:node('div'),status:node('p'),session,run(fn){const task=Promise.resolve().then(()=>{if(connectionFailures-->0)throw Error('connection unavailable');return fn();});tasks.push(task);this.pending=task;return task;},navigate(fn){return this.run(fn);},close(){calls.push('close-dialog');closed=true;}};
 const context={readStoredOriginal,crypto,resolveRentalDocumentContext,linkedDocumentFieldKeys,groupRentalContractsByProperty,assertContractProperty,resolveContractPropertyBinding,mountContractChangeRequest:()=>{},mountSignatureReview:async()=>{},mountRentalTemplatePicker:async(d,target,options)=>{options.onChange({id:'fixture-template'});return {values:()=>({}),setValues(){}};},templateForContract:()=>({clauses:[]}),requireContractIdentity:()=>{},guardPageImport:load=>load(),currentMonth:()=> '2026-09',loadStatements:async()=>{calls.push('load-statements');if(moduleFailure)throw Error('module unavailable');if(closeDuringImport)closed=true;return {openPropertyStatements(options){assert.equal(closed,true);calls.push(options);}};},loadExecution:async()=>{calls.push('load-execution');if(moduleFailure)throw Error('module unavailable');if(closeDuringImport)closed=true;return {openContractExecution(id,options){assert.equal(closed,true);assert.equal(typeof options.onDone,'function');calls.push('execution:'+id);return true;}};},Blob,node,field:(label,control)=>control,translateStatic:x=>x,createPage:()=>d,createPrivateUrls:()=>({clear(){},create(blob){urls.push(blob);return 'blob:verified-original';}}),window:{AQARI_RENTAL_RECORDS:api}};
 context.t=x=>x;vm.runInNewContext(readFileSync(new URL('../src/v267/components/pdf-viewer.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'')+'\n'+source,context);
 const all=(root=d.body)=>[root,...root.children.flatMap(x=>all(x))];
 return {calls,queries,db,contracts,d,urls,all,attachment,open:async initial=>{context.openRentalContracts(initial);await tasks.at(-1);},click:async el=>{el.onclick();await tasks.at(-1);}};
}
test('the first contracts page shows property cards with counts and no mixed contracts list',async()=>{
 const f=fixture({secondBuilding:true});await f.open({});const cards=f.all().filter(x=>x.dataset?.propertyId);assert.equal(cards.length,2);assert.equal(f.all().some(x=>x.textContent.includes('C-123')),false);assert.equal(f.all().some(x=>x.textContent.includes('OTHER-456')),false);assert.equal(f.all().some(x=>x.tag==='input'),false);
});
test('the contracts home library entry is visible only to the general manager',async()=>{
 for(const role of ['staff','property_manager','general_manager']){const f=fixture({role,secondBuilding:true});await f.open({});assert.equal(f.all().some(x=>x.tag==='button'&&x.textContent==='فتح مكتبة النماذج والحقول الخاصة'),role==='general_manager');assert.equal(f.all().filter(x=>x.dataset?.propertyId).length,2);assert.equal(f.calls.includes('saveLease'),false);}
});
test('selected contract resolves its property and unit before showing any record',async()=>{
 const f=fixture();await f.open({id:123});assert.ok(f.all().some(x=>x.innerHTML==='<p>saved contract</p>'));assert.equal(f.calls.includes('aqari_documents'),false);assert.equal(f.calls.includes('aqari_contract_history'),false);assert.equal(f.calls.includes('aqari_units'),true);
});
test('imported contract exposes its original attachment without enabling official issuance',async()=>{
 const f=fixture({imported:true});await f.open({id:123});const file=f.all().find(x=>x.textContent==='original.pdf');assert.ok(file);assert.equal(f.all().some(x=>x.textContent.includes('Prepare approved copy')),false);await f.click(file);assert.ok(f.calls.includes('GET:workspace/original.pdf'));assert.equal(f.urls.length,1);assert.equal(f.all().find(x=>x.tag==='iframe').src,'blob:verified-original');assert.match(f.d.status.textContent,/بلا بصمة محفوظة/);
});
test('an imported contract never previews stored bytes that differ from its saved checksum',async()=>{
 const f=fixture({imported:true});f.attachment.checksum_sha256=await checksum(new Blob(['saved original']));f.attachment.size_bytes=14;
 f.d.session.storage=async()=>new Blob(['other original']);await f.open({id:123});
 await assert.rejects(f.click(f.all().find(x=>x.textContent==='original.pdf')),/بصمة الملف المسترجع/);assert.equal(f.urls.length,0);assert.equal(f.all().some(x=>x.tag==='iframe'),false);
});
test('a closed session cannot render contracts from a late state response',async()=>{
 const f=fixture({closedAfterRead:true});await assert.rejects(f.open({}),/closed/);assert.equal(f.all().some(x=>x.textContent.includes('C-123')),false);
});

test('normalized grouping reads are scoped and include independent property, unit, lease and tenant IDs',async()=>{
 const f=fixture();await f.open({});assert.deepEqual(f.queries.map(q=>q.table),['aqari_properties','aqari_units','aqari_leases','aqari_tenants']);for(const query of f.queries)assert.ok(query.filters.some(([key,value])=>key==='workspace_id'&&value==='workspace'));
});

test('signing opens the settlement dialog after closing the contract, without a direct signed write',async()=>{
 const f=fixture({status:'signing',role:'general_manager'});await f.open({id:123});
 await f.click(f.all().find(x=>x.tag==='button'&&x.textContent==='نقل إلى: موقّع'));
 assert.deepEqual(f.calls.slice(-3),['load-execution','close-dialog','execution:123']);assert.equal(f.calls.includes('saveLease'),false);
});
test('non-managers cannot open final settlement from the contract',async()=>{
 const f=fixture({status:'signing'});await f.open({id:123});
 assert.equal(f.all().some(x=>x.tag==='button'&&x.textContent==='نقل إلى: موقّع'),false);
 assert.equal(f.calls.includes('load-execution'),false);assert.equal(f.calls.includes('saveLease'),false);
});
test('module failure preserves the contract dialog for retry; a late import cannot reopen a closed session',async()=>{
 for(const options of [{moduleFailure:true},{closeDuringImport:true}]){
  const f=fixture({status:'signing',role:'general_manager',...options});await f.open({id:123});
  await assert.rejects(f.click(f.all().find(x=>x.tag==='button'&&x.textContent==='نقل إلى: موقّع')),/module unavailable|closed/);
  assert.equal(f.calls.includes('close-dialog'),false);assert.equal(f.calls.includes('execution:123'),false);
 }
});

test('contract search supports unit, property, Arabic digits and linked bilingual tenant names',async()=>{
 const f=fixture({contractOverrides:{unit:'٤٠١',property:'برج أحمد',tenantId:'tenant'},profiles:[{id:'tenant',nameAr:'محمد سالم',nameEn:'Mohammed Salem'}]});
 await f.open({propertyId:'property-a'});const search=f.all().find(x=>x.tag==='input');
 for(const query of ['401','۴۰۱','احمد','محمد','mohammed salem','C-١٢٣','احمد 401']){
  search.value=query;search.oninput();assert.ok(f.all().some(x=>x.textContent.includes('C-123')),query);
 }
 search.value='402';search.oninput();assert.equal(f.all().some(x=>x.textContent.includes('C-123')),false);
});
test('contract statement handoff preserves the property and month and supports returning to the same contract',async()=>{
 const f=fixture();await f.open({id:123});await f.click(f.all().find(x=>x.textContent==='كشوف العقارات المحفوظة'));
 assert.deepEqual(f.calls.slice(-3,-1),['load-statements','close-dialog']);
 const options=f.calls.at(-1);assert.equal(options.propertyName,'Test property');assert.equal(options.period,'2026-09');assert.equal(typeof options.onBack,'function');
});
test('failed statement imports preserve the contract and closed sessions cannot open a statement',async()=>{
 for(const options of [{moduleFailure:true},{closeDuringImport:true}]){
  const f=fixture(options);await f.open({id:123});
  await assert.rejects(f.click(f.all().find(x=>x.textContent==='كشوف العقارات المحفوظة')),/module unavailable|closed/);
  assert.equal(f.calls.includes('close-dialog'),false);assert.equal(f.calls.some(x=>typeof x==='object'),false);
 }
});


test('attachments and history are requested separately after the contract preview is ready',async()=>{
 const f=fixture();await f.open({id:123});assert.deepEqual(f.calls,['aqari_read_state_v267','aqari_properties','aqari_units','aqari_leases','aqari_tenants']);
 await f.click(f.all().find(x=>x.textContent==='عرض المرفقات المحفوظة'));
 assert.ok(f.calls.includes('aqari_documents'));assert.equal(f.calls.includes('aqari_contract_history'),false);
 assert.ok(f.all().some(x=>x.textContent==='original.pdf'));
 await f.click(f.all().find(x=>x.textContent==='عرض سجل العقد والنسخ السابقة'));
 assert.ok(f.calls.includes('aqari_contract_history'));
});

test('unavailable attachments do not prevent opening or retaining the saved contract',async()=>{
 const f=fixture({documentsError:true});await f.open({id:123});
 await assert.rejects(f.click(f.all().find(x=>x.textContent==='عرض المرفقات المحفوظة')),/attachment read unavailable/);
 assert.ok(f.all().some(x=>x.innerHTML==='<p>saved contract</p>'));
 assert.equal(f.calls.includes('close-dialog'),false);
});

test('a failed initial list read keeps a refresh action that can recover',async()=>{
 const f=fixture({stateFailures:1});await assert.rejects(f.open({}),/state temporarily unavailable/);
 const retry=f.all().find(x=>x.tag==='button'&&x.textContent==='تحديث العقود / Refresh');assert.ok(retry);
 assert.equal(f.all().some(x=>x.textContent.includes('C-123')),false);
 await f.click(retry);assert.ok(f.all().some(x=>x.dataset?.propertyId==='property-a'));
 assert.equal(f.calls.includes('saveLease'),false);
});
test('a failed direct contract read keeps both retry and back navigation',async()=>{
 const f=fixture({stateFailures:1});await assert.rejects(f.open({id:123}),/state temporarily unavailable/);
 assert.ok(f.all().some(x=>x.textContent==='العودة للعقود / Back'));
 const retry=f.all().find(x=>x.tag==='button'&&x.textContent==='إعادة المحاولة');assert.ok(retry);
 await f.click(retry);assert.ok(f.all().some(x=>x.innerHTML==='<p>saved contract</p>'));
 assert.equal(f.calls.includes('saveLease'),false);
});
test('a missing contract still permits returning to the saved contract list',async()=>{
 const f=fixture();await assert.rejects(f.open({id:'missing'}),/العقد غير موجود/);
 const back=f.all().find(x=>x.textContent==='العودة للعقود / Back');assert.ok(back);
 await f.click(back);assert.ok(f.all().some(x=>x.dataset?.propertyId==='property-a'));
});

test('initial connection failure retains a retry action before any page task runs',async()=>{
 const f=fixture({connectionFailures:1});await assert.rejects(f.open({id:123}),/connection unavailable/);
 assert.deepEqual(f.calls,[]);
 const retry=f.all().find(x=>x.tag==='button'&&x.textContent==='إعادة المحاولة');assert.ok(retry);
 await f.click(retry);assert.ok(f.all().some(x=>x.innerHTML==='<p>saved contract</p>'));
});

test('missing originals are explained without presenting a file link',async()=>{
 const f=fixture({emptyDocuments:true});await f.open({id:123});await f.click(f.all().find(x=>x.textContent==='عرض المرفقات المحفوظة'));assert.ok(f.all().some(x=>x.textContent.includes('لا توجد نسخة أصلية مرفوعة')));assert.equal(f.all().some(x=>x.tag==='a'),false);
});

test('imported contract attachment failure preserves explanation and can recover in place',async()=>{
 const f=fixture({imported:true,documentFailures:1});await assert.rejects(f.open({id:123}),/attachment read unavailable/);
 assert.ok(f.all().some(x=>x.textContent.includes('هذا عقد مستورد محفوظ للمراجعة')));
 const retry=f.all().find(x=>x.textContent==='إعادة تحميل مرفقات العقد');assert.ok(retry);await f.click(retry);
 assert.ok(f.all().some(x=>x.textContent==='original.pdf'));await f.click(retry);
 assert.equal(f.all().filter(x=>x.textContent==='original.pdf').length,1);
 assert.equal(f.all().some(x=>x.textContent.includes('Prepare approved copy')),false);
});


test('source review contracts are visually separated from operational contracts',()=>{
 assert.match(source,/card\.dataset\.contractMode=sourceOnly\?'source_review':'operational'/);
 assert.match(source,/مصدر للمراجعة — غير تشغيلي/);
 assert.match(source,/لا يحتسب إشغالاً أو تحصيلاً ولا يمنع عقداً تشغيلياً جديداً/);
 assert.match(source,/العقود التشغيلية:/);
 assert.match(source,/عقود المصدر للمراجعة:/);
});



for(const [label,options,error]of [['عرض المرفقات المحفوظة',{documentFailures:1},/attachment read unavailable/],['متابعة العقد',{historyFailures:1},/history temporarily unavailable/]]){
 test(label+' keeps retry and returns the same contract after a temporary failure',async()=>{
  const f=fixture(options);await f.open({propertyId:'property-a'});await f.click(f.all().find(x=>x.dataset?.unitId==='unit-a'));
  await assert.rejects(f.click(f.all().find(x=>x.tag==='button'&&x.textContent.includes(label))),error);
  const retry=f.all().find(x=>x.tag==='button'&&x.textContent==='إعادة المحاولة');assert.ok(retry);
  await f.click(retry);assert.ok(f.all().some(x=>x.textContent==='C-123'));
  assert.equal(f.calls.includes('saveLease'),false);
  await f.click(f.all().find(x=>x.tag==='button'&&x.textContent==='إعادة المحاولة'));
  assert.equal(f.all().filter(x=>x.tag==='h3'&&x.textContent==='C-123').length,1);
 });
}
test('contract approval inbox denies staff and excludes historical source rows',async()=>{
 const staff=fixture();await assert.rejects(staff.open({mode:'approval'}),/اعتماد المدير/);
 const historical=fixture({role:'general_manager',imported:true,status:'ready'});await historical.open({propertyId:'property-a',mode:'approval'});assert.equal(historical.all().some(x=>x.textContent==='C-123'),false);
 const manager=fixture({role:'general_manager',status:'ready'});await manager.open({propertyId:'property-a',mode:'approval'});assert.ok(manager.all().some(x=>x.textContent.includes('C-123')));
});


test('two buildings sharing unit number cannot leak through property search or unit navigation',async()=>{
 const f=fixture({secondBuilding:true});await f.open({propertyId:'property-a'});assert.equal(f.all().some(x=>x.textContent.includes('OTHER-456')),false);const search=f.all().find(x=>x.name==='property_contract_search');search.value='Other tenant';search.oninput();assert.equal(f.all().some(x=>x.dataset?.unitId),false);search.value='1';search.oninput();assert.equal(f.all().filter(x=>x.dataset?.unitId).length,1);await f.click(f.all().find(x=>x.dataset?.unitId==='unit-a'));assert.equal(f.all().some(x=>x.textContent.includes('OTHER-456')),false);assert.ok(f.all().some(x=>x.textContent.includes('C-123')));
});
test('a cross-property deep link fails before rendering tenant or contract content',async()=>{
 const f=fixture({secondBuilding:true});await assert.rejects(f.open({propertyId:'property-a',id:456}),/لا يتبع العقار/);assert.equal(f.all().some(x=>x.innerHTML),false);assert.equal(f.all().some(x=>x.textContent.includes('Other tenant')),false);
});
test('renaming a property keeps contract grouping stable through its UUID',async()=>{
 const f=fixture({renamedProperty:true});await f.open({});assert.ok(f.all().some(x=>x.textContent==='Renamed property'));await f.click(f.all().find(x=>x.dataset?.propertyId==='property-a'));const search=f.all().find(x=>x.name==='property_contract_search');search.value='Renamed';search.oninput();assert.ok(f.all().some(x=>x.textContent.includes('C-123')));await f.click(f.all().find(x=>x.dataset?.unitId==='unit-a'));await f.click(f.all().find(x=>x.tag==='button'&&x.textContent==='عرض العقد — C-123'));assert.ok(f.all().some(x=>x.textContent.includes('Renamed property')));
});
test('unbound legacy records remain counted and visible without guessing property from identical names',async()=>{
 const f=fixture({unbound:true});await f.open({});assert.ok(f.all().some(x=>x.textContent.includes('سجلات محفوظة تحتاج مراجعة الربط: 1')));assert.ok(f.all().some(x=>x.textContent.includes('UNBOUND-1')));await f.click(f.all().find(x=>x.dataset?.propertyId==='property-a'));assert.equal(f.all().some(x=>x.textContent.includes('UNBOUND-1')),false);
});


test('new contract creation is locked to property UUID and rejects forged property and unit selections',async()=>{
 const f=fixture({secondBuilding:true,renamedProperty:true,role:'general_manager',profiles:[{id:'tenant-1',nameAr:'Test Tenant'}]});await f.open({propertyId:'property-a',create:true});const property=f.all().find(x=>x.name==='contract_property_id'),unit=f.all().find(x=>x.name==='contract_unit_id'),tenant=f.all().find(x=>x.name==='contract_tenant_id'),form=f.all().find(x=>x.tag==='form');assert.equal(property.value,'property-a');assert.equal(property.disabled,true);assert.deepEqual(unit.children.map(x=>x.value),['','unit-a']);
 property.value='property-b';form.onsubmit({preventDefault(){}});await assert.rejects(f.d.pending,/نطاق/);
 assert.equal(f.calls.includes('saveLease'),false);
 property.value='property-a';unit.value='unit-b';const rejected=f.d.run;let pending;f.d.run=fn=>{pending=rejected.call(f.d,fn);return pending;};form.onsubmit({preventDefault(){}});await assert.rejects(pending,/الوحدة لا تخص/);assert.equal(f.calls.includes('saveLease'),false);
 unit.value='unit-a';tenant.value='tenant-1';form.onsubmit({preventDefault(){}});await pending;const saved=f.calls.find(x=>x&&typeof x==='object'&&x.unitId==='unit-a');assert.ok(saved);assert.equal(saved.propertyId,'property-a');assert.equal(saved.property,'Renamed property');assert.equal(saved.unit,'1');
});
