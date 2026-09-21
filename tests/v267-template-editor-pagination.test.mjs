import test from 'node:test';
import assert from 'node:assert/strict';
import {fragmentTemplateText,templateTextLineCount} from '../src/v267/domain/template-editor-pagination.js';
import {tokenizeTemplateText} from '../src/v267/domain/rental-document-layout.js';

const field=(key,label)=>({key,label,type:'text',required:false});

test('visible long chip labels determine pagination instead of short hidden keys',()=>{
 const fields=[field('aa','اسم حقل خاص طويل بالعربية / Long English custom field label '.repeat(2))],text=Array(24).fill('{{aa}}').join(' ');
 assert.ok(templateTextLineCount(text,fields,41)>templateTextLineCount(text,[],41));
 const fragments=fragmentTemplateText(text,fields,{columns:41,lines:6});
 assert.ok(fragments.length>8);assert.equal(fragments.join(''),text);
 assert.equal(fragments.flatMap(part=>tokenizeTemplateText(part,fields)).filter(part=>part.type==='field').length,24);
 for(const fragment of fragments)assert.ok(templateTextLineCount(fragment,fields,41)<=6);
});

test('36 original provisions retain exact whitespace, newlines, Unicode and complete field tokens',()=>{
 const fields=[field('tenant_name','اسم المستأجر / Tenant name')];
 const text='\ufeff  عقد محل\r\n'+Array.from({length:36},(_,i)=>`${i+1}- نصّ أَصليّ محفوظ 👨‍👩‍👧‍👦 English e\u0301 {{tenant_name}} {{field_name}}\r\n\t  `).join('\n')+'\u200f نهاية  ';
 for(const [columns,lines] of [[41,6],[68,24],[90,30]]){
  const fragments=fragmentTemplateText(text,fields,{columns,lines});assert.equal(fragments.join(''),text);assert.ok(fragments.length>1);
  assert.deepEqual(fragments.flatMap(part=>tokenizeTemplateText(part,fields)).filter(part=>part.type==='field').map(part=>part.raw),tokenizeTemplateText(text,fields).filter(part=>part.type==='field').map(part=>part.raw));
  for(const fragment of fragments){assert.ok(templateTextLineCount(fragment,fields,columns)<=lines);assert.ok(!/[\uD800-\uDBFF]$/.test(fragment));assert.ok(!/^[\uDC00-\uDFFF]/.test(fragment));assert.ok(!/^\u200d|\u200d$/.test(fragment));}
 }
});

test('blank lines and CRLF remain source exact with no lost or fabricated separators',()=>{
 for(const text of ['', '\n', '\r\n', 'a\n\n\n b\r\n\t  c\n', '   \n  \n']){
  const fragments=fragmentTemplateText(text,[],{columns:3,lines:2});assert.equal(fragments.join(''),text);
  for(const fragment of fragments)assert.ok(templateTextLineCount(fragment,[],3)<=2);
 }
 assert.equal(templateTextLineCount('a\r\nb\nc',[],10),3);
 assert.equal(templateTextLineCount(''),1);
});

test('oversize indivisible chips make progress without cutting their source',()=>{
 const fields=[field('aa','W'.repeat(100))],text='{{aa}}{{aa}}';
 assert.deepEqual(fragmentTemplateText(text,fields,{columns:10,lines:2}),['{{aa}}','{{aa}}']);
 assert.equal(templateTextLineCount('{{aa}}',fields,10),11);
});

test('short visible chips do not inherit the length of generated technical identifiers',()=>{
 const fields=[field('custom_1234567890123456','رقم')];
 assert.equal(templateTextLineCount('{{custom_1234567890123456}}',fields,10),1);
 assert.equal(templateTextLineCount('12345678 {{custom_1234567890123456}}',fields,10),2);
});

test('invalid budgets are rejected instead of creating infinite fragment loops',()=>{
 for(const value of [0,-1,Infinity,NaN,'5']){
  assert.throws(()=>fragmentTemplateText('text',[],{columns:value}),RangeError);
  assert.throws(()=>fragmentTemplateText('text',[],{lines:value}),RangeError);
  assert.throws(()=>templateTextLineCount('text',[],value),RangeError);
 }
});
