import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const settings=read('staging-database/sql/collection-delivery-settings-rpc-20260915.sql');
const stop=read('staging-database/sql/collection-reminder-stop-after-payment-20260915.sql');
const queue=read('staging-database/sql/collection-payment-delivery-queue-20260915.sql');
const page=read('src/v267/pages/collection-delivery-settings.js');
const operationsSchema=read('staging-database/sql/operations-completion.sql');
const operationsRpc=read('staging-database/sql/operations-register.sql');
const operationsPage=read('src/v267/pages/operations-center.js');
const financeCore=read('staging-database/sql/final-gap-finance-core-20260915.sql');
const financeRpc=read('staging-database/sql/final-gap-finance-live-20260915.sql');

test('collection delivery settings are property scoped, revisioned and manager MFA guarded',()=>{
 assert.match(settings,/aqari_collection_delivery_settings/);
 assert.match(settings,/private\.aqari_can_property\(w,p,'properties','read'\)/);
 assert.match(settings,/private\.aqari_manager\(w\)/);
 assert.match(settings,/private\.aqari_require_sensitive_aal2\(w\)/);
 assert.match(settings,/COLLECTION_DELIVERY_SETTINGS_REVISION_CONFLICT/);
 assert.match(settings,/OWNER_NOTIFICATION_WHATSAPP_REQUIRED/);
});

test('paid authoritative balance cancels only unsent rent reminders',()=>{
 assert.match(stop,/aqari_refresh_rent_due_schedule\(w,lid\)/);
 assert.match(stop,/o\.kind='rent_reminder'/);
 assert.match(stop,/o\.status in\('awaiting_configuration','queued','failed'\)/);
 assert.match(stop,/d\.balance<=0/);
 assert.match(stop,/after insert or update of status,amount on public\.aqari_rent_payments/);
});

test('payment queues idempotent receipt and selected owner WhatsApp events and cancellation dead-letters pending delivery',()=>{
 assert.match(queue,/'collection\.receipt'/);
 assert.match(queue,/'collection:receipt:'\|\|new\.id::text/);
 assert.match(queue,/'collection\.owner_whatsapp_summary'/);
 assert.match(queue,/'collection:owner-summary:'\|\|new\.id::text\|\|':'\|\|\(owner->>'id'\)/);
 assert.match(queue,/on conflict\(workspace_id,idempotency_key\) do nothing/);
 assert.match(queue,/PAYMENT_CANCELLED_BEFORE_DELIVERY/);
 assert.match(queue,/status='dead_letter'/);
});

test('collection delivery UI uses server context and exact revision readback',()=>{
 assert.match(page,/aqari_collection_delivery_settings/);
 assert.match(page,/ownerWhatsappEnabled/);
 assert.match(page,/receiptEnabled/);
 assert.match(page,/expectedRevision:Number\(state\.revision\|\|0\)/);
 assert.match(page,/Number\(saved\?\.revision\)!==Number\(state\.revision\|\|0\)\+1/);
 assert.match(page,/حدد مالكًا واحدًا على الأقل لديه رقم واتساب/);
});

test('operations domains are persisted with protected ledgers and immutable money evidence',()=>{
 for(const table of ['aqari_cheques','aqari_vendors','aqari_vendor_contracts','aqari_work_orders','aqari_legal_cases','aqari_legal_costs','aqari_petty_cash_funds','aqari_petty_cash_entries','aqari_unit_inspections'])assert.match(operationsSchema,new RegExp(table));
 for(const trigger of ['aqari_cheque_events_immutable','aqari_legal_costs_immutable','aqari_petty_cash_entries_immutable'])assert.match(operationsSchema,new RegExp(`create trigger ${trigger} before update or delete`));
 assert.match(operationsSchema,/enable row level security/);
 assert.match(operationsSchema,/revoke all on private\.%I from public,anon,authenticated/);
});

test('operations RPC requires manager and recent MFA for writes, and work-order invoice creates an authoritative expense link',()=>{
 assert.match(operationsRpc,/auth\.uid\(\) is null or not private\.aqari_manager\(w\)/);
 assert.match(operationsRpc,/if p_action<>'list' then perform private\.aqari_require_sensitive_aal2\(w\)/);
 assert.match(operationsRpc,/private\.aqari_operations_expense/);
 assert.match(operationsRpc,/work_order\.invoice_id is not null/);
 assert.match(operationsRpc,/expense_id:=nullif\(d->>'expense_id',''\)::uuid/);
 assert.match(operationsRpc,/WORK_ORDER_ALREADY_INVOICED/);
});

test('operations center exposes real persisted domains with readback instead of sample records',()=>{
 for(const domain of ['cheques','vendors','work_orders','legal_cases','petty_cash'])assert.match(operationsPage,new RegExp(`rpc\\('${domain}','list'\\)`));
 assert.match(operationsPage,/await rpc\(domain,action,payload\);await load\(proof\)/);
 assert.doesNotMatch(operationsPage,/service_role|SUPABASE_SERVICE|example\.com|TEST-/);
});

test('finance gap core persists bank/cash posting, reserve and tenant credit ledgers immutably',()=>{
 for(const table of ['aqari_tenant_preferences','aqari_collection_accounts','aqari_collection_postings','aqari_reserve_entries','aqari_tenant_ledger_entries','aqari_credit_allocations'])assert.match(financeCore,new RegExp(table));
 for(const trigger of ['aqari_postings_immutable','aqari_reserves_immutable','aqari_tenant_ledger_immutable','aqari_credit_allocations_immutable'])assert.match(financeCore,new RegExp(trigger));
 assert.match(financeCore,/masked_reference !~ '\[0-9\]\{8,\}'/);
});

test('finance gap RPC protects receipt cancellation and credit allocation with manager MFA and readback',()=>{
 assert.match(financeRpc,/not private\.aqari_manager\(w\)/);
 assert.match(financeRpc,/private\.aqari_require_sensitive_aal2\(w\)/);
 assert.match(financeRpc,/'cancel_receipt'/);
 assert.match(financeRpc,/approved_by_name/);
 assert.match(financeRpc,/receipt_cancellation/);
 assert.match(financeRpc,/CREDIT_OVERALLOCATION/);
 assert.match(financeRpc,/private\.aqari_financial_open\(w,posting_date\)/);
 assert.match(financeRpc,/return public\.aqari_final_gap_register\(w,'list'/);
});
