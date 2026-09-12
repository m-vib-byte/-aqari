const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const source=readFileSync(resolve(__dirname,'../src/v267/pages/operations-center.js'),'utf8');
const workspace=readFileSync(resolve(__dirname,'../src/v267/workspace.js'),'utf8');

test('operations center reads every persisted domain through the controlled RPC',()=>{
 for(const domain of ['overview','cheques','vendors','work_orders','legal_cases','petty_cash'])assert.match(source,new RegExp(`rpc\\('${domain}','list'\\)`));
 assert.match(source,/aqari_operations_register/);
});
test('every create or transition is followed by database readback proof',()=>{
 assert.match(source,/await rpc\(domain,action,payload\);await load\(proof\)/);
 assert.match(source,/if\(proof&&!proof\(data\)\)throw Error/);
});
test('forms cover cheques, vendors, work orders, legal cases and petty cash',()=>{
 for(const action of ["runWrite('cheques','create'","runWrite('vendors','save'","runWrite('vendors','contract'","await write('work_orders','create'","runWrite('work_orders','invoice'","runWrite('legal_cases','create'","runWrite('legal_cases','event'","runWrite('legal_cases','cost'","runWrite('petty_cash','create'","runWrite('petty_cash','entry'"])assert.ok(source.includes(action),action);
});
test('financial operation forms require verified documents, reasons and readback identifiers',()=>{
 assert.match(source,/data\.overview\.documents\.filter/);
 assert.match(source,/document_id:doc\.value/);
 assert.match(source,/reason:required\(/);
 assert.match(source,/entries\.some\(row=>row\.id===entryId\)/);
});
test('the page never embeds sample business records or service credentials',()=>{
 assert.doesNotMatch(source,/service_role|SUPABASE_SERVICE|example\.com|TEST-/);
 assert.match(source,/crypto\.randomUUID\(\)/);
});

test('manager workspace exposes the real operations center without a production route',()=>{
 assert.match(workspace,/openOperationsCenter/);
 assert.match(workspace,/aq267-operations-center/);
 assert.doesNotMatch(workspace,/myaqari\.com/);
});
