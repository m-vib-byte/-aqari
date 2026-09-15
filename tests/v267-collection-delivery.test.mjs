import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const settings=read('staging-database/sql/collection-delivery-settings-rpc-20260915.sql');
const stop=read('staging-database/sql/collection-reminder-stop-after-payment-20260915.sql');
const queue=read('staging-database/sql/collection-payment-delivery-queue-20260915.sql');
const page=read('src/v267/pages/collection-delivery-settings.js');

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
