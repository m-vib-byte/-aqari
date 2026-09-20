import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const page=readFileSync(new URL('../src/v267/pages/property-onboarding.js',import.meta.url),'utf8');
const experience=readFileSync(new URL('../src/v267/components/property-experience.js',import.meta.url),'utf8');
const upload=readFileSync(new URL('../src/v267/components/original-document-upload.js',import.meta.url),'utf8');
const legacyQuickCreate=readFileSync(new URL('../v201-experience.js',import.meta.url),'utf8');

function directEntry({bridge=true}={}){
 const labels=[],calls=[];
 const node=(tag,text='')=>({tag,textContent:text,value:'',children:[],append(...items){this.children.push(...items);},focus(){}});
 const d={body:node('section'),status:node('p'),session:{bound:{user:'user',workspace:'workspace',role:'general_manager'},client:{rpc(name){calls.push(name);return name;}},request:async()=>({user_id:'user',workspace_id:'workspace',permissions:{properties:{write:true},documents:{write:true}}})},run(work){this.pending=Promise.resolve().then(work);return this.pending;}};
 let opened=0;
 const context={window:{AQARI_SUPABASE:bridge?{loadAppState(){},saveAppState(){}}:null},node,field(label,control){labels.push(label);return control;},createDialog(){opened++;return d;},translateStatic:x=>x,translateMessage:x=>x};
 vm.createContext(context);
 // Execute the declared dependency, as a direct module entry does, without the property finder.
 const dependency=page.match(/^import '([^']*v267-rental-records\.js)';$/m);
 assert.ok(dependency,'direct onboarding must load its own records dependency');
 vm.runInContext(readFileSync(new URL('../src/v267/pages/'+dependency[1],import.meta.url),'utf8'),context);
 vm.runInContext(page.replace(/^import .*;$/gm,'').replace(/\bexport /g,'')+'\nthis.openPage=openPropertyOnboarding;',context);
 return {d,labels,calls,open:()=>context.openPage(),opened:()=>opened};
}

test('direct service entry renders the property form without visiting the property finder first',async()=>{
 const f=directEntry();assert.equal(f.open(),true);await f.d.pending;
 assert.ok(f.labels.includes('اسم العقار *'));assert.ok(f.labels.includes('العنوان *'));
 assert.equal(f.d.body.children[0].tag,'form');assert.deepEqual(f.calls,['aqari_workspace_access']);
 assert.equal(f.d.status.textContent,'أكمل الملف في شاشة واحدة ثم اضغط حفظ.');
});

test('missing cloud bridge does not leave an empty modal blocking navigation',()=>{
 const f=directEntry({bridge:false});assert.throws(f.open,/جسر السحابة/);assert.equal(f.opened(),0);assert.deepEqual(f.calls,[]);
});

test('direct contract foundation loads its engine and renders choices without creating a draft',async()=>{
 const source=readFileSync(new URL('../src/v267/pages/contract-foundation.js',import.meta.url),'utf8');
 assert.match(source,/^import '\.\.\/\.\.\/\.\.\/v267-rental-records\.js';$/m);
 const writes=[],calls=[],filters=[],published={id:'template',kind:'investment',kind_label:'استثماري',title:'نموذج منشور',version:1,clauses:[{title:'بند',text:'نص'}]};
 const node=(tag,text='')=>({tag,textContent:text,children:[],append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;}});
 const query={select(){return this;},eq(){return this;},or(value){filters.push(value);return this;},order(){return [];}};
 const d={body:node('section'),status:node('p'),session:{bound:{user:'user',workspace:'workspace',role:'general_manager'},check(){},client:{from(name){calls.push(name);return query;},rpc(name){calls.push(name);return name==='aqari_rental_templates'?{items:[published]}:{items:[]};}},request:async value=>value},run(work){this.pending=Promise.resolve().then(work);return this.pending;}};
 const context={window:{AQARI_SUPABASE:{loadAppState:async()=>({payload:{}}),saveAppState:()=>writes.push('save')}},node,createDialog:()=>d,translateStatic:x=>x,rentalTemplateKinds:[['investment','استثماري']],validTemplate:()=>true,templateKindName:r=>r.kind_label,mountTemplateFields:()=>({values:()=>({})})};
 vm.createContext(context);vm.runInContext(readFileSync(new URL('../v267-rental-records.js',import.meta.url),'utf8'),context);
 vm.runInContext(source.replace(/^import .*;$/gm,'').replace(/\bexport /g,'')+'\nopenContractFoundation();',context);
 await d.pending;
 assert.equal(d.body.children[0].textContent,'ابدأ عقدًا جديدًا');
 assert.equal(d.body.children.at(-1).children[0].textContent,'استثماري');
 assert.deepEqual(calls,['aqari_properties','aqari_units','aqari_rental_templates']);assert.deepEqual(writes,[]);
 assert.deepEqual(filters,['metadata->>source_only.is.null,metadata->>source_only.neq.true']);
});

