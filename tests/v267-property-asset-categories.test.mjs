import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../staging-database/sql/property-asset-document-categories.sql',import.meta.url),'utf8');
const upload=readFileSync(new URL('../src/v267/components/original-document-upload.js',import.meta.url),'utf8');
const onboarding=readFileSync(new URL('../src/v267/pages/property-onboarding.js',import.meta.url),'utf8');

test('property visual assets are accepted only for property records and supporting documents',()=>{
 for(const category of ['property_logo','property_photo','property_other']){
  assert.match(sql,new RegExp(`when '${category}' then entity='property'`));
  assert.match(upload,new RegExp(`${category}:\\{documentType:'supporting_document'`));
 }
 assert.match(sql,/and kind=case category when 'signed_lease' then 'signed_contract' else 'supporting_document' end/);
 assert.match(upload,/const metadata=\{category:target\.category,asset_role:/);
 assert.match(upload,/p_metadata:metadata/);
});

test('integrated property onboarding routes deed plans logo photos and general attachments through archived originals',()=>{
 for(const category of ['property_logo','property_photo','title_deed','site_plan','property_other'])assert.match(onboarding,new RegExp(`category:'${category}'`));
 assert.match(onboarding,/createOriginalDocumentUpload/);
 assert.match(onboarding,/await upload\(entry\.file,\{type:'property',ref:created\.external_ref,category:entry\.category,title:entry\.title\}\)/);
 assert.match(onboarding,/if\(!ids\.has\(row\.id\)\)throw Error\('مستند مرفوع لم يظهر في الملف الكامل بعد إعادة القراءة\.'/);
});
