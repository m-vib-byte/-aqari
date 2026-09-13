import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../src/v267/pages/property-statements.js',import.meta.url),'utf8');
const api=readFileSync(new URL('../src/v267/api/operational-report.js',import.meta.url),'utf8');
const has=(source,pattern)=>assert.match(source,pattern);

test('collection and collector views expose both PDF and Excel export controls',()=>{
 has(page,/تنزيل Excel للنتائج/);has(page,/تحميل PDF للنتائج/);
 has(page,/attachOperationalExports\(collectionResult,'collection'\)/);
 has(page,/attachOperationalExports\(collectorResult,'collectors'\)/);
});

test('UI exports verified server snapshots instead of displayed report lines',()=>{
 has(page,/readOperationalReport\(d,\{kind,format,propertyId:select\.value,month:month\.value\}\)/);
 has(page,/createOperationalReportXlsx\(verified\)/);
 assert.doesNotMatch(page,/createOperationalReportXlsx\(report\)/);
 has(page,/لا يعتمد على الصفحة المعروضة أو صفوف مخزنة في المتصفح/);
});

test('operational API request contains only identity filters and format, never report rows',()=>{
 has(api,/JSON\.stringify\(\{workspaceId:dialog\.session\.bound\.workspace,propertyId,month,report:kind,format\}\)/);
 assert.doesNotMatch(api,/rows\s*:/);
 has(api,/cache:'no-store'/);has(api,/redirect:'error'/);
});

test('session identity is rechecked after export response',()=>{
 has(api,/auth\?\.user\?\.id!==dialog\.session\.bound\.user/);
 has(api,/final\?\.user\?\.id!==auth\.user\.id/);
 has(api,/response\.status===409/);
});
