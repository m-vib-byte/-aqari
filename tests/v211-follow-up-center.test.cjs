'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');

test('V211 core preserves protected rent-office contracts while the hotfix guard owns delayed actions',()=>{
  const loader=fs.readFileSync(path.join(root,'final-release-ui.js'),'utf8');
  const hotfix=fs.readFileSync(path.join(root,'v211-follow-up-center.js'),'utf8');
  const core=fs.readFileSync(path.join(root,'v211-follow-up-center-core.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'v211-follow-up-center.css'),'utf8');

  assert.match(loader,/function installV211FollowUpCenter\s*\(/);
  assert.match(loader,/followUpCss\.href='\/v211-follow-up-center\.css\?v=211\.1'/);
  assert.match(loader,/followUpJs\.src='\/v211-follow-up-center\.js\?v=211\.1'/);

  assert.match(core,/AQARI_V202\?\.rentOfficeProperties/);
  assert.match(core,/AQARI_V202\.rentOfficeProperties\(\)/);
  assert.match(core,/AQARI_V202\?\.rentOfficeData/);
  assert.match(core,/rentOfficeData\(name,period\)/);
  assert.match(core,/AQARI_V202\.openProperty\(item\.property,item\.period\)/);
  assert.match(core,/rentOfficeAction\(item\.property,item\.key,item\.period,action,trigger\)/);
  assert.match(core,/record\?\.billable===true/);
  assert.match(core,/record\?\.collectible===true/);
  assert.match(core,/data\.canRecordPayment===true/);
  assert.match(core,/scopeKey\(\)!==item\.scope/);
  assert.match(core,/AQARI_DATA_GATE\?\.scope/);
  assert.match(core,/AQARI_EARLY_STORAGE_GATE\?\.scope/);
  assert.match(core,/membership\?\.is_active!==true/);
  assert.match(core,/\.v210-kpis \.is-red/);
  assert.match(core,/\.v210-kpis \.is-amber/);
  assert.match(core,/data-v210-property/);
  assert.match(core,/نسخ تذكير/);
  assert.match(core,/Current outstanding balance shown in the property record/);

  assert.doesNotMatch(core,/rentLedgerV202/);
  assert.doesNotMatch(core,/contractsV202/);
  assert.doesNotMatch(core,/\bdb\b/);
  assert.doesNotMatch(core,/localStorage/);
  assert.doesNotMatch(core,/sessionStorage/);
  assert.doesNotMatch(core,/record\?\.phone/);
  assert.doesNotMatch(core,/civilId/);

  assert.match(hotfix,/V211\.0\.1-action-epoch-hotfix/);
  assert.match(hotfix,/\/v211-follow-up-center-core\.js\?v=211\.0\.1/);
  assert.match(hotfix,/document\.addEventListener\('click'/);
  assert.match(hotfix,/stopImmediatePropagation\(\)/);
  assert.match(hotfix,/AQARI_V202\?\.rentOfficeData/);
  assert.match(hotfix,/AQARI_V202\.openProperty\(selection\.property,selection\.period\)/);
  assert.match(hotfix,/AQARI_V202\.rentOfficeAction\(selection\.property,current\.record\.key,selection\.period,action,trigger\)===true/);
  assert.match(hotfix,/if\(ok===true\)window\.AQARI_V211\?\.close\?\.\(\)/);
  assert.match(hotfix,/AQARI_DATA_GATE\?\.scope/);
  assert.match(hotfix,/AQARI_EARLY_STORAGE_GATE\?\.scope/);
  assert.match(hotfix,/membership\?\.is_active!==true/);
  assert.match(hotfix,/if\(action==='reminder'\)return/);
  assert.doesNotMatch(hotfix,/rentLedgerV202|contractsV202|\bdb\b|localStorage|sessionStorage|civilId|phone|email/);

  assert.match(css,/v211-shell/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/@media print/);
});

test('V211 action hotfix cannot close the center before a protected action succeeds',()=>{
  const hotfix=fs.readFileSync(path.join(root,'v211-follow-up-center.js'),'utf8');
  const execute=hotfix.match(/function executeAction\(selection,action,trigger\)\{[\s\S]*?\n  \}/);
  assert.ok(execute);
  assert.doesNotMatch(execute[0],/setTimeout\(follow,70\);\s*(?:window\.AQARI_V211\?\.)?close/);
  assert.match(execute[0],/rentOfficeAction[\s\S]*?===true[\s\S]*?if\(ok===true\)window\.AQARI_V211\?\.close\?\.\(\)/);
});

test('V211 classifies write access conservatively',()=>{
  const source=fs.readFileSync(path.join(root,'v211-follow-up-center-core.js'),'utf8');
  const match=source.match(/function statusOf\(row\)\{[\s\S]*?\n  \}/);
  assert.ok(match);
  const statusOf=vm.runInNewContext('('+match[0]+')');

  assert.equal(statusOf({pending:10,paymentStatus:'',hasContract:true,balance:10,billable:true,collectible:true,canRecordPayment:true}),'pending');
  assert.equal(statusOf({pending:0,paymentStatus:'',hasContract:true,balance:10,billable:true,collectible:true,canRecordPayment:true}),'due');
  assert.equal(statusOf({pending:0,paymentStatus:'',hasContract:true,balance:10,billable:true,collectible:false,canRecordPayment:true}),'readonly');
  assert.equal(statusOf({pending:0,paymentStatus:'',hasContract:false,balance:10,billable:false,collectible:false,canRecordPayment:false}),'unlinked');
  assert.equal(statusOf({pending:0,paymentStatus:'مسدد',hasContract:true,balance:0,billable:true,collectible:true,canRecordPayment:true}),'clear');
});

test('V211 reminder wording remains operational and avoids unsupported legal claims',()=>{
  const source=fs.readFileSync(path.join(root,'v211-follow-up-center-core.js'),'utf8');
  const reminder=source.match(/function reminderText\(item\)\{[\s\S]*?\n  \}/);
  const money=source.match(/function money\(value\)\{[\s\S]*?\n  \}/);
  const number=source.match(/function number\(value\)\{[^\n]*\}/);
  const periodLabel=source.match(/function periodLabel\(value,locale\)\{[\s\S]*?\n  \}/);
  assert.ok(reminder&&money&&number&&periodLabel);
  const fn=vm.runInNewContext(`(()=>{${number[0]};${money[0]};${periodLabel[0]};return ${reminder[0]}})()`,{Intl,Date});
  const text=fn({period:'2026-09',property:'TEST PROPERTY',unit:'5',balance:350});
  assert.match(text,/TEST PROPERTY/);
  assert.match(text,/350/);
  assert.match(text,/نذكّركم بمراجعة إيجار/);
  assert.doesNotMatch(text,/إنذار|إخلاء|دعوى|غرامة|قانون/);
});

test('V266 startup backup is scheduled only by the authenticated workspace boundary',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const bridge=fs.readFileSync(path.join(root,'secure-auth-bridge.js'),'utf8');
  const loader=fs.readFileSync(path.join(root,'final-release-ui.js'),'utf8');
  const backup=html.match(/const AQARI_AUTO_BACKUP_MAX_AGE_V211[\s\S]*?window\.AQARI_STARTUP_BACKUP=Object\.freeze\(\{[\s\S]*?\}\);/);
  assert.ok(backup);
  assert.match(backup[0],/activeWorkspaceStorageScopeV206\(\)/);
  assert.match(backup[0],/aqariAutoBackupInFlightV211/);
  assert.match(backup[0],/schedule:scheduleStartupBackupV211/);
  assert.match(backup[0],/cancel:cancelStartupBackupV211/);
  assert.match(backup[0],/version:'V267'/);
  assert.doesNotMatch(backup[0],/\balert\s*\(/);

  assert.match(bridge,/function sealData\(\)\{[\s\S]*?AQARI_STARTUP_BACKUP\?\.cancel\?\.\(\)/);
  assert.match(bridge,/function unlock\(nextContext, nextRemoteState\)\{[\s\S]*?activateWorkspaceDbV198[\s\S]*?AQARI_STARTUP_BACKUP\?\.schedule\?\.\(\)/);
  assert.doesNotMatch(loader,/installStartupBackupGuard|__v211StartupGuard|window\.makeAutoBackup\s*=/);
  assert.match(loader,/عقاري V267 — التشغيل الآلي السحابي/);
});
