import test from 'node:test';
import assert from 'node:assert/strict';
import {rentalTemplateStarters,cloneRentalTemplateStarter} from '../src/v267/domain/rental-template-starters.js';
import {documentFieldCatalog,validateTemplateFields,renderDocumentTemplate,resolveDocumentSigners} from '../src/v267/domain/rental-document-cycle.js';
import {validateTemplatePresentation} from '../src/v267/domain/rental-document-layout.js';

test('the ten reusable starters have independent stable catalog IDs and no saved or approved identity',()=>{
 assert.deepEqual(rentalTemplateStarters.map(item=>item.kind),['tenant_final_release','investment_apartment','commercial_shop','house_apartment','rent_receipt','eviction','apartment_handover','owner_final_clearance','salary_voucher','employment_contract']);
 assert.equal(new Set(rentalTemplateStarters.map(item=>item.starterId)).size,10);
 for(const item of rentalTemplateStarters){
  assert.match(item.starterId,/^starter-[a-z-]+-v1$/);
  assert.match(item.title,/^مسودة /);
  for(const key of ['id','family_id','revision','status','version','published_at','approved_at','values'])assert.ok(!Object.hasOwn(item,key));
 }
});

test('all starters validate with exact saved field schema and render an empty usable labelled preview',()=>{
 for(const item of rentalTemplateStarters){
  assert.equal(validateTemplateFields(item),item.fields);
  for(const spec of item.fields){
   assert.deepEqual(Object.keys(spec),['key','label','type','required']);
   assert.equal(typeof spec.required,'boolean');
   if(documentFieldCatalog[spec.key])assert.equal(spec.label,documentFieldCatalog[spec.key].label);
  }
  const rendered=renderDocumentTemplate(item,{}, {requireValues:false});
  assert.ok(rendered.clauses.length>0);
  assert.ok(rendered.clauses.every(clause=>!clause.text.includes('{{')&&!clause.text.includes('}}')));
  assert.ok(Object.values(rendered.values).every(value=>value===''));
  assert.throws(()=>renderDocumentTemplate(item,{}),/أكمل الحقول المطلوبة/);
  const presentation=validateTemplatePresentation(item.presentation,item.fields);
  assert.equal(presentation.paper,'A4');assert.equal(presentation.language,'bilingual');
  const leaseSigners=!['salary_voucher','employment_contract'].includes(item.kind);for(const role of ['owner','tenant'])assert.deepEqual(presentation.signers[role],{name:leaseSigners&&(role!=='owner'||item.kind!=='tenant_final_release'),signature:leaseSigners&&(role!=='owner'||item.kind!=='tenant_final_release'),fingerprint:leaseSigners&&(role!=='owner'||item.kind!=='tenant_final_release')});
  const signers=resolveDocumentSigners(item.kind,{},presentation);
  assert.ok(signers.every(signer=>signer.name===''&&signer.signature===''&&signer.fingerprint===''));
 }
});

test('blank scaffolds contain headings and empty slots only, without manufactured legal prose or fixed source values',()=>{
 for(const item of rentalTemplateStarters.filter(x=>x.kind!=='tenant_final_release')){
  for(const clause of item.clauses){
   assert.match(clause.title,/\p{Script=Arabic}/u);assert.match(clause.title,/[A-Za-z]/);
   for(const line of clause.text.split('\n')){
    assert.match(line,/^(?:[^{}\n]+: )?\{\{[a-z][a-z0-9_]{1,49}\}\}$/);
    assert.doesNotMatch(line,/أقر|اتعهد|أتعهد|استلمت|تسديد|shall|acknowledge|pledge/i);
   }
  }
 }
 const handover=rentalTemplateStarters.find(item=>item.kind==='apartment_handover');
 const expected=['handover_sanitary_items','handover_electrical_items','handover_carpentry_items','handover_keys_details','handover_decor_details'];
 assert.deepEqual(handover.fields.filter(field=>field.key.startsWith('handover_')&&field.key!=='handover_date').map(field=>field.key),expected);
 for(const key of expected){
  assert.equal(handover.clauses.find(clause=>clause.text==='{{'+key+'}}')?.text,'{{'+key+'}}');
  assert.equal(handover.fields.find(field=>field.key===key).required,false);
 }
});

