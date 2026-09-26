import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {patchTodayPayments} from '../src/v267/support/today-payments-patch.js';
import {patchTodayKnetUi,patchProtectedKnetApi} from '../src/v267/support/today-knet-details-patch.js';
import {patchKnetRangeFilters,KNET_RANGE_MARKER} from '../src/v267/support/knet-range-filters-patch.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('KNET range filters extend the protected current command center without storage writes',()=>{
 const today=patchTodayPayments(read('v210-daily-command-center.js'));
 const knet=patchTodayKnetUi(today);
 const current=patchKnetRangeFilters(knet);
 assert.ok(current.includes(KNET_RANGE_MARKER));
 for(const mode of ['today','yesterday','month','custom'])assert.match(current,new RegExp('data-v267-knet-range="'+mode+'"'));
 assert.match(current,/id="v267KnetFrom"/);assert.match(current,/id="v267KnetTo"/);
 assert.match(current,/AQARI_V202\?\.dailyKnetPayments/);
 assert.match(current,/Math\.floor\(\(end-start\)\/dayMs\)>365/);
 assert.match(current,/v267KnetRangeMarkup/);
 assert.doesNotMatch(current,/localStorage|sessionStorage/);
 new Function(current);
});

test('range layer keeps protected KNET API parseable and is idempotent',()=>{
 const api=patchProtectedKnetApi(read('v202-property-os.js'));new Function(api);
 const current=patchTodayKnetUi(patchTodayPayments(read('v210-daily-command-center.js')));
 const once=patchKnetRangeFilters(current);assert.equal(patchKnetRangeFilters(once),once);
});

test('range layer fails closed when KNET UI has not been installed',()=>{
 assert.throws(()=>patchKnetRangeFilters(read('v210-daily-command-center.js')),/anchor not found/);
});
