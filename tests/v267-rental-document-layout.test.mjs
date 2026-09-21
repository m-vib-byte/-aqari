import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultTemplatePresentation,validateTemplatePresentation,tokenizeTemplateText,serializeTemplateTokens,createTemplateFieldToken,replaceTemplateFieldToken,humanTemplateText,templateTextFromHuman} from '../src/v267/domain/rental-document-layout.js';
import {renderDocumentTemplate,resolveDocumentSigners,rentalDocumentDigestPayload,resolveContractPropertyBinding,groupRentalContractsByProperty,assertContractProperty,canonicalDocumentFieldKey,validateTemplateFields} from '../src/v267/domain/rental-document-cycle.js';

const fields=[{key:'tenant_name',label:'اسم المستأجر',type:'text',required:true},{key:'owner_name',label:'اسم المالك',type:'text',required:true}];
const placement=(change={})=>({id:'field-1',field_key:'tenant_name',page:1,x_mm:12,y_mm:20,width_mm:50,height_mm:12,font_pt:12,language:'ar',...change});
const presentation=()=>({...defaultTemplatePresentation(),placements:[placement()]});
const template=()=>({title:'  عقد إيجار محل  ',kind:'shop',kind_label:'محل',fields:structuredClone(fields),clauses:[{title:'عنوان أصلي  ',text:'  السيد {{tenant_name}}\n\n{{owner_name}}\r\n  لا يغيّر النص.  '}]});

test('presentation is optional, additive and validated without changing any legal text or field',()=>{
 const source=template(),before=JSON.stringify(source);
 assert.equal(validateTemplatePresentation(undefined,fields),null);
 assert.equal(validateTemplatePresentation(null,fields),null);
 const rendered=renderDocumentTemplate(source,{tenant_name:'مستأجر',owner_name:'مالك'});
 assert.ok(!Object.hasOwn(rendered,'presentation'));assert.equal(JSON.stringify(source),before);
 source.presentation=presentation();const saved=JSON.stringify(source);
 assert.deepEqual(validateTemplatePresentation(source.presentation,fields),source.presentation);
 assert.equal(JSON.stringify(source),saved);
 assert.equal(renderDocumentTemplate(source,{tenant_name:'مستأجر',owner_name:'مالك'}).clauses[0].text,'  السيد مستأجر\n\nمالك\r\n  لا يغيّر النص.  ');
});

test('untouched shop model with all 36 paragraphs, mixed languages and whitespace round trips byte for byte',()=>{
 const paragraphs=Array.from({length:36},(_,i)=>`${i+1}-  نص بند أصلي محفوظ — Original clause ${i+1}.\t${i%2?'{{tenant_name}}':'{{owner_name}}'}  `);
 const original='\ufeff  عقد\r\n'+paragraphs.join('\r\n\r\n')+'\n\u200f نهاية  ';
 const beforeFields=JSON.stringify(fields),tokens=tokenizeTemplateText(original,fields);
 assert.equal(tokens.filter(token=>token.type==='field').length,36);
 assert.equal(serializeTemplateTokens(tokens,fields),original);
 assert.equal(JSON.stringify(fields),beforeFields);
 assert.ok(!humanTemplateText(original,fields).includes('{{'));
});

test('human chips hide generic, unknown and malformed syntax while preserving it until explicit replacement',()=>{
 const original='أ: {{field_name}}، ب: {{missing_field}}، ج: {(field_name}}، د: {{tenant_name}';
 const tokens=tokenizeTemplateText(original,fields),chips=tokens.filter(x=>x.type==='field');
 assert.equal(chips.length,4);assert.equal(chips[0].label,'حقل يحتاج تحديد');
 assert.equal(chips[1].label,'حقل غير معرّف');assert.equal(chips[2].label,'حقل غير مكتمل');
 assert.equal(serializeTemplateTokens(tokens,fields),original);
 const at=tokens.indexOf(chips[0]);tokens[at]=replaceTemplateFieldToken(chips[0],'tenant_name',fields);
 assert.equal(serializeTemplateTokens(tokens,fields),original.replace('{{field_name}}','{{tenant_name}}'));
 assert.throws(()=>createTemplateFieldToken('field_name',fields));assert.throws(()=>createTemplateFieldToken('unknown',fields));
 assert.throws(()=>validateTemplateFields({...template(),clauses:[{title:'عنوان',text:'{{field_name}}'}]}),error=>/حقل يحتاج تحديد/.test(error.message)&&!/[{}]|field_name/.test(error.message));
});

