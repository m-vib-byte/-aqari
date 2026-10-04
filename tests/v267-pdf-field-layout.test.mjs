import test from 'node:test';
import assert from 'node:assert/strict';
import {duplicatePdfField,alignPdfField,validPdfFieldPosition} from '../src/v267/domain/pdf-field-layout.js';
const field=(id,x=.1,y=.1)=>({id,label:'اسم',page:1,x,y,width:.3,height:.04,fontSize:14,color:'#234567',type:'text',align:'right',dataKey:'name'});
test('duplicate preserves style, stays on page without overlap and is independent',()=>{
 const original=field('a'),other=field('b',.1,.15),before=JSON.stringify([original,other]);
 const copy=duplicatePdfField([original,other],original,'copy');
 assert.equal(copy.fontSize,14);assert.equal(copy.color,'#234567');assert.equal(copy.dataKey,undefined);
 assert.equal(validPdfFieldPosition([original,other],copy),true);assert.equal(JSON.stringify([original,other]),before);
});
test('full page and field limit refuse safely without mutating originals',()=>{
 const original={...field('full',0,0),width:1,height:1};
 assert.throws(()=>duplicatePdfField([original],original,'copy'),/PDF_FIELD_NO_SPACE/);
 assert.throws(()=>duplicatePdfField(Array(100).fill(original),original,'copy'),/PDF_FIELD_LIMIT/);
});
test('alignment and size match reference; collisions and page overflow are atomic refusals',()=>{
 const a=field('a',.2,.2),b={...field('b',.1,.5),width:.4,height:.05};
 assert.equal(alignPdfField([a,b],a,b,'left').x,.1);
 assert.equal(alignPdfField([a,b],a,b,'right').x,.2);
 assert.equal(alignPdfField([a,b],a,b,'size').height,.05);
 assert.throws(()=>alignPdfField([a,b],a,b,'top'),/PDF_FIELD_PLACEMENT/);
 assert.throws(()=>alignPdfField([a,b],{...a,x:.7},b,'size'),/PDF_FIELD_PLACEMENT/);
 assert.throws(()=>alignPdfField([a,b],a,{...b,page:2},'left'),/PDF_FIELD_REFERENCE/);
 assert.equal(a.y,.2);
});

test('locked geometry cannot be aligned, and copies are intentionally unlocked',()=>{
 const a={...field('a'),locked:true},b=field('b',.5,.5);
 assert.throws(()=>alignPdfField([a,b],a,b,'left'),/PDF_FIELD_LOCKED/);
 const copy=duplicatePdfField([a,b],a,'copy');assert.equal(copy.locked,undefined);assert.equal(a.locked,true);
});
