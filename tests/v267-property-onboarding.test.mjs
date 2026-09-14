import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../src/v267/pages/property-onboarding.js',import.meta.url),'utf8');
const experience=readFileSync(new URL('../src/v267/components/property-experience.js',import.meta.url),'utf8');
const upload=readFileSync(new URL('../src/v267/components/original-document-upload.js',import.meta.url),'utf8');

test('property add action opens the unified onboarding instead of the legacy property form',()=>{
 assert.match(experience,/property-onboarding\.js/);
 assert.match(experience,/openPropertyOnboarding/);
 assert.doesNotMatch(experience,/openRecord\('properties'\)/);
});

test('one onboarding screen captures master data owners contacts and every requested asset group',()=>{
 for(const label of ['اسم العقار','العنوان','نوع العقار','حالة العقار','الدخل المعلن','البريد الرسمي للعقار','الهاتف','واتساب','الملاك والحصص','شعار العقار','صور العقار','وثيقة الملكية','المخططات والكروكيات','مستندات أخرى'])assert.match(page,new RegExp(label));
 assert.match(page,/reduce\(\(sum,o\)=>sum\+o\.bps,0\)!==10000/);
 assert.match(page,/aqari_workspace_access/);
 assert.match(page,/permissions\?\.properties\?\.write/);
 assert.match(page,/permissions\?\.documents\?\.write/);
});

test('onboarding persists compatibility row then archives originals and finishes authoritative master with readback',()=>{
 assert.match(page,/loadAppState/);
 assert.match(page,/saveAppState/);
 assert.match(page,/aqari_properties/);
 assert.match(page,/createOriginalDocumentUpload/);
 assert.match(page,/aqari_property_master_save/);
 assert.match(page,/aqari_property_full_file/);
 assert.match(page,/مستند مرفوع لم يظهر في الملف الكامل/);
 assert.match(page,/aqari:property-saved/);
});

test('logo photos and general property files use explicit supporting-document asset categories',()=>{
 assert.match(upload,/property_logo:\{documentType:'supporting_document'/);
 assert.match(upload,/property_photo:\{documentType:'supporting_document'/);
 assert.match(upload,/property_other:\{documentType:'supporting_document'/);
 assert.match(upload,/asset_role/);
 assert.match(page,/category:'property_logo'/);
 assert.match(page,/category:'property_photo'/);
 assert.match(page,/category:'title_deed'/);
 assert.match(page,/category:'site_plan'/);
 assert.match(page,/category:'property_other'/);
});

test('archive retry keeps successful document ids and never asks storage or database to delete an archived original',()=>{
 assert.match(page,/uploaded=new Map\(\)/);
 assert.match(page,/if\(uploaded\.has\(entry\.key\)\)continue/);
 assert.match(upload,/createVerifiedUpload/);
 assert.doesNotMatch(page,/\.storage\.from\([^)]*\)\.remove\(/);
 assert.doesNotMatch(page,/\.from\([^)]*\)\.delete\(/);
 assert.doesNotMatch(upload,/\.storage\.from\([^)]*\)\.remove\(/);
 assert.doesNotMatch(upload,/\.from\([^)]*\)\.delete\(/);
});