test('opening each starter clones mutable fields and presentation into a fresh independent unsaved UUID family',()=>{
 const original=JSON.stringify(rentalTemplateStarters),ids=new Set();
 for(const item of rentalTemplateStarters){
  const a=cloneRentalTemplateStarter(item.starterId),b=cloneRentalTemplateStarter(item.starterId);
  for(const draft of [a,b]){
   assert.match(draft.id,/^[0-9a-f-]{36}$/i);assert.equal(draft.family_id,draft.id);
   assert.equal(draft.revision,0);assert.equal(draft.status,'draft');assert.equal(draft._unsaved,true);
   assert.ok(!Object.hasOwn(draft,'starterId'));assert.ok(!ids.has(draft.id));ids.add(draft.id);
  }
  a.fields[0].label='تعديل المستخدم';a.clauses[0].text='نص يكتبه المستخدم';a.presentation.signers.owner.name=!item.presentation.signers.owner.name;
  assert.equal(b.fields[0].label,item.fields[0].label);assert.equal(b.clauses[0].text,item.clauses[0].text);assert.equal(b.presentation.signers.owner.name,item.presentation.signers.owner.name);
 }
 assert.equal(JSON.stringify(rentalTemplateStarters),original);
});

test('catalog is deeply immutable and cloning refuses unknown starters or non-UUID identities',()=>{
 assert.ok(Object.isFrozen(rentalTemplateStarters));
 assert.throws(()=>{rentalTemplateStarters[0].clauses[0].text='changed';},TypeError);
 assert.throws(()=>{rentalTemplateStarters[0].presentation.signers.owner.name=false;},TypeError);
 assert.throws(()=>cloneRentalTemplateStarter('unknown'),/غير موجودة/);
 assert.throws(()=>cloneRentalTemplateStarter(rentalTemplateStarters[0].starterId,{createId:()=>rentalTemplateStarters[0].starterId}),/معرّف مستقل/);
 const id='b435aa4a-d83a-44ec-bf84-a3fb0292cae3';
 assert.equal(cloneRentalTemplateStarter(rentalTemplateStarters[0].starterId,{createId:()=>id}).family_id,id);
});


test('lease starters print every declared identity, date and money field without silently dropping entered values',()=>{
 for(const item of rentalTemplateStarters.filter(row=>['investment_apartment','commercial_shop','house_apartment'].includes(row.kind))){
  const values=Object.fromEntries(item.fields.map(f=>[f.key,f.type==='date'?'2026-10-02':f.type==='money'?'350.125':'TEST-'+f.key]));
  const result=renderDocumentTemplate(item,values);
  const text=result.clauses.map(c=>c.text).join('\n');
  for(const key of ['tenant_civil_id','start_date','end_date','monthly_rent'])assert.ok(item.clauses.some(c=>c.text.includes('{{'+key+'}}')),key+' must reach printed clauses');
  assert.match(text,/TEST-tenant_civil_id/);assert.match(text,/350[.,]125/);
 }
});


test('owner supplied tenant release stays unsigned and distinct from owner clearance',()=>{
 const draft=cloneRentalTemplateStarter('starter-tenant-final-release-v1');
 assert.equal(draft.kind,'tenant_final_release');assert.equal(draft.status,'draft');assert.equal(draft._unsaved,true);
 const text=draft.clauses.map(x=>x.text).join('\n');assert.match(text,/أقر وأعترف/);assert.match(text,/I hereby acknowledge/);
 assert.equal(draft.clauses.length,15);assert.deepEqual(resolveDocumentSigners(draft.kind,{},draft.presentation).map(s=>s.role),['tenant']);
 assert.ok(!Object.hasOwn(draft,'approved_at'));assert.ok(!Object.hasOwn(draft,'signature'));
});
