import test from 'node:test';
import assert from 'node:assert/strict';
import {linkPdfField,writeLinkedPdfValue} from '../src/v267/domain/pdf-linked-fields.js';
import {pdfFieldRequired,pdfSelectOptions,pdfFieldValueError} from '../src/v267/domain/pdf-field-values.js';
test('required defaults preserve legacy maps; optional blanks and strict typed values',()=>{
 assert.equal(pdfFieldRequired({}),true);assert.equal(pdfFieldRequired({required:false}),false);
 assert.equal(pdfFieldValueError({type:'text'},''),'FIELD_VALUES_REQUIRED');
 assert.equal(pdfFieldValueError({type:'civil_id',required:false},''),null);
 for(const v of ['123456789012','١٢٣٤٥٦٧٨٩٠١٢','۱۲۳۴۵۶۷۸۹۰۱۲'])assert.equal(pdfFieldValueError({type:'civil_id'},v),null);
 for(const v of ['123','1234567890123','12345678901x'])assert.equal(pdfFieldValueError({type:'civil_id'},v),'INVALID_CIVIL_ID_FORMAT');
 assert.equal(pdfFieldValueError({type:'select',options:['سكني','تجاري']},'سكني'),null);
 assert.equal(pdfFieldValueError({type:'select',options:['سكني','تجاري']},'مخالف'),'INVALID_FIELD_OPTION');
 assert.equal(pdfFieldValueError({type:'date'},'2026-02-30'),'INVALID_FIELD_VALUE');
 assert.equal(pdfFieldValueError({type:'date'},'2026-10-04'),null);
 assert.equal(pdfFieldValueError({type:'text'},'x\u0000'),'INVALID_FIELD_VALUE');
 assert.deepEqual(pdfSelectOptions(' سكني \nتجاري\n'),['سكني','تجاري']);
 for(const v of ['', 'a\na', 'a'.repeat(101), 'a\u0000',Array.from({length:51},(_,i)=>String(i)).join('\n')])assert.throws(()=>pdfSelectOptions(v),/INVALID_FIELD_OPTIONS/);
});
test('select links require the same options and refuse without changing existing values',()=>{
 const fields=[{id:'a',type:'select',options:['A','B']},{id:'b',type:'select',options:['A','C']}],values={a:'A'};
 const before=JSON.stringify({fields,values});assert.throws(()=>linkPdfField(fields,values,fields[1],'a'),/PDF_LINK_TYPE/);assert.equal(JSON.stringify({fields,values}),before);
 fields[1].options=['A','B'];linkPdfField(fields,values,fields[1],'a');assert.equal(values.b,'A');
 writeLinkedPdfValue(fields,values,fields[1],'B');assert.equal(values.a,'B');
});
test('explicit cross-page link fills once, unlinks without losing value, survives serialization',()=>{
 const fields=[{id:'a',type:'text',page:1},{id:'b',type:'text',page:2},{id:'c',type:'text',page:1}];
 const values={a:'اسم تجريبي',c:'independent'};
 linkPdfField(fields,values,fields[1],'a');assert.equal(values.b,values.a);
 const saved=JSON.parse(JSON.stringify({fields,values}));
 writeLinkedPdfValue(saved.fields,saved.values,saved.fields[1],'NEW');
 assert.deepEqual(saved.values,{a:'NEW',b:'NEW',c:'independent'});
 linkPdfField(saved.fields,saved.values,saved.fields[1],'');
 writeLinkedPdfValue(saved.fields,saved.values,saved.fields[0],'NEXT');assert.equal(saved.values.b,'NEW');
});
test('conflicts and different types fail atomically; equal labels never imply linking',()=>{
 const fields=[{id:'a',type:'text',label:'Same'},{id:'b',type:'text',label:'Same'},{id:'d',type:'date'}],values={a:'A',b:'B'};
 const before=JSON.stringify({fields,values});
 assert.throws(()=>linkPdfField(fields,values,fields[1],'a'),/PDF_LINK_CONFLICT/);
 assert.throws(()=>linkPdfField(fields,values,fields[2],'a'),/PDF_LINK_TYPE/);
 assert.equal(JSON.stringify({fields,values}),before);
 writeLinkedPdfValue(fields,values,fields[0],'C');assert.equal(values.b,'B');
});
