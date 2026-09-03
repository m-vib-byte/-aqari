'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('V206 rent ledger extends V205 without replacing the simplified shell', () => {
  const loader = fs.readFileSync(path.join(root, 'final-release-ui.js'), 'utf8');
  const shell = fs.readFileSync(path.join(root, 'v205-simplified-shell.js'), 'utf8');
  const rent = fs.readFileSync(path.join(root, 'v206-rent-ledger.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'v206-rent-ledger.css'), 'utf8');

  assert.match(loader, /function installV205SimplifiedShell\s*\(/);
  assert.match(loader, /function installV206RentLedger\s*\(/);
  assert.match(loader, /shell\.src = '\/v205-simplified-shell\.js'/);
  assert.match(loader, /shell\.addEventListener\('load', installV206RentLedger, \{ once:true \}\)/);
  assert.match(loader, /installV206RentLedger\(\)/);
  assert.match(loader, /css\.href='\/v206-rent-ledger\.css'/);
  assert.match(loader, /script\.src='\/v206-rent-ledger\.js'/);

  assert.match(shell, /V205-preview/);
  assert.match(rent, /contractsV202/);
  assert.match(rent, /rentLedgerV202/);
  assert.match(rent, /KNET OPERATION NUMBER/);
  assert.match(rent, /VOUCHER NO/);
  assert.match(rent, /NAME OF THE TENANT/);
  assert.match(rent, /FLAT NO\./);
  assert.match(rent, /function brand\s*\(/);
  assert.match(rent, /function isDhahawi\s*\(/);
  assert.match(rent, /totalBalance/);
  assert.match(rent, /collectionRate/);
  assert.match(rent, /dueCount/);
  assert.match(rent, /data-v206-action="payment"/);
  assert.match(rent, /data-v206-action="print"/);
  assert.match(rent, /data-v206-action="csv"/);
  assert.match(rent, /data-v206-due-contract/);
  assert.match(rent, /function dueList\s*\(/);
  assert.match(rent, /function openPaymentFor\s*\(/);
  assert.match(rent, /v202PaymentContract/);
  assert.match(rent, /v202PaymentAmount/);
  assert.match(rent, /مركز تحصيل الإيجارات/);
  assert.match(rent, /المطلوب تحصيله الآن/);
  assert.match(rent, /المتبقي/);
  assert.match(rent, /نسبة التحصيل/);
  assert.match(rent, /dhahawi/i);
  assert.doesNotMatch(rent, /AQARI_SUPABASE\s*=/);

  const headerCount = (rent.match(/<th>/g) || []).length;
  assert.equal(headerCount, 14, 'V206 rent ledger must keep the 14-column statement contract');

  assert.match(css, /@page\s*\{\s*size\s*:\s*A4 landscape/i);
  assert.match(css, /v206-ledger/);
  assert.match(css, /v206-paper/);
  assert.match(css, /v206-command/);
  assert.match(css, /v206-stats/);
  assert.match(css, /v206-due-panel/);
  assert.match(css, /v206-due-item/);
  assert.match(css, /body\.aq-v206 \.v206-command\{display:none!important\}/);
});