test('human marker conversion touches only explicit unique labels; ambiguous labels are refused',()=>{
 assert.equal(templateTextFromHuman('اسم المستأجر نص عادي؛ ⟦اسم المستأجر⟧\n  ⟦اسم المالك⟧ ',fields),'اسم المستأجر نص عادي؛ {{tenant_name}}\n  {{owner_name}} ');
 assert.throws(()=>templateTextFromHuman('⟦غير معروف⟧',fields),/غير محدد/);
 assert.throws(()=>templateTextFromHuman('⟦اسم المستأجر⟧',[...fields,{key:'other_name',label:'اسم المستأجر'}]),/مكرر/);
 assert.equal(serializeTemplateTokens([{type:'text',text:'  محفوظ  '},createTemplateFieldToken('tenant_name',fields)],fields),'  محفوظ  {{tenant_name}}');
 assert.equal(canonicalDocumentFieldKey('civil_id'),canonicalDocumentFieldKey('tenant_civil_id'));
});

test('layout rejects unknown keys, external logos, unsafe keys, invalid numbers, off-page and duplicate placements',()=>{
 for(const mutate of [
  p=>p.html='<script>',p=>p.logo.url='https://example.invalid/image',p=>p.logo.source='inline',p=>p.version=2,p=>p.paper='A3',p=>p.language='auto',
  p=>p.placements[0].field_key='__proto__',p=>p.placements[0].field_key='unknown_field',p=>p.placements[0].id='x'.repeat(65),p=>p.placements[0].x_mm=NaN,p=>p.placements[0].height_mm=Infinity,
  p=>p.placements[0].x_mm=7,p=>p.placements[0].y_mm=-1,p=>p.placements[0].width_mm=195,p=>p.placements[0].height_mm=2,p=>p.placements[0].x_mm=190,
  p=>p.placements[0].page=0,p=>p.placements[0].page=51,p=>p.placements[0].page=1.5,p=>p.placements[0].font_pt=37,p=>p.placements[0].font_pt='12',
  p=>p.placements.push({...p.placements[0]}),p=>p.signers.owner.name='true',p=>delete p.signers.tenant,p=>p.placements=Array.from({length:121},(_,i)=>placement({id:'f'+i}))
 ]){const p=presentation();mutate(p);assert.throws(()=>validateTemplatePresentation(p,fields));}
});

test('exact A4 boundaries and safe declared/signature slots are allowed',()=>{
 const p=presentation();p.placements=[placement({x_mm:8,y_mm:8,width_mm:194,height_mm:281,font_pt:36,page:50})];
 assert.equal(validateTemplatePresentation(p,fields).placements[0].page,50);
 p.placements=[placement({field_key:'tenant_fingerprint'})];assert.equal(validateTemplatePresentation(p,fields).placements[0].field_key,'tenant_fingerprint');
 p.signers.tenant.fingerprint=false;assert.throws(()=>validateTemplatePresentation(p,fields),/فعّل/);
});

test('signer options support both parties without producing signatures, and absent settings remain compatible',()=>{
 const values={owner_name:'المالك',representative_name:'الوكيل',tenant_name:'المستأجر'};
 assert.equal(resolveDocumentSigners('apartment_handover',values).length,1);
 const p=defaultTemplatePresentation('apartment_handover');
 let signers=resolveDocumentSigners('apartment_handover',values,p);assert.deepEqual(signers.map(x=>x.role),['owner','tenant']);assert.equal(signers[0].name,'الوكيل');
 p.signers.owner.name=false;p.signers.tenant={name:false,signature:false,fingerprint:false};
 signers=resolveDocumentSigners('apartment_handover',values,p);assert.equal(signers.length,1);assert.equal(signers[0].name,'');assert.equal(signers[0].showSignature,true);assert.equal(signers[0].signature,'');
});

