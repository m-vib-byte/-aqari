import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const runtime=read('src/v267/live-stability-runtime.js');
const css=read('src/v267/styles/live-stability.css');
const installer=read('scripts/install-v267-live-stability.mjs');
const ownerInstaller=read('scripts/install-v267-owner-feedback.mjs');

test('Work1 uses one canonical visible shell instead of stacking dashboard layers',()=>{
 for(const id of ['#aqUnifiedExperience','#aqUnifiedMobileNav','#aqOwnerReferenceRail','#aqOwnerReferenceCommand'])assert.match(runtime,new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 assert.match(runtime,/aqStabilitySuppressed/);
 assert.match(css,/#aqUnifiedExperience[^\n]*display:none!important/);
 assert.match(css,/#aqOwnerExactHome\{display:grid!important/);
});

test('dashboard augmentation reads existing authoritative UI only and never invents business writes',()=>{
 for(const label of ['تحصيل اليوم','تحصيل الشهر','المستحق','المتبقي','العقارات','الوحدات','الإشغال','المستأجرون','العقود النشطة','تنتهي خلال 30 يومًا','الصيانة المفتوحة','المصروفات','صافي السجلات','أحدث العمليات'])assert.match(runtime,new RegExp(label));
 assert.match(runtime,/sourceValue\(/);
 assert.match(runtime,/fallback='—'/);
 assert.doesNotMatch(runtime,/\.insert\(|\.update\(|\.delete\(|\.upsert\(|localStorage|sessionStorage/);
});

test('reference dashboard retains mobile and tablet layouts with six desktop metrics',()=>{
 assert.match(css,/@media\(max-width:699px\)/);
 assert.match(css,/@media\(min-width:700px\) and \(max-width:1049px\)/);
 assert.match(css,/@media\(min-width:1050px\)/);
 assert.match(css,/safe-area-inset-top/);
 assert.match(css,/safe-area-inset-bottom/);
 assert.match(css,/#aqOwnerExactRail\{display:none!important/);
 assert.match(css,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
 assert.match(css,/'properties collections assistant' 'quick alerts report'/);
});

test('internal pages dialogs forms tables and LTR direction share the same final stability grammar',()=>{
 for(const token of ['main.w>.p.on:not(#home)','aq267-dialog','input,select,textarea','table','table-wrap',"html[dir='ltr']"])assert.match(css,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 assert.match(css,/aq-st-success/);
 assert.match(css,/aq-st-danger/);
});

test('live stability is installed after the successful iPhone startup blocker',()=>{
 assert.match(ownerInstaller,/await import\('\.\/install-v267-iphone-startup-fix\.mjs'\)/);
 assert.match(ownerInstaller,/await import\('\.\/install-v267-live-stability\.mjs'\)/);
 assert.ok(ownerInstaller.indexOf("install-v267-live-stability.mjs")>ownerInstaller.indexOf("install-v267-iphone-startup-fix.mjs"));
 assert.match(installer,/aqari-v267-live-stability-js/);
 assert.match(installer,/v267-live-stability\.test\.mjs/);
});

