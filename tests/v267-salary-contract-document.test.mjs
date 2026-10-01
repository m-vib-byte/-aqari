import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync('src/v267/pages/employees.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20261001005500_hr_salary_contract_document.sql','utf8');
const translations=fs.readFileSync('src/v267/components/visible-translations-a.js','utf8');

test('employee UI exposes salary contract independently from employment contract and salary voucher',()=>{
 assert.match(ui,/عقد راتب \/ Salary contract/);
 assert.match(ui,/salary_contract/);
 assert.match(ui,/section==='salary_contract'/);
 assert.match(ui,/doc\.kind==='salary_contract'/);
 assert.match(ui,/salary_contract:translateStatic\('عقد راتب \/ Salary contract'\)/);
});

test('salary contract schema is separate from monthly signed salary',()=>{
 assert.match(sql,/kind in \('document','employment_contract','salary_contract','signed_salary'\)/);
 assert.match(sql,/HR_SALARY_CONTRACT_ANCHOR_MISMATCH/);
 assert.doesNotMatch(sql,/salary_contract'\) = \(payroll_id is not null\)/i);
});

test('salary contract label is localized for all supported interface languages',()=>{
 assert.match(translations,/"عقد راتب \/ Salary contract"/);
 for(const key of ['"ar": "عقد راتب"','"en": "Salary contract"','"hi": "वेतन अनुबंध"','"ur": "تنخواہ کا معاہدہ"','"ml": "ശമ്പള കരാർ"'])assert.ok(translations.includes(key),key);
});
