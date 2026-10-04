import test from 'node:test';
import assert from 'node:assert/strict';
import {linkPdfField,writeLinkedPdfValue} from '../src/v267/domain/pdf-linked-fields.js';
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
