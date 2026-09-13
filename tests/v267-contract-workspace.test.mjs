import test from 'node:test';
import assert from 'node:assert/strict';
import {contractSearchKey,contractGroup,filterContracts,contractNextStep,mountContractJourney} from '../src/v267/components/contract-workspace.js';
const rows=[{id:1,contract_no:'AQ-401',tenant:'أَحْمَد المطيري',property:'برج شيخة',unit:'٤٠١',status:'approved',tenantProfile:{nameEn:'Ahmed Almutairi'}},{id:2,contract_no:'AQ-402',tenant:'سالم',property:'برج مرزوق',unit:'402',status:'signed'},{id:3,contract_no:'SOURCE-403',tenant:'حمد',property:'برج شيخة',unit:'403',status:'signed',source:'statement-import'}];
test('search joins tenant, contract, property and unit with Arabic and Persian digits',()=>{
 assert.equal(contractSearchKey(' أَحـمد ۴۰۱ '),'احمد 401');
 for(const query of ['احمد 401','Ahmed شيخة','AQ-٤٠١','أَحْمَد'])assert.deepEqual(filterContracts(rows,{query}).map(c=>c.id),[1]);
 assert.deepEqual(filterContracts(rows,{query:'۴۰۲',property:'برج مرزوق',stage:'signed'}).map(c=>c.id),[2]);
 assert.equal(filterContracts(rows,{query:'احمد',property:'برج مرزوق'}).length,0);
});
test('imported and unknown contracts remain distinct from operational signing stages',()=>{
 assert.equal(contractGroup(rows[2]),'imported');assert.equal(contractGroup({status:'future'}),'unknown');
 assert.equal(filterContracts(rows,{stage:'signed'}).length,1);assert.match(contractNextStep(rows[2]),/المصدر/);
 for(const status of ['cancelled','expired'])assert.equal(contractGroup({status}),'archived');
 const original=structuredClone(rows);filterContracts(rows,{query:'لا يوجد'});assert.deepEqual(rows,original);
});
test('saved dates and status are not silently rewritten into inferred expiry or signature claims',()=>{
 const c={status:'signed',end_date:'2000-01-01'};assert.equal(contractGroup(c),'signed');assert.match(contractNextStep(c),/الأصل الموقّع/);assert.equal(c.status,'signed');
});
test('journey distinguishes a signed status from the presence of its saved document',()=>{
 const prior=globalThis.document;class Element{constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};}append(...x){this.children.push(...x);}setAttribute(k,v){this.attributes[k]=v;}}
 globalThis.document={createElement:tag=>new Element(tag)};const flatten=x=>[x,...x.children.flatMap(flatten)];
 try{for(const hasSignedDocument of [false,true]){const d={body:new Element('div')};mountContractJourney(d,{status:'signed'},{hasSignedDocument});const text=flatten(d.body).map(x=>x.textContent||'').join('\n');assert.equal(text.includes('لكن الأصل غير ظاهر'),!hasSignedDocument);assert.equal(text.includes('يوجد أصل موقّع مرفوع'),hasSignedDocument);assert.equal(flatten(d.body).filter(x=>x.attributes['aria-current']==='step').length,1);}
 const d={body:new Element('div')};mountContractJourney(d,{status:'cancelled'});assert.equal(flatten(d.body).some(x=>x.tagName==='ol'),false);
 }finally{globalThis.document=prior;}
});
