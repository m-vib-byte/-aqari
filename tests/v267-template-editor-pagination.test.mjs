import test from 'node:test';
import assert from 'node:assert/strict';
import {fragmentTemplateText,templateTextLineCount,paginateTemplateTextMeasured} from '../src/v267/domain/template-editor-pagination.js';
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

test('measured pages use remaining space and actual heights rather than a fixed character cap',()=>{
 const text='x'.repeat(950),measure=(raw,{firstFragment})=>Math.ceil(raw.length/50)*20+(firstFragment?30:0);
 const fragments=paginateTemplateTextMeasured(text,[],{measure,firstPageHeight:150,pageHeight:230,tolerance:0});
 assert.deepEqual(fragments.map(part=>[part.pageOffset,part.text.length,part.height]),[[0,300,150],[1,550,220],[2,100,40]]);
 assert.equal(fragments.map(part=>part.text).join(''),text);assert.ok(fragments.every(part=>!part.overflow));
});

test('title and first atomic field move together when remaining page space is insufficient',()=>{
 const fields=[field('tenant_name','اسم المستأجر')],text='{{tenant_name}} tail',seen=[];
 const fragments=paginateTemplateTextMeasured(text,fields,{firstPageHeight:25,pageHeight:100,measure:(raw,context)=>{
  seen.push({...context,raw});assert.ok(!raw.includes('{{')||raw.includes('}}'));return (context.firstFragment?30:0)+raw.length;
 }});
 assert.equal(fragments[0].pageOffset,1);assert.equal(fragments[0].text,text);assert.equal(fragments[0].height,50);
 assert.ok(seen.filter(call=>call.pageOffset===1).every(call=>call.firstFragment));
});

test('measured pagination preserves 36 clauses, whitespace, complete tokens and Unicode clusters',()=>{
 const fields=[field('tenant_name','اسم المستأجر / Tenant')];
 const text='\ufeff  '+Array.from({length:36},(_,i)=>`${i+1}- نصّ أَصليّ 👨‍👩‍👧‍👦 English e\u0301 {{tenant_name}} {{field_name}}\r\n\t  `).join('\n')+'\u200f نهاية  ';
 const original=tokenizeTemplateText(text,fields).filter(part=>part.type==='field').map(part=>part.raw),measured=[];
 const fragments=paginateTemplateTextMeasured(text,fields,{firstPageHeight:110,pageHeight:230,measure:(raw,{firstFragment})=>{
  measured.push(raw);return templateTextLineCount(raw,fields,52)*19+(firstFragment?35:0);
 }});
 assert.equal(fragments.map(part=>part.text).join(''),text);
 assert.deepEqual(fragments.flatMap(part=>tokenizeTemplateText(part.text,fields)).filter(part=>part.type==='field').map(part=>part.raw),original);
 for(const raw of [...measured,...fragments.map(part=>part.text)]){
  assert.ok(!/[\uD800-\uDBFF]$/.test(raw));assert.ok(!/^[\uDC00-\uDFFF]/.test(raw));assert.ok(!/^\u200d|\u200d$/.test(raw));
  assert.ok(!raw.endsWith('\r'));assert.ok(!raw.endsWith('e'));assert.ok(!raw.endsWith('{'));
 }
 assert.ok(fragments.every(part=>!part.overflow&&part.height<=(part.pageOffset?230:110)+.25));
});

test('measured breaks prefer nearby paragraphs and leave every separator in its original order',()=>{
 const text='a'.repeat(91)+'\n'+'b'.repeat(160),fragments=paginateTemplateTextMeasured(text,[],{firstPageHeight:100,pageHeight:100,measure:raw=>raw.length,tolerance:0});
 assert.equal(fragments[0].text,'a'.repeat(91)+'\n');assert.equal(fragments.map(part=>part.text).join(''),text);
 assert.ok(fragments.every(part=>part.height<=100));
});

test('an oversized indivisible field is retained and explicitly marked instead of looping or clipping',()=>{
 const fields=[field('aa','Long label')],text='{{aa}} next';
 const fragments=paginateTemplateTextMeasured(text,fields,{firstPageHeight:20,pageHeight:100,measure:raw=>raw.includes('{{aa}}')?180:raw.length});
 assert.deepEqual(fragments[0],{text:'{{aa}}',pageOffset:1,height:180,overflow:true});assert.equal(fragments[1].text,' next');assert.equal(fragments[1].overflow,false);
 assert.equal(fragments.map(part=>part.text).join(''),text);
});

test('empty clauses retain their title and move to a new page when needed',()=>{
 assert.deepEqual(paginateTemplateTextMeasured('',[],{firstPageHeight:10,pageHeight:100,measure:()=>40}),[{text:'',pageOffset:1,height:40,overflow:false}]);
 assert.deepEqual(paginateTemplateTextMeasured('',[],{firstPageHeight:100,pageHeight:100,measure:()=>140}),[{text:'',pageOffset:0,height:140,overflow:true}]);
});

test('measurement work stays bounded for a long document and never scans all remaining text per page',()=>{
 const text='x'.repeat(80000);let calls=0,longest=0;
 const fragments=paginateTemplateTextMeasured(text,[],{firstPageHeight:500,pageHeight:1000,measure:raw=>{calls++;longest=Math.max(longest,raw.length);return Math.ceil(raw.length/100)*20;}});
 assert.equal(fragments.map(part=>part.text).join(''),text);assert.equal(fragments.length,17);assert.ok(calls<400);assert.ok(longest<=10000);
});

test('invalid dimensions and invalid measurement results fail explicitly',()=>{
 for(const change of [{firstPageHeight:-1},{firstPageHeight:Infinity},{pageHeight:0},{pageHeight:NaN},{tolerance:-1},{measure:null}])assert.throws(()=>paginateTemplateTextMeasured('text',[],{firstPageHeight:100,pageHeight:100,measure:raw=>raw.length,...change}));
 for(const value of [NaN,Infinity,-1,'10',Promise.resolve(10)])assert.throws(()=>paginateTemplateTextMeasured('text',[],{firstPageHeight:100,pageHeight:100,measure:()=>value}),RangeError);
});

test('measurement receives exact UTF-16 source offsets for repeated text and styled fragments',()=>{
 const text='😀 aa {{tenant_name}} '.repeat(30),fields=[field('tenant_name','المستأجر')],seen=[];
 const fragments=paginateTemplateTextMeasured(text,fields,{firstPageHeight:50,pageHeight:50,tolerance:0,measure:(raw,context)=>{
  assert.equal(text.slice(context.sourceOffset,context.sourceOffset+raw.length),raw);
  seen.push({...context,raw});return raw.length*(context.sourceOffset>=100?2:1);
 }});
 let offset=0;
 for(const part of fragments){assert.ok(seen.some(call=>call.sourceOffset===offset&&call.raw===part.text));offset+=part.text.length;}
 assert.equal(offset,text.length);assert.ok(new Set(seen.map(call=>call.sourceOffset)).size>3);
 const empty=[];paginateTemplateTextMeasured('',[],{firstPageHeight:0,pageHeight:50,measure:(raw,context)=>{empty.push(context);return 20;}});
 assert.deepEqual(empty.map(call=>call.sourceOffset),[0,0]);
});
