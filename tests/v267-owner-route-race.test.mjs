import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/v267/owner-feedback-runtime.js',import.meta.url),'utf8');
test('an older route cannot decorate the shared page after a newer click',async()=>{
 const frames=[],decorated=[],routes=[];
 const box={routeFlight:0,scope:()=>({user:'u',workspace:'w'}),setStatus(){},PRIMARY:new Set(['properties','tenants']),waitPaint:()=>new Promise(r=>frames.push(r)),exactRouteReady:()=>true,decoratePage:r=>decorated.push(r),syncActive(){},routePage:()=>({scrollIntoView(){}}),CustomEvent:class{},document:{body:{dataset:{},getAttribute:()=>routes.at(-1)}},window:{dispatchEvent(){},AQARI_V205:{navigate:r=>routes.push(r)}}};
 vm.createContext(box);vm.runInContext(source.slice(source.indexOf('async function navigateRoute('),source.indexOf('function serviceButton(')),box);
 const first=box.navigateRoute('properties'),second=box.navigateRoute('tenants');
 frames[1]();await second;frames[0]();assert.equal(await first,false);
 assert.deepEqual(decorated,['tenants']);assert.equal(box.document.body.dataset.aqExactRoute,'tenants');assert.deepEqual(routes,['properties','tenants']);
});
