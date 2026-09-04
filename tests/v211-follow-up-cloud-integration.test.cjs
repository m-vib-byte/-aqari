'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const guard=fs.readFileSync('v211-follow-up-center.js','utf8');
const cloud=fs.readFileSync('v211-follow-up-cloud.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20260904205555_v211_1_secure_follow_up_cloud_rpc.sql','utf8');

test('V211.1 keeps the V211.0.1 action-epoch hotfix and loads cloud before core',()=>{
  assert.match(guard,/V211\.0\.1-action-epoch-hotfix\+V211\.1-follow-up-cloud/);
  assert.match(guard,/v211-follow-up-cloud\.js\?v=211\.1/);
  assert.match(guard,/script\.addEventListener\('load',loadCore/);
  assert.match(guard,/v211-follow-up-center-core\.js\?v=211\.0\.1/);
  assert.ok(guard.indexOf('loadCloudThenCore()')<guard.lastIndexOf('window.AQARI_V211_HOTFIX'));
});

test('official V202 actions are journaled only after true protected action result',()=>{
  const body=guard.slice(guard.indexOf('function executeAction'),guard.indexOf('async function hydrateTimeline'));
  assert.match(body,/AQARI_V202\.rentOfficeAction\(selection\.property,current\.record\.key,selection\.period,action,trigger\)===true/);
  assert.ok(body.indexOf('rentOfficeAction')<body.indexOf('cloudAppend(selection,current,EVENT_ACTION[action])'));
  assert.ok(body.indexOf('cloudAppend(selection,current,EVENT_ACTION[action])')<body.indexOf('AQARI_V211?.close'));
});

test('reminder is copied before cloud append and remains local-only text',()=>{
  const body=guard.slice(guard.indexOf('async function executeReminder'),guard.indexOf('function executeAction'));
  assert.ok(body.indexOf('navigator.clipboard.writeText')<body.indexOf("cloudAppend(selection,current,'reminder_copied')"));
  assert.match(guard,/if\(action==='reminder'\)return void executeReminder/);
  assert.doesNotMatch(cloud,/p_property|event\.property|property:String/);
});

test('cloud append payload contains no property or tenant identity',()=>{
  const start=guard.indexOf('window.AQARI_FOLLOW_UP_CLOUD.append({');
  const end=guard.indexOf('},access)',start);
  const payload=guard.slice(start,end);
  assert.match(payload,/recordKey:/);assert.match(payload,/period:/);assert.match(payload,/actionKind/);assert.match(payload,/state:/);
  assert.doesNotMatch(payload,/property|tenant|unit|contractNo|phone|email|civil|note/);
});

test('timeline is bounded, scope-bound, and cloud response has no property field',()=>{
  assert.match(guard,/querySelectorAll\('\.v211-row'\)\)\.slice\(0,40\)/);
  assert.match(guard,/AQARI_FOLLOW_UP_CLOUD\.list/);
  assert.match(guard,/token!==timelineEpoch/);
  assert.match(guard,/accessScope\(\)\?\.key!==selection\.scope/);
  assert.doesNotMatch(cloud,/property:String\(row/);
});

test('RPC reader and writer both enforce server-side bounded contracts',()=>{
  assert.doesNotMatch(sql,/p_property/);
  assert.match(sql,/p_action_kind not in \(/);
  assert.match(sql,/p_state not in \(/);
  assert.match(sql,/a\.metadata->>'state' in \(/);
  assert.match(sql,/least\(greatest\(coalesce\(p_limit, 20\), 1\), 50\)/);
  assert.match(sql,/security invoker/);
  assert.match(sql,/create schema if not exists aqari_internal/);
});
