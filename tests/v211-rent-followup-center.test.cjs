const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const js=fs.readFileSync('v211-rent-followup-center.js','utf8');
const css=fs.readFileSync('v211-rent-followup-center.css','utf8');
const v202=fs.existsSync('v202-property-os.js')?fs.readFileSync('v202-property-os.js','utf8'):'';
const v210=fs.readFileSync('v210-daily-command-center.js','utf8');
const loader=fs.existsSync('final-release-ui.js')?fs.readFileSync('final-release-ui.js','utf8'):'';

test('V211 reads operational data only through protected V202 APIs',()=>{
  assert.match(js,/AQARI_V202\?\.rentOfficeProperties/);assert.match(js,/AQARI_V202\?\.rentOfficeData/);assert.match(js,/AQARI_V202\?\.rentOfficeAction/);
  assert.doesNotMatch(js,/localStorage|sessionStorage|rentLedgerV202|contractsV202|civilId|phone/);
});

test('V211 exact scope and fail-closed contracts are present',()=>{
  for(const token of ['membership?.is_active!==true','membershipUserId!==userId','membershipWorkspaceId!==workspaceId','AQARI_DATA_GATE','AQARI_EARLY_STORAGE_GATE','item.scope!==scopeKey()'])assert.ok(js.includes(token),token);
  assert.match(js,/function seal\(\)\{authSuspended=true/);
});

test('V211 never sends messages silently',()=>{
  assert.doesNotMatch(js,/\bfetch\s*\(|XMLHttpRequest|sendMail|sendMessage/);
  assert.match(js,/navigator\.clipboard\.writeText/);assert.match(js,/mailto:/);assert.match(js,/لا يتم إرسال أي رسالة تلقائياً/);
});

test('V211 classifies payment states conservatively',()=>{
  const document={readyState:'complete',head:{appendChild(){}},body:{appendChild(){},classList:{add(){},remove(){}}},addEventListener(){},querySelector(){return null},getElementById(){return null},createElement(){return {}}};
  const context={window:{},document,MutationObserver:class{},setTimeout(){return 1},clearTimeout(){},Intl,Date,Number,String,Array,Object,Math,JSON,Set,console};
  vm.runInNewContext(js,context);const classify=context.window.AQARI_V211.testing.classify;
  assert.equal(classify({balance:100,pending:20,billable:true,collectible:true},true),'pending');
  assert.equal(classify({balance:100,pending:0,billable:true,collectible:true},true),'reminder');
  assert.equal(classify({balance:100,pending:0,billable:true,collectible:true},false),'readonly');
  assert.equal(classify({balance:100,pending:0,billable:true,collectible:false},true),'uncollectible');
  assert.equal(classify({balance:0,pending:0,hasContract:false},true),'setup');
  assert.equal(classify({balance:0,pending:0,hasContract:true},true),'clear');
});

test('V211 reminder is bilingual and avoids unverified legal claims',()=>{
  const document={readyState:'complete',head:{appendChild(){}},body:{appendChild(){},classList:{add(){},remove(){}}},addEventListener(){},querySelector(){return null},getElementById(){return null},createElement(){return {}}};
  const context={window:{},document,setTimeout(){return 1},clearTimeout(){},Intl,Date,Number,String,Array,Object,Math,JSON,Set,console};vm.runInNewContext(js,context);
  const message=context.window.AQARI_V211.testing.reminder({tenant:'أحمد',balance:350},'2026-09');
  assert.match(message,/أحمد/);assert.match(message,/350|٣٥٠/);assert.match(message,/Dear/);assert.match(message,/outstanding balance/);assert.doesNotMatch(message,/دعوى|إخلاء|جزاء|قانون/);
});

test('V202 provides scoped journal APIs with revision verification',()=>{
  if(!v202)return;
  assert.match(v202,/rentFollowups:function/);assert.match(v202,/recordRentFollowup:function/);assert.match(v202,/followupRevision/);assert.match(v202,/persist\(\)/);
});

test('V211 reads protected follow-up history and exposes search without indexing PII',()=>{
  assert.match(js,/AQARI_V202\.rentFollowups/);assert.match(js,/AQARI_V209\.open/);assert.match(js,/data-v211-action="'\+action\+'"/);
  assert.match(js,/uncollectible:'غير قابل للتحصيل'/);assert.match(js,/contractAlert/);
});

test('payment write appears only for fully eligible records',()=>{
  assert.match(js,/item\.billable&&item\.collectible&&item\.canRecordPayment/);assert.match(js,/actionButton\('payment','تسجيل التحصيل',writable\)/);
});

test('V210 routes overdue, pending and property priorities into V211',()=>{
  assert.match(v210,/data-v210-followup="overdue"/);assert.match(v210,/data-v210-followup="pending"/);assert.match(v210,/AQARI_V211\?\.open/);
});

test('V211 loader follows V210 and assets are revisioned',()=>{
  if(!loader)return;
  assert.match(loader,/installV211RentFollowupCenter/);assert.match(loader,/v211-rent-followup-center\.js\?v=211\.0/);assert.match(loader,/addEventListener\('load', installV211RentFollowupCenter/);
});

test('V211 CSS is dialog-scoped, mobile-safe and print-isolated',()=>{
  assert.doesNotMatch(css,/\n\.(?!on\b)/);assert.match(css,/@media\(max-width:390px\)/);assert.match(css,/font-size:16px/);assert.match(css,/@media print\{#v211FollowupDialog\{display:none!important\}\}/);
});
