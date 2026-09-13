import test from 'node:test';
import assert from 'node:assert/strict';
import {partnerDistributionView,partnerFils} from '../src/v267/components/partner-distribution-view.js';
import {setLocale} from '../src/v267/components/locale.js';

test('partner amounts preserve every fils and sign without floating point conversion',()=>{
 for(const [input,expected] of [['0','0.000'],['1','0.001'],['-1','-0.001'],['333','0.333'],['1000','1.000'],['99999999999999999','99999999999999.999']])assert.equal(partnerFils(input),expected);
});
test('partner view keeps unavailable distinct from empty and renders only the returned owner',()=>{
 const previous=globalThis.document;
 class Element{constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.textContent='';}append(...nodes){this.children.push(...nodes);}}
 globalThis.document={createElement:tag=>new Element(tag)};
 const text=el=>[el.textContent,...el.children.map(text)].join(' ');
 try{
  setLocale('ar',null);
  assert.match(text(partnerDistributionView(null)),/تعذر استرجاع/);
  assert.match(text(partnerDistributionView({entries:[],balance_fils:'0'})),/لا توجد توزيعات/);
  const data={balance_fils:'333',entries:[{id:'A-1',kind:'distribution',owner_id:'o-1',name:'<اسم محفوظ>',bps:3333,amount_fils:'333',occurred_on:'2026-09-12',source_snapshot:'PRIVATE_SOURCE_MUST_NOT_RENDER'}]};
  const view=text(partnerDistributionView(data));assert.match(view,/<اسم محفوظ>/);assert.match(view,/33\.33%/);assert.match(view,/0\.333/);assert.doesNotMatch(view,/PRIVATE_SOURCE/);
  for(const lang of ['en','hi','ur','ml']){setLocale(lang,null);const localized=text(partnerDistributionView(data));assert.doesNotMatch(localized,/مستحقاتي المعتمدة/);assert.match(localized,/<اسم محفوظ>/);}
 }finally{globalThis.document=previous;setLocale('ar',null);}
});
