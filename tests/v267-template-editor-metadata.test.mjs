import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTemplateEditor,isTemplateSourceBoundary} from '../src/v267/domain/template-editor-metadata.js';
import {defaultTemplatePresentation,validateTemplatePresentation} from '../src/v267/domain/rental-document-layout.js';
import {renderDocumentTemplate,resolveDocumentSigners,rentalDocumentDigestPayload,documentFieldCatalog,linkedDocumentFieldKeys} from '../src/v267/domain/rental-document-cycle.js';

const fields=[{key:'tenant_name',label:'المستأجر',type:'text',required:false}];
const clauses=[{title:'عنوان أصلي',text:'A😀 {{tenant_name}} نهاية\r\n  محفوظ'}];
const range=change=>({clause:0,part:'text',start:1,end:3,style:{bold:true},...change});

test('business activity is an explicit manual field and is never guessed from linked data',()=>{
 assert.deepEqual(documentFieldCatalog.business_activity,{key:'business_activity',label:'النشاط التجاري',type:'text',source:'document'});
 assert.equal(linkedDocumentFieldKeys.includes('business_activity'),false);
 const model={title:'نموذج',kind:'shop',fields:[{key:'business_activity',label:'النشاط التجاري',type:'text',required:false}],clauses:[{title:'نشاط',text:'{{business_activity}}'}]};
 assert.equal(renderDocumentTemplate(model,{property_name:'مطعم',unit_no:'محل'}, {requireValues:false}).values.business_activity,'');
 assert.equal(renderDocumentTemplate(model,{business_activity:'تجارة محددة'}).clauses[0].text,'تجارة محددة');
});

test('editor metadata remains absent on untouched legacy presentations and changes no legal bytes',()=>{
 const p=defaultTemplatePresentation(),before=JSON.stringify(p);
 assert.equal(JSON.stringify(validateTemplatePresentation(p,fields,clauses)),before);
 const model={title:'نموذج',kind:'shop',fields,clauses,presentation:p},original=JSON.stringify(model),resolved=renderDocumentTemplate(model,{}, {requireValues:false});
 assert.equal(JSON.stringify(model),original);assert.ok(!Object.hasOwn(resolved.presentation,'editor'));
 p.editor={version:1,style:{bold:true}};const changed=renderDocumentTemplate(model,{}, {requireValues:false});
 assert.deepEqual(changed.clauses,resolved.clauses);assert.notEqual(JSON.stringify(rentalDocumentDigestPayload(model,changed)),JSON.stringify(rentalDocumentDigestPayload({...model,presentation:JSON.parse(before)},resolved)));
});

test('optional editor groups normalize in shared deterministic order without adding defaults',()=>{
 const value={signers:{details:{tenant:{nationality:false,civil_id:true},owner:{nationality:true,civil_id:false}},order:['tenant','owner']},logo:{repeat:'all',height_mm:20,width_mm:30,y_mm:8,x_mm:8},trailing_blank_pages:1,page_breaks:[{offset:3,clause:0}],ranges:[range({style:{underline:false,bold:true,font_pt:14,font_family:'mono'}})],style:{numbering:'decimal',clause_after_mm:4,clause_before_mm:2,paragraph_gap_mm:3,direction:'rtl',underline:false,bold:true,font_family:'sans'},version:1};
 const result=validateTemplateEditor(value,fields,clauses);
 assert.deepEqual(Object.keys(result),['version','style','ranges','page_breaks','trailing_blank_pages','logo','signers']);
 assert.deepEqual(Object.keys(result.style),['font_family','bold','underline','direction','paragraph_gap_mm','clause_before_mm','clause_after_mm','numbering']);
 assert.deepEqual(Object.keys(result.ranges[0].style),['font_family','font_pt','bold','underline']);
 assert.deepEqual(Object.keys(result.signers.details),['owner','tenant']);
 assert.deepEqual(validateTemplateEditor({version:1}),{version:1});assert.deepEqual(validateTemplateEditor({version:1,style:{}}),{version:1,style:{}});
});

test('source ranges and breaks cannot split a surrogate, field token or missing clause',()=>{
 assert.equal(isTemplateSourceBoundary(clauses[0].text,2),false);assert.equal(isTemplateSourceBoundary(clauses[0].text,5),false);assert.equal(isTemplateSourceBoundary(clauses[0].text,3),true);
 for(const change of [{start:2},{end:2},{start:5,end:6},{end:999},{clause:1},{part:'html'}])assert.throws(()=>validateTemplateEditor({version:1,ranges:[range(change)]},fields,clauses));
 for(const offset of [2,5,999])assert.throws(()=>validateTemplateEditor({version:1,page_breaks:[{clause:0,offset}]},fields,clauses));
 for(const text of ['{{field_name}}','{(field_name}}','{{tenant_name}','{{missing_field}}'])assert.equal(isTemplateSourceBoundary(text,2),false);
 const model={title:'نموذج',kind:'shop',fields,clauses,presentation:{...defaultTemplatePresentation(),editor:{version:1,ranges:[range({end:999})]}}};
 assert.throws(()=>renderDocumentTemplate(model,{}, {requireValues:false}));assert.throws(()=>rentalDocumentDigestPayload(model,{title:'',clauses:[],values:{}}));
});

