const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const migration = fs.readFileSync('supabase/migrations/20260904190000_v211_1_secure_follow_up_events.sql','utf8');
const adapter = fs.readFileSync('supabase-adapter.js','utf8');
const center = fs.readFileSync('v211-follow-up-center.js','utf8');

test('migration creates a minimal append-only journal with forced RLS', () => {
  assert.match(migration,/create table if not exists public\.aqari_follow_up_events/);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/force row level security/);
  assert.match(migration,/for select\s+to authenticated[\s\S]*m\.is_active = true/);
  assert.match(migration,/for insert\s+to authenticated[\s\S]*with check[\s\S]*created_by = auth\.uid\(\)/);
  assert.match(migration,/general_manager[\s\S]*property_manager[\s\S]*accountant/);
  assert.doesNotMatch(migration,/create policy[\s\S]{0,120}for (update|delete)/i);
  assert.match(migration,/revoke all on table public\.aqari_follow_up_events from public, anon, authenticated/);
  assert.match(migration,/grant insert \([\s\S]*workspace_id[\s\S]*app_state_revision[\s\S]*\) on table public\.aqari_follow_up_events to authenticated/);
  assert.doesNotMatch(migration,/grant insert \([\s\S]*created_by[\s\S]*\) on table public\.aqari_follow_up_events to authenticated/);
});

test('database trigger derives actor and rejects stale app-state revisions atomically', () => {
  assert.match(migration,/security invoker/);
  assert.match(migration,/set search_path = ''/);
  assert.match(migration,/new\.created_by := auth\.uid\(\)/);
  assert.match(migration,/from public\.aqari_app_state/);
  assert.match(migration,/live_revision <> new\.app_state_revision/);
  assert.match(migration,/errcode = '40001'/);
  assert.match(migration,/message = 'AQARI_REVISION_CONFLICT'/);
  assert.match(migration,/before insert on public\.aqari_follow_up_events/);
});

test('journal schema excludes tenant PII and free-form notes', () => {
  const table = migration.slice(migration.indexOf('create table'), migration.indexOf(');', migration.indexOf('create table')) + 2);
  for (const forbidden of ['tenant','phone','email','civil_id','civilid','note','message']) {
    assert.doesNotMatch(table,new RegExp('\\b'+forbidden+'\\b','i'));
  }
});

test('adapter exposes strict validators and refuses spoof fields', () => {
  const window = { AQARI_PUBLIC_CONFIG:{} };
  vm.runInNewContext(adapter,{window,document:{},console,Error,Object,Set,String,Number,Array,Promise});
  const testing = window.AQARI_SUPABASE.testing;
  const clean = testing.validateFollowUpEvent({
    recordKey:'record-1',property:'برج ضحاوي',period:'2026-09',
    actionKind:'reminder_copied',state:'due'
  });
  assert.equal(clean.record_key,'record-1');
  assert.throws(() => testing.validateFollowUpEvent({
    recordKey:'record-1',property:'برج ضحاوي',period:'2026-09',
    actionKind:'reminder_copied',state:'due',workspace_id:'spoof'
  }),error => error.code === 'AQARI_FOLLOW_UP_INVALID');
  assert.throws(() => testing.validateFollowUpEvent({
    recordKey:'record-1',property:'برج ضحاوي',period:'2026-09',
    actionKind:'reminder_copied',state:'due',phone:'50000000'
  }),error => error.code === 'AQARI_FOLLOW_UP_INVALID');
});

test('adapter binds writes to refreshed access and revision, then rechecks', () => {
  const body = adapter.slice(adapter.indexOf('async function appendFollowUpEvent'),adapter.indexOf('async function listFollowUpEvents'));
  assert.match(body,/bindAccess\(expectedAccess, \{ write:true \}\)/);
  assert.match(body,/appStateRevision\(boundAccess\)/);
  assert.match(body,/expected !== currentRevision/);
  assert.match(body,/workspace_id:boundAccess\.workspaceId/);
  assert.doesNotMatch(body,/workspace_id:event/);
  assert.match(body,/data\.created_by !== boundAccess\.userId/);
  assert.match(body,/recheckBoundAccess\(boundAccess, \{ write:true \}\)/);
  assert.match(body,/error\?\.code === '40001'/);
});

test('V211 writes only through adapter after successful official actions', () => {
  assert.doesNotMatch(center,/\.from\(['"]aqari_follow_up_events['"]\)/);
  assert.match(center,/AQARI_SUPABASE\?\.appendFollowUpEvent/);
  assert.match(center,/if\(ok===true\)return recordFollowUp\(item,action\)/);
  assert.ok(center.indexOf('await navigator.clipboard.writeText') < center.indexOf("await recordFollowUp(item,'reminder')"));
  const payload = center.slice(center.indexOf('appendFollowUpEvent({'),center.indexOf('},access,revision)'));
  for(const forbidden of ['tenant','unit','phone','email','civilId','note']) assert.doesNotMatch(payload,new RegExp('\\b'+forbidden+'\\b'));
});

test('timeline is scope-bound and authentication changes cancel stale work', () => {
  assert.match(center,/listFollowUpEvents\(\{/);
  assert.match(center,/scopeKey\(\)!==expectedScope/);
  assert.match(center,/token!==interactionEpoch/);
  assert.match(center,/function seal\(\)\{authSuspended=true;close\(\)\}/);
  assert.match(center,/V211\.1-cloud-follow-up-journal/);
});
