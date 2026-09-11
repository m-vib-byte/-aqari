const test=require('node:test');const assert=require('node:assert/strict');const {readFileSync}=require('node:fs');const {resolve}=require('node:path');
const source=readFileSync(resolve(__dirname,'../src/v267/pages/maintenance-plans.js'),'utf8');
test('maintenance UI uses only the persistent maintenance RPC',()=>{assert.match(source,/aqari_maintenance_plans/);assert.doesNotMatch(source,/localStorage|sessionStorage/);});
test('every maintenance write is verified by a fresh list read',()=>{assert.match(source,/await rpc\(action,payload\);await load\(proof\)/);assert.match(source,/تعذر مطابقة العملية/);});
test('UI covers plan, task generation, evidence-backed completion and alert preparation',()=>{for(const action of ["write('save'","write('generate_task'","write('complete_task'","write('prepare_alerts'"])assert.ok(source.includes(action),action);assert.match(source,/photo_document_ids:\[doc\.value\]/);});
test('alerts are explicitly not represented as externally delivered',()=>{assert.match(source,/لا تُعرض كرسائل مُرسلة/);});
