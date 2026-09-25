'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'v266-scheduler-control.js'),'utf8');
const css=fs.readFileSync(path.join(root,'v266-scheduler-control.css'),'utf8');
const loader=fs.readFileSync(path.join(root,'final-release-ui.js'),'utf8');
const migration=fs.readFileSync(
  path.join(root,'supabase/migrations/20260905043259_v266_scheduler_ui_least_privilege.sql'),
  'utf8'
);
const vercel=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));

test('V266 assets parse and are loaded with the production release identity',()=>{
  new vm.Script(source,{filename:'v266-scheduler-control.js'});
  assert.match(loader,/const PRODUCT_RELEASE='V267'/);
  assert.match(loader,/installV266SchedulerControl/);
  assert.match(loader,/releaseAsset\('\/v266-scheduler-control\.css'\)/);
  assert.match(loader,/releaseAsset\('\/v266-scheduler-control\.js'\)/);
  assert.match(source,/version:RELEASE,refresh,open,resume,seal/);
});

test('V266 uses the secure bound workspace and never embeds credentials or IDs',()=>{
  assert.match(source,/AQARI_SUPABASE\?\.context/);
  assert.match(source,/refreshContext\(expected\)/);
  assert.match(source,/role!==MANAGER_ROLE/);
  assert.match(source,/membership\?\.is_active!==true/);
  assert.match(source,/\.eq\('workspace_id',access\.workspaceId\)/);
  assert.match(source,/await recheck\(access\)/);
  assert.match(source,/event\?\.detail\?\.state==='ready'/);
  assert.match(source,/event\?\.detail\?\.state==='locked'/);
  assert.doesNotMatch(source,/qtavnufzbkdfeauyukot|sb_publishable_|service_role/i);
  assert.doesNotMatch(source,/localStorage|sessionStorage|aqari_v247_cloud_session/);
  assert.doesNotMatch(source,/\.rpc\(|aqari_run_daily_automation/);
});

test('V266 only writes manager-controlled scheduler columns',()=>{
  assert.match(source,/\.update\(\{enabled,due_day:dueDay\}\)/);
  assert.doesNotMatch(source,/\.update\(\{[^}]*workspace_id/);
  assert.doesNotMatch(source,/\.update\(\{[^}]*last_status/);
  assert.doesNotMatch(source,/\.update\(\{[^}]*reminder_channel/);
  assert.match(migration,/grant update \(enabled, due_day\)/i);
  assert.match(migration,/for update\s+to authenticated/i);
  assert.match(migration,/m\.role = 'general_manager'/i);
  assert.match(migration,/revoke execute on function public\.aqari_run_daily_automation[\s\S]*from public, anon, authenticated/i);
  assert.doesNotMatch(migration,/grant insert|grant delete/i);
});

test('V266 dynamic database values render through textContent',()=>{
  assert.match(source,/errorNode\.textContent=/);
  assert.match(source,/cell\.textContent=/);
  assert.doesNotMatch(source,/innerHTML=.*last_error|innerHTML=.*error_text/);
});

test('V266 stays usable on mobile and bypasses stale cache',()=>{
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/prefers-reduced-motion/);
  assert.match(css,/#aqariV266Scheduler\[hidden\]\{display:none!important\}/);
  for(const asset of ['/v266-scheduler-control.js','/v266-scheduler-control.css']){
    const rule=vercel.headers.find((entry)=>entry.source===asset);
    assert.ok(rule,asset+' cache rule is required');
    assert.match(rule.headers.find((header)=>header.key==='Cache-Control')?.value||'',/no-store/);
  }
});

test('V266 fails closed when scheduler backend tables are not installed',()=>{
  assert.match(source,/function missingSchedulerBackend\(error\)/);
  assert.match(source,/\['PGRST205','42P01'\]/);
  assert.match(source,/aqari_scheduler_\(\?:config\|runs\)/);
  assert.match(source,/if\(missingSchedulerBackend\(error\)&&epoch===state\.epoch\)/);
  assert.match(source,/state\.config=null;state\.runs=\[\];renderConfig\(null\);renderRuns\(\[\]\)/);
  assert.match(source,/التشغيل الآلي غير مهيأ لبيئة البيانات الحالية/);
});
