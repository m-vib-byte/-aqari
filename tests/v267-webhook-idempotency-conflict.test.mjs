import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync('staging-database/supabase/migrations/20260915095400_v267_webhook_idempotency_conflict_guard.sql','utf8');
const ingress=readFileSync('api/provider-webhook.py','utf8');

test('verified webhook duplicate returns the original receipt id and rejects event-id body conflicts',()=>{
  assert.match(migration,/create or replace function public\.aqari_record_verified_webhook/);
  assert.match(migration,/select \* into r from private\.aqari_webhook_receipts/);
  assert.match(migration,/r\.body_sha256 is distinct from incoming_body_sha/);
  assert.match(migration,/WEBHOOK_IDEMPOTENCY_CONFLICT/);
  assert.match(migration,/jsonb_build_object\('duplicate',true,'id',r\.id,'status',r\.status\)/);
  assert.match(ingress,/WEBHOOK_RECORD_NOT_CONFIRMED/);
});

test('maintenance provider-message retry is replayed only when canonical content matches',()=>{
  assert.match(migration,/provider_message_reference=reference/);
  assert.match(migration,/existing\.request_id=request_row\.id/);
  assert.match(migration,/existing_sender_digits=sender_digits/);
  assert.match(migration,/existing\.message_text=body/);
  assert.match(migration,/existing\.occurred_at=wr\.occurred_at/);
  assert.match(migration,/MAINTENANCE_MESSAGE_REFERENCE_REPLAY/);
});

test('maintenance provider-message reference conflict is rejected before the unique insert',()=>{
  const lookup=migration.indexOf('provider_message_reference=reference');
  const conflict=migration.indexOf('MAINTENANCE_MESSAGE_REFERENCE_CONFLICT');
  const insert=migration.indexOf('insert into private.aqari_maintenance_message_events');
  assert.ok(lookup>=0 && conflict>lookup && insert>conflict,'reference lookup/conflict guard must run before insert');
  assert.match(migration,/rejection_reason='MAINTENANCE_MESSAGE_REFERENCE_CONFLICT'/);
  assert.match(migration,/jsonb_build_object\('status','rejected','reason','MAINTENANCE_MESSAGE_REFERENCE_CONFLICT'\)/);
});
