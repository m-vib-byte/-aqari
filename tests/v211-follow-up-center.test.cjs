'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');

test('V211 uses only protected V202 rent-office APIs and keeps V210 integration scoped',()=>{
  const loader=fs.readFileSync(path.join(root,'final-release-ui.js'),'utf8');
  const source=fs.readFileSync(path.join(root,'v211-follow-up-center.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'v211-follow-up-center.css'),'utf8');

  assert.match(loader,/function installV211FollowUpCenter\s*\(/);
  assert.match(loader,/followUpCss\.href='\/v211-follow-up-center\.css\?v=211\.1'/);
  assert.match(loader,/followUpJs\.src='\/v211-follow-up-center\.js\?v=211\.1'/);

  assert.match(source,/AQARI_V202\?\.rentOfficeProperties/);
  assert.match(source,/AQARI_V202\.rentOfficeProperties\(\)/);
  assert.match(source,/AQARI_V202\?\.rentOfficeData/);
  assert.match(source,/rentOfficeData\(name,period\)/);
  assert.match(source,/AQARI_V202\.openProperty\(item\.property,item\.period\)/);
  assert.match(source,/rentOfficeAction\(item\.property,item\.key,item\.period,action,trigger\)/);
  assert.match(source,/record\?\.billable===true/);
  assert.match(source,/record\?\.collectible===true/);
  assert.match(source,/data\.canRecordPayment===true/);
  assert.match(source,/scopeKey\(\)!==item\.scope/);
  assert.match(source,/AQARI_DATA_GATE\?\.scope/);
  assert.match(source,/AQARI_EARLY_STORAGE_GATE\?\.scope/);
  assert.match(source,/membership\?\.is_active!==true/);
  assert.match(source,/\.v210-kpis \.is-red/);
  assert.match(source,/\.v210-kpis \.is-amber/);
  assert.match(source,/data-v210-property/);
  assert.match(source,/نسخ تذكير/);
  assert.match(source,/Current outstanding balance shown in the property record/);

  assert.doesNotMatch(source,/rentLedgerV202/);
  assert.doesNotMatch(source,/contractsV202/);
  assert.doesNotMatch(source,/\bdb\b/);
  assert.doesNotMatch(source,/localStorage/);
  assert.doesNotMatch(source,/sessionStorage/);
  assert.doesNotMatch(source,/record\?\.phone/);
  assert.doesNotMatch(source,/civilId/);

  assert.match(css,/v211-shell/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/@media print/);
});

test('V211 classifies write access conservatively',()=>{
  const source=fs.readFileSync(path.join(root,'v211-follow-up-center.js'),'utf8');
  const match=source.match(/function statusOf\(row\)\{[\s\S]*?\n  \}/);
  assert.ok(match);
  const statusOf=vm.runInNewContext('('+match[0]+')');

  assert.equal(statusOf({pending:10,paymentStatus:'',hasContract:true,balance:10,billable:true,collectible:true,canRecordPayment:true}),'pending');
  assert.equal(statusOf({pending:0,paymentStatus:'',hasContract:true,balance:10,billable:true,collectible:true,canRecordPayment:true}),'due');
  assert.equal(statusOf({pending:0,paymentStatus:'',hasContract:true,balance:10,billable:true,collectible:false,canRecordPayment:true}),'readonly');
  assert.equal(statusOf({pending:0,paymentStatus:'',hasContract:false,balance:10,billable:false,collectible:false,canRecordPayment:false}),'unlinked');
  assert.equal(statusOf({pending:0,paymentStatus:'مسدد',hasContract:true,balance:0,billable:true,collectible:true,canRecordPayment:true}),'clear');
});

test('V211 reminder wording is operational and avoids unsupported legal claims',()=>{
  const source=fs.readFileSync(path.join(root,'v211-follow-up-center.js'),'utf8');
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