test('every property add entry is intercepted into the unified onboarding instead of the legacy property form',()=>{
 assert.match(experience,/property-onboarding\.js/);
 assert.match(experience,/openPropertyOnboarding/);
 assert.match(experience,/openOnboarding/);
 assert.match(experience,/\[data-v201-create="properties"\]/);
 assert.match(experience,/stopImmediatePropagation/);
 assert.match(experience,/addEventListener\('click',onLegacyQuickCreate,true\)/);
 assert.match(legacyQuickCreate,/properties:\{title:'إضافة عقار'/);
 assert.doesNotMatch(experience,/openRecord\('properties'\)/);
});

test('legacy property profile and rent-statement actions are intercepted into authoritative flows',()=>{
 assert.match(experience,/data-v201-property-action="profile"/);
 assert.match(experience,/data-v201-property-action="statement"/);
 assert.match(experience,/property-statements\.js/);
 assert.match(experience,/openPropertyStatements\(\{propertyName:name\}\)/);
 assert.match(experience,/openCompleteFileByName\(name\)/);
 assert.match(experience,/addEventListener\('click',onLegacyPropertyAction,true\)/);
});

test('one onboarding screen captures master data owners contacts and every requested asset group',()=>{
 for(const label of ['اسم العقار','العنوان','نوع العقار','حالة العقار','الدخل المعلن','البريد الرسمي للعقار','الهاتف','واتساب','الملاك والحصص','شعار العقار','صور العقار','وثيقة الملكية','المخططات والكروكيات','مستندات أخرى'])assert.match(page,new RegExp(label));
 assert.match(page,/reduce\(\(sum,o\)=>sum\+o\.bps,0\)!==10000/);
 assert.match(page,/aqari_workspace_access/);
 assert.match(page,/permissions\?\.properties\?\.write/);
 assert.match(page,/permissions\?\.documents\?\.write/);
});

test('onboarding persists compatibility row then archives originals and finishes authoritative master with readback',()=>{
 assert.match(page,/loadAppState/);
 assert.match(page,/saveAppState/);
 assert.match(page,/aqari_properties/);
 assert.match(page,/createOriginalDocumentUpload/);
 assert.match(page,/aqari_property_master_save/);
 assert.match(page,/aqari_property_full_file/);
 assert.match(page,/مستند مرفوع لم يظهر في الملف الكامل/);
 assert.match(page,/aqari:property-saved/);
});

test('logo photos and general property files use explicit supporting-document asset categories',()=>{
 assert.match(upload,/property_logo:\{documentType:'supporting_document'/);
 assert.match(upload,/property_photo:\{documentType:'supporting_document'/);
 assert.match(upload,/property_other:\{documentType:'supporting_document'/);
 assert.match(upload,/asset_role/);
 assert.match(page,/category:'property_logo'/);
 assert.match(page,/category:'property_photo'/);
 assert.match(page,/category:'title_deed'/);
 assert.match(page,/category:'site_plan'/);
 assert.match(page,/category:'property_other'/);
});

test('archive retry keeps successful document ids and never asks storage or database to delete an archived original',()=>{
 assert.match(page,/uploaded=new Map\(\)/);
 assert.match(page,/if\(uploaded\.has\(entry\.key\)\)continue/);
 assert.match(upload,/createVerifiedUpload/);
 assert.doesNotMatch(page,/\.storage\.from\([^)]*\)\.remove\(/);
 assert.doesNotMatch(page,/\.from\([^)]*\)\.delete\(/);
 assert.doesNotMatch(upload,/\.storage\.from\([^)]*\)\.remove\(/);
 assert.doesNotMatch(upload,/\.from\([^)]*\)\.delete\(/);
});
