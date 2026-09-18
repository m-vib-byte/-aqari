import test from 'node:test';
import assert from 'node:assert/strict';
import {formatMaintenanceMetric} from '../src/v267/components/legacy-maintenance-locale.js';
import {createLiveTextTranslator} from '../src/v267/components/live-locale-text.js';

test('maintenance display keeps all three dinar decimals across the five locales',()=>{
 for(const [lang,tag] of Object.entries({ar:'ar-KW',en:'en-KW',hi:'hi-IN',ur:'ur-PK',ml:'ml-IN'})){
  const value=formatMaintenanceMetric('125.125 د.ك','cost',lang);
  const parts=new Intl.NumberFormat(tag,{style:'currency',currency:'KWD',minimumFractionDigits:3}).formatToParts(125.125);
  assert.equal(value,parts.map(p=>p.value).join(''));
  assert.equal(parts.find(p=>p.type==='fraction').value.length,3);
 }
});
test('live metric updates replace prior translated values, including zero',()=>{
 const owner={},render=createLiveTextTranslator(x=>formatMaintenanceMetric(x,'response','en'));
 const first=render(owner,'12 دقيقة');assert.equal(render(owner,first),first);
 const second=render(owner,'0 دقيقة');assert.notEqual(second,first);assert.equal(render(owner,second),second);
});
test('descriptions and already formatted text are not parsed as raw metrics',()=>{
 for(const input of ['اسم الفني','صيانة 125.125 د.ك','125.125 د.ك ملاحظة','KWD 125.125','—']){
  assert.equal(formatMaintenanceMetric(input,'cost','en'),input);
 }
});
