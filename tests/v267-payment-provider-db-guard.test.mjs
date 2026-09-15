import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const migration=read('staging-database/supabase/migrations/20260915162000_v267_payment_provider_guard.sql');
const mirror=read('staging-database/sql/payment-method-reference-guard.sql');

test('new payment provider guard preserves history and remains insert-only',()=>{
 for(const sql of [migration,mirror]){
  assert.match(sql,/create or replace function private\.aqari_payment_method_reference_guard\(\)/);
  assert.match(sql,/security invoker/);
  assert.match(sql,/revoke all on function private\.aqari_payment_method_reference_guard\(\) from public,anon,authenticated/);
  assert.match(sql,/new\.payment_method in \('كي نت','KNET','knet'\)/);
  assert.match(sql,/provider is distinct from 'KNET'/);
  assert.match(sql,/new\.payment_method in \('نقدي','cash'\)/);
  assert.match(sql,/الدفع النقدي لا يستخدم بنكاً أو مزود دفع/);
  assert.match(sql,/أدخل اسم البنك أو مزوّد الدفع من 2 إلى 120 حرفاً/);
  assert.match(sql,/provider !~ U&/);
  assert.match(sql,/lower\(btrim\(provider\)\) in \('—','-','–','n\/a','na','none','null','undefined','غير مسجل','لا يوجد'\)/);
 }
 assert.doesNotMatch(migration,/after insert or update|before insert or update/i);
 assert.match(mirror,/create trigger aqari_payment_method_reference_guard after insert on public\.aqari_rent_payments/);
});

test('collection overlay persists provider inside the protected ledger payload',()=>{
 const patch=read('src/v267/support/payment-detail-patch.js');
 assert.match(patch,/rentLedgerV202:\[[^\]]*'paymentProvider'/);
 assert.match(patch,/id=\"v267PaymentProvider\"/);
 assert.match(patch,/if\(isKnet&&!paymentProvider\)paymentProvider='KNET'/);
 assert.match(patch,/if\(isCash\)paymentProvider=''/);
 assert.match(patch,/providerRequired=method==='تحويل بنكي'\|\|method==='شيك'\|\|method==='أخرى'/);
 assert.match(patch,/method,transactionNo,paymentProvider,accountant/);
});
