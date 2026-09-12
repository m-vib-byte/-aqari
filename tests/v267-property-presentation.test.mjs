import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {presentation,validatePresentation,withPresentation,searchProperties,contactPhone,summaryMarkup,priceLabel,safePhoto} from '../src/v267/domain/property-presentation.js';
const blank={location:'',price:'',purpose:'rent',phone:'',photos:[]};
const sample=['برج أُلفة ٤٠١','مالك اختبار','12','3500 د.ك',{externalId:'keep'}];
const row=withPresentation(sample,{...blank,location:'السالمية، قطعة ٤',price:'٣٥٠٫١٢٥',phone:'٥١٢٣٤٥٦٧'});
test('search matches Arabic diacritics, hamza, spelling variants and local digits across name, area and owner',()=>{
 assert.deepEqual(searchProperties([row],'الفه 401'),[row]);assert.deepEqual(searchProperties([row],'سالمية 4'),[row]);assert.deepEqual(searchProperties([row],'مالك اختبار'),[row]);assert.deepEqual(searchProperties([row],'الفه الجهراء'),[]);
});
test('metadata preserves every legacy field and replaces only its own versioned extension',()=>{
 const updated=withPresentation(row,{...blank,location:'حولي',price:'400',purpose:'sale'});
 assert.deepEqual(updated.slice(0,5),sample);assert.equal(updated.filter(x=>x?.aqariPropertyPresentation===1).length,1);assert.equal(presentation(updated).price,'400');assert.equal(row[3],'3500 د.ك');
});
test('sale price and source income remain separate; missing prices or purpose are not invented',()=>{
 assert.match(priceLabel(row),/شهر/);assert.doesNotMatch(priceLabel(withPresentation(sample,{...blank,price:'12345',purpose:'sale'})),/شهر/);assert.equal(priceLabel(sample),'السعر غير مضاف');assert.equal(presentation(sample).purpose,'');assert.doesNotMatch(summaryMarkup(sample),/للإيجار|للبيع|tel:|wa.me/);
});
test('prices and contact numbers reject ambiguous values',()=>{
 for(const price of ['-1','0','NaN','1e5','1.1234'])assert.throws(()=>validatePresentation({...blank,price}));
 assert.equal(contactPhone('00965 5123 4567'),'+96551234567');assert.equal(contactPhone('+1 (312) 555-0123'),'+13125550123');assert.equal(contactPhone('96551234567'),'');assert.equal(contactPhone('51234567?x=1'),'');
 assert.throws(()=>validatePresentation({...blank,phone:'abc'}));
});
test('contact links are explicit and encoded; user text cannot create HTML or external image requests',()=>{
 const unsafe=withPresentation(['<img src=x onerror=alert(1)>','','',''],{...blank,location:'"><script>alert(1)</script>',phone:'51234567'});
 const html=summaryMarkup(unsafe);assert.doesNotMatch(html,/<script>|onerror=/);assert.match(html,/tel:\+96551234567/);assert.match(html,/https:\/\/wa.me\/96551234567\?text=/);assert.match(html,/noopener noreferrer/);
 assert.equal(safePhoto('https://example.com/tracker.jpg'),'');assert.equal(safePhoto('data:image/svg+xml;base64,PHN2Zz4='),'');assert.throws(()=>validatePresentation({...blank,photos:['data:image/jpeg;base64,bad']}));assert.throws(()=>validatePresentation({...blank,photos:Array(5).fill('data:image/jpeg;base64,/9j/AAAA')}));
});
test('property metadata and photos survive cloud save plus independent JSONB-style readback',async()=>{
 const ctx={module:{exports:{}},structuredClone};vm.createContext(ctx);vm.runInContext(readFileSync(new URL('../v267-rental-records.js',import.meta.url),'utf8'),ctx);const api=ctx.module.exports;
 let local={properties:[sample],audit:[]},remote=structuredClone(local),revision=1;const scope={workspaceId:'fixture',userId:'fixture'};
 const store=api.createStore({scope:()=>scope,local:()=>local,load:async()=>({payload:structuredClone(remote),revision}),save:async(payload,r)=>{assert.equal(r,revision);remote=JSON.parse(JSON.stringify(payload));revision++;},cache(){}});
 const expected=withPresentation(sample,{...blank,price:'350.125',photos:['data:image/jpeg;base64,/9j/AAAA']});
 await store.change(['properties','audit'],data=>{data.properties[0]=expected;return expected;},(data,value)=>JSON.stringify(data.properties[0])===JSON.stringify(value));
 local=structuredClone(remote);assert.equal(presentation(local.properties[0]).price,'350.125');assert.equal(presentation(local.properties[0]).photos.length,1);assert.equal(local.properties[0][4].externalId,'keep');
});
