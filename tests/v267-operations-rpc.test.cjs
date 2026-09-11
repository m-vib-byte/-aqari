const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const source=readFileSync(resolve(__dirname,'../staging-database/sql/operations-register.sql'),'utf8');

test('operations RPC is one authenticated manager boundary with explicit domains',()=>{
 assert.match(source,/auth\.uid\(\) is null or not private\.aqari_manager\(w\)/);
 assert.match(source,/p_action<>'list' then perform private\.aqari_require_sensitive_aal2\(w\)/);
 assert.match(source,/p_domain not in \('overview','cheques','vendors','work_orders','legal_cases','petty_cash'\)/);
 assert.match(source,/revoke all on function[\s\S]*from public,anon,authenticated/);
 assert.match(source,/grant execute on function public\.aqari_operations_register[\s\S]*to authenticated/);
});
test('returned cheques create one immutable tenant debit and freeze renewal',()=>{
 assert.match(source,/next_state='returned' then true/);
 assert.match(source,/kind,direction,amount[\s\S]*'cheque_return','debit'/);
 assert.match(source,/unique\(workspace_id,source_type,source_id\)/);
});
test('work-order, legal and petty-cash expenses use the canonical financial register',()=>{
 assert.equal((source.match(/private\.aqari_operations_expense\(/g)||[]).length>=4,true);
 assert.match(source,/private\.aqari_financial_open\(w,d\)/);
 assert.match(source,/private\.aqari_financial_expenses/);
 assert.match(source,/DOCUMENT_REQUIRED_AND_UNVERIFIED/);
});
test('all state transitions require revision checks or locked current rows',()=>{
 assert.match(source,/REVISION_CONFLICT/);
 assert.equal((source.match(/for update/g)||[]).length>=5,true);
 assert.match(source,/INVALID_CHEQUE_TRANSITION/);
 assert.match(source,/INVALID_WORK_ORDER_TRANSITION/);
});
test('private operational and audit ledgers deny direct browser access',()=>{
 assert.match(source,/enable row level security/);
 assert.match(source,/revoke all on private\.aqari_tenant_adjustments from public,anon,authenticated/);
 assert.match(source,/aqari_operations_audit_immutable/);
});