test('visual settings participate in exact digest while absent presentation keeps the original six-part material',()=>{
 const model=template(),values={owner_name:'مالك',tenant_name:'مستأجر'},before=rentalDocumentDigestPayload(model,renderDocumentTemplate(model,values));
 assert.equal(before.length,6);
 model.presentation=presentation();const after=rentalDocumentDigestPayload(model,renderDocumentTemplate(model,values));assert.equal(after.length,7);assert.deepEqual(after[6],model.presentation);
 const old=JSON.stringify(after);model.presentation.placements[0].x_mm=13;assert.notEqual(JSON.stringify(rentalDocumentDigestPayload(model,renderDocumentTemplate(model,values))),old);
});

function bindingFixture(){
 const p1={id:'p1',external_ref:'source-p1',name:'اسم متكرر',workspace_id:'w'},p2={id:'p2',external_ref:'source-p2',name:'اسم متكرر',workspace_id:'w'};
 const c1={id:'contract-local',tenantId:'tenant-local',property:'اسم متكرر',unit:'101',source:'statement-import'};
 const sources={workspaceId:'w',properties:[p1,p2],units:[{id:'u1',property_id:'p1',unit_no:'101'},{id:'u2',property_id:'p2',unit_no:'101'}],leases:[{id:'lease-db',external_ref:'contract-local',tenant_id:'tenant-db',unit_id:'u1',snapshot:c1}],tenants:[{id:'tenant-db',external_ref:'tenant-local'}]};
 return {sources,c1,p1,p2};
}

test('imported contracts group through normalized lease and unit IDs despite identical property and unit names',()=>{
 const {sources,c1}=bindingFixture(),before=JSON.stringify({sources,c1});
 const binding=resolveContractPropertyBinding(c1,sources);assert.equal(binding.propertyId,'p1');assert.equal(binding.unitId,'u1');assert.equal(binding.leaseId,'lease-db');
 const result=groupRentalContractsByProperty([c1],sources);assert.deepEqual(result.groups.map(x=>[x.propertyId,x.count]),[['p1',1],['p2',0]]);assert.equal(result.unbound.length,0);assert.equal(result.conflicts.length,0);
 assert.equal(JSON.stringify({sources,c1}),before);assert.equal(assertContractProperty(c1,'source-p1',sources).propertyId,'p1');assert.throws(()=>assertContractProperty(c1,'p2',sources),/لا يتبع/);
 assert.equal(resolveContractPropertyBinding({id:'lease-db',tenantId:'tenant-local'},sources).propertyId,'p1');
});

test('unbound contracts remain visible; contradictory, duplicate and cross-workspace bindings never silently join',()=>{
 const {sources,c1}=bindingFixture();
 const unbound={id:'missing-links',property:'اسم متكرر',unit:'101'},conflict={id:'conflicting-links',propertyId:'p2',unitId:'u1'};
 let result=groupRentalContractsByProperty([c1,unbound,conflict],sources);assert.equal(result.unbound.length,1);assert.equal(result.conflicts.length,1);assert.equal(result.groups[0].count,1);
 sources.leases.push({...sources.leases[0],id:'other-db'});assert.throws(()=>resolveContractPropertyBinding(c1,sources),/تعارض/);
 sources.leases.pop();sources.leases[0].workspace_id='other-workspace';assert.throws(()=>resolveContractPropertyBinding(c1,sources),/مساحة العمل/);
});

test('property external references and valid direct IDs bind; tenant identity contradictions do not',()=>{
 const {sources,c1}=bindingFixture();
 assert.equal(resolveContractPropertyBinding({id:'direct',property_ref:'source-p2',unitId:'u2'},sources).propertyId,'p2');
 c1.tenantId='other-tenant';assert.throws(()=>resolveContractPropertyBinding(c1,sources),/المستأجر/);
});
