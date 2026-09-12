const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const source=readFileSync(resolve(__dirname,'../staging-database/sql/petty-cash-close.sql'),'utf8');
const ui=readFileSync(resolve(__dirname,'../src/v267/pages/operations-center.js'),'utf8');

test('petty-cash close is a protected finance action with AAL2',()=>{
 assert.match(source,/auth\.uid\(\) is null or not private\.aqari_manager\(p_workspace_id\)/);
 assert.match(source,/private\.aqari_can\(p_workspace_id,'finance','write'\)/);
 assert.match(source,/private\.aqari_require_sensitive_aal2\(p_workspace_id\)/);
 assert.match(source,/grant execute on function public\.aqari_petty_cash_close[\s\S]*to authenticated/);
});

test('petty-cash close locks the current version and requires zero balance',()=>{
 assert.match(source,/for update/);
 assert.match(source,/REVISION_CONFLICT/);
 assert.match(source,/f\.status<>'open'/);
 assert.match(source,/f\.balance<>0/);
 assert.match(source,/PETTY_CASH_BALANCE_NOT_ZERO/);
});

test('petty-cash close is audited with before and after snapshots and a reason',()=>{
 assert.match(source,/PETTY_CASH_CLOSE_REASON_REQUIRED/);
 assert.match(source,/private\.aqari_operations_audit/);
 assert.match(source,/'petty_cash',p_fund_id,'close'/);
 assert.match(source,/before_row,after_row/);
});

test('petty-cash close preserves ledger history instead of deleting entries',()=>{
 assert.doesNotMatch(source,/delete\s+from\s+private\.aqari_petty_cash/i);
 assert.match(source,/set status='closed',revision=x\.revision\+1/);
});

test('operations UI exposes close only at zero balance and sends the current revision',()=>{
 assert.match(ui,/client\.rpc\('aqari_petty_cash_close',\{p_workspace_id:d\.session\.bound\.workspace,p_fund_id:fund\.id,p_revision:fund\.revision,p_reason:reason\}\)/);
 assert.match(ui,/if\(Number\(fund\.balance\)===0\)/);
 assert.match(ui,/closeReason\.required=true;closeReason\.minLength=3;closeReason\.maxLength=500/);
 assert.match(ui,/required\(closeReason\.value,'سبب الإقفال',3\)/);
});

test('operations UI verifies closed status, revision increment and zero balance by readback',()=>{
 assert.match(ui,/row\.id===fund\.id&&row\.status==='closed'&&row\.revision===fund\.revision\+1&&Number\(row\.balance\)===0/);
 assert.match(ui,/تم إقفال العهدة والتحقق بإعادة القراءة من قاعدة البيانات/);
});