test('nonoverlapping ranges retain input order; breaks must be sorted and unique',()=>{
 const a=range(),b=range({start:20,end:22});assert.deepEqual(validateTemplateEditor({version:1,ranges:[b,a]},fields,clauses).ranges,[b,a]);
 assert.throws(()=>validateTemplateEditor({version:1,ranges:[range({start:0,end:3}),a]},fields,clauses));
 for(const page_breaks of [[{clause:0,offset:3},{clause:0,offset:3}],[{clause:0,offset:3},{clause:0,offset:0}]])assert.throws(()=>validateTemplateEditor({version:1,page_breaks},fields,clauses));
 assert.deepEqual(validateTemplateEditor({version:1,page_breaks:[{clause:0,offset:0},{clause:0,offset:clauses[0].text.length}]},fields,clauses).page_breaks.length,2);
});

test('unsafe keys, invalid numbers, overlapping ranges, excessive arrays and unsupported fonts are rejected',()=>{
 const invalid=[null,[],{version:2},{version:1,html:'<b>'},{version:1,style:{font_family:'https://font.invalid/x'}},{version:1,style:{bold:'true'}},{version:1,style:{direction:'left'}},{version:1,style:{paragraph_gap_mm:13}},{version:1,style:{clause_before_mm:NaN}},{version:1,style:{numbering:'roman'}},{version:1,ranges:[range({style:{}})]},{version:1,ranges:[range({style:{font_pt:37}})]},{version:1,ranges:Array(301).fill(range())},{version:1,page_breaks:Array(51).fill({clause:0,offset:0})},{version:1,trailing_blank_pages:11},{version:1,trailing_blank_pages:1.5},{version:1,logo:{x_mm:190,y_mm:8,width_mm:100,height_mm:20,repeat:'all'}},{version:1,signers:{order:['owner','owner'],details:{}}},{version:1,signers:{order:[],details:{owner:{civil_id:true}}}}];
 for(const value of invalid)assert.throws(()=>validateTemplateEditor(value,fields,clauses));
});

test('extra signer fields and custom order are opt-in; disabled/undeclared placements are rejected',()=>{
 const p=defaultTemplatePresentation(),original=resolveDocumentSigners('shop',{owner_name:'مالك',tenant_name:'مستأجر'},p);
 assert.ok(!Object.hasOwn(original[0],'civilId'));
 p.editor={version:1,signers:{order:['tenant','owner'],details:{owner:{civil_id:true,nationality:true},tenant:{civil_id:true,nationality:false}}}};
 const values={owner_name:'مالك',representative_name:'وكيل',representative_civil_id:'123',representative_nationality:'كويتي',tenant_name:'مستأجر',tenant_civil_id:'456'},signers=resolveDocumentSigners('shop',values,p);
 assert.deepEqual(signers.map(s=>s.role),['tenant','owner']);assert.equal(signers[1].civilId,'123');assert.equal(signers[1].nationality,'كويتي');
 const placement={id:'civil',field_key:'owner_civil_id',page:1,x_mm:12,y_mm:18,width_mm:40,height_mm:10,font_pt:12,language:'ar'};p.placements=[placement];assert.deepEqual(validateTemplatePresentation(p,[],clauses).placements,[placement]);
 p.editor.signers.details.owner.civil_id=false;assert.throws(()=>validateTemplatePresentation(p,[],clauses));
 p.placements=[];p.signers.owner={name:false,signature:false,fingerprint:false};p.editor.signers.details.owner.civil_id=true;
 const model={title:'نموذج',kind:'shop',fields:[],clauses:[{title:'بند',text:'نص محفوظ'}],presentation:p},rendered=renderDocumentTemplate(model,values,{requireValues:false});
 assert.equal(rendered.values.representative_civil_id,'123');assert.equal(rendered.values.tenant_civil_id,'456');assert.equal(rendered.values.representative_nationality,'كويتي');assert.ok(!Object.hasOwn(rendered.values,'tenant_nationality'));
 assert.equal(resolveDocumentSigners('shop',rendered.values,p).length,2);
});
